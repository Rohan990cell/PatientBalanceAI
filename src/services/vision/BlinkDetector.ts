import { EyeState, OverallEyeState, BlinkDetectionState } from "../../types/vision";

/**
 * BlinkDetector
 *
 * Implements a robust temporal state-machine for blink detection and eye closure tracking.
 *
 * Mathematical Foundations:
 * 1. Eye Aspect Ratio (EAR):
 *    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 * 2. Multi-Signal Fusion:
 *    Fuses continuous EAR geometry with blendshape neural probabilities.
 * 3. Temporal State Machine:
 *    OPEN -> CLOSED -> OPEN.
 *    - Rejects single-frame noise (minimum duration >= 45ms).
 *    - Rejects prolonged closure / sleep (> 600ms is classified as prolonged closure, not a quick blink).
 *    - Debounce window (>= 180ms) prevents double-triggering on shaky tracking.
 * 4. Rolling 60-Second Window:
 *    Computes clinical blink rate (blinks per minute).
 */
export class BlinkDetector {
  // Configurable EAR Thresholds
  private earCloseThreshold = 0.21; // EAR below this is closed
  private earOpenThreshold = 0.25;  // EAR above this is open

  // Fallback Blendshape Thresholds (0.0 = open, 1.0 = closed)
  private readonly BLENDSHAPE_CLOSE_THRESHOLD = 0.48;
  private readonly BLENDSHAPE_OPEN_THRESHOLD = 0.30;

  // Temporal timing constraints (in milliseconds)
  private readonly MIN_CLOSED_DURATION_MS = 45;   // ~1.5 - 2 frames minimum
  private readonly MAX_CLOSED_DURATION_MS = 600;  // > 600ms is prolonged closure
  private readonly DEBOUNCE_INTERVAL_MS = 180;    // Minimum gap between successive blinks

  // Eye states
  private leftState: EyeState = "UNKNOWN";
  private rightState: EyeState = "UNKNOWN";
  private overallState: OverallEyeState = "UNKNOWN";

  // Temporal state tracking
  private isEyesCurrentlyClosed = false;
  private closedStartTime: number | null = null;
  private isBlinkCandidate = false;

  // Output metrics
  private blinkCount = 0;
  private lastBlinkTimestamp: number | null = null;
  private lastBlinkDurationMs: number | null = null;
  private blinkTimestamps: number[] = []; // Timestamps of recent blinks for rolling rate

  /**
   * Set custom EAR threshold (calibratable by patient / clinician)
   */
  public setEarThreshold(threshold: number): void {
    this.earCloseThreshold = Math.max(0.12, Math.min(0.32, threshold));
    this.earOpenThreshold = this.earCloseThreshold + 0.04;
  }

  public getEarThreshold(): number {
    return this.earCloseThreshold;
  }

  /**
   * Reset blink counter and temporal state machine
   */
  public reset(): void {
    this.blinkCount = 0;
    this.lastBlinkTimestamp = null;
    this.lastBlinkDurationMs = null;
    this.blinkTimestamps = [];
    this.isEyesCurrentlyClosed = false;
    this.closedStartTime = null;
    this.isBlinkCandidate = false;
    this.leftState = "UNKNOWN";
    this.rightState = "UNKNOWN";
    this.overallState = "UNKNOWN";
  }

  /**
   * Process a single video frame with both EAR geometry and Blendshape closure scores.
   *
   * @param leftScore Blendshape eye closure score [0.0 = open, 1.0 = closed]
   * @param rightScore Blendshape eye closure score [0.0 = open, 1.0 = closed]
   * @param leftEAR Geometric Eye Aspect Ratio (or null if face mesh unavailable)
   * @param rightEAR Geometric Eye Aspect Ratio (or null if face mesh unavailable)
   * @param now Performance timestamp
   */
  public processFrame(
    leftScore: number | null,
    rightScore: number | null,
    leftEAR: number | null = null,
    rightEAR: number | null = null,
    now: number = performance.now()
  ): boolean {
    if ((leftScore === null && leftEAR === null) || (rightScore === null && rightEAR === null)) {
      this.leftState = "UNKNOWN";
      this.rightState = "UNKNOWN";
      this.overallState = "UNKNOWN";
      this.isEyesCurrentlyClosed = false;
      this.closedStartTime = null;
      this.isBlinkCandidate = false;
      return false;
    }

    // 1. Classify individual eyes using EAR if available, otherwise blendshape score
    this.leftState = this.classifySingleEye(leftEAR, leftScore, this.leftState);
    this.rightState = this.classifySingleEye(rightEAR, rightScore, this.rightState);

    // 2. Determine overall eye state
    const bothClosed = this.leftState === "CLOSED" && this.rightState === "CLOSED";
    const bothOpen = this.leftState === "OPEN" && this.rightState === "OPEN";

    if (bothClosed) {
      this.overallState = "EYES CLOSED";
    } else if (bothOpen) {
      this.overallState = "EYES OPEN";
    } else if (this.leftState === "CLOSED" || this.rightState === "CLOSED") {
      // One closed, one open (e.g. winking or asymmetrical blink)
      this.overallState = "EYES OPEN";
    } else {
      this.overallState = "UNKNOWN";
    }

    let blinkTriggered = false;

    // 3. Temporal Sequence Evaluation: OPEN -> CLOSED -> OPEN
    if (bothClosed) {
      if (!this.isEyesCurrentlyClosed) {
        // Transition: OPEN -> CLOSED
        this.isEyesCurrentlyClosed = true;
        this.closedStartTime = now;
        this.isBlinkCandidate = true;
      }
    } else if (bothOpen) {
      if (this.isEyesCurrentlyClosed && this.closedStartTime !== null) {
        // Transition: CLOSED -> OPEN
        const closedDuration = now - this.closedStartTime;

        // Check if debounce time has elapsed since previous blink
        const debouncePassed =
          this.lastBlinkTimestamp === null ||
          now - this.lastBlinkTimestamp >= this.DEBOUNCE_INTERVAL_MS;

        // Verify duration is within blink bounds (not single frame, not prolonged sleep)
        if (
          this.isBlinkCandidate &&
          closedDuration >= this.MIN_CLOSED_DURATION_MS &&
          closedDuration <= this.MAX_CLOSED_DURATION_MS &&
          debouncePassed
        ) {
          // Valid blink detected!
          this.blinkCount += 1;
          this.lastBlinkTimestamp = now;
          this.lastBlinkDurationMs = Math.round(closedDuration);
          this.blinkTimestamps.push(now);
          blinkTriggered = true;
        }

        // Reset closed state
        this.isEyesCurrentlyClosed = false;
        this.closedStartTime = null;
        this.isBlinkCandidate = false;
      }
    }

    // 4. Prune rolling blink timestamps older than 60 seconds
    const cutoff = now - 60000;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff) {
      this.blinkTimestamps.shift();
    }

    return blinkTriggered;
  }

  /**
   * Classify eye state with hysteresis combining EAR and blendshape score
   */
  private classifySingleEye(
    ear: number | null,
    score: number | null,
    previousState: EyeState
  ): EyeState {
    // If EAR is available and valid, prioritize EAR geometry
    if (ear !== null && ear > 0) {
      if (ear <= this.earCloseThreshold) {
        return "CLOSED";
      }
      if (ear >= this.earOpenThreshold) {
        return "OPEN";
      }
      return previousState !== "UNKNOWN" ? previousState : "OPEN";
    }

    // Fallback to blendshape score
    if (score !== null) {
      if (score >= this.BLENDSHAPE_CLOSE_THRESHOLD) {
        return "CLOSED";
      }
      if (score <= this.BLENDSHAPE_OPEN_THRESHOLD) {
        return "OPEN";
      }
      return previousState !== "UNKNOWN" ? previousState : "OPEN";
    }

    return "UNKNOWN";
  }

  /**
   * Calculate rolling blink rate per minute
   */
  public getBlinkRatePerMinute(): number {
    return this.blinkTimestamps.length;
  }

  /**
   * Get current eye states and blink snapshot
   */
  public getState(): {
    leftState: EyeState;
    rightState: EyeState;
    overallState: OverallEyeState;
    blink: BlinkDetectionState;
  } {
    return {
      leftState: this.leftState,
      rightState: this.rightState,
      overallState: this.overallState,
      blink: {
        blinkCount: this.blinkCount,
        lastBlinkTimestamp: this.lastBlinkTimestamp,
        isCurrentlyBlinking: this.isEyesCurrentlyClosed,
        lastBlinkDurationMs: this.lastBlinkDurationMs,
        blinkRatePerMinute: this.getBlinkRatePerMinute(),
      },
    };
  }
}
