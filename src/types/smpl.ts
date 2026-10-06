/**
 * SMPL (Skinned Multi-Person Linear Model) Type Definitions & Joint Topology
 *
 * PatientBalanceAI - Phase 3 / Phase 3A: SMPL Coordinate Clarity
 *
 * COORDINATE SYSTEM ARCHITECTURE:
 *
 * 1. CLINICAL COP COORDINATE SYSTEM (2D Biomechanical Force Plate Plane):
 *    +X = RIGHT
 *    -X = LEFT
 *    +Y = FRONT / ANTERIOR
 *    -Y = BACK / POSTERIOR
 *
 * 2. 3D RENDERING COORDINATE SYSTEM (Three.js Right-Handed, Y-Up World Space):
 *    +X = RIGHT (lateral)
 *    -X = LEFT (lateral)
 *    +Y = VERTICAL HEIGHT (upwards against gravity)
 *    +Z = FRONT / ANTERIOR (sagittal depth, pointing forward)
 *    -Z = BACK / POSTERIOR (sagittal depth, pointing backward)
 *
 * CANONICAL AXIS MAPPING (Clinical COP -> 3D Rendering World):
 *    Clinical +X          → 3D +X (worldX = copX)
 *    Clinical -X          → 3D -X (worldX = copX)
 *    Clinical +Y (FRONT)  → 3D +Z (worldZ = copY)
 *    Clinical -Y (BACK)   → 3D -Z (worldZ = copY)
 *    3D Vertical Height   → 3D +Y (worldY = verticalHeight, independent of COP)
 *
 * Standard 24-joint kinematic skeleton conforming to the official SMPL specification
 * (Loper et al., SIGGRAPH Asia 2015).
 */


/** Standard SMPL 24 Joint Indices and Canonical Identifiers */
export const SMPL_JOINT_NAMES = [
  "pelvis",         // 0  - Root
  "left_hip",       // 1  - Left hip joint
  "right_hip",      // 2  - Right hip joint
  "spine1",         // 3  - Lumbar spine
  "left_knee",      // 4  - Left knee joint
  "right_knee",     // 5  - Right knee joint
  "spine2",         // 6  - Thoracic spine
  "left_ankle",     // 7  - Left ankle joint
  "right_ankle",    // 8  - Right ankle joint
  "spine3",         // 9  - Upper thoracic / chest
  "left_foot",      // 10 - Left foot / ball
  "right_foot",     // 11 - Right foot / ball
  "neck",           // 12 - Cervical spine
  "left_collar",    // 13 - Left clavicle
  "right_collar",   // 14 - Right clavicle
  "head",           // 15 - Cranium / Head
  "left_shoulder",  // 16 - Left glenohumeral joint
  "right_shoulder", // 17 - Right glenohumeral joint
  "left_elbow",     // 18 - Left elbow
  "right_elbow",    // 19 - Right elbow
  "left_wrist",     // 20 - Left wrist
  "right_wrist",    // 21 - Right wrist
  "left_hand",      // 22 - Left hand
  "right_hand",     // 23 - Right hand
] as const;

export type SMPLJointName = typeof SMPL_JOINT_NAMES[number];

/** Clinical Body Region Category */
export type SMPLBodyRegion = "pelvis" | "spine" | "head_neck" | "upper_limb" | "lower_limb";

/** Definition for each joint in the SMPL kinematic chain */
export interface SMPLJointDefinition {
  id: number;
  name: SMPLJointName;
  parent: number | null; // index of parent joint, null for root pelvis
  clinicalName: string;
  region: SMPLBodyRegion;
  /** Anatomical offset [x, y, z] in meters relative to parent joint in neutral pose */
  localOffset: [number, number, number];
  /** Default world position [x, y, z] in neutral standing posture */
  neutralWorldPos: [number, number, number];
}

/** Standard SMPL 24-Joint Kinematic Hierarchy */
export const SMPL_JOINT_DEFINITIONS: Record<SMPLJointName, SMPLJointDefinition> = {
  pelvis: {
    id: 0,
    name: "pelvis",
    parent: null,
    clinicalName: "Pelvis (Center of Mass / Root)",
    region: "pelvis",
    localOffset: [0, 0, 0],
    neutralWorldPos: [0, 0.94, 0],
  },
  left_hip: {
    id: 1,
    name: "left_hip",
    parent: 0,
    clinicalName: "Left Acetabulofemoral (Hip) Joint",
    region: "lower_limb",
    localOffset: [-0.095, -0.05, 0],
    neutralWorldPos: [-0.095, 0.89, 0],
  },
  right_hip: {
    id: 2,
    name: "right_hip",
    parent: 0,
    clinicalName: "Right Acetabulofemoral (Hip) Joint",
    region: "lower_limb",
    localOffset: [0.095, -0.05, 0],
    neutralWorldPos: [0.095, 0.89, 0],
  },
  spine1: {
    id: 3,
    name: "spine1",
    parent: 0,
    clinicalName: "Lumbar Spine (L1-L5)",
    region: "spine",
    localOffset: [0, 0.12, 0],
    neutralWorldPos: [0, 1.06, 0],
  },
  left_knee: {
    id: 4,
    name: "left_knee",
    parent: 1,
    clinicalName: "Left Tibiofemoral (Knee) Joint",
    region: "lower_limb",
    localOffset: [0, -0.42, 0],
    neutralWorldPos: [-0.095, 0.47, 0],
  },
  right_knee: {
    id: 5,
    name: "right_knee",
    parent: 2,
    clinicalName: "Right Tibiofemoral (Knee) Joint",
    region: "lower_limb",
    localOffset: [0, -0.42, 0],
    neutralWorldPos: [0.095, 0.47, 0],
  },
  spine2: {
    id: 6,
    name: "spine2",
    parent: 3,
    clinicalName: "Mid-Thoracic Spine (T7-T12)",
    region: "spine",
    localOffset: [0, 0.13, 0],
    neutralWorldPos: [0, 1.19, 0],
  },
  left_ankle: {
    id: 7,
    name: "left_ankle",
    parent: 4,
    clinicalName: "Left Talocrural (Ankle) Joint",
    region: "lower_limb",
    localOffset: [0, -0.39, 0],
    neutralWorldPos: [-0.095, 0.08, 0],
  },
  right_ankle: {
    id: 8,
    name: "right_ankle",
    parent: 5,
    clinicalName: "Right Talocrural (Ankle) Joint",
    region: "lower_limb",
    localOffset: [0, -0.39, 0],
    neutralWorldPos: [0.095, 0.08, 0],
  },
  spine3: {
    id: 9,
    name: "spine3",
    parent: 6,
    clinicalName: "Upper Thoracic Spine / T1-T6",
    region: "spine",
    localOffset: [0, 0.13, 0],
    neutralWorldPos: [0, 1.32, 0],
  },
  left_foot: {
    id: 10,
    name: "left_foot",
    parent: 7,
    clinicalName: "Left Metatarsal / Foot Plantar Contact",
    region: "lower_limb",
    localOffset: [0, -0.039, 0.07],
    neutralWorldPos: [-0.095, 0.041, 0.07],
  },
  right_foot: {
    id: 11,
    name: "right_foot",
    parent: 8,
    clinicalName: "Right Metatarsal / Foot Plantar Contact",
    region: "lower_limb",
    localOffset: [0, -0.039, 0.07],
    neutralWorldPos: [0.095, 0.041, 0.07],
  },
  neck: {
    id: 12,
    name: "neck",
    parent: 9,
    clinicalName: "Cervical Spine (C1-C7)",
    region: "head_neck",
    localOffset: [0, 0.11, 0],
    neutralWorldPos: [0, 1.43, 0],
  },
  left_collar: {
    id: 13,
    name: "left_collar",
    parent: 9,
    clinicalName: "Left Sternoclavicular (Clavicle)",
    region: "upper_limb",
    localOffset: [-0.08, 0.08, 0],
    neutralWorldPos: [-0.08, 1.40, 0],
  },
  right_collar: {
    id: 14,
    name: "right_collar",
    parent: 9,
    clinicalName: "Right Sternoclavicular (Clavicle)",
    region: "upper_limb",
    localOffset: [0.08, 0.08, 0],
    neutralWorldPos: [0.08, 1.40, 0],
  },
  head: {
    id: 15,
    name: "head",
    parent: 12,
    clinicalName: "Cranium / Vestibular Center",
    region: "head_neck",
    localOffset: [0, 0.15, 0],
    neutralWorldPos: [0, 1.58, 0],
  },
  left_shoulder: {
    id: 16,
    name: "left_shoulder",
    parent: 13,
    clinicalName: "Left Glenohumeral (Shoulder) Joint",
    region: "upper_limb",
    localOffset: [-0.11, 0, 0],
    neutralWorldPos: [-0.19, 1.40, 0],
  },
  right_shoulder: {
    id: 17,
    name: "right_shoulder",
    parent: 14,
    clinicalName: "Right Glenohumeral (Shoulder) Joint",
    region: "upper_limb",
    localOffset: [0.11, 0, 0],
    neutralWorldPos: [0.19, 1.40, 0],
  },
  left_elbow: {
    id: 18,
    name: "left_elbow",
    parent: 16,
    clinicalName: "Left Humeroulnar (Elbow) Joint",
    region: "upper_limb",
    localOffset: [-0.02, -0.26, 0],
    neutralWorldPos: [-0.21, 1.14, 0],
  },
  right_elbow: {
    id: 19,
    name: "right_elbow",
    parent: 17,
    clinicalName: "Right Humeroulnar (Elbow) Joint",
    region: "upper_limb",
    localOffset: [0.02, -0.26, 0],
    neutralWorldPos: [0.21, 1.14, 0],
  },
  left_wrist: {
    id: 20,
    name: "left_wrist",
    parent: 18,
    clinicalName: "Left Radiocarpal (Wrist) Joint",
    region: "upper_limb",
    localOffset: [0, -0.24, 0],
    neutralWorldPos: [-0.21, 0.90, 0],
  },
  right_wrist: {
    id: 21,
    name: "right_wrist",
    parent: 19,
    clinicalName: "Right Radiocarpal (Wrist) Joint",
    region: "upper_limb",
    localOffset: [0, -0.24, 0],
    neutralWorldPos: [0.21, 0.90, 0],
  },
  left_hand: {
    id: 22,
    name: "left_hand",
    parent: 20,
    clinicalName: "Left Metacarpus (Hand)",
    region: "upper_limb",
    localOffset: [0, -0.09, 0],
    neutralWorldPos: [-0.21, 0.81, 0],
  },
  right_hand: {
    id: 23,
    name: "right_hand",
    parent: 21,
    clinicalName: "Right Metacarpus (Hand)",
    region: "upper_limb",
    localOffset: [0, -0.09, 0],
    neutralWorldPos: [0.21, 0.81, 0],
  },
};

/**
 * Full Kinematic Bone Connections for Rendering Skeleton Segments
 * [parentJoint, childJoint]
 */
export const SMPL_SKELETON_BONES: [SMPLJointName, SMPLJointName][] = [
  // Trunk / Spine Chain
  ["pelvis", "spine1"],
  ["spine1", "spine2"],
  ["spine2", "spine3"],
  ["spine3", "neck"],
  ["neck", "head"],
  // Upper Limbs
  ["spine3", "left_collar"],
  ["left_collar", "left_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["left_wrist", "left_hand"],
  ["spine3", "right_collar"],
  ["right_collar", "right_shoulder"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["right_wrist", "right_hand"],
  // Lower Limbs
  ["pelvis", "left_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["left_ankle", "left_foot"],
  ["pelvis", "right_hip"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["right_ankle", "right_foot"],
];

/**
 * Standard SMPL Pose Parameters
 * Rotations per joint in Euler radians [pitch, yaw, roll]
 */
export interface SMPLPose {
  /** Global translation of pelvis root in meters [x, y, z] */
  globalTranslation: [number, number, number];
  /** Global orientation of root body in Euler radians [pitch, yaw, roll] */
  globalOrientation: [number, number, number];
  /** Local rotations per joint in Euler radians [pitch, yaw, roll] */
  jointRotations: Partial<Record<SMPLJointName, [number, number, number]>>;
}

/**
 * Neutral Anatomical Standing Pose (Task 4)
 * - Stand upright
 * - Face FRONT / +Y
 * - Centered over balance board (X = 0)
 * - Both feet positioned naturally contacting the board surface (y = 0.041m)
 * - Neutral joint angles (all zeros)
 */
export const NEUTRAL_SMPL_POSE: SMPLPose = {
  globalTranslation: [0, 0, 0],
  globalOrientation: [0, 0, 0],
  jointRotations: {
    pelvis: [0, 0, 0],
    left_hip: [0, 0, 0],
    right_hip: [0, 0, 0],
    spine1: [0, 0, 0],
    left_knee: [0, 0, 0],
    right_knee: [0, 0, 0],
    spine2: [0, 0, 0],
    left_ankle: [0, 0, 0],
    right_ankle: [0, 0, 0],
    spine3: [0, 0, 0],
    left_foot: [0, 0, 0],
    right_foot: [0, 0, 0],
    neck: [0, 0, 0],
    left_collar: [0, 0, 0],
    right_collar: [0, 0, 0],
    head: [0, 0, 0],
    left_shoulder: [0, 0, -0.06], // Natural slight arm hang at side
    right_shoulder: [0, 0, 0.06],
    left_elbow: [0, 0, 0],
    right_elbow: [0, 0, 0],
    left_wrist: [0, 0, 0],
    right_wrist: [0, 0, 0],
    left_hand: [0, 0, 0],
    right_hand: [0, 0, 0],
  },
};

/** SMPL Asset Loading & Integration Status */
export type SMPLAssetStatus =
  | "checking"   // Probe asset existence
  | "loaded"     // Official SMPL mesh asset loaded successfully
  | "pending"    // Asset pending at configured path (/models/smpl_neutral.glb)
  | "fallback"   // Fallback kinematic architecture active
  | "error";     // Asset loading failed

/** Configuration for SMPL Model Rendering & Display */
export interface SMPLModelConfig {
  /** Expected URL to official SMPL GLB mesh */
  assetUrl: string;
  /** Gender model variant */
  gender: "neutral" | "male" | "female";
  /** Model scale factor (default 1.0) */
  scale: number;
  /** Show anatomical joint sphere markers */
  showJointMarkers: boolean;
  /** Show kinematic skeleton connector bones */
  showSkeleton: boolean;
  /** Wireframe display mode */
  wireframe: boolean;
  /** Body surface opacity (0.0 to 1.0) */
  opacity: number;
}

export const DEFAULT_SMPL_CONFIG: SMPLModelConfig = {
  assetUrl: "/models/smpl_neutral.glb",
  gender: "neutral",
  scale: 1.0,
  showJointMarkers: false,
  showSkeleton: true,
  wireframe: false,
  opacity: 0.95,
};

/** Helper to generate a complete neutral SMPL pose */
export function createNeutralSMPLPose(): SMPLPose {
  return JSON.parse(JSON.stringify(NEUTRAL_SMPL_POSE));
}

/** Helper to get all joint definitions as a sorted array */
export function getSMPLJointList(): SMPLJointDefinition[] {
  return SMPL_JOINT_NAMES.map((name) => SMPL_JOINT_DEFINITIONS[name]);
}

/**
 * Maps 2D Clinical COP coordinates into 3D Rendering World space.
 *
 * CLINICAL COP COORDINATE SYSTEM (2D Force Plate):
 *   +X = RIGHT
 *   -X = LEFT
 *   +Y = FRONT / ANTERIOR
 *   -Y = BACK / POSTERIOR
 *
 * 3D RENDERING COORDINATE SYSTEM (Three.js Y-Up):
 *   +X = RIGHT (lateral)
 *   -X = LEFT (lateral)
 *   +Y = VERTICAL HEIGHT (upwards against gravity)
 *   +Z = FRONT / ANTERIOR (sagittal depth)
 *   -Z = BACK / POSTERIOR (sagittal depth)
 *
 * CANONICAL AXIS MAPPING:
 *   worldX = copX           (Clinical +X -> 3D +X, Clinical -X -> 3D -X)
 *   worldY = verticalHeight (3D vertical height remains 3D Y axis, independent of COP)
 *   worldZ = copY           (Clinical +Y / FRONT -> 3D +Z, Clinical -Y / BACK -> 3D -Z)
 *
 * BEHAVIORAL GUARANTEES:
 *   COP (+X, 0)  → world (+X, verticalHeight, 0)
 *   COP (-X, 0)  → world (-X, verticalHeight, 0)
 *   COP (0, +Y)  → world (0,  verticalHeight, +Z)
 *   COP (0, -Y)  → world (0,  verticalHeight, -Z)
 *
 * @param copX Clinical lateral sway (+X Right, -X Left)
 * @param copY Clinical sagittal sway (+Y Front/Anterior, -Y Back/Posterior)
 * @param verticalHeight 3D vertical height on the Y axis (default 0.0)
 * @returns [worldX, worldY, worldZ] in 3D rendering space
 */
export function clinicalCOPToWorld3D(
  copX: number,
  copY: number,
  verticalHeight: number = 0.0
): [number, number, number] {
  const worldX = copX;
  const worldY = verticalHeight;
  const worldZ = copY;
  return [worldX, worldY, worldZ];
}

/**
 * Maps normalized clinical COP offset [-1, 1] to 3D balance board physical surface coordinates in meters.
 *
 * Physical plate surface dimensions:
 *   Lateral span:   [-0.18m, +0.18m] along 3D X
 *   Sagittal span:  [-0.10m, +0.10m] along 3D Z
 *   Surface height: 0.040m along 3D Y
 *
 * @param copOffset Normalized offset with x and y in [-1, 1]
 * @param surfaceHeight Elevation of the board standing surface in meters (default 0.040m)
 * @returns [worldX, worldY, worldZ] on the board surface
 */
export function normalizedCOPToBoardWorld3D(
  copOffset: { x: number; y: number },
  surfaceHeight: number = 0.040
): [number, number, number] {
  const clampedX = Math.max(-1, Math.min(1, copOffset.x));
  const clampedY = Math.max(-1, Math.min(1, copOffset.y));

  const clinicalCOPX = clampedX * 0.18;
  const clinicalCOPY = clampedY * 0.10;

  return clinicalCOPToWorld3D(clinicalCOPX, clinicalCOPY, surfaceHeight);
}

