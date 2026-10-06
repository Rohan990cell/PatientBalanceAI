import { ExerciseDefinition, SensorAvailability, SessionTelemetryMode } from "../../types/exercise";

export interface SensorReadinessReport {
  isReady: boolean;
  canStartVisionOnly: boolean;
  sessionMode: SessionTelemetryMode;
  warnings: string[];
  blockerMessage?: string;
}

/**
 * Validates hardware and vision sensor readiness before exercise initiation.
 * Prevents starting if strictly required hardware is missing.
 */
export function evaluateSensorReadiness(
  exercise: ExerciseDefinition,
  sensors: SensorAvailability
): SensorReadinessReport {
  const warnings: string[] = [];
  let isReady = true;
  let blockerMessage: string | undefined = undefined;

  // Strict Balance Board Check
  if (exercise.sensorRequirements.requiresBalanceBoard && !sensors.balanceBoard) {
    isReady = false;
    blockerMessage = "Wii Balance Board required. Connect the board before starting this exercise.";
  }

  // Strict Webcam Check
  if (exercise.sensorRequirements.requiresWebcam && !sensors.webcam) {
    if (!exercise.sensorRequirements.allowVisionOnlyFallback) {
      isReady = false;
      blockerMessage = "Camera required for this exercise. Please enable your camera.";
    } else {
      warnings.push("Camera is off. Posture and movement biofeedback will be unavailable.");
    }
  }

  // Determine session telemetry mode
  let sessionMode: SessionTelemetryMode = "UNASSISTED";
  if (sensors.webcam && sensors.balanceBoard) {
    sessionMode = "FULL_MULTIMODAL";
  } else if (sensors.webcam && !sensors.balanceBoard) {
    sessionMode = "VISION_ONLY";
    warnings.push("Vision-only session: Wii Balance Board is not connected. Balance metrics will not be calculated.");
  } else if (!sensors.webcam && sensors.balanceBoard) {
    sessionMode = "BALANCE_ONLY";
    warnings.push("Balance-only session: Camera is off. Visual posture biofeedback will not be calculated.");
  } else {
    sessionMode = "UNASSISTED";
    warnings.push("Unassisted session: Neither sensor is active. Performance scores will not be calculated.");
  }

  return {
    isReady,
    canStartVisionOnly: sessionMode === "VISION_ONLY",
    sessionMode,
    warnings,
    blockerMessage,
  };
}

/**
 * Initial Clinical Exercise Library
 *
 * NOTE: These protocols represent interactive research and rehabilitation demonstration
 * workflows. They are designed for balance biofeedback and are not intended as medical
 * diagnoses or individualized clinical prescriptions.
 */
export const EXERCISE_LIBRARY: ExerciseDefinition[] = [
  {
    id: "romberg-balance",
    name: "Romberg Balance",
    category: "Equilibrium & Vestibular",
    tagline: "Evaluate postural steadiness with eyes open versus eyes closed.",
    description:
      "A classic balance assessment protocol. Phase 1 evaluates steady bipedal stance with visual feedback. Phase 2 tests equilibrium with eyes closed using computer-vision EAR compliance.",
    instructions: [
      "Stand comfortably with feet together and arms relaxed at your sides.",
      "During Phase 1, keep your gaze fixed straight ahead on the horizon.",
      "During Phase 2, gently close both eyes while maintaining upright posture.",
      "If you feel unsteady at any moment, open your eyes or step comfortably.",
    ],
    duration: 30, // 15s eyes open + 15s eyes closed
    steps: [
      {
        id: "romberg-step-1",
        stepNumber: 1,
        title: "Eyes Open Baseline",
        instruction: "Stand straight with feet together. Keep your eyes open and focus forward.",
        durationSeconds: 15,
        demonstrationPosture: "stand",
        expectedEyeState: "OPEN",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
      {
        id: "romberg-step-2",
        stepNumber: 2,
        title: "Eyes Closed Balance",
        instruction: "Maintain your upright posture and gently close your eyes.",
        durationSeconds: 15,
        demonstrationPosture: "stand",
        expectedEyeState: "CLOSED",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
    ],
    requiredVisionSignals: ["pose", "eye-state"],
    requiredHardwareSignals: ["cop"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false, // Operates as Vision-only session when board is absent
      allowVisionOnlyFallback: true,
      notes: "Webcam required for posture & eye tracking. Wii Balance Board required for CoP balance metrics.",
    },
    difficulty: "Easy",
    benefits: [
      "Assesses reliance on visual versus proprioceptive balance",
      "Encourages calm mental focus and postural steadiness",
      "Vision-only capable: powered by on-device computer vision",
    ],
  },

  {
    id: "weight-shifting",
    name: "Weight Shifting",
    category: "Dynamic Weight Transfer",
    tagline: "Practice gentle, controlled weight transitions from left to right.",
    description:
      "A fundamental mobility exercise that trains voluntary lateral weight redistribution across both limbs, reinforcing stability margins.",
    instructions: [
      "Stand with feet shoulder-width apart on a stable, level surface.",
      "Keep your torso upright and shift your weight gently from side to side.",
      "Avoid bending excessively at the waist; move from your hips and ankles.",
      "Follow the 3D avatar guide through the gentle transitions.",
    ],
    duration: 32,
    steps: [
      {
        id: "weight-shift-1",
        stepNumber: 1,
        title: "Center Stance",
        instruction: "Stand balanced with equal weight distributed on both feet.",
        durationSeconds: 8,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
      {
        id: "weight-shift-2",
        stepNumber: 2,
        title: "Shift Left",
        instruction: "Slowly transfer your body weight toward your left side.",
        durationSeconds: 8,
        demonstrationPosture: "lean-left",
        targetLean: "LEAN_LEFT",
        targetStance: "BIPEDAL",
      },
      {
        id: "weight-shift-3",
        stepNumber: 3,
        title: "Shift Right",
        instruction: "Smoothly transfer your weight across to your right side.",
        durationSeconds: 8,
        demonstrationPosture: "lean-right",
        targetLean: "LEAN_RIGHT",
        targetStance: "BIPEDAL",
      },
      {
        id: "weight-shift-4",
        stepNumber: 4,
        title: "Return to Center",
        instruction: "Return to center alignment and hold steady equilibrium.",
        durationSeconds: 8,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: ["quad-weight", "cop"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false,
      allowVisionOnlyFallback: true,
      notes: "Webcam tracks lateral shoulder/hip shift. Wii Board captures load redistribution when connected.",
    },
    difficulty: "Easy",
    benefits: [
      "Improves lateral weight transference and hip control",
      "Increases confidence during everyday walking and turning",
      "Real-time visual mirroring with 3D avatar guidance",
    ],
  },

  {
    id: "single-leg-stance",
    name: "Single Leg Stance",
    category: "Unipedal Stability",
    tagline: "Train unipedal balance and lower-extremity stabilizing muscles.",
    description:
      "A challenging protocol targeting ankle stability, core balance, and unilateral weight-bearing capability. Computer vision tracks ankle elevation in real time.",
    instructions: [
      "Stand near a sturdy wall or chair for support if needed.",
      "Focus your eyes forward on a stationary object to aid stability.",
      "Lift one foot 5 to 10 cm off the floor when prompted.",
      "Lower your foot immediately if you feel unstable.",
    ],
    duration: 34,
    steps: [
      {
        id: "sls-step-1",
        stepNumber: 1,
        title: "Bipedal Baseline",
        instruction: "Stand tall and steady on both feet, preparing your posture.",
        durationSeconds: 8,
        demonstrationPosture: "stand",
        targetStance: "BIPEDAL",
        targetLean: "NEUTRAL",
      },
      {
        id: "sls-step-2",
        stepNumber: 2,
        title: "Left Leg Lift",
        instruction: "Gently raise your left foot slightly off the floor. Stand tall on your right leg.",
        durationSeconds: 13,
        demonstrationPosture: "stand",
        targetStance: "LEFT_LEG",
      },
      {
        id: "sls-step-3",
        stepNumber: 3,
        title: "Right Leg Lift",
        instruction: "Lower your left foot, then gently raise your right foot off the floor.",
        durationSeconds: 13,
        demonstrationPosture: "stand",
        targetStance: "RIGHT_LEG",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: ["total-weight"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false,
      allowVisionOnlyFallback: true,
      notes: "Webcam tracks foot elevation and unipedal stability.",
    },
    difficulty: "Challenging",
    benefits: [
      "Builds lower extremity strength and ankle proprioception",
      "Strong clinical indicator of unipedal fall resilience",
      "Elevated limb tracking automatically verified by Pose Landmarker",
    ],
  },

  {
    id: "forward-reach",
    name: "Forward Reach",
    category: "Functional Range of Stability",
    tagline: "Reach forward at shoulder height to train stability boundaries.",
    description:
      "Based on clinical functional reach protocols. Measures the maximum forward reach excursion achievable without moving the feet or losing balance.",
    instructions: [
      "Stand comfortably with feet flat and shoulder-width apart.",
      "Raise both arms forward to shoulder height.",
      "Reach forward smoothly as far as comfortable without taking a step.",
      "Maintain steady control and return smoothly to upright stance.",
    ],
    duration: 28,
    steps: [
      {
        id: "reach-step-1",
        stepNumber: 1,
        title: "Starting Posture",
        instruction: "Stand upright with arms relaxed at your sides.",
        durationSeconds: 6,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetReach: "NONE",
      },
      {
        id: "reach-step-2",
        stepNumber: 2,
        title: "Forward Extension",
        instruction: "Extend arms forward at shoulder height and lean gently forward.",
        durationSeconds: 14,
        demonstrationPosture: "lean-forward",
        targetLean: "LEAN_FORWARD",
        targetReach: "FORWARD",
      },
      {
        id: "reach-step-3",
        stepNumber: 3,
        title: "Controlled Return",
        instruction: "Slowly bring your arms back down and return to upright center.",
        durationSeconds: 8,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetReach: "NONE",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: ["cop"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false,
      allowVisionOnlyFallback: true,
      notes: "Webcam tracks forward arm reach and trunk flexion.",
    },
    difficulty: "Medium",
    benefits: [
      "Expands the anterior limit of stability (LoS)",
      "Re-trains ankle and hip strategies for fall prevention",
      "Arm reach extension ratio tracked automatically in real time",
    ],
  },

  {
    id: "side-to-side-balance",
    name: "Side-to-Side Balance",
    category: "Equilibrium & Vestibular",
    tagline: "Calm, rhythmic lateral balance training for vestibular conditioning.",
    description:
      "A soothing, rhythmic balance protocol designed to stimulate vestibular balance recovery through gentle, cyclical side-to-side shifts.",
    instructions: [
      "Stand with relaxed knees and feet shoulder-width apart.",
      "Breathe calmly and gently rock side to side with the avatar rhythm.",
      "Keep your movements smooth, fluid, and continuous.",
      "Rest when the exercise completes.",
    ],
    duration: 32,
    steps: [
      {
        id: "sway-step-1",
        stepNumber: 1,
        title: "Center Stance",
        instruction: "Feet shoulder-width apart, arms relaxed, looking straight ahead.",
        durationSeconds: 6,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
      },
      {
        id: "sway-step-2",
        stepNumber: 2,
        title: "Gentle Left Sway",
        instruction: "Gently rock your body weight to the left in a calm, controlled motion.",
        durationSeconds: 10,
        demonstrationPosture: "lean-left",
        targetLean: "LEAN_LEFT",
      },
      {
        id: "sway-step-3",
        stepNumber: 3,
        title: "Gentle Right Sway",
        instruction: "Gently rock your body weight to the right in a rhythmic motion.",
        durationSeconds: 10,
        demonstrationPosture: "lean-right",
        targetLean: "LEAN_RIGHT",
      },
      {
        id: "sway-step-4",
        stepNumber: 4,
        title: "Equilibrium Recovery",
        instruction: "Settle into your quiet center and breathe comfortably.",
        durationSeconds: 6,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: ["quad-weight"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false,
      allowVisionOnlyFallback: true,
      notes: "Webcam monitors lateral sway rhythm. Wii Balance Board tracks bilateral loading when connected.",
    },
    difficulty: "Easy",
    benefits: [
      "Calming vestibular balance re-training",
      "Promotes symmetrical bilateral weight loading",
      "Gentle pacing suitable for all rehabilitation stages",
    ],
  },

  {
    id: "weight-shift-cop-target",
    name: "Weight Shift — COP Target",
    category: "Balance Board Rehabilitation",
    tagline: "Shift your body weight to move the COP toward target locations.",
    description:
      "Interactive balance rehabilitation exercise utilizing solely the Wii Balance Board force plate. The patient actively redistributes their Center of Pressure (COP) to guide the biofeedback cursor toward targeted spatial coordinates without requiring camera tracking.",
    instructions: [
      "Stand comfortably with both feet centered on the balance board.",
      "Identify the active target location displayed on the board.",
      "Gently shift your body weight to guide your Center of Pressure (COP) toward the target.",
      "Enter the target tolerance zone until the target is marked as reached.",
      "Progress through all targets in sequence.",
    ],
    duration: 60,
    steps: [
      {
        id: "cop-target-step-1",
        stepNumber: 1,
        title: "Center Stance",
        instruction: "Settle your center of pressure in the middle of the board.",
        durationSeconds: 12,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
      {
        id: "cop-target-step-2",
        stepNumber: 2,
        title: "Shift Left",
        instruction: "Gently shift weight toward your left foot to reach the left target.",
        durationSeconds: 12,
        demonstrationPosture: "lean-left",
        targetLean: "LEAN_LEFT",
        targetStance: "BIPEDAL",
      },
      {
        id: "cop-target-step-3",
        stepNumber: 3,
        title: "Shift Right",
        instruction: "Smoothly transfer weight across to your right foot to reach the right target.",
        durationSeconds: 12,
        demonstrationPosture: "lean-right",
        targetLean: "LEAN_RIGHT",
        targetStance: "BIPEDAL",
      },
      {
        id: "cop-target-step-4",
        stepNumber: 4,
        title: "Shift Front",
        instruction: "Shift weight forward toward the balls of your feet to reach the front target.",
        durationSeconds: 12,
        demonstrationPosture: "lean-forward",
        targetLean: "LEAN_FORWARD",
        targetStance: "BIPEDAL",
      },
      {
        id: "cop-target-step-5",
        stepNumber: 5,
        title: "Shift Back",
        instruction: "Shift weight gently toward your heels to reach the posterior target.",
        durationSeconds: 12,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
    ],
    requiredVisionSignals: [],
    requiredHardwareSignals: ["cop", "quad-weight"],
    sensorRequirements: {
      requiresWebcam: false,
      requiresBalanceBoard: true,
      allowVisionOnlyFallback: false,
      notes: "Wii Balance Board required. Camera is NOT required for this exercise.",
    },
    difficulty: "Easy",
    benefits: [
      "Trains voluntary lateral and anteroposterior COP weight transfer",
      "Reinforces dynamic Limits of Stability (LoS) within safe boundaries",
      "Board-only protocol: operational without camera or vision sensors",
    ],
  },

  {
    id: "posture-balance-multimodal",
    name: "Posture + Balance — Multimodal Stance",
    category: "Multimodal Biofeedback",
    tagline: "Live Intel RealSense / Camera 2D Pose tracking + Wii Balance Board equilibrium.",
    description:
      "Interactive multimodal rehabilitation exercise integrating live optical 2D pose estimation with Nintendo Wii Balance Board load-cell telemetry. Correlates upper-body coronal and sagittal posture lean with center-of-pressure weight shifts.",
    instructions: [
      "Position your camera in front of you so your head, torso, and legs are in view.",
      "Stand on the Wii Balance Board with feet centered and relaxed.",
      "Observe your real-time 2D skeleton and live Center of Pressure (COP) cursor.",
      "Practice upright stance, controlled lateral shifts, and equilibrium recovery.",
      "Maintain alignment between your body lean and plantar weight distribution.",
    ],
    duration: 45,
    steps: [
      {
        id: "pb-step-1",
        stepNumber: 1,
        title: "Upright Stance Baseline",
        instruction: "Stand tall and centered on the board with balanced weight distribution.",
        durationSeconds: 15,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
      {
        id: "pb-step-2",
        stepNumber: 2,
        title: "Controlled Lateral Alignment",
        instruction: "Gently lean your torso while transferring weight to align posture and COP.",
        durationSeconds: 15,
        demonstrationPosture: "lean-right",
        targetLean: "LEAN_RIGHT",
        targetStance: "BIPEDAL",
      },
      {
        id: "pb-step-3",
        stepNumber: 3,
        title: "Equilibrium Recovery",
        instruction: "Return to centered upright posture and stabilize your center of pressure.",
        durationSeconds: 15,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: ["cop", "quad-weight", "total-weight"],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: true,
      allowVisionOnlyFallback: true,
      notes: "Intel RealSense / Camera required for 2D pose. Wii Balance Board required for force-plate COP telemetry.",
    },
    difficulty: "Easy",
    benefits: [
      "Correlates visual coronal posture with load-cell weight redistribution",
      "Real-time 2D skeleton overlay over live optical camera feed",
      "Simultaneous force plate center of pressure biofeedback",
    ],
  },

  {
    id: "posture-alignment",
    name: "Posture Alignment Exercise",
    category: "Vision Rehabilitation",
    tagline: "Camera-only 2D pose tracking and upright posture alignment training.",
    description:
      "Interactive camera-only rehabilitation exercise using MediaPipe 2D optical pose estimation. Analyzes shoulder alignment, hip alignment, vertical body symmetry, and upright stability without requiring force plates or balance boards.",
    instructions: [
      "Stand upright in front of the camera and align your body with the target posture.",
      "Ensure your head, shoulders, hips, knees, and ankles are clearly visible.",
      "Follow real-time feedback cues to correct lateral leaning or forward/backward posture tilt.",
      "Maintain steady upright posture stability for 10 seconds to complete the protocol.",
    ],
    duration: 10,
    steps: [
      {
        id: "pa-step-1",
        stepNumber: 1,
        title: "Upright Posture Alignment",
        instruction: "Stand upright in front of the camera and align your body with the target posture.",
        durationSeconds: 10,
        demonstrationPosture: "stand",
        targetLean: "NEUTRAL",
        targetStance: "BIPEDAL",
      },
    ],
    requiredVisionSignals: ["pose"],
    requiredHardwareSignals: [],
    sensorRequirements: {
      requiresWebcam: true,
      requiresBalanceBoard: false,
      allowVisionOnlyFallback: true,
      notes: "Camera only. Wii Balance Board is NOT required. COP and weight data are not used.",
    },
    difficulty: "Easy",
    benefits: [
      "Pure vision-based rehabilitation: operates without Wii Balance Board or force sensors",
      "Real-time 2D skeleton overlay (Head, Shoulders, Elbows, Wrists, Hips, Knees, Ankles)",
      "Instant biomechanical feedback on shoulder tilt, hip tilt, and sagittal pitch",
      "Trains upright postural stability and lateral symmetry",
    ],
  },
];

