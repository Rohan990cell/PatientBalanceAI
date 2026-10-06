import { PostureType } from "./avatar";
import { PostureLeanDirection } from "./vision";

export type ExerciseId =
  | "romberg-balance"
  | "weight-shifting"
  | "single-leg-stance"
  | "forward-reach"
  | "side-to-side-balance"
  | "weight-shift-cop-target"
  | "posture-balance-multimodal"
  | "posture-alignment";

export type ExerciseDifficulty = "Easy" | "Medium" | "Challenging";

export type ExercisePhase =
  | "IDLE"
  | "READY"
  | "COUNTDOWN"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type RequiredVisionSignal = "pose" | "eye-state" | "blink";
export type RequiredHardwareSignal = "cop" | "quad-weight" | "total-weight";

export interface SensorAvailability {
  webcam: boolean;
  balanceBoard: boolean;
  isSimulated?: boolean;
}

export interface SensorRequirements {
  requiresWebcam: boolean;
  requiresBalanceBoard: boolean;
  allowVisionOnlyFallback: boolean;
  notes?: string;
}

export interface ExerciseStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  durationSeconds: number;
  demonstrationPosture: PostureType;
  expectedEyeState?: "OPEN" | "CLOSED";
  targetLean?: PostureLeanDirection;
  targetStance?: "BIPEDAL" | "LEFT_LEG" | "RIGHT_LEG";
  targetReach?: "FORWARD" | "LATERAL" | "NONE";
}

export interface ExerciseDefinition {
  id: ExerciseId;
  name: string;
  category: string;
  tagline: string;
  description: string;
  instructions: string[];
  duration: number; // Total seconds
  steps: ExerciseStep[];
  requiredVisionSignals: RequiredVisionSignal[];
  requiredHardwareSignals: RequiredHardwareSignal[];
  sensorRequirements: SensorRequirements;
  difficulty: ExerciseDifficulty;
  benefits: string[];
}

export interface BalanceState {
  isConnected: boolean;
  isSimulated?: boolean;
  totalWeight: number | null;
  distribution: {
    left: number;
    right: number;
    front: number;
    back: number;
  } | null;
  cop: {
    x: number;
    y: number;
  } | null;
}

export interface ExerciseFeedback {
  message: string;
  type: "positive" | "guidance" | "neutral";
  isCompliant: boolean;
}

export type SessionTelemetryMode =
  | "FULL_MULTIMODAL"
  | "VISION_ONLY"
  | "BALANCE_ONLY"
  | "UNASSISTED";

export interface ExerciseTimestampedBalanceSample {
  timestamp: number;
  totalWeight: number;
  leftPercent: number;
  rightPercent: number;
  anteriorPercent: number;
  posteriorPercent: number;
  copX: number;
  copY: number;
  isSimulated: boolean;
}

export interface ExerciseTimestampedVisionSample {
  timestamp: number;
  hasPose: boolean;
  postureLean?: string;
  ear?: number;
  eyeState?: string;
  shoulderTiltDeg?: number;
}

export interface ExerciseSessionResult {
  sessionId: string;
  patientId?: string;
  exerciseId: ExerciseId;
  exerciseName: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  targetDurationSeconds: number;
  completionStatus: "COMPLETED" | "CANCELLED";

  // Explicit Sensor availability during session
  sensorsUsed: {
    webcamActive: boolean;
    balanceBoardConnected: boolean;
    isSimulated?: boolean;
    sessionMode: SessionTelemetryMode;
  };

  // Strictly NULL when sensor was unavailable or unmeasured
  postureCompliancePercent: number | null;
  eyeCompliancePercent: number | null;
  movementCompliancePercent: number | null;
  balanceStabilityPercent: number | null; // null if Wii Board disconnected
  timeCompletionPercent: number;
  overallScore: number | null; // null if no real sensors provided data

  feedbackSummary: string;
  visionEventsCount: number;
  balanceEventsCount: number;

  // Phase 6: Independent timestamped telemetry sample streams
  balanceSamples?: ExerciseTimestampedBalanceSample[];
  visionSamples?: ExerciseTimestampedVisionSample[];

  unmeasuredReasons: {
    posture?: string;
    eyes?: string;
    balance?: string;
    score?: string;
  };
}

export interface ExerciseEngineState {
  phase: ExercisePhase;
  currentExercise: ExerciseDefinition | null;
  currentStepIndex: number;
  currentStep: ExerciseStep | null;
  stepTimeRemaining: number;
  totalTimeElapsed: number;
  countdownValue: number; // 3, 2, 1
  progressPercent: number;
  feedback: ExerciseFeedback;
  sessionResult: ExerciseSessionResult | null;
}

export const INITIAL_EXERCISE_STATE: ExerciseEngineState = {
  phase: "IDLE",
  currentExercise: null,
  currentStepIndex: 0,
  currentStep: null,
  stepTimeRemaining: 0,
  totalTimeElapsed: 0,
  countdownValue: 3,
  progressPercent: 0,
  feedback: {
    message: "Stand comfortably and relax.",
    type: "neutral",
    isCompliant: true,
  },
  sessionResult: null,
};
