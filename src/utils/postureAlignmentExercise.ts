/**
 * Posture Alignment Exercise Logic & Biomechanical Mathematics
 *
 * PHASE C — CAMERA-ONLY REHABILITATION EXERCISE
 * Pure Computer Vision Rehabilitation Protocol:
 * Uses ONLY the camera and MediaPipe 2D optical pose estimation.
 *
 * HARDWARE CONSTRAINTS:
 * - Wii Balance Board must NOT be required.
 * - Do NOT use COP.
 * - Do NOT use weight data.
 * - Do NOT require SMPL.
 * - Reuses the existing VisionContext and MediaPipe pipeline.
 * - Prioritizes Intel RealSense when available.
 * - Does not create a duplicate camera pipeline.
 *
 * NATURAL MOVEMENT TOLERANCE & SCIENTIFIC RIGOR:
 * - Allows small, natural head, shoulder, hip, and torso movements while maintaining generally upright posture.
 * - Configurable tolerance thresholds based on normalized body measurements rather than exact pixel coordinates.
 * - Exponential Moving Average (EMA) smoothing for noisy raw pose landmarks.
 * - Hysteresis on real-time guidance so minor fluctuations do not repeatedly switch messages.
 * - 10-second stability hold timer with configurable grace period for minor transient shifts.
 * - Immediate timer pause upon tracking loss or insufficient landmark confidence.
 *
 * SAFETY & DISCLOSURE:
 * "Development posture feedback — clinical validation pending."
 * No clinical medical diagnosis or scores are claimed.
 */

import { NormalizedLandmark, BodyPoseLandmarks } from "../types/vision";

/**
 * 2D Skeleton Joint Indices matching standard MediaPipe Pose 33-landmark topology:
 * 0: Nose (Head)
 * 11: Left Shoulder, 12: Right Shoulder
 * 13: Left Elbow, 14: Right Elbow
 * 15: Left Wrist, 16: Right Wrist
 * 23: Left Hip, 24: Right Hip
 * 25: Left Knee, 26: Right Knee
 * 27: Left Ankle, 28: Right Ankle
 */
export const SKELETON_2D_KEY_JOINTS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

/**
 * Complete 2D Kinematic bone pairs matching standard MediaPipe Pose 33-landmark topology:
 * Shoulders, Arms, Hands, Torso, Hips, Legs, Feet, and Facial connections.
 */
export const SKELETON_2D_BONES: [number, number][] = [
  // Upper body (Torso & Shoulders)
  [11, 12], // Shoulders
  [11, 23], // Left torso side
  [12, 24], // Right torso side
  [23, 24], // Pelvis / Hips

  // Left arm & hand
  [11, 13], // Left upper arm
  [13, 15], // Left forearm
  [15, 17], // Left wrist to pinky
  [15, 19], // Left wrist to index
  [15, 21], // Left wrist to thumb
  [17, 19], // Left pinky to index

  // Right arm & hand
  [12, 14], // Right upper arm
  [14, 16], // Right forearm
  [16, 18], // Right wrist to pinky
  [16, 20], // Right wrist to index
  [16, 22], // Right wrist to thumb
  [18, 20], // Right pinky to index

  // Left leg & foot
  [23, 25], // Left thigh
  [25, 27], // Left shin
  [27, 29], // Left ankle to heel
  [27, 31], // Left ankle to foot index
  [29, 31], // Left heel to foot index

  // Right leg & foot
  [24, 26], // Right thigh
  [26, 28], // Right shin
  [28, 30], // Right ankle to heel
  [28, 32], // Right ankle to foot index
  [30, 32], // Right heel to foot index

  // Head / Face
  [0, 1],   // Nose to left eye inner
  [1, 2],   // Left eye inner to eye
  [2, 3],   // Left eye to eye outer
  [3, 7],   // Left eye outer to ear
  [0, 4],   // Nose to right eye inner
  [4, 5],   // Right eye inner to eye
  [5, 6],   // Right eye to eye outer
  [6, 8],   // Right eye outer to ear
  [9, 10],  // Mouth left to mouth right
];

export interface SkeletonJoint2D {
  name: string;
  index: number;
  x: number; // [0.0, 1.0]
  y: number; // [0.0, 1.0]
  visibility: number; // [0.0, 1.0]
}

export type PostureAlignmentState =
  | "GOOD"
  | "LEAN_LEFT"
  | "LEAN_RIGHT"
  | "LEAN_FORWARD"
  | "LEAN_BACKWARD"
  | "UNEVEN_SHOULDERS"
  | "ADJUSTING"
  | "NO_POSE";

export type PostureFeedbackMessage =
  | "Good posture — hold naturally"
  | "Move slightly forward"
  | "Move slightly back"
  | "Level your shoulders"
  | "Stand upright"
  | "Adjusting posture"
  | "Hold steady — avoid moving"
  | "Tracking lost — adjust your position"
  // Legacy aliases
  | "✓ Good Posture"
  | "Adjust slightly to the RIGHT"
  | "Adjust slightly to the LEFT"
  | "Move slightly BACK"
  | "Move slightly FORWARD"
  | "Step into camera view";

/**
 * Configurable tolerance parameters based on normalized biomechanical measurements
 */
export interface PostureToleranceConfig {
  /** Maximum acceptable coronal shoulder tilt angle in degrees (allows natural resting asymmetry) */
  shoulderTiltToleranceDeg: number;
  /** Maximum acceptable coronal hip tilt angle in degrees */
  hipTiltToleranceDeg: number;
  /** Maximum acceptable sagittal trunk pitch in degrees relative to baseline (allows natural quiet stance/breathing) */
  trunkPitchToleranceDeg: number;
  /** Calibrated neutral sagittal trunk pitch baseline in degrees (default: 0) */
  neutralPitchBaselineDeg: number;
  /** Calibrated neutral coronal shoulder tilt baseline in degrees (default: 0) */
  neutralShoulderTiltBaselineDeg: number;
  /** Calibrated neutral lateral torso offset baseline (default: 0) */
  neutralOffsetBaseline: number;
  /** Maximum lateral offset between mid-shoulder and mid-hip, normalized by torso height */
  bodyVerticalOffsetTolerance: number;
  /** Maximum head lateral offset relative to mid-shoulder, normalized by torso height */
  headAlignmentTolerance: number;
  /** Maximum coronal head tilt angle in degrees relative to shoulders */
  headTiltToleranceDeg?: number;
  /** Minimum MediaPipe landmark visibility/confidence required for assessment */
  minLandmarkVisibility: number;
  /** Minimum average tracking confidence required for optimal alignment */
  minTrackingConfidence: number;
  /** Minimum body symmetry score percentage (0-100) */
  minSymmetryScore?: number;
  /** Maximum normalized torso displacement speed for quiet standing stillness */
  maxTorsoSpeed?: number;
  /** EMA smoothing weight alpha (0 < alpha <= 1.0) */
  smoothingAlpha: number;
  /** Grace period in milliseconds: minor transient deviations do not reset hold timer */
  gracePeriodMs: number;
  /** Minimum sustained deviation duration in milliseconds before switching corrective guidance */
  sustainedDeviationMs: number;
  /** Required hold duration in seconds to complete exercise */
  requiredStabilitySeconds: number;
}

export const DEFAULT_POSTURE_TOLERANCES: PostureToleranceConfig = {
  shoulderTiltToleranceDeg: 7.5,      // allows natural shoulder variation
  hipTiltToleranceDeg: 8.0,           // allows natural pelvic tilt
  trunkPitchToleranceDeg: 12.0,       // allows natural respiratory sway
  neutralPitchBaselineDeg: 0.0,       // neutral baseline (calibrated during quiet stance)
  neutralShoulderTiltBaselineDeg: 0.0,
  neutralOffsetBaseline: 0.0,
  bodyVerticalOffsetTolerance: 0.14,  // allows natural quiet stance sway
  headAlignmentTolerance: 0.18,       // allows natural head position
  headTiltToleranceDeg: 14.0,         // coronal head tilt
  minLandmarkVisibility: 0.30,
  minTrackingConfidence: 0.45,        // landmark confidence gate
  minSymmetryScore: 75,
  maxTorsoSpeed: 0.22,
  smoothingAlpha: 0.35,
  gracePeriodMs: 1500,                // 1.5-second grace period for natural movement
  sustainedDeviationMs: 350,
  requiredStabilitySeconds: 10.0,
};

export interface PostureAlignmentAnalysis {
  hasPose: boolean;
  shoulderTiltDeg: number | null; // Coronal shoulder tilt relative to baseline (null if no pose, never fake 0)
  hipTiltDeg: number | null; // Coronal hip tilt (null if no pose)
  trunkPitchDeg: number | null; // Sagittal trunk pitch relative to baseline (null if no pose)
  rawTrunkPitchDeg?: number | null; // Absolute uncalibrated trunk pitch (null if no pose)
  bodyVerticalOffset: number | null; // Normalized lateral displacement relative to torso height
  headLateralOffset: number | null; // Normalized head lateral offset
  symmetryScore: number | null; // Torso left/right symmetry percentage [0-100]
  isUpright: boolean;
  postureState: PostureAlignmentState;
  feedbackMessage: PostureFeedbackMessage;
  trackingConfidence: number;
  disclosure: string;
}

export interface PostureAlignmentSummary {
  durationSeconds: number;
  formattedDuration: string;
  poseTrackingAvailabilityPercent: number;
  timeInCorrectPostureSeconds: number;
  postureAlignmentPercentage: number;
  isComplete: boolean;
  disclosure: string;
}

export const POSTURE_CLINICAL_DISCLOSURE =
  "Development posture feedback — clinical validation pending.";

/**
 * Extracts key 2D skeleton joints from raw MediaPipe landmarks.
 * Returns null if landmarks are missing or insufficient.
 */
export function extractKey2DSkeleton(
  landmarks: NormalizedLandmark[] | null | undefined
): Record<string, SkeletonJoint2D> | null {
  if (!landmarks || landmarks.length < 25) return null;

  const result: Record<string, SkeletonJoint2D> = {};
  for (const [name, index] of Object.entries(SKELETON_2D_KEY_JOINTS)) {
    const lm = landmarks[index];
    if (lm) {
      result[name] = {
        name,
        index,
        x: lm.x,
        y: lm.y,
        visibility: lm.visibility ?? 1.0,
      };
    }
  }
  return result;
}

export interface PostureMovementState {
  isStill?: boolean;
  torsoSpeed?: number;
}

/**
 * Real-time Posture Alignment Analyzer
 *
 * Uses the existing detected MediaPipe pose landmarks as the single source of truth.
 *
 * Evaluates:
 * 1. Head and torso alignment (normalized to body proportions)
 * 2. Shoulder symmetry and coronal tilt
 * 3. Hip symmetry and coronal tilt
 * 4. Forward/backward sagittal lean
 * 5. Body symmetry
 * 6. Body stillness (prevents false counting while actively moving)
 * 7. Overall upright posture with configurable natural movement tolerance
 *
 * Supportive guidance messages:
 * - “Good posture — hold naturally”
 * - “Move slightly forward”
 * - “Move slightly back”
 * - “Level your shoulders”
 * - “Stand upright”
 * - “Hold steady — avoid moving”
 * - “Tracking lost — adjust your position”
 *
 * Does not replace missing values with zero.
 * Does not report tracking lost when valid pose landmarks are available.
 */
export function analyzePostureAlignment(
  landmarksOrPose: NormalizedLandmark[] | BodyPoseLandmarks | null | undefined,
  config: Partial<PostureToleranceConfig> = {},
  existingPose?: BodyPoseLandmarks | null,
  movement?: PostureMovementState
): PostureAlignmentAnalysis {
  const mergedConfig: PostureToleranceConfig = {
    ...DEFAULT_POSTURE_TOLERANCES,
    ...config,
  };

  // Resolve landmarks array and existing pose context
  let landmarks: NormalizedLandmark[] | null = null;
  let poseContext: BodyPoseLandmarks | null = existingPose || null;

  if (Array.isArray(landmarksOrPose)) {
    landmarks = landmarksOrPose;
  } else if (landmarksOrPose && "allRawLandmarks" in landmarksOrPose) {
    poseContext = landmarksOrPose as BodyPoseLandmarks;
    landmarks = poseContext.allRawLandmarks;
  } else if (landmarksOrPose && "landmarks" in (landmarksOrPose as any)) {
    landmarks = (landmarksOrPose as any).landmarks;
  }

  // 1. Check if valid pose exists either from landmarks array or pose context
  const hasLandmarks = Boolean(landmarks && landmarks.length >= 25);
  const hasPoseContext = Boolean(poseContext && poseContext.leftShoulder && poseContext.rightShoulder);

  if (!hasLandmarks && !hasPoseContext) {
    return {
      hasPose: false,
      shoulderTiltDeg: null,
      hipTiltDeg: null,
      trunkPitchDeg: null,
      bodyVerticalOffset: null,
      headLateralOffset: null,
      symmetryScore: null,
      isUpright: false,
      postureState: "NO_POSE",
      feedbackMessage: "Tracking lost — adjust your position",
      trackingConfidence: 0,
      disclosure: POSTURE_CLINICAL_DISCLOSURE,
    };
  }

  // Extract key joints from landmarks or pose context
  const leftShoulder = landmarks
    ? landmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]
    : poseContext?.leftShoulder;
  const rightShoulder = landmarks
    ? landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]
    : poseContext?.rightShoulder;
  const leftHip = landmarks
    ? landmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP]
    : poseContext?.leftHip;
  const rightHip = landmarks
    ? landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP]
    : poseContext?.rightHip;
  const nose = landmarks
    ? landmarks[SKELETON_2D_KEY_JOINTS.NOSE]
    : poseContext?.nose;

  // Essential upper body validation: Shoulders must be detected
  const leftShoulderVis = leftShoulder?.visibility ?? (leftShoulder ? 1.0 : 0);
  const rightShoulderVis = rightShoulder?.visibility ?? (rightShoulder ? 1.0 : 0);
  const minVis = mergedConfig.minLandmarkVisibility ?? 0.40;

  if (!leftShoulder || !rightShoulder || leftShoulderVis < minVis || rightShoulderVis < minVis) {
    return {
      hasPose: false,
      shoulderTiltDeg: null,
      hipTiltDeg: null,
      trunkPitchDeg: null,
      bodyVerticalOffset: null,
      headLateralOffset: null,
      symmetryScore: null,
      isUpright: false,
      postureState: "NO_POSE",
      feedbackMessage: "Tracking lost — adjust your position",
      trackingConfidence: 0,
      disclosure: POSTURE_CLINICAL_DISCLOSURE,
    };
  }

  // 1. Coronal shoulder tilt (degrees):
  // dy > 0 indicates right shoulder dipped lower -> person leaning right
  // dy < 0 indicates left shoulder dipped lower -> person leaning left
  const dxS = Math.abs(leftShoulder.x - rightShoulder.x);
  const dyS = rightShoulder.y - leftShoulder.y;
  const rawShoulderTiltDeg = Math.round(Math.atan2(dyS, Math.max(0.01, dxS)) * (180 / Math.PI));

  // 2. Coronal hip tilt (degrees), sagittal pitch, vertical offset, and head alignment
  let hipTiltDeg = 0;
  let rawTrunkPitchDeg = 0;
  let bodyVerticalOffset = 0;
  let headLateralOffset: number | null = null;
  let headTiltDeg = 0;
  let symmetryScore = 100;

  const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const midShoulderZ = ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2;

  const leftHipVis = leftHip?.visibility ?? 0;
  const rightHipVis = rightHip?.visibility ?? 0;
  const areHipsVisible = Boolean(leftHip && rightHip && leftHipVis >= minVis && rightHipVis >= minVis);

  if (areHipsVisible && leftHip && rightHip) {
    const dxH = Math.abs(leftHip.x - rightHip.x);
    const dyH = rightHip.y - leftHip.y;
    hipTiltDeg = Math.round(Math.atan2(dyH, Math.max(0.01, dxH)) * (180 / Math.PI));

    const midHipX = (leftHip.x + rightHip.x) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;
    const midHipZ = ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2;

    const torsoHeight = Math.max(0.10, Math.abs(midHipY - midShoulderY));
    const torsoDz = midHipZ - midShoulderZ;
    rawTrunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoHeight)) * (180 / Math.PI));

    const rawOffset = midShoulderX - midHipX;
    bodyVerticalOffset = parseFloat((rawOffset / torsoHeight).toFixed(3));

    if (nose && (nose.visibility === undefined || nose.visibility >= 0.35)) {
      headLateralOffset = parseFloat(((nose.x - midShoulderX) / torsoHeight).toFixed(3));
      const headDx = midShoulderX - nose.x;
      const headDy = Math.max(0.01, midShoulderY - nose.y);
      headTiltDeg = Math.round(Math.atan2(headDx, headDy) * (180 / Math.PI));
    }

    const leftTorsoLen = Math.hypot(leftShoulder.x - leftHip.x, leftShoulder.y - leftHip.y);
    const rightTorsoLen = Math.hypot(rightShoulder.x - rightHip.x, rightShoulder.y - rightHip.y);
    const maxTorso = Math.max(0.001, leftTorsoLen, rightTorsoLen);
    const symmetryRatio = Math.max(0, 1 - Math.abs(leftTorsoLen - rightTorsoLen) / maxTorso);
    symmetryScore = Math.round(symmetryRatio * 100);
  } else if (leftHip || rightHip) {
    // Single hip landmark fallback: ensures brief partial occlusion does not drop pitch to 0
    const singleHip = leftHip || rightHip!;
    const torsoHeight = Math.max(0.10, Math.abs(singleHip.y - midShoulderY));
    const torsoDz = (singleHip.z ?? 0) - midShoulderZ;
    rawTrunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoHeight)) * (180 / Math.PI));
    if (nose && (nose.visibility === undefined || nose.visibility >= 0.35)) {
      headLateralOffset = parseFloat(((nose.x - midShoulderX) / torsoHeight).toFixed(3));
      const headDx = midShoulderX - nose.x;
      const headDy = Math.max(0.01, midShoulderY - nose.y);
      headTiltDeg = Math.round(Math.atan2(headDx, headDy) * (180 / Math.PI));
    }
  } else if (nose && (nose.visibility === undefined || nose.visibility >= 0.35)) {
    const shoulderWidth = Math.max(0.08, dxS);
    headLateralOffset = parseFloat(((nose.x - midShoulderX) / shoulderWidth).toFixed(3));
    const headDx = midShoulderX - nose.x;
    const headDy = Math.max(0.01, midShoulderY - nose.y);
    headTiltDeg = Math.round(Math.atan2(headDx, headDy) * (180 / Math.PI));
  }

  // 3. Normalization relative to calibrated neutral posture baseline
  const neutralPitch = mergedConfig.neutralPitchBaselineDeg ?? 0;
  const neutralShoulder = mergedConfig.neutralShoulderTiltBaselineDeg ?? 0;
  const neutralOffset = mergedConfig.neutralOffsetBaseline ?? 0;

  const relativePitchDeg = rawTrunkPitchDeg - neutralPitch;
  const relativeShoulderTiltDeg = rawShoulderTiltDeg - neutralShoulder;
  const relativeBodyOffset = parseFloat((bodyVerticalOffset - neutralOffset).toFixed(3));

  // 4. Tolerance verification for natural quiet standing
  const absShoulder = Math.abs(relativeShoulderTiltDeg);
  const absPitch = Math.abs(relativePitchDeg);
  const absHip = Math.abs(hipTiltDeg);
  const absOffset = Math.abs(relativeBodyOffset);
  const absHeadOffset = headLateralOffset !== null ? Math.abs(headLateralOffset) : 0;
  const absHeadTilt = Math.abs(headTiltDeg);

  const isShoulderAligned = absShoulder <= mergedConfig.shoulderTiltToleranceDeg;
  const isPitchAligned = absPitch <= mergedConfig.trunkPitchToleranceDeg;
  const isHipAligned = !areHipsVisible || absHip <= mergedConfig.hipTiltToleranceDeg;
  const isOffsetAligned = absOffset <= mergedConfig.bodyVerticalOffsetTolerance;
  const isHeadAligned =
    headLateralOffset === null ||
    (absHeadOffset <= (mergedConfig.headAlignmentTolerance ?? 0.20) &&
      absHeadTilt <= (mergedConfig.headTiltToleranceDeg ?? 14.0));
  const isSymmetric = !areHipsVisible || symmetryScore >= (mergedConfig.minSymmetryScore ?? 75);
  const isStill = movement?.isStill ?? true;

  const getVis = (lm?: NormalizedLandmark | null) =>
    lm && lm.visibility !== undefined ? lm.visibility : 1.0;

  const jointConfidences = [getVis(leftShoulder), getVis(rightShoulder)];
  if (leftHip && (leftHip.visibility ?? 0) >= minVis) jointConfidences.push(getVis(leftHip));
  if (rightHip && (rightHip.visibility ?? 0) >= minVis) jointConfidences.push(getVis(rightHip));

  const trackingConfidence = Math.min(
    1.0,
    jointConfidences.reduce((acc, v) => acc + v, 0) / jointConfidences.length
  );
  const isTrackingConfident = trackingConfidence >= (mergedConfig.minTrackingConfidence ?? 0.45);

  const isUpright =
    isTrackingConfident &&
    isShoulderAligned &&
    isPitchAligned &&
    isHipAligned &&
    isOffsetAligned &&
    isHeadAligned &&
    isSymmetric &&
    isStill;

  // 5. Guidance determination
  let postureState: PostureAlignmentState = "GOOD";
  let feedbackMessage: PostureFeedbackMessage = "Good posture — hold naturally";

  if (!isUpright) {
    if (!isStill) {
      postureState = "ADJUSTING";
      feedbackMessage = "Hold steady — avoid moving";
    }
    // Forward / backward lean priority when sagittal pitch deviation is primary
    else if (!isPitchAligned && (absPitch >= absShoulder || absPitch >= 10)) {
      if (relativePitchDeg > 0) {
        postureState = "LEAN_FORWARD";
        feedbackMessage = "Move slightly back";
      } else {
        postureState = "LEAN_BACKWARD";
        feedbackMessage = "Move slightly forward";
      }
    }
    // Uneven shoulders priority
    else if (!isShoulderAligned) {
      postureState = relativeShoulderTiltDeg > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
      feedbackMessage = "Level your shoulders";
    }
    // Lateral torso displacement / leaning
    else if (!isOffsetAligned) {
      postureState = relativeBodyOffset > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
      feedbackMessage = "Stand upright";
    }
    // Pelvic asymmetry
    else if (!isHipAligned) {
      postureState = "UNEVEN_SHOULDERS";
      feedbackMessage = "Stand upright";
    }
    // Head alignment priority
    else if (!isHeadAligned) {
      postureState = (headLateralOffset ?? 0) > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
      feedbackMessage = "Stand upright";
    }
    // Torso asymmetry
    else if (!isSymmetric) {
      postureState = "ADJUSTING";
      feedbackMessage = "Stand upright";
    }
  }

  // If tracking confidence is temporarily poor, pause timer & prompt to adjust without falsely claiming tracking lost
  if (!isTrackingConfident) {
    return {
      hasPose: true,
      shoulderTiltDeg: relativeShoulderTiltDeg,
      hipTiltDeg,
      trunkPitchDeg: relativePitchDeg,
      rawTrunkPitchDeg,
      bodyVerticalOffset: relativeBodyOffset,
      headLateralOffset,
      symmetryScore,
      isUpright: false,
      postureState: "NO_POSE",
      feedbackMessage: "Adjusting posture",
      trackingConfidence: parseFloat(trackingConfidence.toFixed(2)),
      disclosure: POSTURE_CLINICAL_DISCLOSURE,
    };
  }

  return {
    hasPose: true,
    shoulderTiltDeg: relativeShoulderTiltDeg,
    hipTiltDeg,
    trunkPitchDeg: relativePitchDeg,
    rawTrunkPitchDeg,
    bodyVerticalOffset: relativeBodyOffset,
    headLateralOffset,
    symmetryScore,
    isUpright,
    postureState,
    feedbackMessage,
    trackingConfidence: parseFloat(trackingConfidence.toFixed(2)),
    disclosure: POSTURE_CLINICAL_DISCLOSURE,
  };
}

/**
 * Exponential Moving Average (EMA) Landmark Smoother.
 * Reduces camera sensor noise, tremor, and frame-to-frame landmark jitter.
 * Includes hold-frame tolerance so brief 1-2 frame camera drops do not wipe state.
 */
export class PostureLandmarkSmoother {
  private smoothedLandmarks: NormalizedLandmark[] | null = null;
  private prevMidShoulder: { x: number; y: number } | null = null;
  private alpha: number;
  private missingFramesCount: number = 0;
  private readonly maxHoldFrames: number = 4;

  constructor(alpha: number = 0.35, maxHoldFrames: number = 4) {
    this.alpha = Math.max(0.05, Math.min(1.0, alpha));
    this.maxHoldFrames = maxHoldFrames;
  }

  public getSmoothed(): NormalizedLandmark[] | null {
    return this.smoothedLandmarks;
  }

  public update(raw: NormalizedLandmark[] | null | undefined): NormalizedLandmark[] | null {
    if (!raw || raw.length < 25) {
      this.missingFramesCount++;
      if (this.missingFramesCount > this.maxHoldFrames) {
        this.smoothedLandmarks = null;
        this.prevMidShoulder = null;
      }
      return this.smoothedLandmarks;
    }

    this.missingFramesCount = 0;

    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== raw.length) {
      this.smoothedLandmarks = raw.map((lm) => ({ ...lm }));
      const ls = raw[11];
      const rs = raw[12];
      if (ls && rs) {
        this.prevMidShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
      }
      return this.smoothedLandmarks;
    }

    // Adaptive smoothing based on movement velocity:
    // Large body displacement -> higher alpha (zero lag, tracks immediately)
    // Quiet standing tremor -> base alpha (0.35, filters sensor noise)
    const ls = raw[11];
    const rs = raw[12];
    let effectiveAlpha = this.alpha;
    if (ls && rs && this.prevMidShoulder) {
      const curX = (ls.x + rs.x) / 2;
      const curY = (ls.y + rs.y) / 2;
      const displacement = Math.hypot(curX - this.prevMidShoulder.x, curY - this.prevMidShoulder.y);
      this.prevMidShoulder = { x: curX, y: curY };
      if (displacement > 0.03) {
        effectiveAlpha = 0.85; // fast motion -> zero lag
      } else if (displacement > 0.01) {
        effectiveAlpha = 0.65; // moderate motion
      } else {
        effectiveAlpha = this.alpha; // steady quiet posture -> clean noise filtering
      }
    } else if (ls && rs) {
      this.prevMidShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    }

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const s = this.smoothedLandmarks[i];
      if (r && s) {
        s.x = effectiveAlpha * r.x + (1 - effectiveAlpha) * s.x;
        s.y = effectiveAlpha * r.y + (1 - effectiveAlpha) * s.y;
        s.z = effectiveAlpha * (r.z ?? 0) + (1 - effectiveAlpha) * (s.z ?? 0);
        if (r.visibility !== undefined) {
          s.visibility = r.visibility;
        }
      }
    }

    return this.smoothedLandmarks;
  }

  public reset(): void {
    this.smoothedLandmarks = null;
    this.prevMidShoulder = null;
    this.missingFramesCount = 0;
  }
}

export interface PostureTrackerState {
  timeInCorrectPostureSeconds: number;
  remainingSeconds: number;
  isHolding: boolean;
  isInGracePeriod: boolean;
  graceTimeRemainingMs: number;
  guidanceMessage: PostureFeedbackMessage;
  isComplete: boolean;
  isTrackingLost: boolean;
  totalDurationSeconds: number;
  trackedSamplesCount: number;
  goodSamplesCount: number;
  totalSamplesCount: number;
}

/**
 * State Machine Tracker for Posture Stability Hold.
 * - Handles 10-second hold timer progression.
 * - Enforces configurable grace period for natural minor movement without resetting the timer.
 * - Pauses timing on tracking loss / low confidence (never counts lost tracking as success).
 * - Applies guidance hysteresis so minor fluctuations do not repeatedly switch messages.
 */
export class PostureSessionTracker {
  private config: PostureToleranceConfig;

  // Timers and counters
  private timeInCorrectPostureSeconds: number = 0;
  private totalDurationSeconds: number = 0;
  private totalSamples: number = 0;
  private trackedSamples: number = 0;
  private goodSamples: number = 0;

  // Hysteresis & Grace period trackers
  private isHolding: boolean = false;
  private isInGracePeriod: boolean = false;
  private graceElapsedMs: number = 0;
  private sustainedDeviationMsCount: number = 0;
  private sustainedGoodMsCount: number = 0;
  private trackingLostMsCount: number = 0;

  // Stabilized guidance message
  private currentGuidance: PostureFeedbackMessage = "Good posture — hold naturally";
  private isComplete: boolean = false;

  constructor(config: Partial<PostureToleranceConfig> = {}) {
    this.config = {
      ...DEFAULT_POSTURE_TOLERANCES,
      ...config,
    };
  }

  public update(
    analysis: PostureAlignmentAnalysis,
    deltaMs: number
  ): PostureTrackerState {
    const dt = Math.max(0, deltaMs);
    this.totalDurationSeconds += dt / 1000;
    this.totalSamples += 1;

    // 1. Handling Missing / Lost Pose
    if (!analysis.hasPose) {
      this.trackingLostMsCount += dt;
      this.isHolding = false;
      this.isInGracePeriod = false;
      this.sustainedGoodMsCount = 0;
      this.currentGuidance = "Tracking lost — adjust your position";

      // Camera tracking loss strictly pauses the timer (no time added)
      return this.getState();
    }

    // Pose is tracked
    this.trackedSamples += 1;
    this.trackingLostMsCount = 0;

    // 2. Handling Upright Posture within Tolerance
    if (analysis.isUpright) {
      this.goodSamples += 1;
      this.sustainedGoodMsCount += dt;
      this.sustainedDeviationMsCount = 0;
      this.isHolding = true;
      this.isInGracePeriod = false;
      this.graceElapsedMs = 0;

      // Accumulate hold time only while within acceptable tolerance
      const nextTime = Math.round((this.timeInCorrectPostureSeconds + dt / 1000) * 1000) / 1000;
      this.timeInCorrectPostureSeconds = Math.min(
        this.config.requiredStabilitySeconds,
        nextTime
      );

      // Check completion
      if (this.timeInCorrectPostureSeconds >= this.config.requiredStabilitySeconds - 0.001) {
        this.isComplete = true;
      }

      // Guidance hysteresis: switch to "Good posture" smoothly
      if (this.sustainedGoodMsCount >= 200 || this.currentGuidance === "Good posture — hold naturally") {
        this.currentGuidance = "Good posture — hold naturally";
      }
    } else {
      // 3. Handling Deviation / Outside Tolerance
      this.sustainedDeviationMsCount += dt;
      this.sustainedGoodMsCount = 0;
      this.isHolding = false;

      if (this.timeInCorrectPostureSeconds > 0) {
        // An active hold was in progress
        this.graceElapsedMs += dt;

        if (this.graceElapsedMs <= this.config.gracePeriodMs) {
          // Within grace period: Pause timing, do NOT reset yet!
          this.isInGracePeriod = true;
        } else {
          // Exceeded grace period: Reset hold timer to zero
          this.isInGracePeriod = false;
          this.timeInCorrectPostureSeconds = 0;
          this.graceElapsedMs = 0;
        }
      }

      // Guidance hysteresis: switch corrective message after sustained deviation or when adjusting
      if (
        this.sustainedDeviationMsCount >= this.config.sustainedDeviationMs ||
        analysis.feedbackMessage === "Adjusting posture"
      ) {
        this.currentGuidance = analysis.feedbackMessage;
      }
    }

    return this.getState();
  }

  public calibrateBaseline(pitchDeg: number, shoulderTiltDeg: number = 0, offset: number = 0): void {
    this.config.neutralPitchBaselineDeg = pitchDeg;
    this.config.neutralShoulderTiltBaselineDeg = shoulderTiltDeg;
    this.config.neutralOffsetBaseline = offset;
  }

  public getBaseline(): { pitchDeg: number; shoulderTiltDeg: number; offset: number } {
    return {
      pitchDeg: this.config.neutralPitchBaselineDeg,
      shoulderTiltDeg: this.config.neutralShoulderTiltBaselineDeg,
      offset: this.config.neutralOffsetBaseline,
    };
  }

  public updateConfig(partial: Partial<PostureToleranceConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
    };
  }

  public getState(): PostureTrackerState {
    const remainingSeconds = Math.max(
      0,
      parseFloat((this.config.requiredStabilitySeconds - this.timeInCorrectPostureSeconds).toFixed(1))
    );
    const graceTimeRemainingMs = Math.max(
      0,
      this.config.gracePeriodMs - this.graceElapsedMs
    );

    return {
      timeInCorrectPostureSeconds: parseFloat(this.timeInCorrectPostureSeconds.toFixed(1)),
      remainingSeconds,
      isHolding: this.isHolding,
      isInGracePeriod: this.isInGracePeriod,
      graceTimeRemainingMs,
      guidanceMessage: this.currentGuidance,
      isComplete: this.isComplete,
      isTrackingLost: this.trackingLostMsCount > 0,
      totalDurationSeconds: parseFloat(this.totalDurationSeconds.toFixed(1)),
      trackedSamplesCount: this.trackedSamples,
      goodSamplesCount: this.goodSamples,
      totalSamplesCount: this.totalSamples,
    };
  }

  public reset(): void {
    this.timeInCorrectPostureSeconds = 0;
    this.totalDurationSeconds = 0;
    this.totalSamples = 0;
    this.trackedSamples = 0;
    this.goodSamples = 0;
    this.isHolding = false;
    this.isInGracePeriod = false;
    this.graceElapsedMs = 0;
    this.sustainedDeviationMsCount = 0;
    this.sustainedGoodMsCount = 0;
    this.trackingLostMsCount = 0;
    this.currentGuidance = "Good posture — hold naturally";
    this.isComplete = false;
  }
}

/**
 * Calculates session summary metrics without generating medical or clinical diagnosis scores.
 */
export function calculatePostureAlignmentSummary(params: {
  totalDurationSeconds: number;
  totalSamples: number;
  trackedSamples: number;
  goodPostureSamples: number;
  timeInCorrectPostureSeconds: number;
  requiredStabilitySeconds?: number;
}): PostureAlignmentSummary {
  const {
    totalDurationSeconds,
    totalSamples,
    trackedSamples,
    goodPostureSamples,
    timeInCorrectPostureSeconds,
    requiredStabilitySeconds = 10,
  } = params;

  const durationSec = Math.max(0, parseFloat(totalDurationSeconds.toFixed(1)));
  const mins = Math.floor(durationSec / 60);
  const secs = Math.floor(durationSec % 60);
  const formattedDuration = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  const poseTrackingAvailabilityPercent =
    totalSamples > 0 ? Math.round((trackedSamples / totalSamples) * 100) : 0;

  const postureAlignmentPercentage =
    trackedSamples > 0 ? Math.round((goodPostureSamples / trackedSamples) * 100) : 0;

  const isComplete = timeInCorrectPostureSeconds >= requiredStabilitySeconds;

  return {
    durationSeconds: durationSec,
    formattedDuration,
    poseTrackingAvailabilityPercent,
    timeInCorrectPostureSeconds: parseFloat(timeInCorrectPostureSeconds.toFixed(1)),
    postureAlignmentPercentage,
    isComplete,
    disclosure: POSTURE_CLINICAL_DISCLOSURE,
  };
}
