/**
 * MediaPipePoseToSMPLAdapter
 *
 * PatientBalanceAI - Phase 4: Camera Pose Estimation -> SMPL Body Movement
 *
 * Translates MediaPipe 33-landmark pose detections into canonical 24-joint SMPL
 * pose parameters ([rx, ry, rz] Euler angles in radians, global translation, global orientation).
 *
 * ARCHITECTURAL CONVENTIONS:
 *
 * 1. Clinical COP Coordinate System (2D Force Plate):
 *    +X = RIGHT, -X = LEFT
 *    +Y = FRONT / ANTERIOR, -Y = BACK / POSTERIOR
 *
 * 2. 3D Rendering World Space (Three.js Y-Up):
 *    +X = RIGHT (lateral)
 *    -X = LEFT (lateral)
 *    +Y = VERTICAL HEIGHT (upwards against gravity)
 *    +Z = FRONT / ANTERIOR (sagittal depth, pointing forward)
 *    -Z = BACK / POSTERIOR (sagittal depth, pointing backward)
 *
 * 3. MediaPipe Pose Space:
 *    x in [0, 1] (left to right on sensor)
 *    y in [0, 1] (top to bottom on sensor, inverted relative to 3D Y)
 *    z (depth relative to mid-hip; negative = closer to camera / front)
 */

import {
  SMPLPose,
  SMPLJointName,
  SMPL_JOINT_NAMES,
  createNeutralSMPLPose,
} from "../../types/smpl";
import { NormalizedLandmark, BodyPoseLandmarks } from "../../types/vision";

/** Indices for standard MediaPipe 33 pose landmarks */
export const MEDIAPIPE_LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface MediaPipeSMPLAdapterOptions {
  /**
   * Exponential moving average smoothing parameter alpha in (0.0, 1.0].
   * Lower values = stronger smoothing (less jitter), higher values = faster responsiveness.
   * Default: 0.35.
   */
  smoothingAlpha?: number;
  /** Minimum detection confidence [0.0, 1.0] required for reliable joint rotation. Default: 0.5. */
  minConfidence?: number;
  /** Whether the camera input is mirrored (standard selfie/webcam mode). Default: true. */
  isMirrored?: boolean;
  /** Whether temporal smoothing is enabled. Default: true. */
  enableSmoothing?: boolean;
}

export interface SMPLPoseDebugInfo {
  pelvisMidpoint: [number, number, number];
  shoulderMidpoint: [number, number, number];
  spineVector: [number, number, number];
  leftSideAligned: boolean;
  rightSideAligned: boolean;
  frontBackAligned: boolean;
  derivedJoints: string[];
  rawLandmarkCount: number;
  overallConfidence: number;
}

export interface SMPLPoseConversionResult {
  pose: SMPLPose;
  confidence: number;
  jointConfidences: Record<SMPLJointName, number>;
  isPoseValid: boolean;
  debugInfo: SMPLPoseDebugInfo;
}

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/** Helper 3D vector subtraction */
function sub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Helper 3D vector length */
function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** Helper vector dot product */
function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Helper clamp */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * MediaPipePoseToSMPLAdapter
 *
 * Stateless or stateful adapter mapping raw camera landmarks to the official
 * 24-joint SMPL body structure with temporal smoothing and confidence gating.
 */
export class MediaPipePoseToSMPLAdapter {
  private smoothingAlpha: number;
  private minConfidence: number;
  private isMirrored: boolean;
  private enableSmoothing: boolean;

  // Smoothing state history
  private previousPose: SMPLPose;
  private previousJointRotations: Record<SMPLJointName, [number, number, number]>;
  private missingFramesCount: Record<SMPLJointName, number>;

  constructor(options?: MediaPipeSMPLAdapterOptions) {
    this.smoothingAlpha = options?.smoothingAlpha ?? 0.35;
    this.minConfidence = options?.minConfidence ?? 0.5;
    this.isMirrored = options?.isMirrored ?? true;
    this.enableSmoothing = options?.enableSmoothing ?? true;

    this.previousPose = createNeutralSMPLPose();
    this.previousJointRotations = JSON.parse(JSON.stringify(this.previousPose.jointRotations));
    this.missingFramesCount = {} as Record<SMPLJointName, number>;

    for (const name of SMPL_JOINT_NAMES) {
      this.missingFramesCount[name] = 0;
    }
  }

  /** Update smoothing alpha parameter dynamically */
  public setSmoothingAlpha(alpha: number): void {
    this.smoothingAlpha = clamp(alpha, 0.05, 1.0);
  }

  /** Update mirror mode */
  public setMirrored(mirrored: boolean): void {
    this.isMirrored = mirrored;
  }

  /** Reset temporal filter history */
  public reset(): void {
    this.previousPose = createNeutralSMPLPose();
    this.previousJointRotations = JSON.parse(JSON.stringify(this.previousPose.jointRotations));
    for (const name of SMPL_JOINT_NAMES) {
      this.missingFramesCount[name] = 0;
    }
  }

  /**
   * Main transformation method: converts MediaPipe pose landmarks into standard SMPL pose parameters.
   */
  public convert(
    input: BodyPoseLandmarks | NormalizedLandmark[] | null | undefined
  ): SMPLPoseConversionResult {
    // 1. Resolve raw landmark array
    let rawLandmarks: NormalizedLandmark[] | null = null;

    if (Array.isArray(input)) {
      rawLandmarks = input;
    } else if (input && "allRawLandmarks" in input && Array.isArray(input.allRawLandmarks)) {
      rawLandmarks = input.allRawLandmarks;
    }

    if (!rawLandmarks || rawLandmarks.length < 25) {
      return {
        pose: createNeutralSMPLPose(),
        confidence: 0,
        jointConfidences: this.createEmptyConfidences(),
        isPoseValid: false,
        debugInfo: this.createEmptyDebugInfo(),
      };
    }

    // Helper to get landmark with visibility
    const getLm = (index: number): { pos: Vector3D; vis: number } => {
      const lm = rawLandmarks[index];
      if (!lm) {
        return { pos: { x: 0, y: 0, z: 0 }, vis: 0 };
      }

      // Convert from MediaPipe image space to Three.js anatomical space:
      // MediaPipe: x in [0, 1] (left to right), y in [0, 1] (top to bottom), z (depth)
      // Mirroring handling: In mirrored mode, camera x is already aligned with viewer coronal orientation
      const x = this.isMirrored ? (lm.x - 0.5) : -(lm.x - 0.5);
      const y = -(lm.y - 0.5); // Invert image Y so +Y is UP
      const z = -lm.z;         // Invert Z so negative MediaPipe z (closer) becomes +Z (Anterior / Front)

      return {
        pos: { x, y, z },
        vis: lm.visibility ?? 1.0,
      };
    };

    // 2. Extract key MediaPipe landmarks
    const nose = getLm(MEDIAPIPE_LANDMARK_INDEX.NOSE);
    const leftShoulder = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_SHOULDER);
    const rightShoulder = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_SHOULDER);
    const leftElbow = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_ELBOW);
    const rightElbow = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_ELBOW);
    const leftWrist = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_WRIST);
    const rightWrist = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_WRIST);
    const leftHip = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_HIP);
    const rightHip = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_HIP);
    const leftKnee = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_KNEE);
    const rightKnee = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_KNEE);
    const leftAnkle = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_ANKLE);
    const rightAnkle = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_ANKLE);
    const leftFoot = getLm(MEDIAPIPE_LANDMARK_INDEX.LEFT_FOOT_INDEX);
    const rightFoot = getLm(MEDIAPIPE_LANDMARK_INDEX.RIGHT_FOOT_INDEX);

    // 3. Mathematical derivations for missing joints (Tasks 2 & 3)
    // Pelvis center = midpoint(leftHip, rightHip)
    const pelvisPos: Vector3D = {
      x: (leftHip.pos.x + rightHip.pos.x) * 0.5,
      y: (leftHip.pos.y + rightHip.pos.y) * 0.5,
      z: (leftHip.pos.z + rightHip.pos.z) * 0.5,
    };
    const pelvisVis = Math.min(leftHip.vis, rightHip.vis);

    // Shoulder center = midpoint(leftShoulder, rightShoulder)
    const shoulderCenterPos: Vector3D = {
      x: (leftShoulder.pos.x + rightShoulder.pos.x) * 0.5,
      y: (leftShoulder.pos.y + rightShoulder.pos.y) * 0.5,
      z: (leftShoulder.pos.z + rightShoulder.pos.z) * 0.5,
    };
    const shoulderCenterVis = Math.min(leftShoulder.vis, rightShoulder.vis);

    // Spine vector = pelvis -> shoulderCenter
    const spineVec = sub(shoulderCenterPos, pelvisPos);

    // Neck: derived between shoulder center and nose
    const neckPos: Vector3D = {
      x: shoulderCenterPos.x + (nose.pos.x - shoulderCenterPos.x) * 0.25,
      y: shoulderCenterPos.y + (nose.pos.y - shoulderCenterPos.y) * 0.25,
      z: shoulderCenterPos.z + (nose.pos.z - shoulderCenterPos.z) * 0.25,
    };

    // 4. Calculate Anatomically Meaningful Joint Rotations (Task 6)
    const newRotations = createNeutralSMPLPose().jointRotations;
    const jointConfidences: Record<SMPLJointName, number> = this.createEmptyConfidences();

    // --- Torso Orientation (Pelvis & Spine) ---
    // Coronal lateral tilt (roll around Z) and Sagittal forward/backward lean (pitch around X)
    const torsoRoll = Math.atan2(spineVec.x, spineVec.y);      // >0 = lean right, <0 = lean left
    const torsoPitch = -Math.atan2(spineVec.z, spineVec.y);    // >0 = lean forward (+Z), <0 = lean backward (-Z)

    // Clavicle width vector for yaw (rotation around vertical Y)
    const clavicleVec = sub(leftShoulder.pos, rightShoulder.pos);
    const torsoYaw = Math.atan2(clavicleVec.z, clavicleVec.x || 1.0);

    const trunkConf = Math.min(pelvisVis, shoulderCenterVis);
    jointConfidences.pelvis = trunkConf;
    jointConfidences.spine1 = trunkConf;
    jointConfidences.spine2 = trunkConf;
    jointConfidences.spine3 = trunkConf;

    if (trunkConf >= this.minConfidence) {
      // Distribute spinal curve across lumbar and thoracic chain
      newRotations.spine1 = [torsoPitch * 0.35, torsoYaw * 0.35, torsoRoll * 0.35];
      newRotations.spine2 = [torsoPitch * 0.35, torsoYaw * 0.35, torsoRoll * 0.35];
      newRotations.spine3 = [torsoPitch * 0.30, torsoYaw * 0.30, torsoRoll * 0.30];
    }

    // --- Head & Neck ---
    const headConf = Math.min(nose.vis, shoulderCenterVis);
    jointConfidences.head = headConf;
    jointConfidences.neck = headConf;
    if (headConf >= this.minConfidence) {
      const headVec = sub(nose.pos, neckPos);
      const headRoll = clamp(Math.atan2(headVec.x, headVec.y || 1.0) - torsoRoll, -0.6, 0.6);
      const headPitch = clamp(-Math.atan2(headVec.z, headVec.y || 1.0) - torsoPitch, -0.6, 0.6);
      newRotations.head = [headPitch, 0, headRoll];
      newRotations.neck = [headPitch * 0.4, 0, headRoll * 0.4];
    }

    // --- Upper Limbs (Shoulders & Elbows) ---
    // Left Upper Arm (Shoulder -> Elbow)
    const leftArmConf = Math.min(leftShoulder.vis, leftElbow.vis);
    jointConfidences.left_shoulder = leftArmConf;
    if (leftArmConf >= this.minConfidence) {
      const lArmVec = sub(leftElbow.pos, leftShoulder.pos);
      // Abduction: lateral raise (roll Z)
      const lAbduction = clamp(Math.atan2(-lArmVec.x, -lArmVec.y) - 0.15, -0.2, 1.8);
      // Flexion: forward raise (pitch X)
      const lFlexion = clamp(Math.atan2(lArmVec.z, -lArmVec.y), -0.4, 1.8);
      newRotations.left_shoulder = [lFlexion, 0, -lAbduction];
    }

    // Left Forearm & Elbow (Elbow -> Wrist)
    const leftForearmConf = Math.min(leftElbow.vis, leftWrist.vis);
    jointConfidences.left_elbow = leftForearmConf;
    if (leftForearmConf >= this.minConfidence && leftArmConf >= this.minConfidence) {
      const lUpper = sub(leftElbow.pos, leftShoulder.pos);
      const lForearm = sub(leftWrist.pos, leftElbow.pos);
      const lUpperLen = length(lUpper) || 1.0;
      const lForearmLen = length(lForearm) || 1.0;
      const cosAngle = dot(lUpper, lForearm) / (lUpperLen * lForearmLen);
      const elbowBend = Math.PI - Math.acos(clamp(cosAngle, -1.0, 1.0));
      newRotations.left_elbow = [clamp(elbowBend, 0, 2.5), 0, 0];
    }

    // Right Upper Arm (Shoulder -> Elbow)
    const rightArmConf = Math.min(rightShoulder.vis, rightElbow.vis);
    jointConfidences.right_shoulder = rightArmConf;
    if (rightArmConf >= this.minConfidence) {
      const rArmVec = sub(rightElbow.pos, rightShoulder.pos);
      const rAbduction = clamp(Math.atan2(rArmVec.x, -rArmVec.y) - 0.15, -0.2, 1.8);
      const rFlexion = clamp(Math.atan2(rArmVec.z, -rArmVec.y), -0.4, 1.8);
      newRotations.right_shoulder = [rFlexion, 0, rAbduction];
    }

    // Right Forearm & Elbow (Elbow -> Wrist)
    const rightForearmConf = Math.min(rightElbow.vis, rightWrist.vis);
    jointConfidences.right_elbow = rightForearmConf;
    if (rightForearmConf >= this.minConfidence && rightArmConf >= this.minConfidence) {
      const rUpper = sub(rightElbow.pos, rightShoulder.pos);
      const rForearm = sub(rightWrist.pos, rightElbow.pos);
      const rUpperLen = length(rUpper) || 1.0;
      const rForearmLen = length(rForearm) || 1.0;
      const cosAngle = dot(rUpper, rForearm) / (rUpperLen * rForearmLen);
      const elbowBend = Math.PI - Math.acos(clamp(cosAngle, -1.0, 1.0));
      newRotations.right_elbow = [clamp(elbowBend, 0, 2.5), 0, 0];
    }

    // --- Lower Limbs (Hips, Knees, Ankles) ---
    // Left Leg (Hip -> Knee -> Ankle)
    const leftLegConf = Math.min(leftHip.vis, leftKnee.vis);
    jointConfidences.left_hip = leftLegConf;
    if (leftLegConf >= this.minConfidence) {
      const lThigh = sub(leftKnee.pos, leftHip.pos);
      const lHipFlexion = clamp(Math.atan2(lThigh.z, -lThigh.y), -0.4, 1.6);
      const lHipAbduction = clamp(Math.atan2(-lThigh.x, -lThigh.y), -0.3, 0.8);
      newRotations.left_hip = [lHipFlexion, 0, -lHipAbduction];
    }

    const leftKneeConf = Math.min(leftKnee.vis, leftAnkle.vis);
    jointConfidences.left_knee = leftKneeConf;
    if (leftKneeConf >= this.minConfidence && leftLegConf >= this.minConfidence) {
      const lThigh = sub(leftKnee.pos, leftHip.pos);
      const lShin = sub(leftAnkle.pos, leftKnee.pos);
      const lThighLen = length(lThigh) || 1.0;
      const lShinLen = length(lShin) || 1.0;
      const cosAngle = dot(lThigh, lShin) / (lThighLen * lShinLen);
      const kneeBend = Math.PI - Math.acos(clamp(cosAngle, -1.0, 1.0));
      newRotations.left_knee = [-clamp(kneeBend, 0, 2.3), 0, 0];
    }

    // Right Leg (Hip -> Knee -> Ankle)
    const rightLegConf = Math.min(rightHip.vis, rightKnee.vis);
    jointConfidences.right_hip = rightLegConf;
    if (rightLegConf >= this.minConfidence) {
      const rThigh = sub(rightKnee.pos, rightHip.pos);
      const rHipFlexion = clamp(Math.atan2(rThigh.z, -rThigh.y), -0.4, 1.6);
      const rHipAbduction = clamp(Math.atan2(rThigh.x, -rThigh.y), -0.3, 0.8);
      newRotations.right_hip = [rHipFlexion, 0, rHipAbduction];
    }

    const rightKneeConf = Math.min(rightKnee.vis, rightAnkle.vis);
    jointConfidences.right_knee = rightKneeConf;
    if (rightKneeConf >= this.minConfidence && rightLegConf >= this.minConfidence) {
      const rThigh = sub(rightKnee.pos, rightHip.pos);
      const rShin = sub(rightAnkle.pos, rightKnee.pos);
      const rThighLen = length(rThigh) || 1.0;
      const rShinLen = length(rShin) || 1.0;
      const cosAngle = dot(rThigh, rShin) / (rThighLen * rShinLen);
      const kneeBend = Math.PI - Math.acos(clamp(cosAngle, -1.0, 1.0));
      newRotations.right_knee = [-clamp(kneeBend, 0, 2.3), 0, 0];
    }

    // Foot confidences
    jointConfidences.left_ankle = leftAnkle.vis;
    jointConfidences.right_ankle = rightAnkle.vis;
    jointConfidences.left_foot = leftFoot.vis;
    jointConfidences.right_foot = rightFoot.vis;

    // 5. Temporal Smoothing & Unreliable Detection Gating (Tasks 7 & 8)
    const alpha = this.enableSmoothing ? this.smoothingAlpha : 1.0;
    const finalRotations: Partial<Record<SMPLJointName, [number, number, number]>> = {};

    for (const name of SMPL_JOINT_NAMES) {
      const conf = jointConfidences[name] ?? 0;
      const prev = this.previousJointRotations[name] || [0, 0, 0];
      const target = newRotations[name] || [0, 0, 0];

      if (conf < this.minConfidence) {
        // Low confidence: retain previous stable pose or decay toward neutral if long missing
        this.missingFramesCount[name] = (this.missingFramesCount[name] || 0) + 1;
        if (this.missingFramesCount[name] > 25) {
          // Gated gentle decay toward neutral anatomical zero
          finalRotations[name] = [
            prev[0] * 0.92,
            prev[1] * 0.92,
            prev[2] * 0.92,
          ];
        } else {
          finalRotations[name] = [...prev];
        }
      } else {
        // Confident detection: apply Exponential Moving Average (EMA)
        this.missingFramesCount[name] = 0;
        finalRotations[name] = [
          prev[0] * (1 - alpha) + target[0] * alpha,
          prev[1] * (1 - alpha) + target[1] * alpha,
          prev[2] * (1 - alpha) + target[2] * alpha,
        ];
      }

      this.previousJointRotations[name] = [...(finalRotations[name] as [number, number, number])];
    }

    // 6. Global Translation & Orientation
    // Root translation derived from pelvis offset
    const lateralShift = clamp(pelvisPos.x * 0.35, -0.15, 0.15);
    const prevTrans = this.previousPose.globalTranslation;
    const smoothedTranslation: [number, number, number] = [
      prevTrans[0] * (1 - alpha) + lateralShift * alpha,
      0, // Standing plane contact maintained on board
      0,
    ];

    const prevRot = this.previousPose.globalOrientation;
    const smoothedOrientation: [number, number, number] = [
      prevRot[0] * (1 - alpha) + (torsoPitch * 0.3) * alpha,
      prevRot[1] * (1 - alpha) + (torsoYaw * 0.3) * alpha,
      prevRot[2] * (1 - alpha) + (torsoRoll * 0.3) * alpha,
    ];

    const resultPose: SMPLPose = {
      globalTranslation: smoothedTranslation,
      globalOrientation: smoothedOrientation,
      jointRotations: finalRotations,
    };

    this.previousPose = resultPose;

    // 7. Overall Pose Confidence & Debug Metrics (Task 10)
    const keyConfidences = [
      leftShoulder.vis,
      rightShoulder.vis,
      leftHip.vis,
      rightHip.vis,
      nose.vis,
    ];
    const overallConfidence =
      keyConfidences.reduce((acc, c) => acc + c, 0) / keyConfidences.length;

    const isPoseValid = overallConfidence >= this.minConfidence;

    return {
      pose: resultPose,
      confidence: overallConfidence,
      jointConfidences,
      isPoseValid,
      debugInfo: {
        pelvisMidpoint: [pelvisPos.x, pelvisPos.y, pelvisPos.z],
        shoulderMidpoint: [shoulderCenterPos.x, shoulderCenterPos.y, shoulderCenterPos.z],
        spineVector: [spineVec.x, spineVec.y, spineVec.z],
        leftSideAligned: leftShoulder.pos.x < rightShoulder.pos.x, // Left body sits on -X
        rightSideAligned: rightShoulder.pos.x > leftShoulder.pos.x, // Right body sits on +X
        frontBackAligned: true,
        derivedJoints: [
          "pelvis",
          "spine1",
          "spine2",
          "spine3",
          "neck",
          "left_collar",
          "right_collar",
          "left_hand",
          "right_hand",
        ],
        rawLandmarkCount: rawLandmarks.length,
        overallConfidence,
      },
    };
  }

  private createEmptyConfidences(): Record<SMPLJointName, number> {
    const map = {} as Record<SMPLJointName, number>;
    for (const name of SMPL_JOINT_NAMES) {
      map[name] = 0;
    }
    return map;
  }

  private createEmptyDebugInfo(): SMPLPoseDebugInfo {
    return {
      pelvisMidpoint: [0, 0, 0],
      shoulderMidpoint: [0, 0, 0],
      spineVector: [0, 1, 0],
      leftSideAligned: true,
      rightSideAligned: true,
      frontBackAligned: true,
      derivedJoints: [],
      rawLandmarkCount: 0,
      overallConfidence: 0,
    };
  }
}
