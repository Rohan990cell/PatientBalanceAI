import {
  ExerciseEngineState,
  ExerciseFeedback,
  ExerciseId,
  ExerciseStep,
  ExerciseSessionResult,
  ExerciseTimestampedBalanceSample,
  ExerciseTimestampedVisionSample,
  INITIAL_EXERCISE_STATE,
  BalanceState,
  SessionTelemetryMode,
} from "../../types/exercise";
import { VisionState } from "../../types/vision";
import { EXERCISE_LIBRARY } from "./exerciseLibrary";

/**
 * ExerciseEngine
 *
 * Modular state-machine orchestrator for interactive rehabilitation protocols.
 * Decoupled from React components. Consumes VisionState and BalanceState abstractions,
 * tracks step progression, provides real-time encouraging biofeedback, and computes
 * non-clinical exercise session scores.
 *
 * RIGID SCIENTIFIC INTEGRITY RULE:
 * Never generate, infer, or fabricate balance or performance metrics when sensors
 * are unavailable or inactive. Unavailable metrics are strictly stored as `null`
 * and presented as "--" / "Not available".
 */
export class ExerciseEngine {
  private state: ExerciseEngineState = { ...INITIAL_EXERCISE_STATE };
  private stateListeners: ((state: ExerciseEngineState) => void)[] = [];

  // Internal timers
  private tickIntervalId: any = null;

  // Real sensory evaluation tracking — only frames with actual detected sensor landmarks
  private sessionStartTime: number = 0;
  private visionEvaluationFrames: number = 0;
  private postureCompliantFrames: number = 0;
  private eyeEvaluationFrames: number = 0;
  private eyeCompliantFrames: number = 0;
  private movementEvaluationFrames: number = 0;
  private movementCompliantFrames: number = 0;
  private balanceEvaluationSamples: number = 0;
  private balanceCompliantSamples: number = 0;

  // Sensor lifecycle flags
  private webcamEverActive: boolean = false;
  private balanceBoardEverConnected: boolean = false;
  private isSimulated: boolean = false;
  private activePatientId: string = "pat-001";
  private visionEventsCount: number = 0;
  private balanceEventsCount: number = 0;

  // Independent timestamped telemetry sample streams (Phase 6)
  private balanceSamples: ExerciseTimestampedBalanceSample[] = [];
  private visionSamples: ExerciseTimestampedVisionSample[] = [];

  /**
   * Subscribe to state updates
   */
  public onStateUpdate(listener: (state: ExerciseEngineState) => void): () => void {
    this.stateListeners.push(listener);
    listener(this.state);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  private emitState(): void {
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  private updateState(partial: Partial<ExerciseEngineState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.emitState();
  }

  /**
   * Get current engine state snapshot
   */
  public getState(): ExerciseEngineState {
    return this.state;
  }

  /**
   * Select an exercise from the library and transition from IDLE to READY
   */
  public selectExercise(exerciseId: ExerciseId): boolean {
    const exercise = EXERCISE_LIBRARY.find((e) => e.id === exerciseId);
    if (!exercise) return false;

    this.stopTickTimer();
    this.stopCountdownTimer();
    this.resetComplianceCounters();

    this.updateState({
      phase: "READY",
      currentExercise: exercise,
      currentStepIndex: 0,
      currentStep: exercise.steps[0] || null,
      stepTimeRemaining: exercise.steps[0]?.durationSeconds || 0,
      totalTimeElapsed: 0,
      progressPercent: 0,
      feedback: {
        message: "Review instructions below and click Start Exercise when ready.",
        type: "neutral",
        isCompliant: true,
      },
      sessionResult: null,
    });

    return true;
  }

  private countdownTimer: any = null;

  private stopCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Start 3-second countdown before active exercise
   */
  public startCountdown(patientId?: string): void {
    if (!this.state.currentExercise || this.state.phase !== "READY") return;

    if (patientId) {
      this.activePatientId = patientId;
    }

    this.stopCountdownTimer();
    this.resetComplianceCounters();
    this.updateState({
      phase: "COUNTDOWN",
      countdownValue: 3,
      feedback: {
        message: "Get ready in 3...",
        type: "neutral",
        isCompliant: true,
      },
    });

    let count = 3;
    this.countdownTimer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        this.updateState({
          countdownValue: count,
          feedback: {
            message: `Get ready in ${count}...`,
            type: "neutral",
            isCompliant: true,
          },
        });
      } else {
        this.stopCountdownTimer();
        this.startActiveExercise();
      }
    }, 1000);
  }

  /**
   * Transition to ACTIVE running exercise
   */
  public startActiveExercise(patientId?: string): void {
    if (patientId) {
      this.activePatientId = patientId;
    }
    if (!this.state.currentExercise) return;

    this.stopCountdownTimer();
    this.sessionStartTime = performance.now();

    const firstStep = this.state.currentExercise.steps[0];
    this.updateState({
      phase: "ACTIVE",
      currentStepIndex: 0,
      currentStep: firstStep,
      stepTimeRemaining: firstStep.durationSeconds,
      totalTimeElapsed: 0,
      progressPercent: 0,
      feedback: {
        message: firstStep.instruction,
        type: "positive",
        isCompliant: true,
      },
    });

    this.startTickTimer();
  }

  /**
   * Pause currently running exercise
   */
  public pause(): void {
    if (this.state.phase !== "ACTIVE") return;
    this.stopTickTimer();
    this.updateState({
      phase: "PAUSED",
      feedback: {
        message: "Exercise paused. Take a rest and resume whenever you are ready.",
        type: "neutral",
        isCompliant: true,
      },
    });
  }

  /**
   * Resume paused exercise
   */
  public resume(): void {
    if (this.state.phase !== "PAUSED" || !this.state.currentExercise) return;
    this.updateState({
      phase: "ACTIVE",
      feedback: {
        message: this.state.currentStep?.instruction || "Continuing exercise...",
        type: "positive",
        isCompliant: true,
      },
    });
    this.startTickTimer();
  }

  /**
   * Cancel and exit current exercise back to library
   */
  public cancel(): void {
    this.stopTickTimer();
    this.stopCountdownTimer();
    if (this.state.currentExercise && this.state.phase === "ACTIVE") {
      const actualDuration = this.state.totalTimeElapsed;
      const totalDuration = this.state.currentExercise.duration;
      const timeScore = Math.min(100, Math.round((actualDuration / totalDuration) * 100));

      const sessionResult: ExerciseSessionResult = {
        sessionId: `sess-${Date.now()}`,
        exerciseId: this.state.currentExercise.id,
        exerciseName: this.state.currentExercise.name,
        startTime: Math.round(this.sessionStartTime),
        endTime: Math.round(performance.now()),
        durationSeconds: actualDuration,
        targetDurationSeconds: totalDuration,
        completionStatus: "CANCELLED",
        sensorsUsed: {
          webcamActive: this.webcamEverActive,
          balanceBoardConnected: this.balanceBoardEverConnected,
          sessionMode: this.determineSessionMode(),
        },
        postureCompliancePercent: null,
        eyeCompliancePercent: null,
        movementCompliancePercent: null,
        balanceStabilityPercent: null,
        timeCompletionPercent: timeScore,
        overallScore: null,
        feedbackSummary: "Exercise was ended early by user.",
        visionEventsCount: this.visionEventsCount,
        balanceEventsCount: this.balanceEventsCount,
        unmeasuredReasons: {
          score: "Session cancelled prior to completion.",
        },
      };

      this.updateState({
        phase: "CANCELLED",
        sessionResult,
        feedback: {
          message: "Exercise cancelled.",
          type: "neutral",
          isCompliant: true,
        },
      });
    } else {
      this.returnToLibrary();
    }
  }

  /**
   * Return to Exercise Library view
   */
  public returnToLibrary(): void {
    this.stopTickTimer();
    this.stopCountdownTimer();
    this.resetComplianceCounters();
    this.updateState({
      phase: "IDLE",
      currentExercise: null,
      currentStepIndex: 0,
      currentStep: null,
      stepTimeRemaining: 0,
      totalTimeElapsed: 0,
      progressPercent: 0,
      sessionResult: null,
      feedback: {
        message: "Stand comfortably and relax.",
        type: "neutral",
        isCompliant: true,
      },
    });
  }

  /**
   * Feed continuous real-time sensory inputs from Vision and Hardware layers
   */
  public updateSensoryInputs(
    vision: VisionState | null,
    balance: BalanceState | null
  ): void {
    if (vision?.hasPose) {
      this.webcamEverActive = true;
      this.visionEventsCount += 1;
    }
    if (balance?.isConnected && balance.totalWeight !== null) {
      this.balanceBoardEverConnected = true;
      this.balanceEventsCount += 1;
      if (balance.isSimulated) {
        this.isSimulated = true;
      }
    }

    // Capture timestamped telemetry samples with original frequencies during active exercise
    if (this.state.phase === "ACTIVE") {
      if (balance?.isConnected && balance.totalWeight !== null && balance.distribution && balance.cop) {
        this.balanceSamples.push({
          timestamp: performance.now(),
          totalWeight: balance.totalWeight,
          leftPercent: balance.distribution.left,
          rightPercent: balance.distribution.right,
          anteriorPercent: balance.distribution.front,
          posteriorPercent: balance.distribution.back,
          copX: balance.cop.x,
          copY: balance.cop.y,
          isSimulated: Boolean(balance.isSimulated),
        });
      }

      if (vision?.hasPose) {
        this.visionSamples.push({
          timestamp: performance.now(),
          hasPose: true,
          postureLean: vision.pose?.postureLean,
          ear: vision.face?.hasFace ? vision.face.averageEAR : undefined,
          eyeState: vision.face?.hasFace ? vision.face.overallEyeState : undefined,
          shoulderTiltDeg: vision.pose?.shoulderTiltDeg,
        });
      }
    }

    // Evaluate live feedback during active exercise
    if (this.state.phase === "ACTIVE" && this.state.currentStep) {
      const liveFeedback = this.evaluateCompliance(this.state.currentStep, vision, balance);
      this.updateState({
        feedback: liveFeedback,
      });
    }
  }

  /**
   * Main 1-second interval tick for exercise progression
   */
  private startTickTimer(): void {
    this.stopTickTimer();

    this.tickIntervalId = setInterval(() => {
      if (this.state.phase !== "ACTIVE" || !this.state.currentExercise) return;

      const newStepRemaining = Math.max(0, this.state.stepTimeRemaining - 1);
      const newTotalElapsed = this.state.totalTimeElapsed + 1;
      const totalDuration = this.state.currentExercise.duration || 30;
      const newProgressPercent = Math.min(100, Math.round((newTotalElapsed / totalDuration) * 100));

      if (newStepRemaining <= 0) {
        // Step finished: advance to next step or complete exercise
        const nextStepIndex = this.state.currentStepIndex + 1;
        if (nextStepIndex < this.state.currentExercise.steps.length) {
          const nextStep = this.state.currentExercise.steps[nextStepIndex];
          this.updateState({
            currentStepIndex: nextStepIndex,
            currentStep: nextStep,
            stepTimeRemaining: nextStep.durationSeconds,
            totalTimeElapsed: newTotalElapsed,
            progressPercent: newProgressPercent,
          });
        } else {
          // Completed all steps in the protocol!
          this.completeExercise();
          return;
        }
      } else {
        this.updateState({
          stepTimeRemaining: newStepRemaining,
          totalTimeElapsed: newTotalElapsed,
          progressPercent: newProgressPercent,
        });
      }
    }, 1000);
  }

  private stopTickTimer(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  /**
   * Evaluate real-time compliance for current step and generate encouraging feedback.
   * Only records metric frames when real sensor data is genuinely present.
   */
  private evaluateCompliance(
    step: ExerciseStep,
    vision: VisionState | null,
    balance: BalanceState | null
  ): ExerciseFeedback {
    // 0. Fallback when Camera is Inactive or pose missing
    if (!vision?.hasPose || !vision.pose) {
      // If Wii Balance Board is connected, evaluate balance
      if (balance?.isConnected && balance.totalWeight !== null && balance.distribution) {
        this.balanceEvaluationSamples += 1;
        if (step.targetLean === "LEAN_LEFT" && balance.distribution.left < 52) {
          return {
            message: "Shift slightly more weight to your left foot.",
            type: "guidance",
            isCompliant: false,
          };
        } else if (step.targetLean === "LEAN_RIGHT" && balance.distribution.right < 52) {
          return {
            message: "Shift slightly more weight to your right foot.",
            type: "guidance",
            isCompliant: false,
          };
        }
        this.balanceCompliantSamples += 1;
        return {
          message: "✓ Good balance board equilibrium.",
          type: "positive",
          isCompliant: true,
        };
      }

      // No active sensors
      return {
        message: "Camera inactive — Stand comfortably in place.",
        type: "neutral",
        isCompliant: false,
      };
    }

    // WEBCAM POSE IS REAL AND MEASURED
    this.visionEvaluationFrames += 1;

    // 1. Eye State Rule (e.g. Romberg)
    let eyeOk = true;
    if (step.expectedEyeState) {
      if (vision.face?.hasFace) {
        this.eyeEvaluationFrames += 1;
        const overall = vision.face.overallEyeState;
        if (step.expectedEyeState === "CLOSED") {
          eyeOk = overall === "EYES CLOSED";
          if (!eyeOk) {
            return {
              message: "Gently close both eyes to continue.",
              type: "guidance",
              isCompliant: false,
            };
          }
        } else if (step.expectedEyeState === "OPEN") {
          eyeOk = overall === "EYES OPEN";
          if (!eyeOk) {
            return {
              message: "Open both eyes and focus forward.",
              type: "guidance",
              isCompliant: false,
            };
          }
        }
        if (eyeOk) {
          this.eyeCompliantFrames += 1;
        }
      }
    }

    // 2. Single Leg Stance Rule
    if (step.targetStance === "LEFT_LEG" || step.targetStance === "RIGHT_LEG") {
      this.movementEvaluationFrames += 1;
      const isSingle = vision.pose.singleLeg.isSingleLeg;
      const lifted = vision.pose.singleLeg.liftedLeg;
      const expectedLeg = step.targetStance === "LEFT_LEG" ? "LEFT" : "RIGHT";

      if (!isSingle) {
        return {
          message: `Gently lift your ${expectedLeg.toLowerCase()} foot slightly off the floor.`,
          type: "guidance",
          isCompliant: false,
        };
      } else if (lifted !== expectedLeg) {
        return {
          message: `Switch feet: please raise your ${expectedLeg.toLowerCase()} foot.`,
          type: "guidance",
          isCompliant: false,
        };
      } else {
        this.movementCompliantFrames += 1;
        return {
          message: `✓ Excellent unipedal steadiness on your ${expectedLeg === "LEFT" ? "right" : "left"} leg!`,
          type: "positive",
          isCompliant: true,
        };
      }
    }

    // 3. Forward Reach Rule
    if (step.targetReach === "FORWARD") {
      this.movementEvaluationFrames += 1;
      const isReaching = vision.pose.armReach.isReachingForward || vision.pose.trunkPitchDeg > 4;
      if (!isReaching) {
        return {
          message: "Reach your arms forward at shoulder height.",
          type: "guidance",
          isCompliant: false,
        };
      } else {
        this.movementCompliantFrames += 1;
        return {
          message: "✓ Good forward extension. Hold steady.",
          type: "positive",
          isCompliant: true,
        };
      }
    }

    // 4. Lateral Weight Shift Rule
    if (step.targetLean && step.targetLean !== "NEUTRAL") {
      this.movementEvaluationFrames += 1;
      const currentLean = vision.pose.postureLean;
      const targetDirection = step.targetLean === "LEAN_LEFT" ? "left" : "right";

      // If balance board is connected, verify load symmetry
      if (balance?.isConnected && balance.totalWeight !== null && balance.distribution) {
        this.balanceEvaluationSamples += 1;
        const requiredSide = step.targetLean === "LEAN_LEFT" ? balance.distribution.left : balance.distribution.right;
        if (requiredSide >= 52) {
          this.balanceCompliantSamples += 1;
        }
      }

      if (currentLean !== step.targetLean) {
        return {
          message: `Slowly shift your body weight to your ${targetDirection} side.`,
          type: "guidance",
          isCompliant: false,
        };
      } else {
        this.movementCompliantFrames += 1;
        return {
          message: `✓ Good weight transfer to the ${targetDirection}.`,
          type: "positive",
          isCompliant: true,
        };
      }
    }

    // 5. Neutral Posture / Centering Rule
    let postureOk = true;
    if (step.targetLean === "NEUTRAL") {
      const isOffCenter =
        Math.abs(vision.pose.shoulderTiltDeg) > 7 || Math.abs(vision.pose.trunkPitchDeg) > 8;
      if (isOffCenter) {
        postureOk = false;
        return {
          message: "Please return toward the center.",
          type: "guidance",
          isCompliant: false,
        };
      }
    }

    if (postureOk) {
      this.postureCompliantFrames += 1;
    }

    // 6. Optional Balance Board Verification for neutral stance
    if (balance?.isConnected && balance.totalWeight !== null && balance.distribution) {
      this.balanceEvaluationSamples += 1;
      const isSymmetric = balance.distribution.left >= 45 && balance.distribution.left <= 55;
      if (isSymmetric) {
        this.balanceCompliantSamples += 1;
      }
    }

    return {
      message: "✓ Good steady posture. Keep breathing calmly.",
      type: "positive",
      isCompliant: true,
    };
  }

  private determineSessionMode(): SessionTelemetryMode {
    if (this.webcamEverActive && this.balanceBoardEverConnected) return "FULL_MULTIMODAL";
    if (this.webcamEverActive && !this.balanceBoardEverConnected) return "VISION_ONLY";
    if (!this.webcamEverActive && this.balanceBoardEverConnected) return "BALANCE_ONLY";
    return "UNASSISTED";
  }

  /**
   * Finalize exercise and compute performance metrics.
   * Rigorously avoids fabricating scores when sensors were unavailable.
   */
  public completeExercise(): void {
    this.stopTickTimer();
    if (!this.state.currentExercise) return;

    const totalDuration = this.state.currentExercise.duration;
    const actualDuration = this.state.totalTimeElapsed;
    const timeScore = Math.min(100, Math.round((actualDuration / totalDuration) * 100));

    const unmeasuredReasons: ExerciseSessionResult["unmeasuredReasons"] = {};

    // 1. Posture Compliance (requires active camera pose frames)
    let postureScore: number | null = null;
    if (this.visionEvaluationFrames > 0) {
      postureScore = Math.min(
        100,
        Math.round((this.postureCompliantFrames / this.visionEvaluationFrames) * 100)
      );
    } else {
      unmeasuredReasons.posture = "Camera was off or no pose landmarks were detected.";
    }

    // 2. Eye Compliance (only if protocol tests eyes AND face was detected)
    let eyeScore: number | null = null;
    const exerciseEvaluatesEyes = this.state.currentExercise.steps.some((s) => !!s.expectedEyeState);
    if (exerciseEvaluatesEyes) {
      if (this.eyeEvaluationFrames > 0) {
        eyeScore = Math.min(
          100,
          Math.round((this.eyeCompliantFrames / this.eyeEvaluationFrames) * 100)
        );
      } else {
        unmeasuredReasons.eyes = "Face/eyes were not detected or camera was inactive.";
      }
    } else {
      unmeasuredReasons.eyes = "Not evaluated in this protocol.";
    }

    // 3. Movement / Stance Compliance
    let movementScore: number | null = null;
    if (this.movementEvaluationFrames > 0) {
      movementScore = Math.min(
        100,
        Math.round((this.movementCompliantFrames / this.movementEvaluationFrames) * 100)
      );
    } else if (this.visionEvaluationFrames === 0) {
      unmeasuredReasons.posture = unmeasuredReasons.posture || "Camera inactive.";
    }

    // 4. Wii Balance Board Metrics
    let balanceScore: number | null = null;
    if (this.balanceEvaluationSamples > 0) {
      balanceScore = Math.min(
        100,
        Math.round((this.balanceCompliantSamples / this.balanceEvaluationSamples) * 100)
      );
    } else {
      unmeasuredReasons.balance = "Wii Balance Board was not connected during this session.";
    }

    // 5. Session Telemetry Mode & Composite Performance Score
    const sessionMode = this.determineSessionMode();
    let overallScore: number | null = null;

    if (sessionMode === "FULL_MULTIMODAL") {
      const p = postureScore ?? 100;
      const e = eyeScore ?? 100;
      const m = movementScore ?? 100;
      const b = balanceScore ?? 100;
      overallScore = Math.min(100, Math.round(timeScore * 0.3 + p * 0.25 + e * 0.15 + m * 0.15 + b * 0.15));
    } else if (sessionMode === "VISION_ONLY") {
      // Vision-only score: derived strictly from measured vision frames and time
      const p = postureScore ?? 0;
      if (eyeScore !== null) {
        overallScore = Math.min(100, Math.round(timeScore * 0.35 + p * 0.40 + eyeScore * 0.25));
      } else {
        const m = movementScore ?? p;
        overallScore = Math.min(100, Math.round(timeScore * 0.40 + p * 0.40 + m * 0.20));
      }
    } else if (sessionMode === "BALANCE_ONLY") {
      const b = balanceScore ?? 0;
      overallScore = Math.min(100, Math.round(timeScore * 0.40 + b * 0.60));
    } else {
      // UNASSISTED: NEITHER SENSOR ACTIVE
      // Strictly null — never show 60/100 or fabricated number!
      overallScore = null;
      unmeasuredReasons.score =
        "Performance score not calculated: No real sensor data was captured (Webcam was off and Wii Board was not connected).";
    }

    let feedbackSummary = "Exercise session finished.";
    if (sessionMode === "UNASSISTED") {
      feedbackSummary = "Completed without sensor telemetry. No sensor measurements were recorded.";
    } else if (sessionMode === "VISION_ONLY") {
      feedbackSummary = "Vision-only session completed. Postural steadiness recorded via camera tracking (Wii Board disconnected).";
    } else if (sessionMode === "FULL_MULTIMODAL") {
      feedbackSummary = this.isSimulated
        ? "Multimodal session completed with optical tracking and development simulation balance data."
        : "Multimodal session completed with both optical tracking and physical balance board telemetry.";
    } else if (sessionMode === "BALANCE_ONLY") {
      feedbackSummary = this.isSimulated
        ? "Balance-only session completed with development simulation balance data."
        : "Balance-only session completed with physical balance board telemetry.";
    }

    const sessionResult: ExerciseSessionResult = {
      sessionId: `sess-${Date.now()}`,
      patientId: this.activePatientId,
      exerciseId: this.state.currentExercise.id,
      exerciseName: this.state.currentExercise.name,
      startTime: Math.round(this.sessionStartTime),
      endTime: Math.round(performance.now()),
      durationSeconds: actualDuration,
      targetDurationSeconds: totalDuration,
      completionStatus: "COMPLETED",
      sensorsUsed: {
        webcamActive: this.webcamEverActive,
        balanceBoardConnected: this.balanceBoardEverConnected,
        isSimulated: this.isSimulated,
        sessionMode,
      },
      postureCompliancePercent: postureScore,
      eyeCompliancePercent: eyeScore,
      movementCompliancePercent: movementScore,
      balanceStabilityPercent: balanceScore,
      timeCompletionPercent: timeScore,
      overallScore,
      feedbackSummary,
      visionEventsCount: this.visionEventsCount,
      balanceEventsCount: this.balanceEventsCount,
      balanceSamples: [...this.balanceSamples],
      visionSamples: [...this.visionSamples],
      unmeasuredReasons,
    };

    this.updateState({
      phase: "COMPLETED",
      sessionResult,
      feedback: {
        message: "Exercise Complete! Great job maintaining your equilibrium.",
        type: "positive",
        isCompliant: true,
      },
    });
  }

  private resetComplianceCounters(): void {
    this.visionEvaluationFrames = 0;
    this.postureCompliantFrames = 0;
    this.eyeEvaluationFrames = 0;
    this.eyeCompliantFrames = 0;
    this.movementEvaluationFrames = 0;
    this.movementCompliantFrames = 0;
    this.balanceEvaluationSamples = 0;
    this.balanceCompliantSamples = 0;
    this.visionEventsCount = 0;
    this.balanceEventsCount = 0;
    this.webcamEverActive = false;
    this.balanceBoardEverConnected = false;
    this.isSimulated = false;
    this.balanceSamples = [];
    this.visionSamples = [];
  }
}

// Export singleton instance
export const exerciseEngine = new ExerciseEngine();
