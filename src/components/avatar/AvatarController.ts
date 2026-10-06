import { MovementState, PostureType, DEFAULT_JOINT_ROTATIONS } from "../../types/avatar";
import { BodyPoseLandmarks } from "../../types/vision";

export class AvatarController {
  public static getTargetMovementState(posture: PostureType): MovementState {
    switch (posture) {
      case "lean-left":
        return {
          posture: "lean-left",
          bodyPosition: [-0.08, 0, 0],
          bodyRotation: [0, 0, 0.08],
          copOffset: { x: -0.55, y: 0.04 },
          weightShift: { left: 74, right: 26, front: 52, back: 48 },
          jointRotations: {
            ...DEFAULT_JOINT_ROTATIONS,
            spine: [0, 0, 0.12],
            head: [0, 0, -0.06],
            leftHip: [0, 0, -0.06],
            rightHip: [0, 0, -0.12],
            leftShoulder: [0, 0, -0.22],
            rightShoulder: [0, 0, 0.08],
          },
          isDemonstration: true,
        };

      case "lean-right":
        return {
          posture: "lean-right",
          bodyPosition: [0.08, 0, 0],
          bodyRotation: [0, 0, -0.08],
          copOffset: { x: 0.55, y: 0.04 },
          weightShift: { left: 26, right: 74, front: 52, back: 48 },
          jointRotations: {
            ...DEFAULT_JOINT_ROTATIONS,
            spine: [0, 0, -0.12],
            head: [0, 0, 0.06],
            leftHip: [0, 0, 0.12],
            rightHip: [0, 0, 0.06],
            leftShoulder: [0, 0, -0.08],
            rightShoulder: [0, 0, 0.22],
          },
          isDemonstration: true,
        };

      case "lean-forward":
        return {
          posture: "lean-forward",
          bodyPosition: [0, 0, 0.07],
          bodyRotation: [0.10, 0, 0],
          copOffset: { x: 0, y: 0.60 },
          weightShift: { left: 50, right: 50, front: 72, back: 28 },
          jointRotations: {
            ...DEFAULT_JOINT_ROTATIONS,
            spine: [0.08, 0, 0],
            head: [-0.04, 0, 0],
            leftAnkle: [0.10, 0, 0],
            rightAnkle: [0.10, 0, 0],
            leftKnee: [-0.05, 0, 0],
            rightKnee: [-0.05, 0, 0],
          },
          isDemonstration: true,
        };

      case "lean-back":
        return {
          posture: "lean-back",
          bodyPosition: [0, 0, -0.06],
          bodyRotation: [-0.08, 0, 0],
          copOffset: { x: 0, y: -0.55 },
          weightShift: { left: 50, right: 50, front: 29, back: 71 },
          jointRotations: {
            ...DEFAULT_JOINT_ROTATIONS,
            spine: [-0.06, 0, 0],
            head: [0.05, 0, 0],
            leftAnkle: [-0.08, 0, 0],
            rightAnkle: [-0.08, 0, 0],
          },
          isDemonstration: true,
        };

      case "stand":
      default:
        return {
          posture: "stand",
          bodyPosition: [0, 0, 0],
          bodyRotation: [0, 0, 0],
          copOffset: { x: 0, y: 0 },
          weightShift: { left: 50, right: 50, front: 50, back: 50 },
          jointRotations: DEFAULT_JOINT_ROTATIONS,
          isDemonstration: true,
        };
    }
  }

  /**
   * Maps normalized MediaPipe body pose landmarks into 3D avatar movement state.
   * Architecture:
   * MediaPipe Pose -> Normalized Pose -> AvatarController -> 3D Human Avatar
   */
  public static calculateMovementFromPose(pose: BodyPoseLandmarks): MovementState {
    const defaultState = this.getTargetMovementState("stand");
    if (!pose || !pose.leftShoulder || !pose.rightShoulder) {
      return defaultState;
    }

    // 1. Calculate lateral body shift from camera frame center
    // pose.torsoLateralOffset is [-0.5, 0.5], clamp to realistic avatar space [-0.15, 0.15]
    const lateralShift = Math.max(-0.15, Math.min(0.15, -pose.torsoLateralOffset * 0.4));

    // 2. Calculate roll (lateral tilt) and pitch (sagittal tilt) in radians
    const tiltRad = Math.max(-0.25, Math.min(0.25, (pose.shoulderTiltDeg * Math.PI) / 180));
    const pitchRad = Math.max(-0.25, Math.min(0.25, (pose.trunkPitchDeg * Math.PI) / 180));

    // 3. Determine posture classification
    let posture: PostureType = "stand";
    if (pose.postureLean === "LEAN_RIGHT") {
      posture = "lean-right";
    } else if (pose.postureLean === "LEAN_LEFT") {
      posture = "lean-left";
    } else if (pose.postureLean === "LEAN_FORWARD") {
      posture = "lean-forward";
    } else if (pose.postureLean === "LEAN_BACKWARD") {
      posture = "lean-back";
    }

    // 4. Arm movements: calculate shoulder rotation based on elbow elevation
    let leftShoulderRotZ = DEFAULT_JOINT_ROTATIONS.leftShoulder[2];
    let rightShoulderRotZ = DEFAULT_JOINT_ROTATIONS.rightShoulder[2];

    if (pose.leftElbow) {
      // If elbow is elevated above resting position (lower y value in image = higher physically)
      const leftArmLift = pose.leftShoulder.y - pose.leftElbow.y;
      leftShoulderRotZ = -0.15 - Math.max(-0.1, Math.min(1.2, leftArmLift * 2.2));
    }

    if (pose.rightElbow) {
      const rightArmLift = pose.rightShoulder.y - pose.rightElbow.y;
      rightShoulderRotZ = 0.15 + Math.max(-0.1, Math.min(1.2, rightArmLift * 2.2));
    }

    // 5. Knee bend / crouch estimation
    let kneeBendAngle = 0;
    let verticalDrop = 0;
    if (pose.leftHip && pose.leftKnee && pose.leftAnkle) {
      const hipKneeDist = Math.abs(pose.leftKnee.y - pose.leftHip.y);
      // Normalized distance in standing is typically ~0.25 to 0.35
      if (hipKneeDist < 0.22) {
        kneeBendAngle = Math.min(0.35, (0.22 - hipKneeDist) * 3);
        verticalDrop = -kneeBendAngle * 0.2;
        if (posture === "stand") {
          posture = "lean-forward";
        }
      }
    }

    // 6. Center of Pressure (COP) estimation from lateral offset and coronal/sagittal tilts
    const copX = Math.max(-1.0, Math.min(1.0, -pose.torsoLateralOffset * 3.0 + tiltRad * 1.5));
    const copY = Math.max(-1.0, Math.min(1.0, pitchRad * 2.5));
    let leftWeight = Math.round(Math.max(10, Math.min(90, 50 - copX * 35)));
    let rightWeight = 100 - leftWeight;
    let frontWeight = Math.round(Math.max(10, Math.min(90, 50 + copY * 35)));
    let backWeight = 100 - frontWeight;

    // 7. Single-leg stance leg lifting in 3D Avatar
    let leftKneeRotX = -kneeBendAngle;
    let rightKneeRotX = -kneeBendAngle;
    let leftHipRotX = DEFAULT_JOINT_ROTATIONS.leftHip[0];
    let rightHipRotX = DEFAULT_JOINT_ROTATIONS.rightHip[0];

    if (pose.singleLeg?.isSingleLeg) {
      if (pose.singleLeg.liftedLeg === "LEFT") {
        leftHipRotX = 0.5;
        leftKneeRotX = -0.8;
        leftWeight = 15;
        rightWeight = 85;
      } else if (pose.singleLeg.liftedLeg === "RIGHT") {
        rightHipRotX = 0.5;
        rightKneeRotX = -0.8;
        leftWeight = 85;
        rightWeight = 15;
      }
    }

    return {
      posture,
      bodyPosition: [lateralShift, verticalDrop, pitchRad * 0.25],
      bodyRotation: [pitchRad * 0.7, 0, tiltRad * 0.6],
      copOffset: { x: Number(copX.toFixed(2)), y: Number(copY.toFixed(2)) },
      weightShift: {
        left: leftWeight,
        right: rightWeight,
        front: frontWeight,
        back: backWeight,
      },
      jointRotations: {
        ...DEFAULT_JOINT_ROTATIONS,
        spine: [pitchRad * 0.5, 0, -tiltRad * 0.8],
        head: [-pitchRad * 0.3, 0, tiltRad * 0.4],
        leftHip: [leftHipRotX, 0, DEFAULT_JOINT_ROTATIONS.leftHip[2]],
        rightHip: [rightHipRotX, 0, DEFAULT_JOINT_ROTATIONS.rightHip[2]],
        leftShoulder: [0, 0, leftShoulderRotZ],
        rightShoulder: [0, 0, rightShoulderRotZ],
        leftKnee: [leftKneeRotX, 0, 0],
        rightKnee: [rightKneeRotX, 0, 0],
      },
      isDemonstration: false,
    };
  }
}
