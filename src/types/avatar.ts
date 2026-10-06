export type PostureType =
  | "stand"
  | "lean-left"
  | "lean-right"
  | "lean-forward"
  | "lean-back";

export interface JointRotations {
  head: [number, number, number];
  spine: [number, number, number];
  hips: [number, number, number];
  leftShoulder: [number, number, number];
  rightShoulder: [number, number, number];
  leftElbow: [number, number, number];
  rightElbow: [number, number, number];
  leftHip: [number, number, number];
  rightHip: [number, number, number];
  leftKnee: [number, number, number];
  rightKnee: [number, number, number];
  leftAnkle: [number, number, number];
  rightAnkle: [number, number, number];
}

export interface MovementState {
  posture: PostureType;
  bodyPosition: [number, number, number];
  bodyRotation: [number, number, number];
  copOffset: { x: number; y: number }; // Normalized [-1.0, 1.0]
  weightShift: {
    left: number;  // %
    right: number; // %
    front: number; // %
    back: number;  // %
  };
  jointRotations: JointRotations;
  isDemonstration: boolean;
}

export const DEFAULT_JOINT_ROTATIONS: JointRotations = {
  head: [0, 0, 0],
  spine: [0, 0, 0],
  hips: [0, 0, 0],
  leftShoulder: [0, 0, -0.15],
  rightShoulder: [0, 0, 0.15],
  leftElbow: [0, 0, 0],
  rightElbow: [0, 0, 0],
  leftHip: [0, 0, 0.05],
  rightHip: [0, 0, -0.05],
  leftKnee: [0, 0, 0],
  rightKnee: [0, 0, 0],
  leftAnkle: [0, 0, 0],
  rightAnkle: [0, 0, 0],
};

export const DEFAULT_MOVEMENT_STATE: MovementState = {
  posture: "stand",
  bodyPosition: [0, 0, 0],
  bodyRotation: [0, 0, 0],
  copOffset: { x: 0, y: 0 },
  weightShift: { left: 50, right: 50, front: 50, back: 50 },
  jointRotations: DEFAULT_JOINT_ROTATIONS,
  isDemonstration: true,
};
