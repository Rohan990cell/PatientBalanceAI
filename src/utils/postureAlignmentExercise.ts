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
 * SAFETY & DISCLOSURE:
 * "Development posture feedback — clinical validation pending."
 * No clinical medical diagnosis or scores are claimed.
 */

import { NormalizedLandmark } from "../types/vision";

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
 * 2D Kinematic bone pairs for overlay drawing [fromJointIndex, toJointIndex]
 */
export const SKELETON_2D_BONES: [number, number][] = [
  // Upper body
  [11, 12], // Shoulders
  [11, 13], // Left upper arm
  [13, 15], // Left forearm
  [12, 14], // Right upper arm
  [14, 16], // Right forearm

  // Torso
  [11, 23], // Left torso side
  [12, 24], // Right torso side
  [23, 24], // Pelvis / Hips

  // Lower body
  [23, 25], // Left thigh
  [25, 27], // Left shin
  [24, 26], // Right thigh
  [26, 28], // Right shin
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
  | "NO_POSE";

export type PostureFeedbackMessage =
  | "✓ Good Posture"
  | "Adjust slightly to the RIGHT"
  | "Adjust slightly to the LEFT"
  | "Move slightly BACK"
  | "Move slightly FORWARD"
  | "Step into camera view";

export interface PostureAlignmentAnalysis {
  hasPose: boolean;
  shoulderTiltDeg: number | null; // Coronal shoulder tilt (null if no pose, never fake 0)
  hipTiltDeg: number | null; // Coronal hip tilt (null if no pose)
  trunkPitchDeg: number | null; // Sagittal trunk pitch (null if no pose)
  bodyVerticalOffset: number | null; // Horizontal offset between mid-shoulder and mid-hip
  symmetryScore: number | null; // Torso left/right symmetry percentage [0-100]
  isUpright: boolean;
  postureState: PostureAlignmentState;
  feedbackMessage: PostureFeedbackMessage;
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
  if (!landmarks || landmarks.length < 29) return null;

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

/**
 * Real-time Posture Alignment Analyzer
 *
 * Evaluates:
 * 1. Shoulder alignment (coronal tilt)
 * 2. Hip alignment (coronal tilt)
 * 3. Body vertical alignment (torso verticality / lateral displacement)
 * 4. Left/right symmetry
 * 5. Overall upright posture
 *
 * Strict feedback cues:
 * - If posture is good: "✓ Good Posture"
 * - If leaning left: "Adjust slightly to the RIGHT"
 * - If leaning right: "Adjust slightly to the LEFT"
 * - If leaning forward: "Move slightly BACK"
 * - If leaning backward: "Move slightly FORWARD"
 * - If pose is not detected: "Step into camera view"
 *
 * Does not replace missing values with zero.
 */
export function analyzePostureAlignment(
  landmarks: NormalizedLandmark[] | null | undefined
): PostureAlignmentAnalysis {
  if (!landmarks || landmarks.length < 29) {
    return {
      hasPose: false,
      shoulderTiltDeg: null,
      hipTiltDeg: null,
      trunkPitchDeg: null,
      bodyVerticalOffset: null,
      symmetryScore: null,
      isUpright: false,
      postureState: "NO_POSE",
      feedbackMessage: "Step into camera view",
      disclosure: POSTURE_CLINICAL_DISCLOSURE,
    };
  }

  const leftShoulder = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
  const rightShoulder = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
  const leftHip = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
  const rightHip = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return {
      hasPose: false,
      shoulderTiltDeg: null,
      hipTiltDeg: null,
      trunkPitchDeg: null,
      bodyVerticalOffset: null,
      symmetryScore: null,
      isUpright: false,
      postureState: "NO_POSE",
      feedbackMessage: "Step into camera view",
      disclosure: POSTURE_CLINICAL_DISCLOSURE,
    };
  }

  // 1. Coronal shoulder tilt:
  // dy > 0 indicates right shoulder dipped lower -> person leaning right
  // dy < 0 indicates left shoulder dipped lower -> person leaning left
  const dxS = Math.abs(leftShoulder.x - rightShoulder.x);
  const dyS = rightShoulder.y - leftShoulder.y;
  const shoulderTiltDeg = Math.round(Math.atan2(dyS, Math.max(0.001, dxS)) * (180 / Math.PI));

  // 2. Coronal hip tilt
  const dxH = Math.abs(leftHip.x - rightHip.x);
  const dyH = rightHip.y - leftHip.y;
  const hipTiltDeg = Math.round(Math.atan2(dyH, Math.max(0.001, dxH)) * (180 / Math.PI));

  // 3. Sagittal trunk pitch
  const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const midShoulderZ = ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2;
  const midHipY = (leftHip.y + rightHip.y) / 2;
  const midHipZ = ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2;

  const torsoDy = midHipY - midShoulderY;
  const torsoDz = midHipZ - midShoulderZ;
  const trunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoDy)) * (180 / Math.PI));

  // 4. Body vertical alignment (mid-shoulder horizontal offset relative to mid-hip)
  const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const midHipX = (leftHip.x + rightHip.x) / 2;
  const bodyVerticalOffset = parseFloat((midShoulderX - midHipX).toFixed(3));

  // 5. Left/Right Symmetry
  const leftTorsoLen = Math.hypot(leftShoulder.x - leftHip.x, leftShoulder.y - leftHip.y);
  const rightTorsoLen = Math.hypot(rightShoulder.x - rightHip.x, rightShoulder.y - rightHip.y);
  const maxTorso = Math.max(0.001, leftTorsoLen, rightTorsoLen);
  const symmetryRatio = Math.max(0, 1 - Math.abs(leftTorsoLen - rightTorsoLen) / maxTorso);
  const symmetryScore = Math.round(symmetryRatio * 100);

  // 6. Classification & Feedback Determination
  // Thresholds:
  // Shoulder tilt tolerance: ±4°
  // Hip tilt tolerance: ±5°
  // Sagittal pitch tolerance: ±5°
  // Lateral offset tolerance: ±0.035
  const absShoulder = Math.abs(shoulderTiltDeg);
  const absPitch = Math.abs(trunkPitchDeg);
  const absOffset = Math.abs(bodyVerticalOffset);

  let postureState: PostureAlignmentState = "GOOD";
  let feedbackMessage: PostureFeedbackMessage = "✓ Good Posture";

  // Prioritize primary biomechanical deviation
  if (absShoulder >= 5 || absOffset >= 0.04) {
    if (absShoulder >= absPitch || absOffset >= 0.04) {
      if (shoulderTiltDeg > 4 || bodyVerticalOffset > 0.035) {
        postureState = "LEAN_RIGHT";
        feedbackMessage = "Adjust slightly to the LEFT";
      } else {
        postureState = "LEAN_LEFT";
        feedbackMessage = "Adjust slightly to the RIGHT";
      }
    } else if (absPitch >= 6) {
      if (trunkPitchDeg > 0) {
        postureState = "LEAN_FORWARD";
        feedbackMessage = "Move slightly BACK";
      } else {
        postureState = "LEAN_BACKWARD";
        feedbackMessage = "Move slightly FORWARD";
      }
    }
  } else if (absPitch >= 6) {
    if (trunkPitchDeg > 0) {
      postureState = "LEAN_FORWARD";
      feedbackMessage = "Move slightly BACK";
    } else {
      postureState = "LEAN_BACKWARD";
      feedbackMessage = "Move slightly FORWARD";
    }
  } else {
    postureState = "GOOD";
    feedbackMessage = "✓ Good Posture";
  }

  const isUpright = postureState === "GOOD";

  return {
    hasPose: true,
    shoulderTiltDeg,
    hipTiltDeg,
    trunkPitchDeg,
    bodyVerticalOffset,
    symmetryScore,
    isUpright,
    postureState,
    feedbackMessage,
    disclosure: POSTURE_CLINICAL_DISCLOSURE,
  };
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
