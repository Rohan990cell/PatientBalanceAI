/**
 * Posture + Balance Multimodal Exercise Logic & Correlation Mathematics
 *
 * PHASE B — WEDNESDAY DEMO EXERCISE 2:
 * Nintendo Wii Balance Board + Intel RealSense / Camera + MediaPipe 2D Pose
 *
 * SCIENTIFIC COORDINATE CONVENTIONS:
 * - CAMERA POSE:
 *   - Coronal shoulder tilt: positive = LEAN_RIGHT, negative = LEAN_LEFT
 *   - Sagittal pitch: positive = LEAN_FORWARD, negative = LEAN_BACKWARD
 * - WII BALANCE BOARD:
 *   - COP X: negative = LEFT (-X), positive = RIGHT (+X)
 *   - COP Y: negative = BACK / POSTERIOR (-Y), positive = FRONT / ANTERIOR (+Y)
 *
 * MULTIMODAL CORRELATION:
 * Correlates upper-body kinematic lean (optical 2D pose) with plantar center of pressure
 * weight distribution (force plate) to deliver real-time biofeedback.
 *
 * DATA INTEGRITY:
 * Real hardware telemetry takes absolute priority.
 * When sensors are unavailable, values display strictly as "--" / "Not detected" (never fake zero).
 * No fake clinical balance scores are generated from simulation.
 */

import { NormalizedLandmark, PostureLeanDirection } from "../types/vision";

/**
 * 2D Skeleton Joint Indices matching standard MediaPipe Pose 33-landmark topology:
 * 0: Nose
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
 * Clean 2D kinematic bone pairs for overlay drawing [fromJointIndex, toJointIndex]
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

/**
 * Extracts key 2D skeleton joints from raw MediaPipe landmarks.
 * Returns null if landmarks are missing or empty.
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
 * Calculates coronal shoulder tilt, sagittal pitch, and unified posture lean classification
 * from extracted 2D landmarks.
 */
export function calculatePostureFromLandmarks(landmarks: NormalizedLandmark[] | null | undefined): {
  shoulderTiltDeg: number;
  hipTiltDeg: number;
  trunkPitchDeg: number;
  postureLean: PostureLeanDirection;
  isTracking: boolean;
} {
  if (!landmarks || landmarks.length < 29) {
    return {
      shoulderTiltDeg: 0,
      hipTiltDeg: 0,
      trunkPitchDeg: 0,
      postureLean: "NEUTRAL",
      isTracking: false,
    };
  }

  const leftShoulder = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
  const rightShoulder = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
  const leftHip = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
  const rightHip = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];

  // 1. Coronal shoulder tilt: Positive = lean right, Negative = lean left
  let shoulderTiltDeg = 0;
  if (leftShoulder && rightShoulder) {
    const dx = Math.abs(leftShoulder.x - rightShoulder.x);
    const dy = rightShoulder.y - leftShoulder.y;
    shoulderTiltDeg = Math.round(Math.atan2(dy, Math.max(0.001, dx)) * (180 / Math.PI));
  }

  // 2. Coronal hip tilt
  let hipTiltDeg = 0;
  if (leftHip && rightHip) {
    const dx = Math.abs(leftHip.x - rightHip.x);
    const dy = rightHip.y - leftHip.y;
    hipTiltDeg = Math.round(Math.atan2(dy, Math.max(0.001, dx)) * (180 / Math.PI));
  }

  // 3. Sagittal trunk pitch: Positive = lean forward, Negative = lean backward
  let trunkPitchDeg = 0;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midShoulderZ = ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;
    const midHipZ = ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2;

    const torsoDy = midHipY - midShoulderY;
    const torsoDz = midHipZ - midShoulderZ;
    trunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoDy)) * (180 / Math.PI));
  }

  // 4. Posture Lean Direction Classification
  let postureLean: PostureLeanDirection = "NEUTRAL";
  const absShoulder = Math.abs(shoulderTiltDeg);
  const absPitch = Math.abs(trunkPitchDeg);

  if (absShoulder >= 5 && absShoulder >= absPitch) {
    postureLean = shoulderTiltDeg > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
  } else if (absPitch >= 6) {
    postureLean = trunkPitchDeg > 0 ? "LEAN_FORWARD" : "LEAN_BACKWARD";
  } else {
    postureLean = "NEUTRAL";
  }

  return {
    shoulderTiltDeg,
    hipTiltDeg,
    trunkPitchDeg,
    postureLean,
    isTracking: true,
  };
}

export type MultimodalAlignmentStatus =
  | "PERFECT_ALIGNED"
  | "POSTURE_WEIGHT_MISMATCH"
  | "POSTURE_LEAN_ONLY"
  | "WEIGHT_SHIFT_ONLY"
  | "UNASSISTED_OR_INCOMPLETE";

export interface MultimodalCorrelationResult {
  status: MultimodalAlignmentStatus;
  primaryFeedback: string;
  isAligned: boolean;
  cameraPostureText: string;
  balanceShiftText: string;
  disclosure: string;
}

/**
 * Helper to determine COP directional descriptors strictly adhering to:
 * -X = LEFT, +X = RIGHT
 * -Y = BACK, +Y = FRONT
 */
export function getCopDirection(
  copX: number | null | undefined,
  copY: number | null | undefined
): {
  xDirection: "LEFT" | "RIGHT" | "CENTER" | "--";
  yDirection: "FRONT" | "BACK" | "CENTER" | "--";
  displayText: string;
} {
  if (copX === null || copX === undefined || copY === null || copY === undefined) {
    return {
      xDirection: "--",
      yDirection: "--",
      displayText: "COP: --",
    };
  }

  const xDirection = copX > 0.05 ? "RIGHT" : copX < -0.05 ? "LEFT" : "CENTER";
  const yDirection = copY > 0.05 ? "FRONT" : copY < -0.05 ? "BACK" : "CENTER";

  const xSign = copX >= 0 ? `+${copX.toFixed(2)}` : copX.toFixed(2);
  const ySign = copY >= 0 ? `+${copY.toFixed(2)}` : copY.toFixed(2);

  return {
    xDirection,
    yDirection,
    displayText: `COP X: ${xSign} (${xDirection}) | Y: ${ySign} (${yDirection})`,
  };
}

/**
 * Task 5: Multimodal Biofeedback Engine
 * Evaluates the correlation between Camera body posture and Wii Balance Board COP.
 *
 * Example:
 * Camera detects: "Lean Right"
 * Wii Board detects: COP X positive / RIGHT
 * -> "Good — posture and weight shift are aligned."
 *
 * If camera says RIGHT but COP remains LEFT:
 * -> "Check your weight distribution — body is leaning right while weight is shifted left."
 */
export function evaluateMultimodalCorrelation(params: {
  postureLean: PostureLeanDirection | null | undefined;
  hasPose: boolean;
  copX: number | null | undefined;
  copY: number | null | undefined;
  isBoardConnected: boolean;
}): MultimodalCorrelationResult {
  const { postureLean, hasPose, copX, copY, isBoardConnected } = params;

  const disclosure = "Development multimodal feedback — clinical validation pending. Not a clinical diagnosis.";

  // If both sensors are missing
  if (!hasPose && !isBoardConnected) {
    return {
      status: "UNASSISTED_OR_INCOMPLETE",
      primaryFeedback: "Sensors disconnected — connect camera and balance board to begin biofeedback.",
      isAligned: false,
      cameraPostureText: "Pose: Not detected",
      balanceShiftText: "Balance: Disconnected (--)",
      disclosure,
    };
  }

  // Vision only active
  if (hasPose && !isBoardConnected) {
    const postText = postureLean ? postureLean.replace("LEAN_", "Lean ") : "Tracking";
    return {
      status: "POSTURE_LEAN_ONLY",
      primaryFeedback: `Optical posture tracking active (${postText}). Wii Balance Board is not connected.`,
      isAligned: false,
      cameraPostureText: `Posture: ${postText}`,
      balanceShiftText: "COP: --",
      disclosure,
    };
  }

  // Balance only active
  if (!hasPose && isBoardConnected) {
    const copText =
      copX !== null && copX !== undefined && copY !== null && copY !== undefined
        ? `X: ${copX >= 0 ? `+${copX.toFixed(2)}` : copX.toFixed(2)}, Y: ${copY >= 0 ? `+${copY.toFixed(2)}` : copY.toFixed(2)}`
        : "--";
    return {
      status: "WEIGHT_SHIFT_ONLY",
      primaryFeedback: "Wii Balance Board active. Step into camera view for optical posture tracking.",
      isAligned: false,
      cameraPostureText: "Pose: Not detected",
      balanceShiftText: `COP: ${copText}`,
      disclosure,
    };
  }

  // FULL MULTIMODAL ACTIVE: Both sensors providing data
  const safeCopX = copX ?? 0;
  const safeCopY = copY ?? 0;
  const lean = postureLean ?? "NEUTRAL";

  // Balance direction descriptor
  const copLateral = safeCopX > 0.10 ? "RIGHT" : safeCopX < -0.10 ? "LEFT" : "CENTER";
  const copSagittal = safeCopY > 0.10 ? "FRONT" : safeCopY < -0.10 ? "BACK" : "CENTER";

  const cameraPostureText =
    lean === "NEUTRAL"
      ? "Upright Neutral"
      : lean === "LEAN_RIGHT"
      ? "Lean Right"
      : lean === "LEAN_LEFT"
      ? "Lean Left"
      : lean === "LEAN_FORWARD"
      ? "Lean Forward"
      : "Lean Backward";

  const balanceShiftText = `COP ${copLateral}${copSagittal !== "CENTER" ? ` / ${copSagittal}` : ""}`;

  // Evaluate correlation
  if (lean === "NEUTRAL" && copLateral === "CENTER" && copSagittal === "CENTER") {
    return {
      status: "PERFECT_ALIGNED",
      primaryFeedback: "Good — upright posture with balanced weight distribution.",
      isAligned: true,
      cameraPostureText,
      balanceShiftText,
      disclosure,
    };
  }

  if (lean === "LEAN_RIGHT") {
    if (copLateral === "RIGHT") {
      return {
        status: "PERFECT_ALIGNED",
        primaryFeedback: "Good — posture and weight shift are aligned to the right.",
        isAligned: true,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    if (copLateral === "LEFT") {
      return {
        status: "POSTURE_WEIGHT_MISMATCH",
        primaryFeedback: "Check your weight distribution — body is leaning right while weight is shifted left.",
        isAligned: false,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    return {
      status: "POSTURE_LEAN_ONLY",
      primaryFeedback: "Weight centered — shift your weight right to match your torso posture.",
      isAligned: false,
      cameraPostureText,
      balanceShiftText,
      disclosure,
    };
  }

  if (lean === "LEAN_LEFT") {
    if (copLateral === "LEFT") {
      return {
        status: "PERFECT_ALIGNED",
        primaryFeedback: "Good — posture and weight shift are aligned to the left.",
        isAligned: true,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    if (copLateral === "RIGHT") {
      return {
        status: "POSTURE_WEIGHT_MISMATCH",
        primaryFeedback: "Check your weight distribution — body is leaning left while weight is shifted right.",
        isAligned: false,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    return {
      status: "POSTURE_LEAN_ONLY",
      primaryFeedback: "Weight centered — shift your weight left to match your torso posture.",
      isAligned: false,
      cameraPostureText,
      balanceShiftText,
      disclosure,
    };
  }

  if (lean === "LEAN_FORWARD") {
    if (copSagittal === "FRONT") {
      return {
        status: "PERFECT_ALIGNED",
        primaryFeedback: "Good — forward trunk pitch and anterior weight shift are aligned.",
        isAligned: true,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    if (copSagittal === "BACK") {
      return {
        status: "POSTURE_WEIGHT_MISMATCH",
        primaryFeedback: "Check your balance — trunk is leaning forward while weight remains on heels.",
        isAligned: false,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
  }

  if (lean === "LEAN_BACKWARD") {
    if (copSagittal === "BACK") {
      return {
        status: "PERFECT_ALIGNED",
        primaryFeedback: "Good — backward trunk pitch and posterior weight shift are aligned.",
        isAligned: true,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
    if (copSagittal === "FRONT") {
      return {
        status: "POSTURE_WEIGHT_MISMATCH",
        primaryFeedback: "Check your balance — trunk is leaning back while weight remains on toes.",
        isAligned: false,
        cameraPostureText,
        balanceShiftText,
        disclosure,
      };
    }
  }

  // Fallback neutral or gentle adjustment
  return {
    status: "POSTURE_WEIGHT_MISMATCH",
    primaryFeedback: "Center your posture and balance your weight evenly across both feet.",
    isAligned: false,
    cameraPostureText,
    balanceShiftText,
    disclosure,
  };
}

export interface PostureBalanceSessionResult {
  durationSeconds: number;
  postureSamplesCount: number;
  balanceSamplesCount: number;
  alignmentCompliancePercent: number;
  isSimulated: boolean;
  clinicalScore: number | null; // Strictly null if simulated
  validationNotice: string;
}

/**
 * Calculates session summary for Posture + Balance exercise.
 * Strictly guarantees no fake clinical balance scores are produced from simulation.
 */
export function calculatePostureBalanceResult(params: {
  durationMs: number;
  postureSamplesCount: number;
  balanceSamplesCount: number;
  alignedSamplesCount: number;
  isSimulated: boolean;
  isConnected: boolean;
}): PostureBalanceSessionResult {
  const { durationMs, postureSamplesCount, balanceSamplesCount, alignedSamplesCount, isSimulated, isConnected } = params;

  const durationSeconds = Math.max(0, Math.round((durationMs / 1000) * 10) / 10);
  const totalMultimodalSamples = Math.max(1, Math.min(postureSamplesCount, balanceSamplesCount));
  const alignmentCompliancePercent = Math.min(100, Math.round((alignedSamplesCount / totalMultimodalSamples) * 100));

  // STRICT SCIENTIFIC RULE: No clinical score when simulated or unmeasured
  const clinicalScore = !isSimulated && isConnected && postureSamplesCount > 5 ? alignmentCompliancePercent : null;

  return {
    durationSeconds,
    postureSamplesCount,
    balanceSamplesCount,
    alignmentCompliancePercent,
    isSimulated,
    clinicalScore,
    validationNotice: "Development exercise — clinical validation pending. Not a clinical diagnosis.",
  };
}
