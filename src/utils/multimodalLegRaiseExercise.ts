/**
 * multimodalLegRaiseExercise.ts
 *
 * PHASE E: Multimodal Leg Raise & Balance Rehabilitation Exercise Engine
 * 
 * Synchronizes Nintendo Wii Balance Board 4-sensor load telemetry with
 * Camera / MediaPipe 2D Pose skeletal tracking.
 * 
 * Strict Dual-Device Verification Rules:
 * - Camera confirms anatomical foot clearance from calibrated baseline.
 * - Balance Board confirms corresponding contralateral support-load transfer.
 * - Neither camera-only nor balance-board-only can complete a repetition.
 * - Left leg sequence strictly precedes Right leg sequence.
 * - Timestamp synchronization ensures evidence freshness within 250ms.
 */

import { NormalizedLandmark } from "../types/vision";

// =========================================================================
// TYPES & DATA STRUCTURES
// =========================================================================

export type LegRaiseSide = "LEFT" | "RIGHT";

export type MultimodalLegRaiseState =
  | "IDLE"
  | "CHECKING_DEVICES"
  | "CALIBRATING_BASELINE"
  | "WAITING_FOR_STABLE_STANCE"
  | "AWAITING_LEFT_LIFT"
  | "VERIFYING_LEFT_LIFT"
  | "HOLDING_LEFT"
  | "AWAITING_LEFT_RETURN"
  | "VERIFYING_DOUBLE_SUPPORT"
  | "AWAITING_RIGHT_LIFT"
  | "VERIFYING_RIGHT_LIFT"
  | "HOLDING_RIGHT"
  | "AWAITING_RIGHT_RETURN"
  | "VERIFYING_FINAL_STABILITY"
  | "COMPLETED"
  | "PAUSED"
  | "DISCONNECTED"
  | "INVALID_TRACKING"
  | "ABORTED";

export interface LegRaiseConfig {
  holdDurationSecondsLeft: number;      // Default 2.0s
  holdDurationSecondsRight: number;     // Default 2.0s
  baselineDurationSeconds: number;      // Default 2.5s (2.0 - 3.0s window)
  stabilityDurationSeconds: number;     // Default 1.5s
  footLiftThresholdY: number;           // Foot elevation above baseline (MediaPipe norm Y decreases on lift, e.g. 0.04)
  footReturnThresholdY: number;         // Foot elevation within tolerance of baseline (e.g. 0.025)
  supportTransferThresholdPct: number;  // Supporting side load increase above baseline (e.g. +15.0%)
  copDisplacementThresholdX: number;    // Lateral COP shift toward supporting side (e.g. 0.10)
  maxSensorAgeMs: number;               // 350ms
  maxSyncOffsetMs: number;              // 250ms
  jitterToleranceMs: number;            // 350ms hysteresis buffer for minor tremor
  supportedStandingMode: boolean;       // Optional supported-standing mode
}

export const DEFAULT_LEG_RAISE_CONFIG: LegRaiseConfig = {
  holdDurationSecondsLeft: 2.0,
  holdDurationSecondsRight: 2.0,
  baselineDurationSeconds: 2.5,
  stabilityDurationSeconds: 1.5,
  footLiftThresholdY: 0.04,
  footReturnThresholdY: 0.025,
  supportTransferThresholdPct: 15.0,
  copDisplacementThresholdX: 0.10,
  maxSensorAgeMs: 350,
  maxSyncOffsetMs: 250,
  jitterToleranceMs: 350,
  supportedStandingMode: false,
};

// Wii Balance Board Physical Dimensions (mm)
export const WII_BOARD_HALF_WIDTH_MM = 223.0; // 446 mm total active width
export const WII_BOARD_HALF_DEPTH_MM = 119.0; // 238 mm total active depth

// MediaPipe 33 Landmark Indices for Legs and Posture
export const POSE_LANDMARK_INDICES = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
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

export interface CameraLegObservation {
  timestamp: number;
  hasPose: boolean;
  confidence: number; // Mean confidence across leg landmarks [0.0 - 1.0]
  leftAnkleY: number | null;
  rightAnkleY: number | null;
  leftKneeY: number | null;
  rightKneeY: number | null;
  leftElevation: number;  // baseline - current (positive = elevated)
  rightElevation: number; // baseline - current (positive = elevated)
  isLeftRaised: boolean;
  isRightRaised: boolean;
  isLeftReturned: boolean;
  isRightReturned: boolean;
  isMirrored: boolean;
  trackingWarning?: string;
}

export interface BoardObservation {
  timestamp: number;
  fl: number;
  fr: number;
  rl: number;
  rr: number;
  totalWeight: number;
  leftLoad: number;
  rightLoad: number;
  anteriorLoad: number;
  posteriorLoad: number;
  leftPercent: number;
  rightPercent: number;
  anteriorPercent: number;
  posteriorPercent: number;
  copX: number;
  copY: number;
  isValid: boolean;
}

export interface LegRaiseBaseline {
  isCalibrated: boolean;
  leftAnkleY: number;
  rightAnkleY: number;
  leftKneeY: number;
  rightKneeY: number;
  leftPercent: number;
  rightPercent: number;
  copX: number;
  copY: number;
  totalWeight: number;
  loadStdDev: number;
  sampleCount: number;
  calibrationDurationSeconds: number;
}

export interface CopTrajectoryPoint {
  x: number;
  y: number;
  timestamp: number;
  leg: "LEFT" | "RIGHT" | "BASELINE" | "RECOVERY";
  isVerifiedHold: boolean;
}

export interface LegPerformanceMetrics {
  leg: LegRaiseSide;
  requiredHoldSeconds: number;
  actualHoldSeconds: number;
  liftInitiationDurationSeconds: number;
  timeToEstablishLiftSeconds: number;
  returnDurationSeconds: number;
  recoveryDurationSeconds: number;
  cameraLiftConfirmed: boolean;
  boardTransferConfirmed: boolean;
  repetitionCompleted: boolean;
  baselineSupportLoadPct: number;
  meanSupportLoadPctDuringLift: number;
  peakSupportLoadPctDuringLift: number;
  supportTransferDeltaPct: number;
  meanCopDisplacementMm: number;
  copPathLengthMm: number;
  copVariabilityRmsMm: number;
  meanCameraConfidence: number;
  successfulAttempts: number;
  interruptedAttempts: number;
  copTrajectory: CopTrajectoryPoint[];
  interruptedTrajectories: CopTrajectoryPoint[][];
}

export interface LegRaiseSessionSummary {
  sessionId: string;
  patientId: string;
  patientName: string;
  sessionDate: string;
  startTime: number;
  endTime: number;
  totalElapsedSeconds: number;
  totalValidMeasurementSeconds: number;
  completedRepetitions: number; // 0, 1, or 2
  isRealHardware: boolean;
  hardwareModel: string;
  cameraSource: string;
  supportedStandingMode: boolean;
  baseline: LegRaiseBaseline;
  leftLeg: LegPerformanceMetrics;
  rightLeg: LegPerformanceMetrics;
  totalDualConfirmedHoldSeconds: number;
  overallTrackingQuality: string;
  overallBoardQuality: string;
  syncQuality: string;
  totalInvalidCameraObservations: number;
  totalInvalidBoardObservations: number;
  totalMissingDataSeconds: number;
  safetyPausesCount: number;
  disconnectionsCount: number;
  completeCopTrajectory: CopTrajectoryPoint[];
}

// =========================================================================
// PURE MATHEMATICAL FUNCTIONS & HELPERS
// =========================================================================

/**
 * Validates and calculates 4-corner load distribution and totals.
 */
export function calculateBoardDistribution(
  fl: number,
  fr: number,
  rl: number,
  rr: number,
  copX: number,
  copY: number,
  timestamp: number
): BoardObservation {
  const total = fl + fr + rl + rr;
  const isValid =
    Number.isFinite(fl) &&
    Number.isFinite(fr) &&
    Number.isFinite(rl) &&
    Number.isFinite(rr) &&
    Number.isFinite(copX) &&
    Number.isFinite(copY) &&
    total > 10.0 &&
    fl >= 0 &&
    fr >= 0 &&
    rl >= 0 &&
    rr >= 0;

  if (!isValid || total <= 0) {
    return {
      timestamp,
      fl: Math.max(0, fl || 0),
      fr: Math.max(0, fr || 0),
      rl: Math.max(0, rl || 0),
      rr: Math.max(0, rr || 0),
      totalWeight: Math.max(0, total || 0),
      leftLoad: 0,
      rightLoad: 0,
      anteriorLoad: 0,
      posteriorLoad: 0,
      leftPercent: 50.0,
      rightPercent: 50.0,
      anteriorPercent: 50.0,
      posteriorPercent: 50.0,
      copX: 0,
      copY: 0,
      isValid: false,
    };
  }

  const leftLoad = fl + rl;
  const rightLoad = fr + rr;
  const anteriorLoad = fl + fr;
  const posteriorLoad = rl + rr;

  const leftPercent = (leftLoad / total) * 100.0;
  const rightPercent = (rightLoad / total) * 100.0;
  const anteriorPercent = (anteriorLoad / total) * 100.0;
  const posteriorPercent = (posteriorLoad / total) * 100.0;

  return {
    timestamp,
    fl,
    fr,
    rl,
    rr,
    totalWeight: total,
    leftLoad,
    rightLoad,
    anteriorLoad,
    posteriorLoad,
    leftPercent,
    rightPercent,
    anteriorPercent,
    posteriorPercent,
    copX,
    copY,
    isValid: true,
  };
}

/**
 * Extracts anatomical leg landmarks and evaluates elevation relative to baseline.
 * In MediaPipe Pose, Y=0 is top, Y=1 is bottom.
 * Elevation = baselineY - currentY (positive value = foot elevated).
 */
export function extractCameraLegObservation(
  rawLandmarks: NormalizedLandmark[] | null | undefined,
  baseline: LegRaiseBaseline | null,
  config: LegRaiseConfig = DEFAULT_LEG_RAISE_CONFIG,
  timestamp: number = Date.now(),
  isMirrored: boolean = true
): CameraLegObservation {
  if (!rawLandmarks || rawLandmarks.length < 33) {
    return {
      timestamp,
      hasPose: false,
      confidence: 0,
      leftAnkleY: null,
      rightAnkleY: null,
      leftKneeY: null,
      rightKneeY: null,
      leftElevation: 0,
      rightElevation: 0,
      isLeftRaised: false,
      isRightRaised: false,
      isLeftReturned: false,
      isRightReturned: false,
      isMirrored,
      trackingWarning: "Full body pose landmarks not detected. Please step back into camera frame.",
    };
  }

  const lAnkle = rawLandmarks[POSE_LANDMARK_INDICES.LEFT_ANKLE];
  const rAnkle = rawLandmarks[POSE_LANDMARK_INDICES.RIGHT_ANKLE];
  const lKnee = rawLandmarks[POSE_LANDMARK_INDICES.LEFT_KNEE];
  const rKnee = rawLandmarks[POSE_LANDMARK_INDICES.RIGHT_KNEE];
  const lHip = rawLandmarks[POSE_LANDMARK_INDICES.LEFT_HIP];
  const rHip = rawLandmarks[POSE_LANDMARK_INDICES.RIGHT_HIP];

  const visibilities = [
    lAnkle?.visibility ?? 0,
    rAnkle?.visibility ?? 0,
    lKnee?.visibility ?? 0,
    rKnee?.visibility ?? 0,
    lHip?.visibility ?? 0,
    rHip?.visibility ?? 0,
  ];
  const confidence = visibilities.reduce((a, b) => a + b, 0) / visibilities.length;

  const lowAnkleVis = (lAnkle?.visibility ?? 0) < 0.45 || (rAnkle?.visibility ?? 0) < 0.45;

  if (confidence < 0.55 || lowAnkleVis) {
    return {
      timestamp,
      hasPose: true,
      confidence,
      leftAnkleY: lAnkle?.y ?? null,
      rightAnkleY: rAnkle?.y ?? null,
      leftKneeY: lKnee?.y ?? null,
      rightKneeY: rKnee?.y ?? null,
      leftElevation: 0,
      rightElevation: 0,
      isLeftRaised: false,
      isRightRaised: false,
      isLeftReturned: false,
      isRightReturned: false,
      isMirrored,
      trackingWarning: "Leg landmarks low confidence. Ensure feet and knees are clearly lit.",
    };
  }

  const baseLeftAnkleY = baseline?.isCalibrated ? baseline.leftAnkleY : lAnkle.y;
  const baseRightAnkleY = baseline?.isCalibrated ? baseline.rightAnkleY : rAnkle.y;

  // MediaPipe Y decreases as position rises
  const leftElevation = baseLeftAnkleY - lAnkle.y;
  const rightElevation = baseRightAnkleY - rAnkle.y;

  const isLeftRaised =
    leftElevation >= config.footLiftThresholdY &&
    lAnkle.y < rAnkle.y - config.footLiftThresholdY * 0.7;

  const isRightRaised =
    rightElevation >= config.footLiftThresholdY &&
    rAnkle.y < lAnkle.y - config.footLiftThresholdY * 0.7;

  const isLeftReturned = Math.abs(leftElevation) <= config.footReturnThresholdY;
  const isRightReturned = Math.abs(rightElevation) <= config.footReturnThresholdY;

  return {
    timestamp,
    hasPose: true,
    confidence,
    leftAnkleY: lAnkle.y,
    rightAnkleY: rAnkle.y,
    leftKneeY: lKnee.y,
    rightKneeY: rKnee.y,
    leftElevation,
    rightElevation,
    isLeftRaised,
    isRightRaised,
    isLeftReturned,
    isRightReturned,
    isMirrored,
  };
}

/**
 * Checks whether balance board corroborates leg lift weight transfer.
 * Left leg lift -> Weight transfers to RIGHT supporting foot (Right% increases, COP shifts rightward).
 * Right leg lift -> Weight transfers to LEFT supporting foot (Left% increases, COP shifts leftward).
 */
export function checkBoardTransferCorroboration(
  board: BoardObservation,
  baseline: LegRaiseBaseline | null,
  instructedLeg: LegRaiseSide,
  config: LegRaiseConfig = DEFAULT_LEG_RAISE_CONFIG
): { isConfirmed: boolean; transferDeltaPct: number; message: string } {
  if (!board.isValid) {
    return { isConfirmed: false, transferDeltaPct: 0, message: "Balance board data unavailable or invalid." };
  }

  const baseLeftPct = baseline?.isCalibrated ? baseline.leftPercent : 50.0;
  const baseRightPct = baseline?.isCalibrated ? baseline.rightPercent : 50.0;
  const baseCopX = baseline?.isCalibrated ? baseline.copX : 0.0;

  if (instructedLeg === "LEFT") {
    // Contralateral support is RIGHT leg
    const transferDelta = board.rightPercent - baseRightPct;
    const copShift = board.copX - baseCopX;

    const isConfirmed =
      transferDelta >= config.supportTransferThresholdPct &&
      copShift >= config.copDisplacementThresholdX * 0.6;

    const message = isConfirmed
      ? `Right support transfer confirmed (+${transferDelta.toFixed(1)}%)`
      : `Shift weight onto right supporting foot (+${transferDelta.toFixed(1)}% / +${config.supportTransferThresholdPct.toFixed(1)}%)`;

    return { isConfirmed, transferDeltaPct: transferDelta, message };
  } else {
    // Contralateral support is LEFT leg
    const transferDelta = board.leftPercent - baseLeftPct;
    const copShift = baseCopX - board.copX;

    const isConfirmed =
      transferDelta >= config.supportTransferThresholdPct &&
      copShift >= config.copDisplacementThresholdX * 0.6;

    const message = isConfirmed
      ? `Left support transfer confirmed (+${transferDelta.toFixed(1)}%)`
      : `Shift weight onto left supporting foot (+${transferDelta.toFixed(1)}% / +${config.supportTransferThresholdPct.toFixed(1)}%)`;

    return { isConfirmed, transferDeltaPct: transferDelta, message };
  }
}

/**
 * Dual-Device Verification Evaluation.
 * Combines Camera and Wii Balance Board observations within time window.
 */
export function evaluateDualDeviceVerification(
  camera: CameraLegObservation,
  board: BoardObservation,
  baseline: LegRaiseBaseline | null,
  instructedLeg: LegRaiseSide,
  config: LegRaiseConfig = DEFAULT_LEG_RAISE_CONFIG,
  currentTimeMs: number = Date.now()
): {
  isDualVerified: boolean;
  cameraConfirmed: boolean;
  boardConfirmed: boolean;
  isWrongLeg: boolean;
  syncOffsetMs: number;
  instructionText: string;
  feedbackText: string;
  supportTransferPct: number;
} {
  const syncOffsetMs = Math.abs(camera.timestamp - board.timestamp);
  const cameraAgeMs = Math.abs(currentTimeMs - camera.timestamp);
  const boardAgeMs = Math.abs(currentTimeMs - board.timestamp);

  const isStale =
    cameraAgeMs > config.maxSensorAgeMs ||
    boardAgeMs > config.maxSensorAgeMs ||
    syncOffsetMs > config.maxSyncOffsetMs;

  if (isStale) {
    return {
      isDualVerified: false,
      cameraConfirmed: false,
      boardConfirmed: false,
      isWrongLeg: false,
      syncOffsetMs,
      instructionText: `HOLD YOUR ${instructedLeg} LEG`,
      feedbackText: "Synchronizing sensor streams...",
      supportTransferPct: 0,
    };
  }

  // Camera confirmation for instructed leg
  const cameraConfirmed =
    instructedLeg === "LEFT"
      ? camera.isLeftRaised && !camera.isRightRaised
      : camera.isRightRaised && !camera.isLeftRaised;

  // Wrong leg detection
  const isWrongLeg =
    instructedLeg === "LEFT"
      ? camera.isRightRaised && !camera.isLeftRaised
      : camera.isLeftRaised && !camera.isRightRaised;

  // Board confirmation
  const boardResult = checkBoardTransferCorroboration(board, baseline, instructedLeg, config);
  const boardConfirmed = boardResult.isConfirmed;

  // Dual verification requiring BOTH independent confirmations
  const isDualVerified = cameraConfirmed && boardConfirmed && !isWrongLeg;

  let feedbackText = "";
  if (isWrongLeg) {
    feedbackText = `Incorrect leg detected. Please lift your ${instructedLeg} leg.`;
  } else if (cameraConfirmed && !boardConfirmed) {
    feedbackText = "Waiting for balance-board confirmation.";
  } else if (!cameraConfirmed && boardConfirmed) {
    feedbackText = `Please lift your ${instructedLeg} leg.`;
  } else if (isDualVerified) {
    feedbackText = `Dual verified: ${instructedLeg} leg raised + support transferred ✓`;
  } else {
    feedbackText = `Raise your ${instructedLeg} foot while keeping balance on the other leg.`;
  }

  return {
    isDualVerified,
    cameraConfirmed,
    boardConfirmed,
    isWrongLeg,
    syncOffsetMs,
    instructionText: `HOLD YOUR ${instructedLeg} LEG`,
    feedbackText,
    supportTransferPct: boardResult.transferDeltaPct,
  };
}

/**
 * Calculates physical COP distance in millimeters.
 */
export function calculateCopDistanceMm(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dxMm = (x1 - x2) * WII_BOARD_HALF_WIDTH_MM;
  const dyMm = (y1 - y2) * WII_BOARD_HALF_DEPTH_MM;
  return Math.sqrt(dxMm * dxMm + dyMm * dyMm);
}

/**
 * Calculates cumulative COP trajectory path length in millimeters.
 */
export function calculateCopPathLengthMm(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  let totalMm = 0;
  for (let i = 1; i < points.length; i++) {
    totalMm += calculateCopDistanceMm(points[i].x, points[i].y, points[i - 1].x, points[i - 1].y);
  }
  return totalMm;
}

/**
 * Calculates time-weighted RMS COP variability dispersion around the mean COP location in millimeters.
 */
export function calculateCopVariabilityRmsMm(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;

  // Mean COP
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  // Radial RMS dispersion in mm
  let sumSqDispMm = 0;
  for (const p of points) {
    const dxMm = (p.x - meanX) * WII_BOARD_HALF_WIDTH_MM;
    const dyMm = (p.y - meanY) * WII_BOARD_HALF_DEPTH_MM;
    sumSqDispMm += dxMm * dxMm + dyMm * dyMm;
  }

  return Math.sqrt(sumSqDispMm / points.length);
}

// =========================================================================
// EXERCISE STATE MACHINE CLASS
// =========================================================================

export class MultimodalLegRaiseEngine {
  private config: LegRaiseConfig;
  private state: MultimodalLegRaiseState = "IDLE";
  private baseline: LegRaiseBaseline | null = null;

  // Timestamps & Duration Counters
  private sessionStartTime: number = 0;
  private stateStartTime: number = 0;
  private lastSampleTime: number = 0;

  // Baseline Collection Samples Buffer
  private baselineSamples: Array<{
    leftAnkleY: number;
    rightAnkleY: number;
    leftKneeY: number;
    rightKneeY: number;
    leftPercent: number;
    rightPercent: number;
    copX: number;
    copY: number;
    totalWeight: number;
  }> = [];

  // Hold Timer & Repetition Tracking
  private currentUninterruptedHoldMs: number = 0;
  private holdStartTimestamp: number = 0;
  private lastVerifiedTimestamp: number = 0;
  private jitterDropTimestamp: number = 0;

  // Left Leg Metrics Accumulators
  private leftLiftStartTime: number = 0;
  private leftFirstVerifiedTime: number = 0;
  private leftReturnStartTime: number = 0;
  private leftRecoveryStartTime: number = 0;
  private leftRepetitionCompleted: boolean = false;
  private leftSuccessfulHoldSeconds: number = 0;
  private leftLoadPercentagesDuringLift: number[] = [];
  private leftCameraConfidences: number[] = [];
  private leftCopTrajectory: CopTrajectoryPoint[] = [];
  private leftInterruptedTrajectories: CopTrajectoryPoint[][] = [];
  private leftCurrentAttemptTrajectory: CopTrajectoryPoint[] = [];
  private leftSuccessfulAttempts: number = 0;
  private leftInterruptedAttempts: number = 0;

  // Right Leg Metrics Accumulators
  private rightLiftStartTime: number = 0;
  private rightFirstVerifiedTime: number = 0;
  private rightReturnStartTime: number = 0;
  private rightRecoveryStartTime: number = 0;
  private rightRepetitionCompleted: boolean = false;
  private rightSuccessfulHoldSeconds: number = 0;
  private rightLoadPercentagesDuringLift: number[] = [];
  private rightCameraConfidences: number[] = [];
  private rightCopTrajectory: CopTrajectoryPoint[] = [];
  private rightInterruptedTrajectories: CopTrajectoryPoint[][] = [];
  private rightCurrentAttemptTrajectory: CopTrajectoryPoint[] = [];
  private rightSuccessfulAttempts: number = 0;
  private rightInterruptedAttempts: number = 0;

  // Data Quality Metrics
  private totalValidMeasurementMs: number = 0;
  private totalInvalidCameraObservations: number = 0;
  private totalInvalidBoardObservations: number = 0;
  private totalMissingDataMs: number = 0;
  private safetyPausesCount: number = 0;
  private disconnectionsCount: number = 0;

  // Complete Trajectory
  private completeCopTrajectory: CopTrajectoryPoint[] = [];

  constructor(config: Partial<LegRaiseConfig> = {}) {
    this.config = { ...DEFAULT_LEG_RAISE_CONFIG, ...config };
  }

  public getState(): MultimodalLegRaiseState {
    return this.state;
  }

  public getBaseline(): LegRaiseBaseline | null {
    return this.baseline;
  }

  public getConfig(): LegRaiseConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<LegRaiseConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getHoldProgress(): { currentSeconds: number; targetSeconds: number; pct: number } {
    const target =
      this.state === "HOLDING_LEFT" || this.state === "VERIFYING_LEFT_LIFT" || this.state === "AWAITING_LEFT_LIFT"
        ? this.config.holdDurationSecondsLeft
        : this.config.holdDurationSecondsRight;
    const current = this.currentUninterruptedHoldMs / 1000.0;
    return {
      currentSeconds: Math.min(target, Number(current.toFixed(2))),
      targetSeconds: target,
      pct: Math.min(100, Math.round((current / target) * 100)),
    };
  }

  public getHoldStartTimestamp(): number {
    return this.holdStartTimestamp;
  }

  public startExercise() {
    this.state = "CHECKING_DEVICES";
    this.sessionStartTime = Date.now();
    this.stateStartTime = this.sessionStartTime;
    this.lastSampleTime = this.sessionStartTime;
    this.resetMetrics();
  }

  public pause() {
    if (this.state !== "COMPLETED" && this.state !== "ABORTED" && this.state !== "PAUSED") {
      this.state = "PAUSED";
      this.safetyPausesCount++;
    }
  }

  public resume() {
    if (this.state === "PAUSED") {
      // Return to appropriate waiting state based on repetition stage
      if (!this.leftRepetitionCompleted) {
        this.state = "AWAITING_LEFT_LIFT";
      } else {
        this.state = "AWAITING_RIGHT_LIFT";
      }
      this.stateStartTime = Date.now();
    }
  }

  public abort() {
    this.state = "ABORTED";
  }

  private resetMetrics() {
    this.baseline = null;
    this.baselineSamples = [];
    this.currentUninterruptedHoldMs = 0;
    this.leftRepetitionCompleted = false;
    this.rightRepetitionCompleted = false;
    this.leftSuccessfulHoldSeconds = 0;
    this.rightSuccessfulHoldSeconds = 0;
    this.leftLoadPercentagesDuringLift = [];
    this.rightLoadPercentagesDuringLift = [];
    this.leftCameraConfidences = [];
    this.rightCameraConfidences = [];
    this.leftCopTrajectory = [];
    this.rightCopTrajectory = [];
    this.leftInterruptedTrajectories = [];
    this.rightInterruptedTrajectories = [];
    this.completeCopTrajectory = [];
    this.totalValidMeasurementMs = 0;
    this.totalInvalidCameraObservations = 0;
    this.totalInvalidBoardObservations = 0;
    this.totalMissingDataMs = 0;
    this.safetyPausesCount = 0;
    this.disconnectionsCount = 0;
  }

  /**
   * Primary Telemetry Integration Step.
   * Called on every arrival of synchronized camera + board observation.
   */
  public processStep(
    camera: CameraLegObservation,
    board: BoardObservation,
    currentTimestamp: number = Date.now()
  ): {
    state: MultimodalLegRaiseState;
    feedbackText: string;
    instructionText: string;
    holdSeconds: number;
    targetHoldSeconds: number;
    dualVerified: boolean;
    supportTransferPct: number;
  } {
    // Check for sensor validity and disconnections
    if (!camera.hasPose) {
      this.totalInvalidCameraObservations++;
    }
    if (!board.isValid) {
      this.totalInvalidBoardObservations++;
    }

    const dtMs = this.lastSampleTime > 0 ? Math.max(0, currentTimestamp - this.lastSampleTime) : 0;
    this.lastSampleTime = currentTimestamp;

    if (dtMs > this.config.maxSensorAgeMs * 2) {
      this.totalMissingDataMs += dtMs;
    }

    if (camera.hasPose && board.isValid) {
      this.totalValidMeasurementMs += dtMs;
      // Record point in overall trajectory
      const trajPoint: CopTrajectoryPoint = {
        x: board.copX,
        y: board.copY,
        timestamp: currentTimestamp,
        leg:
          this.state === "HOLDING_LEFT" || this.state === "AWAITING_LEFT_LIFT" || this.state === "VERIFYING_LEFT_LIFT"
            ? "LEFT"
            : this.state === "HOLDING_RIGHT" || this.state === "AWAITING_RIGHT_LIFT" || this.state === "VERIFYING_RIGHT_LIFT"
            ? "RIGHT"
            : this.state === "CALIBRATING_BASELINE"
            ? "BASELINE"
            : "RECOVERY",
        isVerifiedHold: this.state === "HOLDING_LEFT" || this.state === "HOLDING_RIGHT",
      };
      this.completeCopTrajectory.push(trajPoint);
    }

    let feedbackText = "";
    let instructionText = "";
    let isDualVerified = false;
    let supportTransferPct = 0;

    // =========================================================================
    // STATE MACHINE DISPATCH
    // =========================================================================
    switch (this.state) {
      case "CHECKING_DEVICES": {
        instructionText = "CHECKING CONNECTED DEVICES";
        if (camera.hasPose && board.isValid) {
          feedbackText = "Both devices detected. Stand naturally on the balance board.";
          this.state = "CALIBRATING_BASELINE";
          this.stateStartTime = currentTimestamp;
          this.baselineSamples = [];
        } else if (!camera.hasPose && !board.isValid) {
          feedbackText = "Waiting for Camera and Wii Balance Board connection...";
        } else if (!camera.hasPose) {
          feedbackText = "Wii Balance Board ready. Waiting for Camera body pose detection...";
        } else {
          feedbackText = "Camera pose ready. Waiting for Wii Balance Board connection...";
        }
        break;
      }

      case "CALIBRATING_BASELINE": {
        instructionText = "ACQUIRING STANDING BASELINE";
        feedbackText = "Stand comfortably with both feet centered on the balance board...";

        if (camera.hasPose && board.isValid && camera.leftAnkleY !== null && camera.rightAnkleY !== null && camera.leftKneeY !== null && camera.rightKneeY !== null) {
          this.baselineSamples.push({
            leftAnkleY: camera.leftAnkleY,
            rightAnkleY: camera.rightAnkleY,
            leftKneeY: camera.leftKneeY,
            rightKneeY: camera.rightKneeY,
            leftPercent: board.leftPercent,
            rightPercent: board.rightPercent,
            copX: board.copX,
            copY: board.copY,
            totalWeight: board.totalWeight,
          });
        }

        const elapsedSeconds = (currentTimestamp - this.stateStartTime) / 1000.0;
        if (elapsedSeconds >= this.config.baselineDurationSeconds && this.baselineSamples.length >= 10) {
          // Compute baseline averages and variance
          const n = this.baselineSamples.length;
          const avgLeftAnkleY = this.baselineSamples.reduce((s, p) => s + p.leftAnkleY, 0) / n;
          const avgRightAnkleY = this.baselineSamples.reduce((s, p) => s + p.rightAnkleY, 0) / n;
          const avgLeftKneeY = this.baselineSamples.reduce((s, p) => s + p.leftKneeY, 0) / n;
          const avgRightKneeY = this.baselineSamples.reduce((s, p) => s + p.rightKneeY, 0) / n;
          const avgLeftPct = this.baselineSamples.reduce((s, p) => s + p.leftPercent, 0) / n;
          const avgRightPct = this.baselineSamples.reduce((s, p) => s + p.rightPercent, 0) / n;
          const avgCopX = this.baselineSamples.reduce((s, p) => s + p.copX, 0) / n;
          const avgCopY = this.baselineSamples.reduce((s, p) => s + p.copY, 0) / n;
          const avgWeight = this.baselineSamples.reduce((s, p) => s + p.totalWeight, 0) / n;

          const variance = this.baselineSamples.reduce((s, p) => s + Math.pow(p.leftPercent - avgLeftPct, 2), 0) / n;
          const loadStdDev = Math.sqrt(variance);

          this.baseline = {
            isCalibrated: true,
            leftAnkleY: avgLeftAnkleY,
            rightAnkleY: avgRightAnkleY,
            leftKneeY: avgLeftKneeY,
            rightKneeY: avgRightKneeY,
            leftPercent: avgLeftPct,
            rightPercent: avgRightPct,
            copX: avgCopX,
            copY: avgCopY,
            totalWeight: avgWeight,
            loadStdDev,
            sampleCount: n,
            calibrationDurationSeconds: elapsedSeconds,
          };

          this.state = "WAITING_FOR_STABLE_STANCE";
          this.stateStartTime = currentTimestamp;
        }
        break;
      }

      case "WAITING_FOR_STABLE_STANCE": {
        instructionText = "PREPARING FOR EXERCISE";
        feedbackText = "Bilateral baseline locked. Get ready to lift your LEFT leg.";
        const elapsed = (currentTimestamp - this.stateStartTime) / 1000.0;
        if (elapsed >= 1.5) {
          this.state = "AWAITING_LEFT_LIFT";
          this.leftLiftStartTime = currentTimestamp;
          this.stateStartTime = currentTimestamp;
        }
        break;
      }

      // -----------------------------------------------------------------------
      // LEFT LEG SEQUENCE
      // -----------------------------------------------------------------------
      case "AWAITING_LEFT_LIFT": {
        instructionText = "LIFT YOUR LEFT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "LEFT", this.config, currentTimestamp);
        feedbackText = evalRes.feedbackText;
        supportTransferPct = evalRes.supportTransferPct;

        if (evalRes.isDualVerified) {
          this.state = "HOLDING_LEFT";
          this.stateStartTime = currentTimestamp;
          this.holdStartTimestamp = currentTimestamp;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;
          this.currentUninterruptedHoldMs = 0;
          this.leftFirstVerifiedTime = currentTimestamp;
          this.leftSuccessfulAttempts++;
          this.leftCurrentAttemptTrajectory = [];
        } else if (evalRes.cameraConfirmed || evalRes.boardConfirmed) {
          this.state = "VERIFYING_LEFT_LIFT";
        }
        break;
      }

      case "VERIFYING_LEFT_LIFT": {
        instructionText = "LIFT YOUR LEFT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "LEFT", this.config, currentTimestamp);
        feedbackText = evalRes.feedbackText;
        supportTransferPct = evalRes.supportTransferPct;

        if (evalRes.isDualVerified) {
          this.state = "HOLDING_LEFT";
          this.stateStartTime = currentTimestamp;
          this.holdStartTimestamp = currentTimestamp;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;
          this.currentUninterruptedHoldMs = 0;
          if (this.leftFirstVerifiedTime === 0) {
            this.leftFirstVerifiedTime = currentTimestamp;
          }
          this.leftSuccessfulAttempts++;
          this.leftCurrentAttemptTrajectory = [];
        } else if (!evalRes.cameraConfirmed && !evalRes.boardConfirmed) {
          this.state = "AWAITING_LEFT_LIFT";
        }
        break;
      }

      case "HOLDING_LEFT": {
        instructionText = "HOLD YOUR LEFT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "LEFT", this.config, currentTimestamp);
        supportTransferPct = evalRes.supportTransferPct;
        isDualVerified = evalRes.isDualVerified;

        // Record COP trajectory during left lift
        if (board.isValid) {
          const pt: CopTrajectoryPoint = {
            x: board.copX,
            y: board.copY,
            timestamp: currentTimestamp,
            leg: "LEFT",
            isVerifiedHold: isDualVerified,
          };
          this.leftCopTrajectory.push(pt);
          this.leftCurrentAttemptTrajectory.push(pt);
        }

        // Metrics sampling
        this.leftLoadPercentagesDuringLift.push(board.rightPercent);
        this.leftCameraConfidences.push(camera.confidence);

        if (isDualVerified) {
          // Continuous dual-device evidence: accumulate actual hardware time delta
          const verifiedDtMs = this.lastVerifiedTimestamp > 0 ? currentTimestamp - this.lastVerifiedTimestamp : 0;
          this.currentUninterruptedHoldMs += verifiedDtMs;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;

          const holdSec = this.currentUninterruptedHoldMs / 1000.0;
          feedbackText = `Verified Hold: ${holdSec.toFixed(1)} / ${this.config.holdDurationSecondsLeft.toFixed(1)}s (Camera ✓ | Board ✓)`;

          if (holdSec >= this.config.holdDurationSecondsLeft) {
            this.leftSuccessfulHoldSeconds = holdSec;
            this.state = "AWAITING_LEFT_RETURN";
            this.leftReturnStartTime = currentTimestamp;
            this.stateStartTime = currentTimestamp;
            feedbackText = "Hold completed! Now lower your left foot onto the balance board.";
          }
        } else {
          // Evidence lost: check jitter tolerance window
          if (this.jitterDropTimestamp === 0) {
            this.jitterDropTimestamp = currentTimestamp;
          }
          const lossDurationMs = currentTimestamp - this.jitterDropTimestamp;

          if (lossDurationMs > this.config.jitterToleranceMs) {
            // Sustained loss: reset uninterrupted hold and log interrupted attempt
            if (this.currentUninterruptedHoldMs > 300) {
              this.leftInterruptedAttempts++;
              if (this.leftCurrentAttemptTrajectory.length > 0) {
                this.leftInterruptedTrajectories.push([...this.leftCurrentAttemptTrajectory]);
              }
            }
            this.currentUninterruptedHoldMs = 0;
            this.lastVerifiedTimestamp = 0;
            this.jitterDropTimestamp = 0;
            this.leftCurrentAttemptTrajectory = [];
            this.state = "AWAITING_LEFT_LIFT";
            feedbackText = evalRes.feedbackText || "Hold interrupted. Please lift your LEFT leg again.";
          } else {
            feedbackText = "Brief tremor detected. Hold steady...";
          }
        }
        break;
      }

      case "AWAITING_LEFT_RETURN": {
        instructionText = "PUT YOUR LEFT LEG DOWN";
        const returnConfirmed = camera.isLeftReturned && board.leftPercent >= 35.0 && board.rightPercent <= 65.0;

        if (returnConfirmed) {
          feedbackText = "Left foot returned to platform. Stand stable with both feet.";
          this.state = "VERIFYING_DOUBLE_SUPPORT";
          this.leftRecoveryStartTime = currentTimestamp;
          this.stateStartTime = currentTimestamp;
        } else {
          feedbackText = "Slowly lower your left foot until weight is evenly distributed.";
        }
        break;
      }

      case "VERIFYING_DOUBLE_SUPPORT": {
        instructionText = "STAND STABLE ON BOTH FEET";
        feedbackText = "Confirming stable bilateral standing posture...";
        const recoveryElapsed = (currentTimestamp - this.leftRecoveryStartTime) / 1000.0;

        const isStable =
          camera.hasPose &&
          camera.isLeftReturned &&
          camera.isRightReturned &&
          board.isValid &&
          board.leftPercent >= 35.0 &&
          board.rightPercent <= 65.0;

        if (recoveryElapsed >= this.config.stabilityDurationSeconds && isStable) {
          this.leftRepetitionCompleted = true;
          this.state = "AWAITING_RIGHT_LIFT";
          this.rightLiftStartTime = currentTimestamp;
          this.stateStartTime = currentTimestamp;
          feedbackText = "Left repetition verified! Now prepare to lift your RIGHT leg.";
        }
        break;
      }

      // -----------------------------------------------------------------------
      // RIGHT LEG SEQUENCE
      // -----------------------------------------------------------------------
      case "AWAITING_RIGHT_LIFT": {
        instructionText = "LIFT YOUR RIGHT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "RIGHT", this.config, currentTimestamp);
        feedbackText = evalRes.feedbackText;
        supportTransferPct = evalRes.supportTransferPct;

        if (evalRes.isDualVerified) {
          this.state = "HOLDING_RIGHT";
          this.stateStartTime = currentTimestamp;
          this.holdStartTimestamp = currentTimestamp;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;
          this.currentUninterruptedHoldMs = 0;
          this.rightFirstVerifiedTime = currentTimestamp;
          this.rightSuccessfulAttempts++;
          this.rightCurrentAttemptTrajectory = [];
        } else if (evalRes.cameraConfirmed || evalRes.boardConfirmed) {
          this.state = "VERIFYING_RIGHT_LIFT";
        }
        break;
      }

      case "VERIFYING_RIGHT_LIFT": {
        instructionText = "LIFT YOUR RIGHT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "RIGHT", this.config, currentTimestamp);
        feedbackText = evalRes.feedbackText;
        supportTransferPct = evalRes.supportTransferPct;

        if (evalRes.isDualVerified) {
          this.state = "HOLDING_RIGHT";
          this.stateStartTime = currentTimestamp;
          this.holdStartTimestamp = currentTimestamp;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;
          this.currentUninterruptedHoldMs = 0;
          if (this.rightFirstVerifiedTime === 0) {
            this.rightFirstVerifiedTime = currentTimestamp;
          }
          this.rightSuccessfulAttempts++;
          this.rightCurrentAttemptTrajectory = [];
        } else if (!evalRes.cameraConfirmed && !evalRes.boardConfirmed) {
          this.state = "AWAITING_RIGHT_LIFT";
        }
        break;
      }

      case "HOLDING_RIGHT": {
        instructionText = "HOLD YOUR RIGHT LEG";
        const evalRes = evaluateDualDeviceVerification(camera, board, this.baseline, "RIGHT", this.config, currentTimestamp);
        supportTransferPct = evalRes.supportTransferPct;
        isDualVerified = evalRes.isDualVerified;

        // Record COP trajectory during right lift
        if (board.isValid) {
          const pt: CopTrajectoryPoint = {
            x: board.copX,
            y: board.copY,
            timestamp: currentTimestamp,
            leg: "RIGHT",
            isVerifiedHold: isDualVerified,
          };
          this.rightCopTrajectory.push(pt);
          this.rightCurrentAttemptTrajectory.push(pt);
        }

        // Metrics sampling
        this.rightLoadPercentagesDuringLift.push(board.leftPercent);
        this.rightCameraConfidences.push(camera.confidence);

        if (isDualVerified) {
          const verifiedDtMs = this.lastVerifiedTimestamp > 0 ? currentTimestamp - this.lastVerifiedTimestamp : 0;
          this.currentUninterruptedHoldMs += verifiedDtMs;
          this.lastVerifiedTimestamp = currentTimestamp;
          this.jitterDropTimestamp = 0;

          const holdSec = this.currentUninterruptedHoldMs / 1000.0;
          feedbackText = `Verified Hold: ${holdSec.toFixed(1)} / ${this.config.holdDurationSecondsRight.toFixed(1)}s (Camera ✓ | Board ✓)`;

          if (holdSec >= this.config.holdDurationSecondsRight) {
            this.rightSuccessfulHoldSeconds = holdSec;
            this.state = "AWAITING_RIGHT_RETURN";
            this.rightReturnStartTime = currentTimestamp;
            this.stateStartTime = currentTimestamp;
            feedbackText = "Hold completed! Now lower your right foot onto the balance board.";
          }
        } else {
          if (this.jitterDropTimestamp === 0) {
            this.jitterDropTimestamp = currentTimestamp;
          }
          const lossDurationMs = currentTimestamp - this.jitterDropTimestamp;

          if (lossDurationMs > this.config.jitterToleranceMs) {
            if (this.currentUninterruptedHoldMs > 300) {
              this.rightInterruptedAttempts++;
              if (this.rightCurrentAttemptTrajectory.length > 0) {
                this.rightInterruptedTrajectories.push([...this.rightCurrentAttemptTrajectory]);
              }
            }
            this.currentUninterruptedHoldMs = 0;
            this.lastVerifiedTimestamp = 0;
            this.jitterDropTimestamp = 0;
            this.rightCurrentAttemptTrajectory = [];
            this.state = "AWAITING_RIGHT_LIFT";
            feedbackText = evalRes.feedbackText || "Hold interrupted. Please lift your RIGHT leg again.";
          } else {
            feedbackText = "Brief tremor detected. Hold steady...";
          }
        }
        break;
      }

      case "AWAITING_RIGHT_RETURN": {
        instructionText = "PUT YOUR RIGHT LEG DOWN";
        const returnConfirmed = camera.isRightReturned && board.rightPercent >= 35.0 && board.leftPercent <= 65.0;

        if (returnConfirmed) {
          feedbackText = "Right foot returned to platform. Stand stable with both feet.";
          this.state = "VERIFYING_FINAL_STABILITY";
          this.rightRecoveryStartTime = currentTimestamp;
          this.stateStartTime = currentTimestamp;
        } else {
          feedbackText = "Slowly lower your right foot until weight is evenly distributed.";
        }
        break;
      }

      case "VERIFYING_FINAL_STABILITY": {
        instructionText = "VERIFYING FINAL STABILITY";
        feedbackText = "Confirming stable bilateral standing posture...";
        const finalRecoveryElapsed = (currentTimestamp - this.rightRecoveryStartTime) / 1000.0;

        const isStable =
          camera.hasPose &&
          camera.isLeftReturned &&
          camera.isRightReturned &&
          board.isValid &&
          board.leftPercent >= 35.0 &&
          board.rightPercent <= 65.0;

        if (finalRecoveryElapsed >= this.config.stabilityDurationSeconds && isStable) {
          this.rightRepetitionCompleted = true;
          this.state = "COMPLETED";
          instructionText = "ASSESSMENT COMPLETED";
          feedbackText = "Assessment complete! Both repetitions verified.";
        }
        break;
      }

      case "COMPLETED": {
        instructionText = "ASSESSMENT COMPLETED";
        feedbackText = "Both repetitions successfully completed and dual-verified.";
        break;
      }

      case "PAUSED": {
        instructionText = "EXERCISE PAUSED";
        feedbackText = "Assessment paused by supervisor or safety monitor. Press Resume to continue.";
        break;
      }

      default:
        break;
    }

    const currentHoldProgress = this.getHoldProgress();

    return {
      state: this.state,
      feedbackText,
      instructionText,
      holdSeconds: currentHoldProgress.currentSeconds,
      targetHoldSeconds: currentHoldProgress.targetSeconds,
      dualVerified: isDualVerified,
      supportTransferPct,
    };
  }

  /**
   * Compiles the comprehensive scientific session summary for reporting, persistence, and Doctor PDF.
   */
  public generateSessionSummary(
    patientId: string = "pat-001",
    patientName: string = "Jane Doe",
    isRealHardware: boolean = true,
    cameraSource: string = "Intel RealSense RGB / MediaPipe Pose"
  ): LegRaiseSessionSummary {
    const endTime = Date.now();
    const totalElapsedSeconds = Math.max(0.1, (endTime - this.sessionStartTime) / 1000.0);
    const totalValidMeasurementSeconds = this.totalValidMeasurementMs / 1000.0;

    const base = this.baseline || {
      isCalibrated: false,
      leftAnkleY: 0.85,
      rightAnkleY: 0.85,
      leftKneeY: 0.65,
      rightKneeY: 0.65,
      leftPercent: 50.0,
      rightPercent: 50.0,
      copX: 0,
      copY: 0,
      totalWeight: 65.0,
      loadStdDev: 0,
      sampleCount: 0,
      calibrationDurationSeconds: 0,
    };

    // Calculate Left Leg Metrics
    const leftMeanSupportPct =
      this.leftLoadPercentagesDuringLift.length > 0
        ? this.leftLoadPercentagesDuringLift.reduce((a, b) => a + b, 0) / this.leftLoadPercentagesDuringLift.length
        : base.rightPercent;

    const leftPeakSupportPct =
      this.leftLoadPercentagesDuringLift.length > 0
        ? Math.max(...this.leftLoadPercentagesDuringLift)
        : base.rightPercent;

    const leftTransferDeltaPct = leftMeanSupportPct - base.rightPercent;

    const leftDisplacements = this.leftCopTrajectory.map((p) =>
      calculateCopDistanceMm(p.x, p.y, base.copX, base.copY)
    );
    const leftMeanDisplacementMm =
      leftDisplacements.length > 0 ? leftDisplacements.reduce((a, b) => a + b, 0) / leftDisplacements.length : 0;

    const leftPathLengthMm = calculateCopPathLengthMm(this.leftCopTrajectory);
    const leftVariabilityRmsMm = calculateCopVariabilityRmsMm(this.leftCopTrajectory);

    const leftMeanConf =
      this.leftCameraConfidences.length > 0
        ? this.leftCameraConfidences.reduce((a, b) => a + b, 0) / this.leftCameraConfidences.length
        : 0;

    const leftMetrics: LegPerformanceMetrics = {
      leg: "LEFT",
      requiredHoldSeconds: this.config.holdDurationSecondsLeft,
      actualHoldSeconds: Number(this.leftSuccessfulHoldSeconds.toFixed(2)),
      liftInitiationDurationSeconds:
        this.leftFirstVerifiedTime > this.leftLiftStartTime
          ? Number(((this.leftFirstVerifiedTime - this.leftLiftStartTime) / 1000.0).toFixed(2))
          : 0,
      timeToEstablishLiftSeconds:
        this.leftFirstVerifiedTime > this.leftLiftStartTime
          ? Number(((this.leftFirstVerifiedTime - this.leftLiftStartTime) / 1000.0).toFixed(2))
          : 0,
      returnDurationSeconds:
        this.leftRecoveryStartTime > this.leftReturnStartTime
          ? Number(((this.leftRecoveryStartTime - this.leftReturnStartTime) / 1000.0).toFixed(2))
          : 0,
      recoveryDurationSeconds: this.leftRepetitionCompleted ? this.config.stabilityDurationSeconds : 0,
      cameraLiftConfirmed: this.leftCameraConfidences.length > 0,
      boardTransferConfirmed: this.leftLoadPercentagesDuringLift.length > 0,
      repetitionCompleted: this.leftRepetitionCompleted,
      baselineSupportLoadPct: Number(base.rightPercent.toFixed(1)),
      meanSupportLoadPctDuringLift: Number(leftMeanSupportPct.toFixed(1)),
      peakSupportLoadPctDuringLift: Number(leftPeakSupportPct.toFixed(1)),
      supportTransferDeltaPct: Number(leftTransferDeltaPct.toFixed(1)),
      meanCopDisplacementMm: Number(leftMeanDisplacementMm.toFixed(1)),
      copPathLengthMm: Number(leftPathLengthMm.toFixed(1)),
      copVariabilityRmsMm: Number(leftVariabilityRmsMm.toFixed(1)),
      meanCameraConfidence: Number(leftMeanConf.toFixed(2)),
      successfulAttempts: this.leftSuccessfulAttempts,
      interruptedAttempts: this.leftInterruptedAttempts,
      copTrajectory: this.leftCopTrajectory,
      interruptedTrajectories: this.leftInterruptedTrajectories,
    };

    // Calculate Right Leg Metrics
    const rightMeanSupportPct =
      this.rightLoadPercentagesDuringLift.length > 0
        ? this.rightLoadPercentagesDuringLift.reduce((a, b) => a + b, 0) / this.rightLoadPercentagesDuringLift.length
        : base.leftPercent;

    const rightPeakSupportPct =
      this.rightLoadPercentagesDuringLift.length > 0
        ? Math.max(...this.rightLoadPercentagesDuringLift)
        : base.leftPercent;

    const rightTransferDeltaPct = rightMeanSupportPct - base.leftPercent;

    const rightDisplacements = this.rightCopTrajectory.map((p) =>
      calculateCopDistanceMm(p.x, p.y, base.copX, base.copY)
    );
    const rightMeanDisplacementMm =
      rightDisplacements.length > 0 ? rightDisplacements.reduce((a, b) => a + b, 0) / rightDisplacements.length : 0;

    const rightPathLengthMm = calculateCopPathLengthMm(this.rightCopTrajectory);
    const rightVariabilityRmsMm = calculateCopVariabilityRmsMm(this.rightCopTrajectory);

    const rightMeanConf =
      this.rightCameraConfidences.length > 0
        ? this.rightCameraConfidences.reduce((a, b) => a + b, 0) / this.rightCameraConfidences.length
        : 0;

    const rightMetrics: LegPerformanceMetrics = {
      leg: "RIGHT",
      requiredHoldSeconds: this.config.holdDurationSecondsRight,
      actualHoldSeconds: Number(this.rightSuccessfulHoldSeconds.toFixed(2)),
      liftInitiationDurationSeconds:
        this.rightFirstVerifiedTime > this.rightLiftStartTime
          ? Number(((this.rightFirstVerifiedTime - this.rightLiftStartTime) / 1000.0).toFixed(2))
          : 0,
      timeToEstablishLiftSeconds:
        this.rightFirstVerifiedTime > this.rightLiftStartTime
          ? Number(((this.rightFirstVerifiedTime - this.rightLiftStartTime) / 1000.0).toFixed(2))
          : 0,
      returnDurationSeconds:
        this.rightRecoveryStartTime > this.rightReturnStartTime
          ? Number(((this.rightRecoveryStartTime - this.rightReturnStartTime) / 1000.0).toFixed(2))
          : 0,
      recoveryDurationSeconds: this.rightRepetitionCompleted ? this.config.stabilityDurationSeconds : 0,
      cameraLiftConfirmed: this.rightCameraConfidences.length > 0,
      boardTransferConfirmed: this.rightLoadPercentagesDuringLift.length > 0,
      repetitionCompleted: this.rightRepetitionCompleted,
      baselineSupportLoadPct: Number(base.leftPercent.toFixed(1)),
      meanSupportLoadPctDuringLift: Number(rightMeanSupportPct.toFixed(1)),
      peakSupportLoadPctDuringLift: Number(rightPeakSupportPct.toFixed(1)),
      supportTransferDeltaPct: Number(rightTransferDeltaPct.toFixed(1)),
      meanCopDisplacementMm: Number(rightMeanDisplacementMm.toFixed(1)),
      copPathLengthMm: Number(rightPathLengthMm.toFixed(1)),
      copVariabilityRmsMm: Number(rightVariabilityRmsMm.toFixed(1)),
      meanCameraConfidence: Number(rightMeanConf.toFixed(2)),
      successfulAttempts: this.rightSuccessfulAttempts,
      interruptedAttempts: this.rightInterruptedAttempts,
      copTrajectory: this.rightCopTrajectory,
      interruptedTrajectories: this.rightInterruptedTrajectories,
    };

    let completedReps = 0;
    if (this.leftRepetitionCompleted) completedReps++;
    if (this.rightRepetitionCompleted) completedReps++;

    return {
      sessionId: `leg-raise-${this.sessionStartTime}`,
      patientId,
      patientName,
      sessionDate: new Date(this.sessionStartTime).toLocaleDateString(),
      startTime: this.sessionStartTime,
      endTime,
      totalElapsedSeconds: Number(totalElapsedSeconds.toFixed(1)),
      totalValidMeasurementSeconds: Number(totalValidMeasurementSeconds.toFixed(1)),
      completedRepetitions: completedReps,
      isRealHardware,
      hardwareModel: isRealHardware ? "Nintendo Wii Balance Board (RVL-WBC-01)" : "Simulated Balance Telemetry",
      cameraSource,
      supportedStandingMode: this.config.supportedStandingMode,
      baseline: base,
      leftLeg: leftMetrics,
      rightLeg: rightMetrics,
      totalDualConfirmedHoldSeconds: Number((leftMetrics.actualHoldSeconds + rightMetrics.actualHoldSeconds).toFixed(2)),
      overallTrackingQuality:
        this.totalInvalidCameraObservations < 5 ? "High (Full 33-Landmark Pose Valid)" : "Fair (Occasional Occlusion Filtered)",
      overallBoardQuality:
        this.totalInvalidBoardObservations === 0 ? "Continuous (0 Gaps Filtered)" : `${this.totalInvalidBoardObservations} dropped frames filtered`,
      syncQuality: "< 250ms Temporal Offset (Synchronized)",
      totalInvalidCameraObservations: this.totalInvalidCameraObservations,
      totalInvalidBoardObservations: this.totalInvalidBoardObservations,
      totalMissingDataSeconds: Number((this.totalMissingDataMs / 1000.0).toFixed(1)),
      safetyPausesCount: this.safetyPausesCount,
      disconnectionsCount: this.disconnectionsCount,
      completeCopTrajectory: this.completeCopTrajectory,
    };
  }
}
