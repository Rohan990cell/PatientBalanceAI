/**
 * Target Achieving Game — Real COP Target Detection Engine & Mathematics
 *
 * PHASE 6 & PHASE 7:
 * - Real physical Wii Balance Board Center of Pressure (COP) measurements.
 * - Euclidean distance in physical millimetres: sqrt((COP_X - Target_X)^2 + (COP_Y - Target_Y)^2).
 * - Noise-filtering hold confirmation duration (default 600 ms).
 * - Configurable target timer per balloon (default 10000 ms).
 * - Safe timer pausing on hardware disconnect or clinician pause.
 * - Accurate timeout handling with failure deflation animation.
 * - Boundary safety: Success takes priority over timeout if hold completes at boundary.
 */

import { WII_BOARD_DIMENSIONS } from "../types/hardware";

/**
 * Standard clinical tolerance radius in millimetres.
 * Sized conservatively for rehabilitation to ensure reachable yet controlled weight shift.
 */
export const DEFAULT_TARGET_TOLERANCE_MM = 35.0;

/**
 * Standard center starting tolerance radius in physical millimetres around (0,0).
 * Sized comfortably for natural bipedal stance (40.0 mm).
 */
export const DEFAULT_CENTER_TOLERANCE_MM = 40.0;

/**
 * Required continuous hold duration at center to start the game in milliseconds.
 * Mandatory 2.0 seconds (2000 ms).
 */
export const DEFAULT_CENTER_HOLD_DURATION_MS = 2000;

/**
 * Standard hold/dwell confirmation duration in milliseconds.
 * Mandatory 2-second continuous hold required to achieve balloon target.
 */
export const DEFAULT_CONFIRMATION_DURATION_MS = 2000;

/**
 * Standard time limit per active balloon in milliseconds.
 * Default: 10.0 seconds (10,000 ms).
 */
export const DEFAULT_TARGET_TIME_LIMIT_MS = 10000;

export type TargetOutcomeStatus = "pending" | "active" | "completed" | "missed";

export interface BalloonTargetDefinition {
  id: number;
  number: number;
  name: string;
  directionLabel: string;
  copX: number; // Normalized [-1.0, 1.0]
  copY: number; // Normalized [-1.0, 1.0]
  targetXMm: number; // Physical board mm from center
  targetYMm: number; // Physical board mm from center
  color: string;
  colorDark: string;
  colorLight: string;
  floatDelay: string;
}

/**
 * The 4 balloon targets with exact normalized and physical millimetre coordinates.
 */
export const BALLOON_TARGET_SPECS: BalloonTargetDefinition[] = [
  {
    id: 1,
    number: 1,
    name: "Target 1",
    directionLabel: "Left side",
    copX: -0.60,
    copY: 0.05,
    targetXMm: -0.60 * WII_BOARD_DIMENSIONS.halfDistanceXMm, // -133.8 mm
    targetYMm: 0.05 * WII_BOARD_DIMENSIONS.halfDistanceYMm,  // +5.95 mm
    color: "#EF4444",
    colorDark: "#B91C1C",
    colorLight: "#FCA5A5",
    floatDelay: "0s",
  },
  {
    id: 2,
    number: 2,
    name: "Target 2",
    directionLabel: "Upper-Right diagonal",
    copX: 0.55,
    copY: 0.55,
    targetXMm: 0.55 * WII_BOARD_DIMENSIONS.halfDistanceXMm,  // +122.65 mm
    targetYMm: 0.55 * WII_BOARD_DIMENSIONS.halfDistanceYMm,  // +65.45 mm
    color: "#0284C7",
    colorDark: "#075985",
    colorLight: "#7DD3FC",
    floatDelay: "0.6s",
  },
  {
    id: 3,
    number: 3,
    name: "Target 3",
    directionLabel: "Forward side",
    copX: -0.10,
    copY: 0.65,
    targetXMm: -0.10 * WII_BOARD_DIMENSIONS.halfDistanceXMm, // -22.3 mm
    targetYMm: 0.65 * WII_BOARD_DIMENSIONS.halfDistanceYMm,  // +77.35 mm
    color: "#059669",
    colorDark: "#065F46",
    colorLight: "#6EE7B7",
    floatDelay: "1.2s",
  },
  {
    id: 4,
    number: 4,
    name: "Target 4",
    directionLabel: "Lower-Right diagonal",
    copX: 0.50,
    copY: -0.55,
    targetXMm: 0.50 * WII_BOARD_DIMENSIONS.halfDistanceXMm,  // +111.5 mm
    targetYMm: -0.55 * WII_BOARD_DIMENSIONS.halfDistanceYMm, // -65.45 mm
    color: "#D97706",
    colorDark: "#92400E",
    colorLight: "#FCD34D",
    floatDelay: "1.8s",
  },
];

/**
 * Calculates Euclidean distance between measured COP and target coordinates in physical millimetres.
 * Formula: sqrt((COP_X - Target_X)^2 + (COP_Y - Target_Y)^2)
 */
export function calculatePhysicalCopDistance(
  copXMm: number | null | undefined,
  copYMm: number | null | undefined,
  targetXMm: number,
  targetYMm: number
): number | null {
  if (
    copXMm === null ||
    copXMm === undefined ||
    !Number.isFinite(copXMm) ||
    copYMm === null ||
    copYMm === undefined ||
    !Number.isFinite(copYMm)
  ) {
    return null;
  }
  return Math.hypot(copXMm - targetXMm, copYMm - targetYMm);
}

/**
 * Evaluates whether measured COP is within target tolerance radius in physical millimetres.
 */
export function isPhysicalTargetReached(
  copXMm: number | null | undefined,
  copYMm: number | null | undefined,
  targetXMm: number,
  targetYMm: number,
  toleranceMm: number = DEFAULT_TARGET_TOLERANCE_MM
): boolean {
  const dist = calculatePhysicalCopDistance(copXMm, copYMm, targetXMm, targetYMm);
  if (dist === null) return false;
  return dist <= toleranceMm;
}

export interface TargetDetectionResult {
  isValid: boolean;
  distanceMm: number | null;
  isInTolerance: boolean;
  holdProgress: number; // 0.0 to 1.0
  holdTimeRemainingMs: number; // e.g. 3000 ms down to 0 ms
  holdSecondsCountdown: number; // 3, 2, 1 (0 when achieved)
  timeRemainingMs: number;
  isAchieved: boolean;
  isTimedOut: boolean;
  status: TargetOutcomeStatus;
}

export interface TargetAttemptResult {
  targetIndex: number; // 0, 1, 2, 3 (order attempted)
  balloonId: number;   // 1, 2, 3, 4
  number: number;      // 1, 2, 3, 4
  name: string;
  directionLabel: string;
  color: string;
  status: "completed" | "missed";
  durationMs: number; // Time taken in milliseconds
  finalDistanceMm: number | null; // Final Euclidean distance error in mm
}

export interface RecordedCopPoint {
  timestamp: number;
  copX: number;
  copY: number;
  copXMm: number;
  copYMm: number;
  targetId: number;
  stepIndex: number;
}

export interface GameSessionSummary {
  sessionId?: string;
  totalTargets: number; // Always 4
  completedTargets: number;
  missedTargets: number;
  achievementPercentage: number; // (completedTargets / 4) * 100
  averageAchievementTimeMs: number | null; // Calculated using successful targets only
  totalSessionDurationMs: number;
  targetAttempts: TargetAttemptResult[];
  trajectory: RecordedCopPoint[];
  sessionDate?: string;
  isRealHardware?: boolean;
  patientName?: string;
  patientId?: string;
}

/**
 * Computes official game session results from actual session data.
 */
export function computeGameSessionSummary(
  targetAttempts: TargetAttemptResult[],
  trajectory: RecordedCopPoint[],
  totalDurationMs: number,
  metadata?: {
    sessionId?: string;
    sessionDate?: string;
    isRealHardware?: boolean;
    patientName?: string;
    patientId?: string;
  }
): GameSessionSummary {
  const totalTargets = 4;
  const completedAttempts = targetAttempts.filter((t) => t.status === "completed");
  const missedAttempts = targetAttempts.filter((t) => t.status === "missed");

  const completedTargets = completedAttempts.length;
  const missedTargets = missedAttempts.length;

  // Achievement percentage: (Completed targets / 4) × 100
  const achievementPercentage = (completedTargets / totalTargets) * 100;

  // Average target achievement time, calculated using successful targets only
  let averageAchievementTimeMs: number | null = null;
  if (completedTargets > 0) {
    const totalCompletedTime = completedAttempts.reduce((sum, t) => sum + t.durationMs, 0);
    averageAchievementTimeMs = totalCompletedTime / completedTargets;
  }

  return {
    sessionId: metadata?.sessionId,
    totalTargets,
    completedTargets,
    missedTargets,
    achievementPercentage,
    averageAchievementTimeMs,
    totalSessionDurationMs: Math.max(0, totalDurationMs),
    targetAttempts,
    trajectory,
    sessionDate: metadata?.sessionDate,
    isRealHardware: metadata?.isRealHardware,
    patientName: metadata?.patientName,
    patientId: metadata?.patientId,
  };
}

/**
 * Detection result for the pre-start 2-second centre hold confirmation.
 */
export interface CenterDetectionResult {
  isValid: boolean;
  distanceMm: number | null;
  isInCenterZone: boolean;
  holdProgress: number; // 0.0 to 1.0
  holdSecondsCountdown: number; // 2, 1 (0 when confirmed)
  holdTimeRemainingMs: number; // 2000 ms down to 0 ms
  isConfirmed: boolean;
}

/**
 * Stateful detector for tracking the 2-second continuous centre hold requirement
 * prior to activating and displaying Balloon 1.
 */
export class CenterPositionDetector {
  private toleranceMm: number;
  private holdDurationMs: number;
  private enterTimestamp: number | null = null;
  private isConfirmed: boolean = false;

  constructor(
    toleranceMm: number = DEFAULT_CENTER_TOLERANCE_MM,
    holdDurationMs: number = DEFAULT_CENTER_HOLD_DURATION_MS
  ) {
    this.toleranceMm = toleranceMm;
    this.holdDurationMs = holdDurationMs;
  }

  public reset(): void {
    this.enterTimestamp = null;
    this.isConfirmed = false;
  }

  public getToleranceMm(): number {
    return this.toleranceMm;
  }

  public getHoldDurationMs(): number {
    return this.holdDurationMs;
  }

  public getIsConfirmed(): boolean {
    return this.isConfirmed;
  }

  public update(
    copXMm: number | null | undefined,
    copYMm: number | null | undefined,
    timestamp: number,
    isHardwareConnected: boolean = true,
    isPaused: boolean = false
  ): CenterDetectionResult {
    if (this.isConfirmed) {
      return {
        isValid: isHardwareConnected && !isPaused,
        distanceMm: calculatePhysicalCopDistance(copXMm, copYMm, 0, 0),
        isInCenterZone: true,
        holdProgress: 1.0,
        holdSecondsCountdown: 0,
        holdTimeRemainingMs: 0,
        isConfirmed: true,
      };
    }

    // Hardware disconnect or clinician pause: pause & reset dwell safely
    if (!isHardwareConnected || isPaused) {
      this.enterTimestamp = null;
      return {
        isValid: false,
        distanceMm: null,
        isInCenterZone: false,
        holdProgress: 0.0,
        holdSecondsCountdown: Math.ceil(this.holdDurationMs / 1000),
        holdTimeRemainingMs: this.holdDurationMs,
        isConfirmed: false,
      };
    }

    const dist = calculatePhysicalCopDistance(copXMm, copYMm, 0, 0);
    // Invalid or missing readings must never count toward confirmation
    if (dist === null) {
      this.enterTimestamp = null;
      return {
        isValid: false,
        distanceMm: null,
        isInCenterZone: false,
        holdProgress: 0.0,
        holdSecondsCountdown: Math.ceil(this.holdDurationMs / 1000),
        holdTimeRemainingMs: this.holdDurationMs,
        isConfirmed: false,
      };
    }

    const isInCenterZone = dist <= this.toleranceMm;

    if (isInCenterZone) {
      if (this.enterTimestamp === null) {
        this.enterTimestamp = timestamp;
      }

      const dwellTime = Math.max(0, timestamp - this.enterTimestamp);
      const holdProgress = Math.min(1.0, dwellTime / this.holdDurationMs);
      const holdTimeRemainingMs = Math.max(0, this.holdDurationMs - dwellTime);
      const isConfirmed = dwellTime >= this.holdDurationMs;
      const holdSecondsCountdown = isConfirmed ? 0 : Math.max(1, Math.ceil(holdTimeRemainingMs / 1000));

      if (isConfirmed) {
        this.isConfirmed = true;
      }

      return {
        isValid: true,
        distanceMm: dist,
        isInCenterZone: true,
        holdProgress,
        holdSecondsCountdown,
        holdTimeRemainingMs,
        isConfirmed,
      };
    }

    // Outside centre tolerance zone: immediately reset dwell & countdown
    this.enterTimestamp = null;
    return {
      isValid: true,
      distanceMm: dist,
      isInCenterZone: false,
      holdProgress: 0.0,
      holdSecondsCountdown: Math.ceil(this.holdDurationMs / 1000),
      holdTimeRemainingMs: this.holdDurationMs,
      isConfirmed: false,
    };
  }
}

/**
 * Stateful detector for tracking COP dwell time and active balloon timer.
 * Handles hold confirmation, configurable time limits, pause/resume safety,
 * and boundary priority (success over timeout).
 */
export class BalloonTargetDetector {
  private toleranceMm: number;
  private confirmationDurationMs: number;
  private timeLimitMs: number;

  private activeTargetId: number | null = null;
  private terminalStatus: TargetOutcomeStatus = "pending";
  private enterTimestamp: number | null = null;
  private elapsedActiveTimeMs: number = 0;
  private lastActiveTimestamp: number | null = null;

  constructor(
    toleranceMm: number = DEFAULT_TARGET_TOLERANCE_MM,
    confirmationDurationMs: number = DEFAULT_CONFIRMATION_DURATION_MS,
    timeLimitMs: number = DEFAULT_TARGET_TIME_LIMIT_MS
  ) {
    this.toleranceMm = toleranceMm;
    this.confirmationDurationMs = confirmationDurationMs;
    this.timeLimitMs = timeLimitMs;
  }

  public setTarget(targetId: number, startTimestamp?: number): void {
    if (this.activeTargetId !== targetId) {
      this.activeTargetId = targetId;
      this.terminalStatus = "active";
      this.enterTimestamp = null;
      this.elapsedActiveTimeMs = 0;
      this.lastActiveTimestamp = startTimestamp ?? null;
    }
  }

  public getToleranceMm(): number {
    return this.toleranceMm;
  }

  public getConfirmationDurationMs(): number {
    return this.confirmationDurationMs;
  }

  public getTimeLimitMs(): number {
    return this.timeLimitMs;
  }

  public getTimeRemainingMs(): number {
    return Math.max(0, this.timeLimitMs - this.elapsedActiveTimeMs);
  }

  public getTerminalStatus(): TargetOutcomeStatus {
    return this.terminalStatus;
  }

  public reset(): void {
    this.terminalStatus = "pending";
    this.enterTimestamp = null;
    this.elapsedActiveTimeMs = 0;
    this.lastActiveTimestamp = null;
  }

  /**
   * Process a live COP sample at a given timestamp.
   * Updates hold dwell and elapsed active time, pausing during hardware disconnect or game pause.
   */
  public update(
    copXMm: number | null | undefined,
    copYMm: number | null | undefined,
    targetXMm: number,
    targetYMm: number,
    timestamp: number,
    isHardwareConnected: boolean = true,
    isPaused: boolean = false
  ): TargetDetectionResult {
    const timeRemainingMs = Math.max(0, this.timeLimitMs - this.elapsedActiveTimeMs);

    // 1. If already terminal (completed or missed), lock status and prevent duplicate transitions
    if (this.terminalStatus === "completed") {
      return {
        isValid: isHardwareConnected && !isPaused,
        distanceMm: calculatePhysicalCopDistance(copXMm, copYMm, targetXMm, targetYMm),
        isInTolerance: true,
        holdProgress: 1.0,
        holdTimeRemainingMs: 0,
        holdSecondsCountdown: 0,
        timeRemainingMs,
        isAchieved: true,
        isTimedOut: false,
        status: "completed",
      };
    }

    if (this.terminalStatus === "missed") {
      return {
        isValid: isHardwareConnected && !isPaused,
        distanceMm: calculatePhysicalCopDistance(copXMm, copYMm, targetXMm, targetYMm),
        isInTolerance: false,
        holdProgress: 0.0,
        holdTimeRemainingMs: 0,
        holdSecondsCountdown: 0,
        timeRemainingMs: 0,
        isAchieved: false,
        isTimedOut: true,
        status: "missed",
      };
    }

    // 2. Hardware disconnect or clinician pause: pause timer & hold detection safely
    if (!isHardwareConnected || isPaused) {
      this.lastActiveTimestamp = null;
      this.enterTimestamp = null;
      return {
        isValid: false,
        distanceMm: null,
        isInTolerance: false,
        holdProgress: 0.0,
        holdTimeRemainingMs: this.confirmationDurationMs,
        holdSecondsCountdown: Math.ceil(this.confirmationDurationMs / 1000),
        timeRemainingMs,
        isAchieved: false,
        isTimedOut: false,
        status: "active",
      };
    }

    // 3. Advance active timer
    if (this.lastActiveTimestamp !== null) {
      const dt = Math.max(0, timestamp - this.lastActiveTimestamp);
      this.elapsedActiveTimeMs += dt;
    }
    this.lastActiveTimestamp = timestamp;

    const updatedRemainingMs = Math.max(0, this.timeLimitMs - this.elapsedActiveTimeMs);

    // 4. Validate physical COP reading
    const dist = calculatePhysicalCopDistance(copXMm, copYMm, targetXMm, targetYMm);
    if (dist === null) {
      this.enterTimestamp = null;
      // If time expired while reading was null/missing, mark missed
      if (this.elapsedActiveTimeMs >= this.timeLimitMs) {
        this.terminalStatus = "missed";
        return {
          isValid: false,
          distanceMm: null,
          isInTolerance: false,
          holdProgress: 0.0,
          holdTimeRemainingMs: 0,
          holdSecondsCountdown: 0,
          timeRemainingMs: 0,
          isAchieved: false,
          isTimedOut: true,
          status: "missed",
        };
      }
      return {
        isValid: false,
        distanceMm: null,
        isInTolerance: false,
        holdProgress: 0.0,
        holdTimeRemainingMs: this.confirmationDurationMs,
        holdSecondsCountdown: Math.ceil(this.confirmationDurationMs / 1000),
        timeRemainingMs: updatedRemainingMs,
        isAchieved: false,
        isTimedOut: false,
        status: "active",
      };
    }

    // 5. Evaluate target tolerance & confirmation hold
    const isInTolerance = dist <= this.toleranceMm;

    if (isInTolerance) {
      if (this.enterTimestamp === null) {
        this.enterTimestamp = timestamp;
      }

      const dwellTime = Math.max(0, timestamp - this.enterTimestamp);
      const holdProgress = Math.min(1.0, dwellTime / this.confirmationDurationMs);
      const holdTimeRemainingMs = Math.max(0, this.confirmationDurationMs - dwellTime);
      const isAchieved = dwellTime >= this.confirmationDurationMs;
      const holdSecondsCountdown = isAchieved ? 0 : Math.max(1, Math.ceil(holdTimeRemainingMs / 1000));

      // RULE: If confirmation completes, success takes strict priority even at the timeout boundary
      if (isAchieved) {
        this.terminalStatus = "completed";
        return {
          isValid: true,
          distanceMm: dist,
          isInTolerance: true,
          holdProgress: 1.0,
          holdTimeRemainingMs: 0,
          holdSecondsCountdown: 0,
          timeRemainingMs: updatedRemainingMs,
          isAchieved: true,
          isTimedOut: false,
          status: "completed",
        };
      }

      // Inside tolerance, but check if time expired before confirmation completed
      if (this.elapsedActiveTimeMs >= this.timeLimitMs) {
        this.terminalStatus = "missed";
        return {
          isValid: true,
          distanceMm: dist,
          isInTolerance: true,
          holdProgress,
          holdTimeRemainingMs,
          holdSecondsCountdown,
          timeRemainingMs: 0,
          isAchieved: false,
          isTimedOut: true,
          status: "missed",
        };
      }

      return {
        isValid: true,
        distanceMm: dist,
        isInTolerance: true,
        holdProgress,
        holdTimeRemainingMs,
        holdSecondsCountdown,
        timeRemainingMs: updatedRemainingMs,
        isAchieved: false,
        isTimedOut: false,
        status: "active",
      };
    }

    // Outside tolerance region
    this.enterTimestamp = null;

    // Check if time expired
    if (this.elapsedActiveTimeMs >= this.timeLimitMs) {
      this.terminalStatus = "missed";
      return {
        isValid: true,
        distanceMm: dist,
        isInTolerance: false,
        holdProgress: 0.0,
        holdTimeRemainingMs: 0,
        holdSecondsCountdown: 0,
        timeRemainingMs: 0,
        isAchieved: false,
        isTimedOut: true,
        status: "missed",
      };
    }

    return {
      isValid: true,
      distanceMm: dist,
      isInTolerance: false,
      holdProgress: 0.0,
      holdTimeRemainingMs: this.confirmationDurationMs,
      holdSecondsCountdown: Math.ceil(this.confirmationDurationMs / 1000),
      timeRemainingMs: updatedRemainingMs,
      isAchieved: false,
      isTimedOut: false,
      status: "active",
    };
  }
}
