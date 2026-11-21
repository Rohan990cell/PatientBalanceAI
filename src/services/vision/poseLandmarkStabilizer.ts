/**
 * Temporal pose stabilizer for MediaPipe Pose Landmarker (Tasks API).
 *
 * Tasks PoseLandmarker has no built-in smoothLandmarks. At distance the lite/full
 * models often jitter and occasionally swap left/right limb labels between frames.
 * This module:
 *  1. Detects L/R label flips via previous-frame limb-chain matching (+ anatomy hint)
 *  2. Applies a One-Euro-style adaptive low-pass filter per landmark
 *  3. Holds last good pose briefly when visibility collapses
 */

export type LandmarkLike = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

/** MediaPipe 33-pose left/right index pairs (person's L/R). Nose (0) stays put. */
const LR_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10],
  [11, 12], // shoulders
  [13, 14], // elbows
  [15, 16], // wrists
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24], // hips
  [25, 26], // knees
  [27, 28], // ankles
  [29, 30], // heels
  [31, 32], // feet
];

const LEFT_CHAIN = [11, 13, 15, 23, 25, 27, 31] as const;
const RIGHT_CHAIN = [12, 14, 16, 24, 26, 28, 32] as const;

function dist2(a: LandmarkLike, b: LandmarkLike): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cloneLm(p: LandmarkLike): LandmarkLike {
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    visibility: p.visibility ?? 1,
  };
}

function swapLeftRight(landmarks: LandmarkLike[]): void {
  for (const [L, R] of LR_PAIRS) {
    const a = landmarks[L];
    const b = landmarks[R];
    if (!a || !b) continue;
    landmarks[L] = b;
    landmarks[R] = a;
  }
}

function chainCost(
  curr: LandmarkLike[],
  prev: LandmarkLike[],
  currIdx: readonly number[],
  prevIdx: readonly number[]
): number {
  let cost = 0;
  let n = 0;
  for (let i = 0; i < currIdx.length; i++) {
    const c = curr[currIdx[i]];
    const p = prev[prevIdx[i]];
    if (!c || !p) continue;
    const cv = c.visibility ?? 1;
    const pv = p.visibility ?? 1;
    if (cv < 0.35 || pv < 0.35) continue;
    cost += dist2(c, p);
    n++;
  }
  return n > 0 ? cost / n : Number.POSITIVE_INFINITY;
}

/** One-Euro filter state for a single scalar */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(1e-6, dt));
  }

  filter(x: number, tMs: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.tPrev = tMs;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const xHat = this.xPrev + a * (x - this.xPrev);
    this.tPrev = tMs;
    this.xPrev = xHat;
    this.dxPrev = edx;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

export class PoseLandmarkStabilizer {
  private prevRaw: LandmarkLike[] | null = null;
  private prevStable: LandmarkLike[] | null = null;
  private missingFrames = 0;
  private filters: Array<{ x: OneEuro; y: OneEuro; z: OneEuro; v: OneEuro } | null> =
    Array.from({ length: 33 }, () => null);

  /** MediaPipe One-Euro defaults (slightly stronger for far full-body) */
  private readonly minCutoff = 0.05;
  private readonly beta = 40;
  private readonly dCutoff = 1.0;
  private readonly maxHoldFrames = 12;
  private readonly minDrawVisibility = 0.45;

  reset(): void {
    this.prevRaw = null;
    this.prevStable = null;
    this.missingFrames = 0;
    for (const f of this.filters) {
      f?.x.reset();
      f?.y.reset();
      f?.z.reset();
      f?.v.reset();
    }
  }

  /**
   * Stabilize a single pose (33 landmarks). Returns a new array; never mutates input.
   * Returns null only when there is no usable pose (and no hold buffer).
   */
  stabilize(
    landmarks: LandmarkLike[] | null | undefined,
    timestampMs: number
  ): LandmarkLike[] | null {
    if (!landmarks || landmarks.length < 33) {
      this.missingFrames++;
      if (this.prevStable && this.missingFrames <= this.maxHoldFrames) {
        return this.prevStable.map(cloneLm);
      }
      this.prevRaw = null;
      this.prevStable = null;
      return null;
    }

    this.missingFrames = 0;
    let curr = landmarks.map(cloneLm);

    // 1) Correct left/right label flips against previous frame
    if (this.prevRaw) {
      const same =
        chainCost(curr, this.prevRaw, LEFT_CHAIN, LEFT_CHAIN) +
        chainCost(curr, this.prevRaw, RIGHT_CHAIN, RIGHT_CHAIN);
      const swapped =
        chainCost(curr, this.prevRaw, LEFT_CHAIN, RIGHT_CHAIN) +
        chainCost(curr, this.prevRaw, RIGHT_CHAIN, LEFT_CHAIN);

      // Clear preference for swapped assignment → undo the model flip
      if (Number.isFinite(swapped) && Number.isFinite(same) && swapped < same * 0.78) {
        swapLeftRight(curr);
      }
    }

    // 2) Anatomy lock when clearly facing the camera (person's left = larger image x)
    const ls = curr[11];
    const rs = curr[12];
    const lh = curr[23];
    const rh = curr[24];
    if (
      ls &&
      rs &&
      lh &&
      rh &&
      (ls.visibility ?? 1) > 0.5 &&
      (rs.visibility ?? 1) > 0.5 &&
      (lh.visibility ?? 1) > 0.5 &&
      (rh.visibility ?? 1) > 0.5
    ) {
      const shoulderWidth = Math.abs(ls.x - rs.x);
      const hipWidth = Math.abs(lh.x - rh.x);
      // Frontal-ish stance: wide enough shoulders/hips, not a side silhouette
      if (shoulderWidth > 0.08 && hipWidth > 0.05) {
        const shouldersFlipped = ls.x < rs.x;
        const hipsFlipped = lh.x < rh.x;
        if (shouldersFlipped && hipsFlipped) {
          swapLeftRight(curr);
        }
      }
    }

    this.prevRaw = curr.map(cloneLm);

    // 3) One-Euro smooth each landmark
    const smoothed: LandmarkLike[] = curr.map((p, i) => {
      if (!this.filters[i]) {
        this.filters[i] = {
          x: new OneEuro(this.minCutoff, this.beta, this.dCutoff),
          y: new OneEuro(this.minCutoff, this.beta, this.dCutoff),
          z: new OneEuro(this.minCutoff * 2, this.beta * 0.5, this.dCutoff),
          v: new OneEuro(1.0, 0.0, this.dCutoff),
        };
      }
      const f = this.filters[i]!;
      const vis = p.visibility ?? 1;
      // Low visibility: keep previous stable point instead of chasing noise
      if (vis < this.minDrawVisibility && this.prevStable?.[i]) {
        const held = cloneLm(this.prevStable[i]);
        held.visibility = vis;
        return held;
      }
      return {
        x: f.x.filter(p.x, timestampMs),
        y: f.y.filter(p.y, timestampMs),
        z: f.z.filter(p.z, timestampMs),
        visibility: f.v.filter(vis, timestampMs),
      };
    });

    this.prevStable = smoothed.map(cloneLm);
    return smoothed;
  }
}
