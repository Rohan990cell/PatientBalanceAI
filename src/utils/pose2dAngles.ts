/**
 * 2D joint-angle kinematics from MediaPipe Pose (image plane only).
 *
 * Joint conventions (image plane):
 * - Shoulder (hip–shoulder–elbow): keep interior θ.
 *     Arm hanging at side → θ ≈ 0°; raise arm → θ increases.
 * - Elbow / wrist / hip / knee / ankle: flexion from extension φ = 180° − θ.
 *     θ = 180° (limb straight) → φ = 0°; more bent → larger φ.
 * - Trunk sway: 0° = upright vs vertical (signed lean); not converted.
 */

import { BodyPoseLandmarks, NormalizedLandmark } from "../types/vision";

export interface Pose2DAngles {
  /**
   * Shoulder: interior angle hip–shoulder–elbow.
   * 0° ≈ arm hanging at side; larger = arm raised away from torso.
   */
  leftShoulderDeg: number | null;
  rightShoulderDeg: number | null;
  /** Elbow/wrist/hip/knee/ankle: flexion φ = 180° − θ. 0° = fully extended. */
  leftElbowDeg: number | null;
  rightElbowDeg: number | null;
  leftWristDeg: number | null;
  rightWristDeg: number | null;
  leftHipDeg: number | null;
  rightHipDeg: number | null;
  leftKneeDeg: number | null;
  rightKneeDeg: number | null;
  leftAnkleDeg: number | null;
  rightAnkleDeg: number | null;
  /**
   * 2D trunk sway (deg): angle of the mid-hip → mid-shoulder vector from vertical.
   * 0° = upright, + = lean toward image +X (typically patient's left when mirrored display),
   * − = lean toward image −X. Image-plane only. (Not converted with φ=180−θ.)
   */
  trunkSwayDeg: number | null;
  /** @deprecated alias of trunkSwayDeg for older callers */
  trunkLeanDeg: number | null;
  /** Mid-shoulder (normalized) used for trunk vector — null if unavailable */
  midShoulder: { x: number; y: number } | null;
  /** Mid-hip (normalized) used for trunk vector — null if unavailable */
  midHip: { x: number; y: number } | null;
  /** Mean landmark visibility used for confidence gating */
  confidence: number | null;
  timestamp: number;
}

export type JointAngleKey =
  | "shoulder"
  | "elbow"
  | "wrist"
  | "hip"
  | "knee"
  | "ankle";

export const JOINT_ANGLE_KEYS: JointAngleKey[] = [
  "shoulder",
  "elbow",
  "wrist",
  "hip",
  "knee",
  "ankle",
];

const MIN_VISIBILITY = 0.45;

function usable(lm: NormalizedLandmark | null | undefined): lm is NormalizedLandmark {
  if (!lm) return false;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return false;
  const vis = lm.visibility ?? 1;
  return vis >= MIN_VISIBILITY;
}

function rawAt(
  pose: BodyPoseLandmarks,
  idx: number
): NormalizedLandmark | null {
  const p = pose.allRawLandmarks?.[idx];
  return usable(p) ? p : null;
}

function round1(n: number): number {
  return parseFloat(n.toFixed(1));
}

/** Interior angle at point B formed by points A–B–C, in degrees (0–180). */
export function angleAtJointDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const dot = bax * bcx + bay * bcy;
  const magBA = Math.hypot(bax, bay);
  const magBC = Math.hypot(bcx, bcy);
  if (magBA < 1e-8 || magBC < 1e-8) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Convert interior joint angle θ → flexion from straight φ = 180° − θ.
 * Use when anatomical zero is full extension (elbow, knee, hip, …):
 *   θ = 180° (limb straight) → φ = 0°
 *
 * Do NOT use for shoulder (hip–shoulder–elbow): with the arm hanging at the
 * side, θ is already ≈ 0°, so the raw interior angle is the right “0 = at side”.
 */
export function interiorToFlexionDeg(interiorDeg: number): number {
  const clamped = Math.max(0, Math.min(180, interiorDeg));
  return round1(180 - clamped);
}

/** Interior angle at B (no 180−θ). Used for shoulder elevation from hanging. */
function jointInteriorDeg(
  a: NormalizedLandmark | null,
  b: NormalizedLandmark | null,
  c: NormalizedLandmark | null
): number | null {
  if (!a || !b || !c) return null;
  return round1(angleAtJointDeg(a, b, c));
}

/** Flexion from extension: φ = 180° − θ. Used for elbow/wrist/hip/knee/ankle. */
function jointFlexionDeg(
  a: NormalizedLandmark | null,
  b: NormalizedLandmark | null,
  c: NormalizedLandmark | null
): number | null {
  if (!a || !b || !c) return null;
  return interiorToFlexionDeg(angleAtJointDeg(a, b, c));
}

export function emptyPose2DAngles(timestamp: number = Date.now()): Pose2DAngles {
  return {
    leftShoulderDeg: null,
    rightShoulderDeg: null,
    leftElbowDeg: null,
    rightElbowDeg: null,
    leftWristDeg: null,
    rightWristDeg: null,
    leftHipDeg: null,
    rightHipDeg: null,
    leftKneeDeg: null,
    rightKneeDeg: null,
    leftAnkleDeg: null,
    rightAnkleDeg: null,
    trunkSwayDeg: null,
    trunkLeanDeg: null,
    midShoulder: null,
    midHip: null,
    confidence: null,
    timestamp,
  };
}

/**
 * 2D trunk sway from mid-hip → mid-shoulder vs vertical (image plane).
 * Returns signed degrees; null if shoulders/hips not visible.
 */
export function calculateTrunkSway2DDeg(
  pose: BodyPoseLandmarks | null | undefined
): {
  trunkSwayDeg: number | null;
  midShoulder: { x: number; y: number } | null;
  midHip: { x: number; y: number } | null;
} {
  if (!pose) return { trunkSwayDeg: null, midShoulder: null, midHip: null };
  const ls = usable(pose.leftShoulder) ? pose.leftShoulder : null;
  const rs = usable(pose.rightShoulder) ? pose.rightShoulder : null;
  const lh = usable(pose.leftHip) ? pose.leftHip : null;
  const rh = usable(pose.rightHip) ? pose.rightHip : null;
  if (!ls || !rs || !lh || !rh) {
    return { trunkSwayDeg: null, midShoulder: null, midHip: null };
  }
  const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  // Vector hip → shoulder. Upright ≈ (0, −1) in image coords (y down).
  const dx = midShoulder.x - midHip.x;
  const dy = midShoulder.y - midHip.y;
  // Angle from upward vertical: 0 upright, + lean to +X, − lean to −X
  const trunkSwayDeg = round1((Math.atan2(dx, -dy + 1e-8) * 180) / Math.PI);
  return { trunkSwayDeg, midShoulder, midHip };
}

export function getSideJointDeg(
  angles: Pose2DAngles,
  side: "left" | "right",
  joint: JointAngleKey
): number | null {
  const key = `${side}${joint.charAt(0).toUpperCase()}${joint.slice(1)}Deg` as keyof Pose2DAngles;
  const v = angles[key];
  return typeof v === "number" ? v : null;
}

export function calculatePose2DAngles(
  pose: BodyPoseLandmarks | null | undefined,
  timestamp: number = Date.now()
): Pose2DAngles {
  const empty = emptyPose2DAngles(timestamp);
  if (!pose) return empty;

  const ls = usable(pose.leftShoulder) ? pose.leftShoulder : null;
  const rs = usable(pose.rightShoulder) ? pose.rightShoulder : null;
  const le = usable(pose.leftElbow) ? pose.leftElbow : null;
  const re = usable(pose.rightElbow) ? pose.rightElbow : null;
  const lw = usable(pose.leftWrist) ? pose.leftWrist : null;
  const rw = usable(pose.rightWrist) ? pose.rightWrist : null;
  const lh = usable(pose.leftHip) ? pose.leftHip : null;
  const rh = usable(pose.rightHip) ? pose.rightHip : null;
  const lk = usable(pose.leftKnee) ? pose.leftKnee : null;
  const rk = usable(pose.rightKnee) ? pose.rightKnee : null;
  const la = usable(pose.leftAnkle) ? pose.leftAnkle : null;
  const ra = usable(pose.rightAnkle) ? pose.rightAnkle : null;

  // Hand / foot tips from full 33-landmark set (for wrist & ankle 2D angles)
  const lIndex = rawAt(pose, 19);
  const rIndex = rawAt(pose, 20);
  const lFoot = rawAt(pose, 31);
  const rFoot = rawAt(pose, 32);
  const lHeel = rawAt(pose, 29);
  const rHeel = rawAt(pose, 30);

  const used = [ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra].filter(Boolean) as NormalizedLandmark[];
  const confidence =
    used.length > 0
      ? round1(used.reduce((s, p) => s + (p.visibility ?? 1), 0) / used.length)
      : null;

  // Knee: VisionEngine stores extension-style (180=straight) — convert to flexion φ=180−θ
  let leftKneeDeg: number | null =
    pose.kneeFlexion && Number.isFinite(pose.kneeFlexion.leftKneeAngleDeg)
      ? interiorToFlexionDeg(pose.kneeFlexion.leftKneeAngleDeg)
      : null;
  let rightKneeDeg: number | null =
    pose.kneeFlexion && Number.isFinite(pose.kneeFlexion.rightKneeAngleDeg)
      ? interiorToFlexionDeg(pose.kneeFlexion.rightKneeAngleDeg)
      : null;
  if (leftKneeDeg === null) leftKneeDeg = jointFlexionDeg(lh, lk, la);
  if (rightKneeDeg === null) rightKneeDeg = jointFlexionDeg(rh, rk, ra);

  const trunk = calculateTrunkSway2DDeg(pose);

  return {
    // Shoulder (hip–shoulder–elbow): keep interior θ.
    // Arm hanging at side → θ ≈ 0°; raise arm out/up → θ increases toward 180°.
    leftShoulderDeg: jointInteriorDeg(lh, ls, le),
    rightShoulderDeg: jointInteriorDeg(rh, rs, re),
    // Elbow / wrist / hip / knee / ankle: flexion from extension φ = 180° − θ
    // (0° = fully straight/extended).
    leftElbowDeg: jointFlexionDeg(ls, le, lw),
    rightElbowDeg: jointFlexionDeg(rs, re, rw),
    leftWristDeg: jointFlexionDeg(le, lw, lIndex),
    rightWristDeg: jointFlexionDeg(re, rw, rIndex),
    leftHipDeg: jointFlexionDeg(ls, lh, lk),
    rightHipDeg: jointFlexionDeg(rs, rh, rk),
    leftKneeDeg,
    rightKneeDeg,
    leftAnkleDeg: jointFlexionDeg(lk, la, lFoot ?? lHeel),
    rightAnkleDeg: jointFlexionDeg(rk, ra, rFoot ?? rHeel),
    trunkSwayDeg: trunk.trunkSwayDeg,
    trunkLeanDeg: trunk.trunkSwayDeg,
    midShoulder: trunk.midShoulder,
    midHip: trunk.midHip,
    confidence: confidence !== null ? parseFloat(confidence.toFixed(3)) : null,
    timestamp,
  };
}

/** Flat joint metrics captured at the instant a board target hold is completed. */
export type Pose2DAngleMetricKey =
  | "leftShoulderDeg"
  | "rightShoulderDeg"
  | "leftElbowDeg"
  | "rightElbowDeg"
  | "leftWristDeg"
  | "rightWristDeg"
  | "leftHipDeg"
  | "rightHipDeg"
  | "leftKneeDeg"
  | "rightKneeDeg"
  | "leftAnkleDeg"
  | "rightAnkleDeg"
  | "trunkSwayDeg";

export const POSE_2D_ANGLE_METRIC_KEYS: Pose2DAngleMetricKey[] = [
  "leftShoulderDeg",
  "rightShoulderDeg",
  "leftElbowDeg",
  "rightElbowDeg",
  "leftWristDeg",
  "rightWristDeg",
  "leftHipDeg",
  "rightHipDeg",
  "leftKneeDeg",
  "rightKneeDeg",
  "leftAnkleDeg",
  "rightAnkleDeg",
  "trunkSwayDeg",
];

export const POSE_2D_ANGLE_METRIC_LABELS: Record<Pose2DAngleMetricKey, string> = {
  leftShoulderDeg: "L Shoulder",
  rightShoulderDeg: "R Shoulder",
  leftElbowDeg: "L Elbow",
  rightElbowDeg: "R Elbow",
  leftWristDeg: "L Wrist",
  rightWristDeg: "R Wrist",
  leftHipDeg: "L Hip",
  rightHipDeg: "R Hip",
  leftKneeDeg: "L Knee",
  rightKneeDeg: "R Knee",
  leftAnkleDeg: "L Ankle",
  rightAnkleDeg: "R Ankle",
  trunkSwayDeg: "Trunk Sway",
};

export interface BoardSyncedPose2DSnapshot {
  stepNumber: number;
  targetIndex: number;
  targetId: string;
  targetName: string;
  shortLabel: string;
  targetX: number;
  targetY: number;
  /** Board COP at the synced achievement instant */
  copX: number | null;
  copY: number | null;
  weightKg: number | null;
  /** True when snapshot taken at board-target hold completion */
  boardSynced: boolean;
  poseConfidence: number | null;
  timestamp: number;
  angles: Pose2DAngles;
}

export interface Pose2DAngleDeltas {
  leftShoulderDeg: number | null;
  rightShoulderDeg: number | null;
  leftElbowDeg: number | null;
  rightElbowDeg: number | null;
  leftWristDeg: number | null;
  rightWristDeg: number | null;
  leftHipDeg: number | null;
  rightHipDeg: number | null;
  leftKneeDeg: number | null;
  rightKneeDeg: number | null;
  leftAnkleDeg: number | null;
  rightAnkleDeg: number | null;
  trunkSwayDeg: number | null;
}

export interface Pose2DAngleTransition {
  fromStep: number;
  toStep: number;
  fromLabel: string;
  toLabel: string;
  fromTargetName: string;
  toTargetName: string;
  /** Milliseconds between synced board achievements */
  dtMs: number;
  fromAngles: Pose2DAngles;
  toAngles: Pose2DAngles;
  /** to − from for each metric (null if either side missing) */
  deltas: Pose2DAngleDeltas;
  boardSynced: boolean;
}

export interface Pose2DAngleSessionReport {
  snapshots: BoardSyncedPose2DSnapshot[];
  transitions: Pose2DAngleTransition[];
  syncedTargetCount: number;
}

/** Round to whole degrees so displayed values and Δ always match. */
export function roundAngleDeg(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v);
}

function deltaDeg(to: number | null, from: number | null): number | null {
  if (to === null || from === null || Number.isNaN(to) || Number.isNaN(from)) return null;
  // Integer arithmetic after rounding — avoids 172→172 showing Δ −1°
  return Math.round(to) - Math.round(from);
}

/** Snapshot angles rounded to report precision (whole degrees). */
export function normalizeAnglesForReport(angles: Pose2DAngles): Pose2DAngles {
  return {
    ...angles,
    leftShoulderDeg: roundAngleDeg(angles.leftShoulderDeg),
    rightShoulderDeg: roundAngleDeg(angles.rightShoulderDeg),
    leftElbowDeg: roundAngleDeg(angles.leftElbowDeg),
    rightElbowDeg: roundAngleDeg(angles.rightElbowDeg),
    leftWristDeg: roundAngleDeg(angles.leftWristDeg),
    rightWristDeg: roundAngleDeg(angles.rightWristDeg),
    leftHipDeg: roundAngleDeg(angles.leftHipDeg),
    rightHipDeg: roundAngleDeg(angles.rightHipDeg),
    leftKneeDeg: roundAngleDeg(angles.leftKneeDeg),
    rightKneeDeg: roundAngleDeg(angles.rightKneeDeg),
    leftAnkleDeg: roundAngleDeg(angles.leftAnkleDeg),
    rightAnkleDeg: roundAngleDeg(angles.rightAnkleDeg),
    trunkSwayDeg: roundAngleDeg(angles.trunkSwayDeg),
    trunkLeanDeg: roundAngleDeg(angles.trunkLeanDeg ?? angles.trunkSwayDeg),
  };
}

export function computePose2DAngleDeltas(
  from: Pose2DAngles,
  to: Pose2DAngles
): Pose2DAngleDeltas {
  const f = normalizeAnglesForReport(from);
  const t = normalizeAnglesForReport(to);
  return {
    leftShoulderDeg: deltaDeg(t.leftShoulderDeg, f.leftShoulderDeg),
    rightShoulderDeg: deltaDeg(t.rightShoulderDeg, f.rightShoulderDeg),
    leftElbowDeg: deltaDeg(t.leftElbowDeg, f.leftElbowDeg),
    rightElbowDeg: deltaDeg(t.rightElbowDeg, f.rightElbowDeg),
    leftWristDeg: deltaDeg(t.leftWristDeg, f.leftWristDeg),
    rightWristDeg: deltaDeg(t.rightWristDeg, f.rightWristDeg),
    leftHipDeg: deltaDeg(t.leftHipDeg, f.leftHipDeg),
    rightHipDeg: deltaDeg(t.rightHipDeg, f.rightHipDeg),
    leftKneeDeg: deltaDeg(t.leftKneeDeg, f.leftKneeDeg),
    rightKneeDeg: deltaDeg(t.rightKneeDeg, f.rightKneeDeg),
    leftAnkleDeg: deltaDeg(t.leftAnkleDeg, f.leftAnkleDeg),
    rightAnkleDeg: deltaDeg(t.rightAnkleDeg, f.rightAnkleDeg),
    trunkSwayDeg: deltaDeg(t.trunkSwayDeg, f.trunkSwayDeg),
  };
}

export function buildPose2DAngleSessionReport(
  snapshots: BoardSyncedPose2DSnapshot[]
): Pose2DAngleSessionReport {
  const ordered = [...snapshots]
    .sort((a, b) => a.targetIndex - b.targetIndex)
    .map((s) => ({
      ...s,
      angles: normalizeAnglesForReport(s.angles),
    }));
  const transitions: Pose2DAngleTransition[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1];
    const to = ordered[i];
    transitions.push({
      fromStep: from.stepNumber,
      toStep: to.stepNumber,
      fromLabel: from.shortLabel,
      toLabel: to.shortLabel,
      fromTargetName: from.targetName,
      toTargetName: to.targetName,
      dtMs: Math.max(0, to.timestamp - from.timestamp),
      fromAngles: from.angles,
      toAngles: to.angles,
      // Δ = angle_at_to − angle_at_from (signed). Example: −4 − (+8) = −12
      deltas: computePose2DAngleDeltas(from.angles, to.angles),
      boardSynced: from.boardSynced && to.boardSynced,
    });
  }
  return {
    snapshots: ordered,
    transitions,
    syncedTargetCount: ordered.filter((s) => s.boardSynced).length,
  };
}

/** Explicit signed degrees so −4° is never read as 4°. */
export function formatAngleDeg(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "--";
  const n = Math.round(v);
  if (n > 0) return `+${n}°`;
  return `${n}°`; // includes − and 0
}

export function formatDeltaDeg(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "--";
  const n = Math.round(v);
  if (n > 0) return `+${n}°`;
  if (n < 0) return `${n}°`;
  return `0°`;
}

export interface Pose2DAngleMetricSummary {
  key: Pose2DAngleMetricKey;
  label: string;
  sampleCount: number;
  minDeg: number | null;
  medianDeg: number | null;
  maxDeg: number | null;
}

function medianOfSorted(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Min / median / max per joint across all board-synced target snapshots. */
export function computePose2DAngleSummaries(
  report: Pose2DAngleSessionReport
): Pose2DAngleMetricSummary[] {
  return POSE_2D_ANGLE_METRIC_KEYS.map((key) => {
    const vals = report.snapshots
      .map((s) => roundAngleDeg(s.angles[key] as number | null | undefined))
      .filter((v): v is number => v !== null);
    const sorted = [...vals].sort((a, b) => a - b);
    const medianRaw = medianOfSorted(sorted);
    return {
      key,
      label: POSE_2D_ANGLE_METRIC_LABELS[key],
      sampleCount: vals.length,
      minDeg: sorted.length ? sorted[0] : null,
      medianDeg: medianRaw === null ? null : Math.round(medianRaw),
      maxDeg: sorted.length ? sorted[sorted.length - 1] : null,
    };
  });
}

/** Continuous angle samples buffered during ACTIVE (for transit box plots). */
export interface Pose2DAngleTimelineSample {
  timestamp: number;
  visionFps: number | null;
  angles: Pose2DAngles;
}

/**
 * Box-plot X order: trunk first, then L/R joint pairs (shoulders → … → ankles).
 * Rendering packs each L/R pair tightly with larger gaps between pairs.
 */
export const TRANSIT_BOX_PLOT_METRIC_ORDER: Pose2DAngleMetricKey[] = [
  "trunkSwayDeg",
  "leftShoulderDeg",
  "rightShoulderDeg",
  "leftElbowDeg",
  "rightElbowDeg",
  "leftWristDeg",
  "rightWristDeg",
  "leftHipDeg",
  "rightHipDeg",
  "leftKneeDeg",
  "rightKneeDeg",
  "leftAnkleDeg",
  "rightAnkleDeg",
];

/**
 * X centers for box plots: trunk (solo) then L/R pairs close together,
 * with larger gaps between joint groups.
 */
export function computePairedBoxCenters(
  boxCount: number,
  left: number,
  innerW: number
): number[] {
  if (boxCount <= 0) return [];

  const groups: number[][] = [[0]];
  for (let i = 1; i < boxCount; i += 2) {
    const g = [i];
    if (i + 1 < boxCount) g.push(i + 1);
    groups.push(g);
  }

  /** Width units per group (pair or trunk). */
  const PAIR_SPAN = 1;
  /** Extra gap between groups (e.g. Shoulder → Elbow) — keep tight. */
  const GROUP_GAP = 0.4;
  /** Fraction of PAIR_SPAN separating L vs R centers (small = tight pair). */
  const WITHIN_PAIR = 0.28;

  const totalUnits =
    groups.length * PAIR_SPAN + Math.max(0, groups.length - 1) * GROUP_GAP;
  const unit = innerW / Math.max(1e-6, totalUnits);

  const centers: number[] = new Array(boxCount);
  let cursor = left;
  for (const g of groups) {
    const span = PAIR_SPAN * unit;
    if (g.length === 1) {
      centers[g[0]!] = cursor + span / 2;
    } else {
      const mid = cursor + span / 2;
      const half = (WITHIN_PAIR * span) / 2;
      centers[g[0]!] = mid - half;
      centers[g[1]!] = mid + half;
    }
    cursor += span + GROUP_GAP * unit;
  }
  return centers;
}

export interface TransitAngleBoxStats {
  key: Pose2DAngleMetricKey;
  label: string;
  region: "upper" | "lower" | "trunk";
  n: number;
  /** Absolute sample min (may be an outlier) */
  minDeg: number;
  q1Deg: number;
  medianDeg: number;
  q3Deg: number;
  /** Absolute sample max (may be an outlier) */
  maxDeg: number;
  /** Tukey lower whisker: lowest point ≥ Q1 − 1.5·IQR */
  whiskerLowDeg: number;
  /** Tukey upper whisker: highest point ≤ Q3 + 1.5·IQR */
  whiskerHighDeg: number;
  /** Points outside [whiskerLow, whiskerHigh] */
  outliersDeg: number[];
}

/** One leave→hit transit: Target (n−1) border exit → Target n border hit. */
export interface TransitAngleBoxPlot {
  fromStep: number;
  toStep: number;
  toLabel: string;
  leaveTs: number;
  hitTs: number;
  transitSeconds: number;
  fpsUsed: number;
  /** Expected points ≈ transitSeconds × fps */
  expectedPoints: number;
  sampleCount: number;
  boxes: TransitAngleBoxStats[];
  /**
   * When true, box values are Δ° vs center-stance T0 baseline
   * (T_n − T0 for every sample — never T_n − T_{n−1}).
   */
  relativeToT0: boolean;
}

function quantileOfSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function boxStatsFromValues(
  key: Pose2DAngleMetricKey,
  values: number[]
): TransitAngleBoxStats | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const region: "upper" | "lower" | "trunk" = key.includes("trunk")
    ? "trunk"
    : key.includes("Shoulder") || key.includes("Elbow") || key.includes("Wrist")
      ? "upper"
      : "lower";

  const q1 = quantileOfSorted(sorted, 0.25);
  const median = quantileOfSorted(sorted, 0.5);
  const q3 = quantileOfSorted(sorted, 0.75);
  const iqr = Math.max(0, q3 - q1);
  const fenceLow = q1 - 1.5 * iqr;
  const fenceHigh = q3 + 1.5 * iqr;

  // Whiskers = farthest inliers inside Tukey fences
  let whiskerLow = sorted[0];
  let whiskerHigh = sorted[sorted.length - 1];
  for (const v of sorted) {
    if (v >= fenceLow) {
      whiskerLow = v;
      break;
    }
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] <= fenceHigh) {
      whiskerHigh = sorted[i];
      break;
    }
  }

  const outliersDeg = sorted
    .filter((v) => v < fenceLow || v > fenceHigh)
    .map((v) => parseFloat(v.toFixed(1)));

  return {
    key,
    label: POSE_2D_ANGLE_METRIC_LABELS[key],
    region,
    n: sorted.length,
    minDeg: parseFloat(sorted[0].toFixed(1)),
    q1Deg: parseFloat(q1.toFixed(1)),
    medianDeg: parseFloat(median.toFixed(1)),
    q3Deg: parseFloat(q3.toFixed(1)),
    maxDeg: parseFloat(sorted[sorted.length - 1].toFixed(1)),
    whiskerLowDeg: parseFloat(whiskerLow.toFixed(1)),
    whiskerHighDeg: parseFloat(whiskerHigh.toFixed(1)),
    outliersDeg,
  };
}

type TransitCopSample = { timestamp: number; isInside: boolean };
type TransitTargetSlice = {
  stepNumber: number;
  shortLabel: string;
  samples: TransitCopSample[];
  completionTimeSeconds?: number | null;
};

/**
 * Leave previous (after complete) → first hit of current target border.
 * Same window used for COP path transit times on the result board.
 */
export function computeLeaveToHitWindow(
  curr: TransitTargetSlice,
  prev: TransitTargetSlice | null
): { leaveTs: number; hitTs: number; transitSeconds: number } | null {
  if (!curr.samples.length) return null;
  const hit = curr.samples.find((s) => s.isInside);
  if (!hit) return null;

  let leaveTs = curr.samples[0].timestamp;
  if (prev && prev.samples.length > 0) {
    const prevStart = prev.samples[0].timestamp;
    const completeTs =
      typeof prev.completionTimeSeconds === "number" &&
      Number.isFinite(prev.completionTimeSeconds)
        ? prevStart + prev.completionTimeSeconds * 1000
        : prev.samples[prev.samples.length - 1].timestamp;

    let foundLeave: number | null = null;
    for (const s of prev.samples) {
      if (s.timestamp + 1 >= completeTs && !s.isInside) {
        foundLeave = s.timestamp;
        break;
      }
    }
    leaveTs = foundLeave ?? curr.samples[0].timestamp;
    if (leaveTs > hit.timestamp) leaveTs = curr.samples[0].timestamp;
  }

  const transitSeconds = Math.max(0, (hit.timestamp - leaveTs) / 1000);
  return {
    leaveTs,
    hitTs: hit.timestamp,
    transitSeconds: parseFloat(transitSeconds.toFixed(2)),
  };
}

/** Δ° = sample − T0 baseline (null if either side missing). */
function angleDeltaFromBaseline(
  sample: number | null | undefined,
  baseline: number | null | undefined
): number | null {
  if (
    typeof sample !== "number" ||
    typeof baseline !== "number" ||
    !Number.isFinite(sample) ||
    !Number.isFinite(baseline)
  ) {
    return null;
  }
  return parseFloat((sample - baseline).toFixed(1));
}

/**
 * Build per-transit box plots from continuous angle timeline.
 * Window = leave prev border (after complete) → hit next border.
 *
 * When `t0Baseline` (center-stance angles) is provided, every sample is
 * converted to Δ° vs T0:  T1−T0, T2−T0, …  (always vs center, not vs previous target).
 */
export function buildTransitAngleBoxPlots(
  targets: TransitTargetSlice[],
  timeline: Pose2DAngleTimelineSample[],
  t0Baseline?: Pose2DAngles | null
): TransitAngleBoxPlot[] {
  if (!targets.length || !timeline.length) return [];

  const baseline = t0Baseline ? normalizeAnglesForReport(t0Baseline) : null;
  const relativeToT0 = Boolean(baseline);

  const out: TransitAngleBoxPlot[] = [];
  for (let i = 0; i < targets.length; i++) {
    const curr = targets[i];
    const prev = i > 0 ? targets[i - 1] : null;
    const win = computeLeaveToHitWindow(curr, prev);
    if (!win) continue;

    const inWindow = timeline.filter(
      (s) => s.timestamp >= win.leaveTs && s.timestamp <= win.hitTs
    );
    const fpsSamples = inWindow
      .map((s) => s.visionFps)
      .filter((f): f is number => typeof f === "number" && Number.isFinite(f) && f > 0);
    const fpsUsed =
      fpsSamples.length > 0
        ? parseFloat(
            (fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length).toFixed(1)
          )
        : 30;
    const expectedPoints = Math.max(
      1,
      Math.round(win.transitSeconds * fpsUsed)
    );

    const boxes: TransitAngleBoxStats[] = [];
    for (const key of TRANSIT_BOX_PLOT_METRIC_ORDER) {
      const vals = inWindow
        .map((s) => {
          const raw = s.angles[key] as number | null | undefined;
          if (!baseline) {
            return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
          }
          const baseVal = baseline[key] as number | null | undefined;
          return angleDeltaFromBaseline(raw, baseVal);
        })
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const box = boxStatsFromValues(key, vals);
      if (box) boxes.push(box);
    }
    if (boxes.length === 0) continue;

    out.push({
      // Prefer previous target's real step (so after T6 → T0 shows 6 → 0, not −1 → 0)
      fromStep: prev ? prev.stepNumber : Math.max(0, curr.stepNumber - 1),
      toStep: curr.stepNumber,
      toLabel: curr.shortLabel,
      leaveTs: win.leaveTs,
      hitTs: win.hitTs,
      transitSeconds: win.transitSeconds,
      fpsUsed,
      expectedPoints,
      sampleCount: inWindow.length,
      boxes,
      relativeToT0,
    });
  }
  return out;
}

export interface NamedNormPoint {
  name: string;
  x: number;
  y: number;
}

/** One joint angle and the landmark vectors used to compute it. */
export interface Pose2DAngleVectorSpec {
  key: Pose2DAngleMetricKey;
  label: string;
  angleDeg: number | null;
  /** Landmark points in order (A–B–C for joint at B, or A→B for trunk). */
  points: NamedNormPoint[];
  /** Plain-language vector description */
  vectorDescription: string;
  color: string;
}

/** Center-stance capture taken when the 3s pre-start center hold completes. */
export interface CenterStanceSnapshot {
  timestamp: number;
  /** JPEG/PNG data URL of the live camera canvas at capture time */
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  isMirrored: boolean;
  angles: Pose2DAngles;
  /** Mid-hip = average of left & right hip landmarks (normalized image coords) */
  midHip: { x: number; y: number } | null;
  midShoulder: { x: number; y: number } | null;
  leftHip: { x: number; y: number } | null;
  rightHip: { x: number; y: number } | null;
  vectors: Pose2DAngleVectorSpec[];
}

const VECTOR_COLORS: Record<Pose2DAngleMetricKey, string> = {
  leftShoulderDeg: "#38BDF8",
  rightShoulderDeg: "#7DD3FC",
  leftElbowDeg: "#34D399",
  rightElbowDeg: "#6EE7B7",
  leftWristDeg: "#A78BFA",
  rightWristDeg: "#C4B5FD",
  leftHipDeg: "#FBBF24",
  rightHipDeg: "#FCD34D",
  leftKneeDeg: "#F87171",
  rightKneeDeg: "#FCA5A5",
  leftAnkleDeg: "#2DD4BF",
  rightAnkleDeg: "#5EEAD4",
  trunkSwayDeg: "#F59E0B",
};

function pt(name: string, lm: { x: number; y: number } | null): NamedNormPoint | null {
  if (!lm) return null;
  return { name, x: lm.x, y: lm.y };
}

/**
 * Build the exact landmark vectors used for each 2D angle at this pose.
 * Joint angles use vectors B→A and B→C; trunk uses mid-hip → mid-shoulder.
 */
export function extractPose2DAngleVectors(
  pose: BodyPoseLandmarks | null | undefined,
  angles: Pose2DAngles
): Pose2DAngleVectorSpec[] {
  if (!pose) return [];

  const ls = usable(pose.leftShoulder) ? pose.leftShoulder : null;
  const rs = usable(pose.rightShoulder) ? pose.rightShoulder : null;
  const le = usable(pose.leftElbow) ? pose.leftElbow : null;
  const re = usable(pose.rightElbow) ? pose.rightElbow : null;
  const lw = usable(pose.leftWrist) ? pose.leftWrist : null;
  const rw = usable(pose.rightWrist) ? pose.rightWrist : null;
  const lh = usable(pose.leftHip) ? pose.leftHip : null;
  const rh = usable(pose.rightHip) ? pose.rightHip : null;
  const lk = usable(pose.leftKnee) ? pose.leftKnee : null;
  const rk = usable(pose.rightKnee) ? pose.rightKnee : null;
  const la = usable(pose.leftAnkle) ? pose.leftAnkle : null;
  const ra = usable(pose.rightAnkle) ? pose.rightAnkle : null;
  const lIndex = rawAt(pose, 19);
  const rIndex = rawAt(pose, 20);
  const lFoot = rawAt(pose, 31) ?? rawAt(pose, 29);
  const rFoot = rawAt(pose, 32) ?? rawAt(pose, 30);

  const joint = (
    key: Pose2DAngleMetricKey,
    aName: string,
    a: { x: number; y: number } | null,
    bName: string,
    b: { x: number; y: number } | null,
    cName: string,
    c: { x: number; y: number } | null,
    desc: string
  ): Pose2DAngleVectorSpec | null => {
    const pa = pt(aName, a);
    const pb = pt(bName, b);
    const pc = pt(cName, c);
    if (!pa || !pb || !pc) return null;
    return {
      key,
      label: POSE_2D_ANGLE_METRIC_LABELS[key],
      angleDeg: roundAngleDeg(angles[key] as number | null),
      points: [pa, pb, pc],
      vectorDescription: desc,
      color: VECTOR_COLORS[key],
    };
  };

  const out: Pose2DAngleVectorSpec[] = [];
  const push = (v: Pose2DAngleVectorSpec | null) => {
    if (v) out.push(v);
  };

  push(
    joint(
      "leftShoulderDeg",
      "L Hip",
      lh,
      "L Shoulder",
      ls,
      "L Elbow",
      le,
      "Vectors: L Shoulder→L Hip and L Shoulder→L Elbow"
    )
  );
  push(
    joint(
      "rightShoulderDeg",
      "R Hip",
      rh,
      "R Shoulder",
      rs,
      "R Elbow",
      re,
      "Vectors: R Shoulder→R Hip and R Shoulder→R Elbow"
    )
  );
  push(
    joint(
      "leftElbowDeg",
      "L Shoulder",
      ls,
      "L Elbow",
      le,
      "L Wrist",
      lw,
      "Vectors: L Elbow→L Shoulder and L Elbow→L Wrist"
    )
  );
  push(
    joint(
      "rightElbowDeg",
      "R Shoulder",
      rs,
      "R Elbow",
      re,
      "R Wrist",
      rw,
      "Vectors: R Elbow→R Shoulder and R Elbow→R Wrist"
    )
  );
  push(
    joint(
      "leftWristDeg",
      "L Elbow",
      le,
      "L Wrist",
      lw,
      "L Index",
      lIndex,
      "Vectors: L Wrist→L Elbow and L Wrist→L Index tip"
    )
  );
  push(
    joint(
      "rightWristDeg",
      "R Elbow",
      re,
      "R Wrist",
      rw,
      "R Index",
      rIndex,
      "Vectors: R Wrist→R Elbow and R Wrist→R Index tip"
    )
  );
  push(
    joint(
      "leftHipDeg",
      "L Shoulder",
      ls,
      "L Hip",
      lh,
      "L Knee",
      lk,
      "Vectors: L Hip→L Shoulder and L Hip→L Knee"
    )
  );
  push(
    joint(
      "rightHipDeg",
      "R Shoulder",
      rs,
      "R Hip",
      rh,
      "R Knee",
      rk,
      "Vectors: R Hip→R Shoulder and R Hip→R Knee"
    )
  );
  push(
    joint(
      "leftKneeDeg",
      "L Hip",
      lh,
      "L Knee",
      lk,
      "L Ankle",
      la,
      "Vectors: L Knee→L Hip and L Knee→L Ankle"
    )
  );
  push(
    joint(
      "rightKneeDeg",
      "R Hip",
      rh,
      "R Knee",
      rk,
      "R Ankle",
      ra,
      "Vectors: R Knee→R Hip and R Knee→R Ankle"
    )
  );
  push(
    joint(
      "leftAnkleDeg",
      "L Knee",
      lk,
      "L Ankle",
      la,
      "L Foot",
      lFoot,
      "Vectors: L Ankle→L Knee and L Ankle→L Foot tip"
    )
  );
  push(
    joint(
      "rightAnkleDeg",
      "R Knee",
      rk,
      "R Ankle",
      ra,
      "R Foot",
      rFoot,
      "Vectors: R Ankle→R Knee and R Ankle→R Foot tip"
    )
  );

  if (angles.midHip && angles.midShoulder) {
    out.push({
      key: "trunkSwayDeg",
      label: POSE_2D_ANGLE_METRIC_LABELS.trunkSwayDeg,
      angleDeg: roundAngleDeg(angles.trunkSwayDeg),
      points: [
        { name: "Mid-Hip", x: angles.midHip.x, y: angles.midHip.y },
        { name: "Mid-Shoulder", x: angles.midShoulder.x, y: angles.midShoulder.y },
      ],
      vectorDescription: "Vector: Mid-Hip → Mid-Shoulder vs upright vertical",
      color: VECTOR_COLORS.trunkSwayDeg,
    });
  }

  return out;
}

/** Capture a center-stance snapshot (angles + vectors + optional canvas image). */
export function buildCenterStanceSnapshot(params: {
  pose: BodyPoseLandmarks | null | undefined;
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  isMirrored: boolean;
  timestamp?: number;
}): CenterStanceSnapshot {
  const timestamp = params.timestamp ?? Date.now();
  const angles = calculatePose2DAngles(params.pose, timestamp);
  const lh = params.pose && usable(params.pose.leftHip) ? params.pose.leftHip : null;
  const rh = params.pose && usable(params.pose.rightHip) ? params.pose.rightHip : null;
  return {
    timestamp,
    imageDataUrl: params.imageDataUrl,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
    isMirrored: params.isMirrored,
    angles,
    midHip: angles.midHip,
    midShoulder: angles.midShoulder,
    leftHip: lh ? { x: lh.x, y: lh.y } : null,
    rightHip: rh ? { x: rh.x, y: rh.y } : null,
    vectors: extractPose2DAngleVectors(params.pose, angles),
  };
}
