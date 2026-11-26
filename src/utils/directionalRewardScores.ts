import {
  DirectionalTargetAssessment,
  DirectionalWeightShiftSessionSummary,
  HoldWindowErrorSeries,
  WII_BOARD_DIMENSIONS,
} from "./directionalWeightShiftExercise";

/** Per-target reward marks (each score is an integer 1–10). */
export interface TargetRewardScore {
  stepNumber: number;
  shortLabel: string;
  /** Straight-line ideal distance from previous target (or center) → this target (mm). */
  shortestPathMm: number;
  /** Measured COP trajectory length for this target (mm). */
  actualPathMm: number;
  /** actual / shortest (≥ 1 when a path exists). */
  pathRatio: number;
  /** 10 = closest to shortest path … 1 = much longer. */
  pathScore: number;
  /** Mean miss distance from the hold-window miss graph (mm). */
  meanMissMm: number | null;
  /** Target tolerance used to scale miss score (mm). */
  toleranceMm: number;
  /** 10 = stayed very close to target … 1 = far most of the time. */
  missScore: number;
  /** Average of pathScore + missScore, rounded 1–10. */
  targetScore: number;
}

export interface SessionRewardSummary {
  targets: TargetRewardScore[];
  averagePathScore: number;
  averageMissScore: number;
  /** Final session mark: mean of per-target scores, 1–10. */
  finalScore: number;
  maxScore: 10;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

/**
 * Path efficiency: shortest → 10; about 3× shortest → 1.
 * ratio = actualPath / shortestPath.
 */
export function pathScoreFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  const t = Math.min(1, Math.max(0, (Math.max(ratio, 1) - 1) / 2));
  return clampScore(10 - 9 * t);
}

/**
 * Hold-window miss closeness: ~0 mm mean miss → 10;
 * mean miss ≈ 2.5 × tolerance → 1.
 */
export function missScoreFromMeanMm(meanMissMm: number, toleranceMm: number): number {
  if (!Number.isFinite(meanMissMm) || meanMissMm < 0) return 1;
  const tol = Math.max(1, toleranceMm);
  const t = Math.min(1, Math.max(0, meanMissMm / (tol * 2.5)));
  return clampScore(10 - 9 * t);
}

/** Live per-target path + miss marks at the moment a target is achieved. */
export function computeLiveTargetRewardScores(params: {
  shortestPathMm: number;
  actualPathMm: number;
  meanMissMm: number | null;
  toleranceMm: number;
}): { pathScore: number; missScore: number; targetScore: number } {
  const shortest = Math.max(0, params.shortestPathMm);
  const actual = Math.max(0, params.actualPathMm);
  const pathRatio = shortest > 1e-3 ? Math.max(actual, shortest) / shortest : 1;
  const pathScore = actual > 0 ? pathScoreFromRatio(pathRatio) : 1;
  const missScore =
    params.meanMissMm === null
      ? 1
      : missScoreFromMeanMm(params.meanMissMm, params.toleranceMm);
  const targetScore = clampScore((pathScore + missScore) / 2);
  return { pathScore, missScore, targetScore };
}

function targetCenterMm(t: DirectionalTargetAssessment): { x: number; y: number } {
  if (typeof t.targetXMm === "number" && typeof t.targetYMm === "number") {
    return { x: t.targetXMm, y: t.targetYMm };
  }
  return {
    x: t.targetX * WII_BOARD_DIMENSIONS.halfDistanceXMm,
    y: t.targetY * WII_BOARD_DIMENSIONS.halfDistanceYMm,
  };
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Build 1–10 path + miss rewards for every target, then a session final mark.
 * UI-only — not written into PDF reports.
 */
export function buildSessionRewardSummary(
  summary: DirectionalWeightShiftSessionSummary
): SessionRewardSummary {
  const holdById = new Map<string, HoldWindowErrorSeries>();
  for (const s of summary.holdWindowErrorSeries ?? []) {
    holdById.set(s.targetId, s);
  }

  const targets: TargetRewardScore[] = summary.targets.map((t, index) => {
    const prev = index > 0 ? summary.targets[index - 1] : null;
    const currMm = targetCenterMm(t);
    const prevMm = prev
      ? targetCenterMm(prev)
      : { x: 0, y: 0 }; // Target 1 starts from board center after T0 hold

    const shortestPathMm = Math.hypot(currMm.x - prevMm.x, currMm.y - prevMm.y);
    const actualPathMm =
      typeof t.pathLengthMm === "number" && Number.isFinite(t.pathLengthMm)
        ? Math.max(0, t.pathLengthMm)
        : 0;

    const pathRatio =
      shortestPathMm > 1e-3 ? Math.max(actualPathMm, shortestPathMm) / shortestPathMm : 1;
    const pathScore = actualPathMm > 0 ? pathScoreFromRatio(pathRatio) : 1;

    const hold =
      (t.holdWindowErrorSeries ?? null) ||
      (t.targetId ? holdById.get(t.targetId) : undefined) ||
      null;

    let meanMissMm: number | null =
      hold && typeof hold.meanErrorMm === "number" && Number.isFinite(hold.meanErrorMm)
        ? hold.meanErrorMm
        : typeof t.meanDistanceErrorMm === "number" && Number.isFinite(t.meanDistanceErrorMm)
          ? t.meanDistanceErrorMm
          : typeof t.meanDistanceMm === "number" && Number.isFinite(t.meanDistanceMm)
            ? t.meanDistanceMm
            : null;

    const toleranceMm = Math.max(1, t.toleranceMm || 40);
    const missScore =
      meanMissMm === null ? 1 : missScoreFromMeanMm(meanMissMm, toleranceMm);

    const targetScore = clampScore((pathScore + missScore) / 2);

    return {
      stepNumber: t.stepNumber,
      shortLabel: t.shortLabel,
      shortestPathMm: parseFloat(shortestPathMm.toFixed(1)),
      actualPathMm: parseFloat(actualPathMm.toFixed(1)),
      pathRatio: parseFloat(pathRatio.toFixed(3)),
      pathScore,
      meanMissMm:
        meanMissMm === null ? null : parseFloat(meanMissMm.toFixed(1)),
      toleranceMm: parseFloat(toleranceMm.toFixed(1)),
      missScore,
      targetScore,
    };
  });

  const averagePathScore = targets.length
    ? clampScore(mean(targets.map((t) => t.pathScore)))
    : 1;
  const averageMissScore = targets.length
    ? clampScore(mean(targets.map((t) => t.missScore)))
    : 1;
  const finalScore = targets.length
    ? clampScore(mean(targets.map((t) => t.targetScore)))
    : 1;

  return {
    targets,
    averagePathScore,
    averageMissScore,
    finalScore,
    maxScore: 10,
  };
}

export const REWARD_SCORE_INFO = {
  what: "Target rewards (1–10)",
  meaning:
    "Two marks per target — path efficiency and hold closeness — averaged into a target score, then averaged across all targets for the final mark.",
  how:
    "Path: compare your COP path length to the straight-line shortest distance to the target. Shortest ≈ 10; about 3× longer ≈ 1. Miss: average distance from the target center during the hold. On center (0 mm) ≈ 10; about 2.5× the allowed circle (tolerance) ≈ 1 — so a larger bullseye does not unfairly change the mark. Final mark = average of all target scores (1–10).",
};
