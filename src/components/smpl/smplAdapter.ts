/**
 * SMPL Adapter Utilities
 *
 * Bridges PatientBalanceAI legacy MovementState / JointRotations to standard SMPL 24-joint poses.
 * Allows seamless integration between rehabilitation exercise demonstrations and SMPL body model.
 */

import { MovementState, JointRotations } from "../../types/avatar";
import { SMPLPose, createNeutralSMPLPose, SMPLJointName } from "../../types/smpl";

/**
 * Maps legacy movement state to SMPL 24-joint pose parameters
 */
export function convertMovementStateToSMPLPose(movementState?: MovementState): SMPLPose {
  const smplPose = createNeutralSMPLPose();
  if (!movementState) {
    return smplPose;
  }

  // 1. Global Translation & Orientation
  smplPose.globalTranslation = [
    movementState.bodyPosition[0],
    movementState.bodyPosition[1],
    movementState.bodyPosition[2],
  ];

  smplPose.globalOrientation = [
    movementState.bodyRotation[0],
    movementState.bodyRotation[1],
    movementState.bodyRotation[2],
  ];

  const jr: JointRotations = movementState.jointRotations;
  if (!jr) {
    return smplPose;
  }

  // 2. Spine distribution: divide spine rotation across lumbar (spine1), thoracic (spine2), upper chest (spine3)
  const spineRotX = jr.spine ? jr.spine[0] * 0.35 : 0;
  const spineRotY = jr.spine ? jr.spine[1] * 0.35 : 0;
  const spineRotZ = jr.spine ? jr.spine[2] * 0.35 : 0;

  smplPose.jointRotations.spine1 = [spineRotX, spineRotY, spineRotZ];
  smplPose.jointRotations.spine2 = [spineRotX, spineRotY, spineRotZ];
  smplPose.jointRotations.spine3 = [spineRotX, spineRotY, spineRotZ];

  // 3. Head / Cervical
  if (jr.head) {
    smplPose.jointRotations.head = [jr.head[0], jr.head[1], jr.head[2]];
    smplPose.jointRotations.neck = [jr.head[0] * 0.3, jr.head[1] * 0.3, jr.head[2] * 0.3];
  }

  // 4. Upper Limbs
  if (jr.leftShoulder) {
    smplPose.jointRotations.left_shoulder = [
      jr.leftShoulder[0],
      jr.leftShoulder[1],
      jr.leftShoulder[2],
    ];
  }
  if (jr.rightShoulder) {
    smplPose.jointRotations.right_shoulder = [
      jr.rightShoulder[0],
      jr.rightShoulder[1],
      jr.rightShoulder[2],
    ];
  }
  if (jr.leftElbow) {
    smplPose.jointRotations.left_elbow = [jr.leftElbow[0], jr.leftElbow[1], jr.leftElbow[2]];
  }
  if (jr.rightElbow) {
    smplPose.jointRotations.right_elbow = [jr.rightElbow[0], jr.rightElbow[1], jr.rightElbow[2]];
  }

  // 5. Lower Limbs
  if (jr.leftHip) {
    smplPose.jointRotations.left_hip = [jr.leftHip[0], jr.leftHip[1], jr.leftHip[2]];
  }
  if (jr.rightHip) {
    smplPose.jointRotations.right_hip = [jr.rightHip[0], jr.rightHip[1], jr.rightHip[2]];
  }
  if (jr.leftKnee) {
    smplPose.jointRotations.left_knee = [jr.leftKnee[0], jr.leftKnee[1], jr.leftKnee[2]];
  }
  if (jr.rightKnee) {
    smplPose.jointRotations.right_knee = [jr.rightKnee[0], jr.rightKnee[1], jr.rightKnee[2]];
  }
  if (jr.leftAnkle) {
    smplPose.jointRotations.left_ankle = [jr.leftAnkle[0], jr.leftAnkle[1], jr.leftAnkle[2]];
  }
  if (jr.rightAnkle) {
    smplPose.jointRotations.right_ankle = [jr.rightAnkle[0], jr.rightAnkle[1], jr.rightAnkle[2]];
  }

  return smplPose;
}

/**
 * Creates an index export of SMPL components
 */
export function getJointNameClinicalLabel(name: SMPLJointName): string {
  switch (name) {
    case "pelvis": return "Pelvis (Center of Mass)";
    case "left_hip": return "Left Hip Joint";
    case "right_hip": return "Right Hip Joint";
    case "spine1": return "Lumbar Spine (L1-L5)";
    case "left_knee": return "Left Knee Joint";
    case "right_knee": return "Right Knee Joint";
    case "spine2": return "Mid-Thoracic Spine (T7-T12)";
    case "left_ankle": return "Left Ankle Joint";
    case "right_ankle": return "Right Ankle Joint";
    case "spine3": return "Upper Thoracic Spine / T1-T6";
    case "left_foot": return "Left Foot (Plantar Contact)";
    case "right_foot": return "Right Foot (Plantar Contact)";
    case "neck": return "Cervical Spine (Neck)";
    case "left_collar": return "Left Clavicle";
    case "right_collar": return "Right Clavicle";
    case "head": return "Cranium (Head)";
    case "left_shoulder": return "Left Shoulder Joint";
    case "right_shoulder": return "Right Shoulder Joint";
    case "left_elbow": return "Left Elbow Joint";
    case "right_elbow": return "Right Elbow Joint";
    case "left_wrist": return "Left Wrist Joint";
    case "right_wrist": return "Right Wrist Joint";
    case "left_hand": return "Left Hand";
    case "right_hand": return "Right Hand";
  }
}
