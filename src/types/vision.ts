export type EyeState = "OPEN" | "CLOSED" | "UNKNOWN";
export type OverallEyeState = "EYES OPEN" | "EYES CLOSED" | "UNKNOWN";

export type CameraStatusType = 
  | "ready"              // Ready (standby)
  | "starting"           // Starting (requesting stream / loading models)
  | "connected"          // Connected (streaming video actively)
  | "unavailable"        // Unavailable (camera hardware missing or RealSense not available)
  | "permission-denied"  // Permission Denied
  | "error";             // Error

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
  isRealSenseRgb?: boolean;
}

export interface NormalizedLandmark {
  x: number;          // [0.0, 1.0] from left to right
  y: number;          // [0.0, 1.0] from top to bottom
  z: number;          // Depth relative to mid-hip/mid-point
  visibility?: number; // Detection confidence [0.0, 1.0]
}

export interface ArmReachMetrics {
  leftReachDistance: number;    // Normalized distance from shoulder to wrist
  rightReachDistance: number;   // Normalized distance from shoulder to wrist
  maxReachRatio: number;        // Maximum reach relative to shoulder width
  isReachingForward: boolean;   // True if either wrist extends significantly
}

export interface SingleLegStanceMetrics {
  isSingleLeg: boolean;         // True if one foot is raised
  liftedLeg: "LEFT" | "RIGHT" | "NONE";
  elevationRatio: number;       // Height difference relative to torso length
  holdDurationSeconds: number;  // Seconds single-leg stance maintained
}

export interface KneeFlexionMetrics {
  leftKneeAngleDeg: number;     // 180 = full extension, <140 = flexed
  rightKneeAngleDeg: number;    // 180 = full extension, <140 = flexed
  isSquatting: boolean;         // Both knees flexed
}

export type PostureLeanDirection = 
  | "NEUTRAL" 
  | "LEAN_LEFT" 
  | "LEAN_RIGHT" 
  | "LEAN_FORWARD" 
  | "LEAN_BACKWARD";

export interface BodyPoseLandmarks {
  // Head
  nose: NormalizedLandmark | null;
  
  // Upper body
  leftShoulder: NormalizedLandmark | null;
  rightShoulder: NormalizedLandmark | null;
  leftElbow: NormalizedLandmark | null;
  rightElbow: NormalizedLandmark | null;
  leftWrist: NormalizedLandmark | null;
  rightWrist: NormalizedLandmark | null;

  // Lower body
  leftHip: NormalizedLandmark | null;
  rightHip: NormalizedLandmark | null;
  leftKnee: NormalizedLandmark | null;
  rightKnee: NormalizedLandmark | null;
  leftAnkle: NormalizedLandmark | null;
  rightAnkle: NormalizedLandmark | null;

  // Raw array of all 33 pose landmarks for drawing overlays
  allRawLandmarks: NormalizedLandmark[] | null;

  // Biomechanical metrics for UI / Avatar / Rehabilitation
  // Angle convention: Neutral horizontal / vertical is 0°.
  // Lateral roll: Positive = lean right, Negative = lean left.
  // Sagittal pitch: Positive = lean forward, Negative = lean backward.
  shoulderTiltDeg: number;      // Coronal shoulder roll: 0° = level, >0 = lean right, <0 = lean left
  hipTiltDeg: number;           // Coronal pelvic tilt: 0° = level, >0 = lean right, <0 = lean left
  headTiltDeg: number;          // Head coronal tilt relative to shoulders: 0° = upright, >0 = tilt right, <0 = tilt left
  trunkPitchDeg: number;        // Sagittal pitch: 0° = vertical upright, >0 = lean forward, <0 = lean backward
  torsoLateralOffset: number;   // Normalized horizontal shift from center [-0.5, 0.5]
  postureLean: PostureLeanDirection; // Unified clinical posture classification
  isStandingFacingCamera: boolean;

  // Advanced Phase 5 Biomechanics
  armReach: ArmReachMetrics;
  singleLeg: SingleLegStanceMetrics;
  kneeFlexion: KneeFlexionMetrics;
}

export interface FaceVisionData {
  hasFace: boolean;
  leftEyeState: EyeState;
  rightEyeState: EyeState;
  overallEyeState: OverallEyeState;
  
  // Mathematical Eye Aspect Ratio (EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||))
  leftEAR: number;              // Continuous EAR value (typically 0.15 - 0.38)
  rightEAR: number;             // Continuous EAR value
  averageEAR: number;           // Mean EAR of both eyes
  earThreshold: number;         // Threshold under which eye is considered closed (e.g. 0.21)

  // Blendshapes (eyeBlinkLeft, eyeBlinkRight)
  leftEyeScore: number;         // 0.0 = wide open, 1.0 = fully closed
  rightEyeScore: number;
  faceDetectedCount: number;
}

export interface BlinkDetectionState {
  blinkCount: number;
  lastBlinkTimestamp: number | null;
  isCurrentlyBlinking: boolean;
  lastBlinkDurationMs: number | null;
  blinkRatePerMinute: number;   // Rolling 60-second blink rate
}

export interface VisionState {
  cameraStatus: CameraStatusType;
  errorMessage: string | null;
  modelsLoaded: boolean;
  modelLoadingMessage: string;
  fps: number;
  
  // Devices & display
  availableCameras: CameraDeviceInfo[];
  selectedCameraId: string | null;
  activeCameraLabel: string | null;
  activeResolution: string;
  isRealSenseAvailable: boolean;
  isMirrored: boolean;

  // Pose
  hasPose: boolean;
  pose: BodyPoseLandmarks | null;

  // Face & Eyes
  face: FaceVisionData;

  // Blink
  blink: BlinkDetectionState;
}

export const INITIAL_VISION_STATE: VisionState = {
  cameraStatus: "ready",
  errorMessage: null,
  modelsLoaded: false,
  modelLoadingMessage: "",
  fps: 0,
  availableCameras: [],
  selectedCameraId: null,
  activeCameraLabel: null,
  activeResolution: "--",
  isRealSenseAvailable: false,
  isMirrored: true,
  hasPose: false,
  pose: null,
  face: {
    hasFace: false,
    leftEyeState: "UNKNOWN",
    rightEyeState: "UNKNOWN",
    overallEyeState: "UNKNOWN",
    leftEAR: 0,
    rightEAR: 0,
    averageEAR: 0,
    earThreshold: 0.21,
    leftEyeScore: 0,
    rightEyeScore: 0,
    faceDetectedCount: 0,
  },
  blink: {
    blinkCount: 0,
    lastBlinkTimestamp: null,
    isCurrentlyBlinking: false,
    lastBlinkDurationMs: null,
    blinkRatePerMinute: 0,
  },
};

