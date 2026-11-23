import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Home,
  Gamepad2,
  Scale,
  MoveHorizontal,
  CheckCircle2,
  AlertCircle,
  Wifi,
  RefreshCw,
  RotateCcw,
  Target,
  Trophy,
  Clock,
  Pause,
  Play,
  XCircle,
  Volume2,
  VolumeX,
  Timer,
  Activity,
  Award,
  Download,
} from "lucide-react";
import { PatientProfile } from "../../types/patient";
import { useBalanceBoard } from "../../context/HardwareContext";
import { VisualBalanceBoard } from "../balance/VisualBalanceBoard";
import { mapCopToBoard } from "../../utils/copMapping";
import { PdfReportService, GeneratePdfResult } from "../../services/pdfReportService";
import {
  BALLOON_TARGET_SPECS,
  BalloonTargetDefinition,
  BalloonTargetDetector,
  CenterPositionDetector,
  DEFAULT_TARGET_TOLERANCE_MM,
  DEFAULT_CENTER_TOLERANCE_MM,
  DEFAULT_CENTER_HOLD_DURATION_MS,
  DEFAULT_CONFIRMATION_DURATION_MS,
  DEFAULT_TARGET_TIME_LIMIT_MS,
  TargetOutcomeStatus,
  TargetAttemptResult,
  RecordedCopPoint,
  computeGameSessionSummary,
  GameSessionSummary,
} from "../../utils/targetAchievingGame";
import { TargetGameAudioService } from "../../utils/targetGameAudio";

export interface TargetAchievingGameExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
  onResultFullScreenChange?: (isFullScreen: boolean) => void;
  onNavigateToDashboard?: () => void;
}

interface BurstParticle {
  id: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
}

/**
 * Generates a randomized permutation of all 4 balloon targets.
 * Ensures every balloon appears exactly once and avoids repeating the same sequence back-to-back.
 */
function generateRandomSequence(previousSequence?: number[]): number[] {
  const ids = [1, 2, 3, 4];
  let attempts = 0;
  let result = [...ids];

  do {
    // Fisher-Yates shuffle algorithm
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    attempts++;
  } while (
    previousSequence &&
    previousSequence.length === result.length &&
    result.every((val, idx) => val === previousSequence[idx]) &&
    attempts < 10
  );

  return result;
}

export const TargetAchievingGameExercise: React.FC<TargetAchievingGameExerciseProps> = ({
  patient,
  onExit,
  onResultFullScreenChange,
  onNavigateToDashboard,
}) => {
  const { status, reading, scanAndConnect } = useBalanceBoard();

  // Strict physical hardware connection & data validity
  const isConnected = Boolean(status.isConnected);
  const hasLiveReading = Boolean(
    isConnected &&
    reading &&
    typeof reading.totalWeight === "number" &&
    Number.isFinite(reading.totalWeight) &&
    typeof reading.copXMm === "number" &&
    Number.isFinite(reading.copXMm) &&
    typeof reading.copYMm === "number" &&
    Number.isFinite(reading.copYMm)
  );

  // Target sequence & session state machine
  const [sequence, setSequence] = useState<number[]>(() => generateRandomSequence());
  const [currentTargetIndex, setCurrentTargetIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isSessionComplete, setIsSessionComplete] = useState<boolean>(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);

  // Per-target recorded attempts & outcomes
  const [balloonOutcomes, setBalloonOutcomes] = useState<Map<number, TargetOutcomeStatus>>(() => new Map());
  const [targetAttempts, setTargetAttempts] = useState<TargetAttemptResult[]>([]);
  const recordedTrajectoryRef = useRef<RecordedCopPoint[]>([]);
  const sessionStartTimeRef = useRef<number>(Date.now());
  const targetStartTimeRef = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>(`game_${Date.now()}`);

  // PDF report export state
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfResult, setPdfResult] = useState<GeneratePdfResult | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Transition & live sensor refs for steady 30Hz frame updates
  const isTransitioningRef = useRef<boolean>(false);
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const hasLiveReadingRef = useRef(hasLiveReading);
  hasLiveReadingRef.current = hasLiveReading;

  // Transient animation states
  const [poppingBalloonId, setPoppingBalloonId] = useState<number | null>(null);
  const [deflatingBalloonId, setDeflatingBalloonId] = useState<number | null>(null);
  const [burstParticles, setBurstParticles] = useState<BurstParticle[]>([]);
  const [missedFeedbackMessage, setMissedFeedbackMessage] = useState<string | null>(null);
  const [successFeedbackMessage, setSuccessFeedbackMessage] = useState<string | null>(null);

  // Audio service ref
  const audioRef = useRef<TargetGameAudioService>(new TargetGameAudioService(false));

  // Sync mute state with audio service
  useEffect(() => {
    audioRef.current.setMuted(!isSoundEnabled);
  }, [isSoundEnabled]);

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      audioRef.current.dispose();
    };
  }, []);

  // Centre starting confirmation state (Step 2)
  const [isCenterConfirmed, setIsCenterConfirmed] = useState<boolean>(false);
  const [centerDetectionState, setCenterDetectionState] = useState<{
    distanceMm: number | null;
    isInCenterZone: boolean;
    holdProgress: number;
    holdSecondsCountdown: number;
    isConfirmed: boolean;
  }>({
    distanceMm: null,
    isInCenterZone: false,
    holdProgress: 0.0,
    holdSecondsCountdown: Math.ceil(DEFAULT_CENTER_HOLD_DURATION_MS / 1000),
    isConfirmed: false,
  });

  const centerDetectorRef = useRef<CenterPositionDetector>(
    new CenterPositionDetector(DEFAULT_CENTER_TOLERANCE_MM, DEFAULT_CENTER_HOLD_DURATION_MS)
  );

  // Real-time COP target detection & timer state
  const [detectionState, setDetectionState] = useState<{
    distanceMm: number | null;
    isInTolerance: boolean;
    holdProgress: number;
    holdTimeRemainingMs: number;
    holdSecondsCountdown: number;
    timeRemainingMs: number;
    isAchieved: boolean;
    isTimedOut: boolean;
    status: TargetOutcomeStatus;
  }>({
    distanceMm: null,
    isInTolerance: false,
    holdProgress: 0.0,
    holdTimeRemainingMs: DEFAULT_CONFIRMATION_DURATION_MS,
    holdSecondsCountdown: Math.ceil(DEFAULT_CONFIRMATION_DURATION_MS / 1000),
    timeRemainingMs: DEFAULT_TARGET_TIME_LIMIT_MS,
    isAchieved: false,
    isTimedOut: false,
    status: "active",
  });

  // Persistent detector instance
  const detectorRef = useRef<BalloonTargetDetector>(
    new BalloonTargetDetector(
      DEFAULT_TARGET_TOLERANCE_MM,
      DEFAULT_CONFIRMATION_DURATION_MS,
      DEFAULT_TARGET_TIME_LIMIT_MS
    )
  );

  // Active balloon computation
  const activeBalloonId = sequence[currentTargetIndex] ?? sequence[0];
  const activeBalloon: BalloonTargetDefinition = useMemo(() => {
    return BALLOON_TARGET_SPECS.find((b) => b.id === activeBalloonId) || BALLOON_TARGET_SPECS[0];
  }, [activeBalloonId]);

  // Synchronize active target in detector when current target changes or center confirmed
  useEffect(() => {
    if (!isCenterConfirmed) return;
    const now = Date.now();
    targetStartTimeRef.current = now;
    detectorRef.current.setTarget(activeBalloon.id, now);
    setDetectionState({
      distanceMm: null,
      isInTolerance: false,
      holdProgress: 0.0,
      holdTimeRemainingMs: DEFAULT_CONFIRMATION_DURATION_MS,
      holdSecondsCountdown: Math.ceil(DEFAULT_CONFIRMATION_DURATION_MS / 1000),
      timeRemainingMs: DEFAULT_TARGET_TIME_LIMIT_MS,
      isAchieved: false,
      isTimedOut: false,
      status: "active",
    });
    setMissedFeedbackMessage(null);
    setSuccessFeedbackMessage(null);
  }, [activeBalloon.id, isCenterConfirmed]);

  // Record real-time COP trajectory points during active exercise
  useEffect(() => {
    if (isSessionComplete || isPaused || !hasLiveReading || !reading || !isCenterConfirmed) {
      return;
    }

    recordedTrajectoryRef.current.push({
      timestamp: Date.now(),
      copX: reading.copX,
      copY: reading.copY,
      copXMm: reading.copXMm,
      copYMm: reading.copYMm,
      targetId: activeBalloon.id,
      stepIndex: currentTargetIndex,
    });
  }, [reading, hasLiveReading, isSessionComplete, isPaused, activeBalloon.id, currentTargetIndex]);

  // Periodic frame processing loop (~30Hz) for real COP evaluation, 2s continuous hold, and timer countdown
  useEffect(() => {
    if (isSessionComplete) {
      return;
    }

    const interval = setInterval(() => {
      if (isSessionComplete || isTransitioningRef.current || poppingBalloonId !== null || deflatingBalloonId !== null) {
        return;
      }

      const now = Date.now();
      const currentReading = readingRef.current;
      const isCurrentConnected = isConnectedRef.current;
      const isCurrentPaused = isPausedRef.current;
      const hasCurrentLiveReading = hasLiveReadingRef.current;

      const currentCopXMm = hasCurrentLiveReading && currentReading ? currentReading.copXMm : null;
      const currentCopYMm = hasCurrentLiveReading && currentReading ? currentReading.copYMm : null;

      // 1. Pre-start Gate: Continuous 2-second Centre Hold Confirmation
      if (!isCenterConfirmed) {
        const centerRes = centerDetectorRef.current.update(
          currentCopXMm,
          currentCopYMm,
          now,
          isCurrentConnected,
          isCurrentPaused
        );

        setCenterDetectionState({
          distanceMm: centerRes.distanceMm,
          isInCenterZone: centerRes.isInCenterZone,
          holdProgress: centerRes.holdProgress,
          holdSecondsCountdown: centerRes.holdSecondsCountdown,
          isConfirmed: centerRes.isConfirmed,
        });

        if (centerRes.isConfirmed) {
          setIsCenterConfirmed(true);
          sessionStartTimeRef.current = now;
          targetStartTimeRef.current = now;
          detectorRef.current.setTarget(activeBalloon.id, now);
        }
        return;
      }

      const result = detectorRef.current.update(
        currentCopXMm,
        currentCopYMm,
        activeBalloon.targetXMm,
        activeBalloon.targetYMm,
        now,
        isCurrentConnected,
        isCurrentPaused
      );

      setDetectionState({
        distanceMm: result.distanceMm,
        isInTolerance: result.isInTolerance,
        holdProgress: result.holdProgress,
        holdTimeRemainingMs: result.holdTimeRemainingMs,
        holdSecondsCountdown: result.holdSecondsCountdown,
        timeRemainingMs: result.timeRemainingMs,
        isAchieved: result.isAchieved,
        isTimedOut: result.isTimedOut,
        status: result.status,
      });

      // 1. Successful Target Achievement: Only after full 2-second continuous hold
      if (result.isAchieved && !isTransitioningRef.current) {
        isTransitioningRef.current = true;
        setPoppingBalloonId(activeBalloon.id);
        setSuccessFeedbackMessage(`Balloon ${activeBalloon.number} Achieved! Great job!`);
        audioRef.current.playBalloonPop();

        // Generate 12 radial burst particles for pop animation
        const particles: BurstParticle[] = Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 2 * Math.PI) / 12 + (Math.random() * 0.3 - 0.15);
          const dist = 36 + Math.random() * 28;
          return {
            id: i,
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist,
            size: 6 + Math.random() * 4,
            color: i % 2 === 0 ? activeBalloon.color : activeBalloon.colorLight,
          };
        });
        setBurstParticles(particles);

        const durationMs = Math.max(0, DEFAULT_TARGET_TIME_LIMIT_MS - result.timeRemainingMs);
        const attempt: TargetAttemptResult = {
          targetIndex: currentTargetIndex,
          balloonId: activeBalloon.id,
          number: activeBalloon.number,
          name: activeBalloon.name,
          directionLabel: activeBalloon.directionLabel,
          color: activeBalloon.color,
          status: "completed",
          durationMs,
          finalDistanceMm: result.distanceMm,
        };

        // ONLY after the successful blast animation finishes (600ms):
        // 1. Mark balloon as Completed
        // 2. Clear blast particles and popping state
        // 3. Display and activate the next balloon (or complete session)
        // 4. Release transition lock
        setTimeout(() => {
          setTargetAttempts((prev) => [...prev, attempt]);
          setBalloonOutcomes((prev) => new Map(prev).set(activeBalloon.id, "completed"));
          setPoppingBalloonId(null);
          setBurstParticles([]);
          setSuccessFeedbackMessage(null);

          if (currentTargetIndex < sequence.length - 1) {
            setCurrentTargetIndex((prev) => prev + 1);
          } else {
            setIsSessionComplete(true);
          }
          isTransitioningRef.current = false;
        }, 600);
        return;
      }

      // 2. Target Timeout / Missed Target
      if (result.isTimedOut && !isTransitioningRef.current) {
        isTransitioningRef.current = true;
        setDeflatingBalloonId(activeBalloon.id);
        audioRef.current.playBalloonDeflate();
        setMissedFeedbackMessage(`Target Missed — Time expired on Balloon ${activeBalloon.number}`);

        const attempt: TargetAttemptResult = {
          targetIndex: currentTargetIndex,
          balloonId: activeBalloon.id,
          number: activeBalloon.number,
          name: activeBalloon.name,
          directionLabel: activeBalloon.directionLabel,
          color: activeBalloon.color,
          status: "missed",
          durationMs: DEFAULT_TARGET_TIME_LIMIT_MS,
          finalDistanceMm: result.distanceMm,
        };

        // ONLY after deflation feedback finishes (700ms):
        // 1. Mark balloon as Missed
        // 2. Clear deflating state
        // 3. Display and activate the next balloon (or complete session)
        // 4. Release transition lock
        setTimeout(() => {
          setTargetAttempts((prev) => [...prev, attempt]);
          setBalloonOutcomes((prev) => new Map(prev).set(activeBalloon.id, "missed"));
          setDeflatingBalloonId(null);
          setMissedFeedbackMessage(null);

          if (currentTargetIndex < sequence.length - 1) {
            setCurrentTargetIndex((prev) => prev + 1);
          } else {
            setIsSessionComplete(true);
          }
          isTransitioningRef.current = false;
        }, 700);
        return;
      }
    }, 33);

    return () => {
      clearInterval(interval);
    };
  }, [
    activeBalloon,
    currentTargetIndex,
    sequence.length,
    isSessionComplete,
    poppingBalloonId,
    deflatingBalloonId,
    isCenterConfirmed,
  ]);

  // Compute final session results summary from actual session data
  const sessionSummary: GameSessionSummary = useMemo(() => {
    const totalDurationMs = Date.now() - sessionStartTimeRef.current;
    return computeGameSessionSummary(
      targetAttempts,
      recordedTrajectoryRef.current,
      totalDurationMs,
      {
        sessionId: sessionIdRef.current,
        sessionDate: new Date(sessionStartTimeRef.current).toISOString(),
        isRealHardware: isConnected,
        patientName: patient?.fullName,
        patientId: patient?.medicalRecordNumber || patient?.id,
      }
    );
  }, [targetAttempts, isConnected, patient]);

  // Clean Start / Reset handler
  const handleStartNewGame = () => {
    const nextSeq = generateRandomSequence(sequence);
    setSequence(nextSeq);
    setCurrentTargetIndex(0);
    setIsCenterConfirmed(false);
    centerDetectorRef.current.reset();
    setCenterDetectionState({
      distanceMm: null,
      isInCenterZone: false,
      holdProgress: 0.0,
      holdSecondsCountdown: Math.ceil(DEFAULT_CENTER_HOLD_DURATION_MS / 1000),
      isConfirmed: false,
    });
    setBalloonOutcomes(new Map());
    setTargetAttempts([]);
    recordedTrajectoryRef.current = [];
    sessionIdRef.current = `game_${Date.now()}`;
    setPdfResult(null);
    setPdfError(null);
    sessionStartTimeRef.current = Date.now();
    targetStartTimeRef.current = Date.now();
    setPoppingBalloonId(null);
    setDeflatingBalloonId(null);
    setBurstParticles([]);
    setMissedFeedbackMessage(null);
    setSuccessFeedbackMessage(null);
    setIsSessionComplete(false);
    setIsPaused(false);
    isTransitioningRef.current = false;
    detectorRef.current.reset();
  };

  // Export Doctor Clinical PDF Report
  const handleExportDoctorPdf = async () => {
    try {
      setIsExportingPdf(true);
      setPdfError(null);
      const result = await PdfReportService.generateAndSaveTargetAchievingReport(
        sessionSummary,
        patient,
        new Date(sessionStartTimeRef.current),
        isConnected
      );
      setPdfResult(result);
    } catch (err) {
      console.error("Failed to generate doctor PDF report:", err);
      setPdfError(err instanceof Error ? err.message : "Failed to generate doctor report.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const handleBack = () => {
    onResultFullScreenChange?.(false);
    onExit?.();
  };

  const handleDashboard = () => {
    onResultFullScreenChange?.(false);
    if (onNavigateToDashboard) {
      onNavigateToDashboard();
    } else if (onExit) {
      onExit();
    }
  };

  // Safe direction formatting
  const getCopXDirection = (x: number) => {
    if (x > 0.05) return "Right (+X)";
    if (x < -0.05) return "Left (-X)";
    return "Centered";
  };

  const getCopYDirection = (y: number) => {
    if (y > 0.05) return "Forward (+Y)";
    if (y < -0.05) return "Backward (-Y)";
    return "Centered";
  };

  const timeRemainingSeconds = (detectionState.timeRemainingMs / 1000).toFixed(1);

  // SVG Trajectory Points String computation
  const trajectorySvgPoints = useMemo(() => {
    if (recordedTrajectoryRef.current.length < 2) return "";
    return recordedTrajectoryRef.current
      .map((p) => {
        const coords = mapCopToBoard(p.copX, p.copY);
        return `${coords.xPercent.toFixed(2)},${coords.yPercent.toFixed(2)}`;
      })
      .join(" ");
  }, [isSessionComplete]);

  // =========================================================================
  // DEDICATED RESULTS DASHBOARD SCREEN (PHASE 9)
  // =========================================================================
  if (isSessionComplete) {
    const {
      completedTargets,
      missedTargets,
      achievementPercentage,
      averageAchievementTimeMs,
      totalSessionDurationMs,
      targetAttempts: attempts,
      trajectory,
    } = sessionSummary;

    return (
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          padding: "8px 0 48px 0",
        }}
      >
        {/* 1. Results Top Navigation Header */}
        <div
          className="medical-card"
          style={{
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
            backgroundColor: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleBack}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--text-main)",
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Exercises</span>
            </button>

            {onNavigateToDashboard && (
              <button
                onClick={handleDashboard}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                }}
              >
                <Home size={16} />
                <span>Dashboard</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {patient && (
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  background: "#F8FAFC",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                }}
              >
                Patient: <strong style={{ color: "var(--text-main)" }}>{patient.fullName}</strong>
              </div>
            )}

            <button
              onClick={handleExportDoctorPdf}
              disabled={isExportingPdf}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "#0D9488",
                background: "#F0FDFA",
                border: "1px solid #99F6E4",
                borderRadius: "10px",
                cursor: isExportingPdf ? "not-allowed" : "pointer",
                opacity: isExportingPdf ? 0.7 : 1,
              }}
            >
              <Download size={15} />
              <span>{isExportingPdf ? "Exporting PDF..." : "Export Doctor PDF"}</span>
            </button>

            <button
              onClick={handleStartNewGame}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                fontSize: "0.875rem",
                fontWeight: 800,
                background: "#059669",
                color: "#FFFFFF",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 10px rgba(5, 150, 105, 0.25)",
              }}
            >
              <RotateCcw size={15} />
              <span>Play Again</span>
            </button>
          </div>
        </div>

        {/* PDF Export Feedback Banners */}
        {pdfResult && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              background: "#ECFDF5",
              border: "1px solid #10B981",
              color: "#065F46",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={16} />
              <span>
                Doctor PDF Report generated: <strong>{pdfResult.filename}</strong>
              </span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "#047857" }}>{pdfResult.filePath}</span>
          </div>
        )}

        {pdfError && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              background: "#FEF2F2",
              border: "1px solid #EF4444",
              color: "#991B1B",
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <XCircle size={16} />
            <span>Failed to generate report: {pdfError}</span>
          </div>
        )}

        {/* 2. Results Hero Assessment Banner */}
        <div
          className="medical-card"
          style={{
            padding: "26px 30px",
            borderRadius: "20px",
            border: "1.5px solid #A7F3D0",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 50%, #ECFDF5 100%)",
            boxShadow: "0 6px 20px -3px rgba(5, 150, 105, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: completedTargets >= 3 ? "linear-gradient(135deg, #059669 0%, #047857 100%)" : "linear-gradient(135deg, #D97706 0%, #B45309 100%)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 16px rgba(5, 150, 105, 0.25)",
              }}
            >
              {completedTargets >= 3 ? <Trophy size={30} /> : <Award size={30} />}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 800,
                    color: "var(--text-main)",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Session Complete — Target Achieving Game
                </h1>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#065F46",
                    background: "#D1FAE5",
                    padding: "3px 10px",
                    borderRadius: "6px",
                  }}
                >
                  Results Dashboard
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  margin: "4px 0 0 0",
                }}
              >
                Comprehensive biomechanical evaluation of directional Center of Pressure (COP) control on the Wii Balance Board.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "10px 18px",
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1.5px solid #A7F3D0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                Overall Achievement
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#065F46", lineHeight: 1.1 }}>
                {achievementPercentage.toFixed(0)}%
              </div>
            </div>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#ECFDF5",
                border: "3px solid #059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.875rem",
                fontWeight: 900,
                color: "#065F46",
              }}
            >
              {completedTargets}/4
            </div>
          </div>
        </div>

        {/* 3. Five Overall Metric Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
          }}
        >
          {/* Card 1: Total Targets */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Total Targets
              </span>
              <div style={{ color: "#0D9488" }}>
                <Target size={16} />
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", fontFamily: "var(--font-mono, monospace)" }}>
              4
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Prescribed target session
            </div>
          </div>

          {/* Card 2: Completed Targets */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Successfully Achieved
              </span>
              <div style={{ color: "#059669" }}>
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#059669", fontFamily: "var(--font-mono, monospace)" }}>
              {completedTargets}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Confirmed with 600ms hold
            </div>
          </div>

          {/* Card 3: Missed Targets */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Missed Targets
              </span>
              <div style={{ color: missedTargets > 0 ? "#DC2626" : "#64748B" }}>
                <XCircle size={16} />
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: missedTargets > 0 ? "#DC2626" : "var(--text-main)", fontFamily: "var(--font-mono, monospace)" }}>
              {missedTargets}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {missedTargets > 0 ? "Exceeded 10.0s time limit" : "Zero missed targets"}
            </div>
          </div>

          {/* Card 4: Average Achievement Time */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Avg Target Time
              </span>
              <div style={{ color: "#0D9488" }}>
                <Timer size={16} />
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", fontFamily: "var(--font-mono, monospace)" }}>
              {averageAchievementTimeMs !== null ? `${(averageAchievementTimeMs / 1000).toFixed(2)} s` : "--"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {averageAchievementTimeMs !== null ? "Successful targets only" : "No targets achieved"}
            </div>
          </div>

          {/* Card 5: Total Session Duration */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              backgroundColor: "#FFFFFF",
              borderRadius: "16px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Total Duration
              </span>
              <div style={{ color: "#334155" }}>
                <Clock size={16} />
              </div>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", fontFamily: "var(--font-mono, monospace)" }}>
              {(totalSessionDurationMs / 1000).toFixed(1)} s
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Full session duration
            </div>
          </div>
        </div>

        {/* 4. Per-Target Results Table */}
        <div
          className="medical-card"
          style={{
            padding: "24px 28px",
            backgroundColor: "#FFFFFF",
            borderRadius: "20px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 2px 0" }}>
                Per-Target Breakdown
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
                Individual target attempts in order of randomized execution
              </p>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", background: "#F8FAFC", padding: "4px 10px", borderRadius: "6px", border: "1px solid #E2E8F0" }}>
              Tolerance radius: 35.0 mm • Time limit: 10.0s
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0", background: "#F8FAFC" }}>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Order
                  </th>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Balloon Target
                  </th>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Target Position
                  </th>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Final Status
                  </th>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Time Taken
                  </th>
                  <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    COP Distance / Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att, idx) => {
                  const isComp = att.status === "completed";
                  return (
                    <tr
                      key={`attempt-row-${idx}`}
                      style={{
                        borderBottom: "1px solid #F1F5F9",
                        background: idx % 2 === 0 ? "#FFFFFF" : "#FAFAFA",
                      }}
                    >
                      <td style={{ padding: "12px 14px", fontWeight: 800, color: "var(--text-muted)" }}>
                        #{att.targetIndex + 1}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: att.color,
                              color: "#FFFFFF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.75rem",
                              fontWeight: 900,
                              flexShrink: 0,
                            }}
                          >
                            {att.number}
                          </div>
                          <span style={{ fontWeight: 800, color: "var(--text-main)" }}>
                            Balloon {att.number}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", color: "var(--text-secondary)", fontWeight: 600 }}>
                        {att.directionLabel}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            background: isComp ? "#ECFDF5" : "#FEF2F2",
                            color: isComp ? "#059669" : "#DC2626",
                            border: `1px solid ${isComp ? "#A7F3D0" : "#FCA5A5"}`,
                          }}
                        >
                          {isComp ? "Completed ✓" : "Missed ✕"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: "var(--text-main)" }}>
                        {isComp ? `${(att.durationMs / 1000).toFixed(2)} s` : "--"}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono, monospace)", fontWeight: 700, color: isComp ? "#059669" : "var(--text-muted)" }}>
                        {isComp && att.finalDistanceMm !== null
                          ? `${att.finalDistanceMm.toFixed(1)} mm`
                          : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Center of Pressure (COP) Trajectory Card */}
        <div
          className="medical-card"
          style={{
            padding: "28px 28px",
            backgroundColor: "#FFFFFF",
            borderRadius: "20px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 2px 0" }}>
                Recorded Center of Pressure (COP) Trajectory
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
                Physical Wii Balance Board coordinate mapping • {trajectory.length} real sensor samples recorded
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "12px", height: "3px", background: "#0D9488", borderRadius: "2px" }} />
                <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>COP Path</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#059669" }} />
                <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>Start</span>
              </div>
            </div>
          </div>

          {/* Force Plate Trajectory Canvas */}
          <div
            style={{
              width: "100%",
              maxWidth: "760px",
              margin: "0 auto",
              padding: "16px 20px",
              background: "#F8FAFC",
              borderRadius: "18px",
              border: "1px solid #E2E8F0",
              position: "relative",
            }}
          >
            {trajectory.length < 2 ? (
              <div
                style={{
                  height: "240px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: "var(--text-muted)",
                }}
              >
                <Activity size={32} color="#94A3B8" />
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  No valid trajectory data was recorded during this session.
                </span>
              </div>
            ) : (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "446 / 240",
                  borderRadius: "16px",
                  background: "linear-gradient(180deg, #F8FAFC 0%, #EEF2F6 45%, #E2E8F0 100%)",
                  border: "2px solid #94A3B8",
                  overflow: "hidden",
                }}
              >
                {/* Center Crosshairs */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "4%",
                    right: "4%",
                    height: "1px",
                    borderTop: "1.5px dashed #CBD5E1",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "6%",
                    bottom: "6%",
                    width: "1px",
                    borderLeft: "1.5px dashed #CBD5E1",
                    transform: "translateX(-50%)",
                    pointerEvents: "none",
                  }}
                />

                {/* Equilibrium center dot */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#94A3B8",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                  }}
                />

                {/* 4 Balloon Target Reference Badges on Map */}
                {BALLOON_TARGET_SPECS.map((target) => {
                  const coords = mapCopToBoard(target.copX, target.copY);
                  const outcome = balloonOutcomes.get(target.id);
                  const isComp = outcome === "completed";

                  return (
                    <div
                      key={`traj-target-${target.id}`}
                      style={{
                        position: "absolute",
                        left: `${coords.xPercent}%`,
                        top: `${coords.yPercent}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                        zIndex: 5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: target.color,
                          color: "#FFFFFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 900,
                          boxShadow: `0 2px 6px ${target.color}66`,
                          border: isComp ? "2px solid #FFFFFF" : "1.5px dashed #FFFFFF",
                        }}
                      >
                        {target.number}
                      </div>
                    </div>
                  );
                })}

                {/* Actual SVG Recorded COP Trajectory Polyline */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 10,
                  }}
                >
                  <polyline
                    points={trajectorySvgPoints}
                    fill="none"
                    stroke="#0D9488"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.85"
                  />
                </svg>

                {/* Start Point Marker */}
                {trajectory.length > 0 && (() => {
                  const startCoords = mapCopToBoard(trajectory[0].copX, trajectory[0].copY);
                  return (
                    <div
                      style={{
                        position: "absolute",
                        left: `${startCoords.xPercent}%`,
                        top: `${startCoords.yPercent}%`,
                        transform: "translate(-50%, -50%)",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#059669",
                        border: "2px solid #FFFFFF",
                        boxShadow: "0 0 4px rgba(0,0,0,0.4)",
                        zIndex: 12,
                        pointerEvents: "none",
                      }}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* 6. Results Action Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            padding: "12px 4px",
          }}
        >
          <button
            onClick={handleBack}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 18px",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            <ArrowLeft size={16} />
            <span>Return to Exercises</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleExportDoctorPdf}
              disabled={isExportingPdf}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "12px 20px",
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "#0D9488",
                background: "#F0FDFA",
                border: "1.5px solid #99F6E4",
                borderRadius: "10px",
                cursor: isExportingPdf ? "not-allowed" : "pointer",
                opacity: isExportingPdf ? 0.7 : 1,
              }}
            >
              <Download size={16} />
              <span>{isExportingPdf ? "Exporting PDF..." : "Export Doctor PDF"}</span>
            </button>

            <button
              onClick={handleStartNewGame}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                fontSize: "0.9375rem",
                fontWeight: 800,
                background: "#059669",
                color: "#FFFFFF",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
              }}
            >
              <RotateCcw size={16} />
              <span>Play Again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ACTIVE GAMEPLAY SCREEN (PHASE 1 - 8)
  // =========================================================================
  return (
    <div
      style={{
        maxWidth: "1160px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "4px 0 40px 0",
      }}
    >
      {/* Balloon pop burst and deflation animations */}
      <style>{`
        @keyframes balloonPopBurst {
          0% {
            transform: scale(1.25);
            opacity: 1;
          }
          40% {
            transform: scale(1.65);
            opacity: 0.9;
          }
          100% {
            transform: scale(0.2);
            opacity: 0;
          }
        }
        @keyframes balloonDeflateFail {
          0% {
            transform: scale(1.22);
            opacity: 1;
            filter: grayscale(0%);
          }
          45% {
            transform: scale(0.82, 0.45) translateY(12px);
            opacity: 0.7;
            filter: grayscale(65%);
          }
          100% {
            transform: scale(0.18, 0.08) translateY(28px);
            opacity: 0;
            filter: grayscale(100%);
          }
        }
        @keyframes burstParticleFly {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--p-dx), var(--p-dy)) scale(0);
            opacity: 0;
          }
        }
        .balloon-popping {
          animation: balloonPopBurst 0.5s ease-out forwards;
        }
        .balloon-deflating {
          animation: balloonDeflateFail 0.65s ease-in forwards;
        }
      `}</style>

      {/* 1. TOP HEADER & NAVIGATION */}
      <div
        className="medical-card"
        style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
          backgroundColor: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "16px",
          boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleBack}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "var(--text-main)",
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Exercises</span>
          </button>

          {onNavigateToDashboard && (
            <button
              onClick={handleDashboard}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              <Home size={16} />
              <span>Dashboard</span>
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {patient && (
            <div
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                background: "#F8FAFC",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #E2E8F0",
              }}
            >
              Patient: <strong style={{ color: "var(--text-main)" }}>{patient.fullName}</strong>
            </div>
          )}

          {/* Sound ON/OFF Control */}
          <button
            onClick={() => setIsSoundEnabled((prev) => !prev)}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: isSoundEnabled ? "#059669" : "#64748B",
              background: isSoundEnabled ? "#ECFDF5" : "#F1F5F9",
              border: `1.5px solid ${isSoundEnabled ? "#A7F3D0" : "#CBD5E1"}`,
              borderRadius: "8px",
            }}
            title={isSoundEnabled ? "Mute game sounds" : "Unmute game sounds"}
          >
            {isSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{isSoundEnabled ? "Sound ON" : "Muted"}</span>
          </button>

          {/* Pause / Resume Control */}
          <button
            onClick={handleTogglePause}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: isPaused ? "#059669" : "#334155",
              background: isPaused ? "#ECFDF5" : "#F8FAFC",
              border: `1.5px solid ${isPaused ? "#A7F3D0" : "#CBD5E1"}`,
              borderRadius: "8px",
            }}
            title={isPaused ? "Resume target timer and detection" : "Pause target timer and detection"}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            <span>{isPaused ? "Resume" : "Pause"}</span>
          </button>

          {/* New Game / Reset Button */}
          <button
            onClick={handleStartNewGame}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#047857",
              background: "#ECFDF5",
              border: "1.5px solid #A7F3D0",
              borderRadius: "8px",
            }}
            title="Start a new game with a newly randomized balloon sequence"
          >
            <RotateCcw size={14} />
            <span>New Game</span>
          </button>

          {/* Hardware Connection Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              background: isConnected ? "#ECFDF5" : "#F1F5F9",
              color: isConnected ? "#059669" : "#64748B",
              border: `1.5px solid ${isConnected ? "#A7F3D0" : "#CBD5E1"}`,
            }}
          >
            {isConnected ? (
              <>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#059669",
                    boxShadow: "0 0 6px rgba(5, 150, 105, 0.6)",
                  }}
                />
                <Wifi size={14} />
                <span>Wii Board Connected</span>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#94A3B8",
                  }}
                />
                <AlertCircle size={14} />
                <span>Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. ACTIVE TARGET INSTRUCTIONS, TIMER & PROGRESS */}
      <div
        className="medical-card"
        style={{
          padding: "24px 28px",
          backgroundColor: "#FFFFFF",
          borderRadius: "18px",
          border: "1.5px solid #D1FAE5",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)",
          boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.25)",
              }}
            >
              <Gamepad2 size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1
                  style={{
                    fontSize: "1.375rem",
                    fontWeight: 800,
                    color: "var(--text-main)",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Target Achieving Game
                </h1>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#047857",
                    background: "#D1FAE5",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Active Session
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: "2px 0 0 0",
                }}
              >
                10.0s time limit per balloon • 35.0 mm tolerance • Full session results recorded
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Target Progress Counter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                borderRadius: "12px",
                background: "#FFFFFF",
                border: "1.5px solid #A7F3D0",
                boxShadow: "0 2px 6px rgba(5, 150, 105, 0.08)",
              }}
            >
              <Target size={16} color="#059669" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  Session Target
                </span>
                <strong style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#065F46" }}>
                  {!isCenterConfirmed
                    ? "Centre Start"
                    : `Target ${Math.min(currentTargetIndex + 1, sequence.length)} of ${sequence.length}`}
                </strong>
              </div>
            </div>

            {/* Target Countdown Timer Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                borderRadius: "12px",
                background: isPaused
                  ? "#F8FAFC"
                  : !isCenterConfirmed
                    ? centerDetectionState.isInCenterZone
                      ? "#EFF6FF"
                      : "#FFFFFF"
                    : detectionState.timeRemainingMs <= 3000
                      ? "#FEF2F2"
                      : "#FFFFFF",
                border: `1.5px solid ${
                  isPaused
                    ? "#CBD5E1"
                    : !isCenterConfirmed
                      ? centerDetectionState.isInCenterZone
                        ? "#93C5FD"
                        : "#CBD5E1"
                      : detectionState.timeRemainingMs <= 3000
                        ? "#FCA5A5"
                        : "#99F6E4"
                }`,
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
              }}
            >
              <Clock
                size={16}
                color={
                  isPaused
                    ? "#64748B"
                    : !isCenterConfirmed
                      ? centerDetectionState.isInCenterZone
                        ? "#2563EB"
                        : "#64748B"
                      : detectionState.timeRemainingMs <= 3000
                        ? "#DC2626"
                        : "#0D9488"
                }
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                  {isPaused
                    ? "Timer Paused"
                    : !isCenterConfirmed
                      ? "Centre Hold"
                      : "Time Left"}
                </span>
                <strong
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 800,
                    fontFamily: "var(--font-mono, monospace)",
                    color: isPaused
                      ? "#64748B"
                      : !isCenterConfirmed
                        ? centerDetectionState.isInCenterZone
                          ? "#1D4ED8"
                          : "#64748B"
                        : detectionState.timeRemainingMs <= 3000
                          ? "#DC2626"
                          : "#0F766E",
                  }}
                >
                  {!isCenterConfirmed
                    ? `${centerDetectionState.holdSecondsCountdown}s`
                    : `${timeRemainingSeconds}s`}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Transient Success Feedback Alert */}
        {successFeedbackMessage && (
          <div
            style={{
              padding: "12px 18px",
              background: "#ECFDF5",
              borderRadius: "10px",
              border: "1.5px solid #6EE7B7",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#065F46",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            <CheckCircle2 size={18} color="#059669" />
            <span>{successFeedbackMessage}</span>
          </div>
        )}

        {/* Transient Missed Target Feedback Alert */}
        {missedFeedbackMessage && (
          <div
            style={{
              padding: "12px 18px",
              background: "#FEF2F2",
              borderRadius: "10px",
              border: "1.5px solid #FCA5A5",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#991B1B",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            <XCircle size={18} color="#DC2626" />
            <span>{missedFeedbackMessage}</span>
          </div>
        )}

        {/* Clinician Pause Notification */}
        {isPaused && (
          <div
            style={{
              padding: "12px 18px",
              background: "#FFFBEB",
              borderRadius: "10px",
              border: "1.5px solid #FCD34D",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              color: "#92400E",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Pause size={18} color="#D97706" />
              <span>Exercise paused. Timer and target detection are temporarily suspended.</span>
            </div>
            <button
              onClick={handleTogglePause}
              className="btn-ghost"
              style={{
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "#92400E",
                background: "#FEF3C7",
                borderRadius: "6px",
                border: "1px solid #F59E0B",
              }}
            >
              Resume Exercise
            </button>
          </div>
        )}

        {/* Active Target Instruction Card with Real-time Distance & Confirmation Hold Bar */}
        {!isCenterConfirmed ? (
          <div
            style={{
              padding: "16px 20px",
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "2px solid #4F46E5",
              boxShadow: "0 4px 14px rgba(79, 70, 229, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.25rem",
                  fontWeight: 900,
                  boxShadow: "0 4px 10px rgba(79, 70, 229, 0.3)",
                  flexShrink: 0,
                }}
              >
                ⊙
              </div>
              <div>
                <div style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--text-main)", lineHeight: 1.4 }}>
                  Stand at the Centre of the Balance Board
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {centerDetectionState.isInCenterZone ? (
                    <strong style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span>Centre position reached! Keep holding:</span>
                      <span
                        style={{
                          background: "#059669",
                          color: "#FFFFFF",
                          padding: "1px 7px",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: 900,
                        }}
                      >
                        {centerDetectionState.holdSecondsCountdown}s
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#065F46" }}>
                        ({Math.round(centerDetectionState.holdProgress * 100)}%)
                      </span>
                    </strong>
                  ) : (
                    <span>
                      Distance to centre:{" "}
                      <strong>
                        {centerDetectionState.distanceMm !== null ? `${centerDetectionState.distanceMm.toFixed(1)} mm` : "--"}
                      </strong>{" "}
                      (Required: ≤ {DEFAULT_CENTER_TOLERANCE_MM} mm)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Centre Hold progress bar */}
            {centerDetectionState.isInCenterZone && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "170px" }}>
                <div
                  style={{
                    flex: 1,
                    height: "8px",
                    background: "#E2E8F0",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(centerDetectionState.holdProgress * 100)}%`,
                      background: "#059669",
                      transition: "width 0.05s linear",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.8125rem", fontWeight: 900, color: "#059669" }}>
                  {centerDetectionState.holdSecondsCountdown}s
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "16px 20px",
              background: "#FFFFFF",
              borderRadius: "14px",
              border: `2px solid ${activeBalloon.color}`,
              boxShadow: `0 4px 14px ${activeBalloon.color}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: activeBalloon.color,
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.25rem",
                  fontWeight: 900,
                  boxShadow: `0 4px 10px ${activeBalloon.color}55`,
                  flexShrink: 0,
                }}
              >
                {activeBalloon.number}
              </div>
              <div>
                <div style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--text-main)", lineHeight: 1.4 }}>
                  Move your weight towards the balloon
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: activeBalloon.color, marginLeft: "8px" }}>
                    (Balloon {activeBalloon.number} • {activeBalloon.directionLabel})
                  </span>
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {detectionState.isInTolerance ? (
                    <strong style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <span>Target Reached! Keep holding:</span>
                      <span
                        style={{
                          background: "#059669",
                          color: "#FFFFFF",
                          padding: "1px 7px",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: 900,
                        }}
                      >
                        {detectionState.holdSecondsCountdown}s
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#065F46" }}>
                        ({Math.round(detectionState.holdProgress * 100)}%)
                      </span>
                    </strong>
                  ) : (
                    <span>
                      Target Euclidean distance:{" "}
                      <strong>
                        {detectionState.distanceMm !== null ? `${detectionState.distanceMm.toFixed(1)} mm` : "--"}
                      </strong>{" "}
                      (Required: ≤ {DEFAULT_TARGET_TOLERANCE_MM} mm)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Hold progress bar */}
            {detectionState.isInTolerance && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "170px" }}>
                <div
                  style={{
                    flex: 1,
                    height: "8px",
                    background: "#E2E8F0",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round(detectionState.holdProgress * 100)}%`,
                      background: "#059669",
                      transition: "width 0.05s linear",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.8125rem", fontWeight: 900, color: "#059669" }}>
                  {detectionState.holdSecondsCountdown}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* 4-Step Sequence Progress Tracker with Completed / Missed Badges */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "10px",
          }}
        >
          {sequence.map((balloonId, stepIndex) => {
            const b = BALLOON_TARGET_SPECS.find((target: BalloonTargetDefinition) => target.id === balloonId) || BALLOON_TARGET_SPECS[0];
            const outcome = balloonOutcomes.get(b.id);
            const isCompleted = outcome === "completed";
            const isMissed = outcome === "missed";
            const isCurrent = isCenterConfirmed && stepIndex === currentTargetIndex;
            const isRevealed = isCompleted || isMissed || isCurrent;

            return (
              <div
                key={`step-${stepIndex}-${balloonId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: isCompleted
                    ? "#ECFDF5"
                    : isMissed
                      ? "#FEF2F2"
                      : isCurrent
                        ? "#FFFFFF"
                        : "#F8FAFC",
                  border: isCompleted
                    ? "1.5px solid #10B981"
                    : isMissed
                      ? "1.5px solid #FCA5A5"
                      : isCurrent
                        ? `2px solid ${b.color}`
                        : "1px solid #E2E8F0",
                  boxShadow: isCurrent
                    ? `0 4px 12px ${b.color}25`
                    : "none",
                  transition: "all 0.2s ease",
                  opacity: isCompleted || isMissed ? 0.95 : isCurrent ? 1.0 : 0.6,
                }}
              >
                {/* Step indicator circle */}
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: isCompleted
                      ? "#059669"
                      : isMissed
                        ? "#DC2626"
                        : isCurrent
                          ? b.color
                          : "#94A3B8",
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? "✓" : isMissed ? "✕" : isCurrent ? b.number : stepIndex + 1}
                </div>

                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: isCompleted
                          ? "#059669"
                          : isMissed
                            ? "#DC2626"
                            : isCurrent
                              ? b.color
                              : "var(--text-muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Target {stepIndex + 1}
                    </span>
                    {isCompleted && (
                      <span
                        style={{
                          fontSize: "0.5625rem",
                          fontWeight: 800,
                          background: "#059669",
                          color: "#FFFFFF",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          letterSpacing: "0.05em",
                        }}
                      >
                        COMPLETED
                      </span>
                    )}
                    {isMissed && (
                      <span
                        style={{
                          fontSize: "0.5625rem",
                          fontWeight: 800,
                          background: "#DC2626",
                          color: "#FFFFFF",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          letterSpacing: "0.05em",
                        }}
                      >
                        MISSED
                      </span>
                    )}
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: "0.5625rem",
                          fontWeight: 800,
                          background: b.color,
                          color: "#FFFFFF",
                          padding: "1px 5px",
                          borderRadius: "4px",
                          letterSpacing: "0.05em",
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: isCurrent || isCompleted || isMissed ? 800 : 600,
                      color: isCompleted
                        ? "#065F46"
                        : isMissed
                          ? "#991B1B"
                          : isCurrent
                            ? "var(--text-main)"
                            : "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                    }}
                  >
                    {isRevealed ? `Balloon ${b.number}` : `Target ${stepIndex + 1}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. REAL-TIME TELEMETRY METRICS GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "14px",
        }}
      >
        {/* Metric 1: Hardware Connection Status */}
        <div
          className="medical-card"
          style={{
            padding: "18px 20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Hardware Status
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: isConnected ? "#ECFDF5" : "#F1F5F9",
                color: isConnected ? "#059669" : "#64748B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isConnected ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            </div>
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: isConnected ? "#059669" : "#64748B",
            }}
          >
            {isConnected ? "Wii Board Connected" : "Disconnected"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {isConnected ? (status.deviceName || "RVL-WBC-01 Active") : "Bluetooth sync required"}
          </div>
        </div>

        {/* Metric 2: Total Weight */}
        <div
          className="medical-card"
          style={{
            padding: "18px 20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Total Weight
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "#F0FDFA",
                color: "#0D9488",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Scale size={16} />
            </div>
          </div>
          <div
            style={{
              fontSize: "1.375rem",
              fontWeight: 800,
              color: "var(--text-main)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {hasLiveReading && reading && typeof reading.totalWeight === "number"
              ? `${reading.totalWeight.toFixed(1)} kg`
              : "--"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {hasLiveReading ? "4 load cells active" : "Awaiting patient weight"}
          </div>
        </div>

        {/* Metric 3: Target Distance */}
        <div
          className="medical-card"
          style={{
            padding: "18px 20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Distance to Target
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: detectionState.isInTolerance ? "#ECFDF5" : "#F8FAFC",
                color: detectionState.isInTolerance ? "#059669" : "#334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Target size={16} />
            </div>
          </div>
          <div
            style={{
              fontSize: "1.375rem",
              fontWeight: 800,
              color: detectionState.isInTolerance ? "#059669" : "var(--text-main)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {detectionState.distanceMm !== null
              ? `${detectionState.distanceMm.toFixed(1)} mm`
              : "--"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {detectionState.isInTolerance
              ? "Inside target region (≤ 35 mm)"
              : `Tolerance radius: ${DEFAULT_TARGET_TOLERANCE_MM} mm`}
          </div>
        </div>

        {/* Metric 4: Live COP Coordinates */}
        <div
          className="medical-card"
          style={{
            padding: "18px 20px",
            backgroundColor: "#FFFFFF",
            borderRadius: "16px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Live COP (X / Y)
            </span>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "#F8FAFC",
                color: "#334155",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MoveHorizontal size={16} />
            </div>
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: "var(--text-main)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {hasLiveReading && reading && typeof reading.copXMm === "number" && typeof reading.copYMm === "number"
              ? `X: ${reading.copXMm >= 0 ? "+" : ""}${reading.copXMm.toFixed(0)} Y: ${reading.copYMm >= 0 ? "+" : ""}${reading.copYMm.toFixed(0)} mm`
              : "--"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {hasLiveReading && reading
              ? `${getCopXDirection(reading.copX)} • ${getCopYDirection(reading.copY)}`
              : "Awaiting telemetry"}
          </div>
        </div>
      </div>

      {/* 4. DIGITAL WII BALANCE BOARD VISUALIZATION WITH BALLOONS */}
      <div
        className="medical-card"
        style={{
          padding: "32px 28px",
          backgroundColor: "#FFFFFF",
          borderRadius: "20px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.05)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "620px" }}>
          <h2
            style={{
              fontSize: "1.125rem",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: "0 0 4px 0",
            }}
          >
            Top-View Wii Balance Board Force Plate
          </h2>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            {isPaused ? (
              <span style={{ color: "#D97706", fontWeight: 700 }}>
                Exercise Paused — Telemetry & Timer Paused.
              </span>
            ) : !isCenterConfirmed ? (
              <span style={{ color: "#4F46E5", fontWeight: 700 }}>
                Centre Starting Position — Please stand at the centre of the balance board.
              </span>
            ) : (
              <>
                Active target: <strong>Balloon {activeBalloon.number} ({activeBalloon.directionLabel})</strong> • Target {currentTargetIndex + 1} of {sequence.length}
              </>
            )}
          </p>
        </div>

        {/* Centered Board Visualization Container */}
        <div
          style={{
            width: "100%",
            maxWidth: "760px",
            margin: "0 auto",
            padding: "16px 20px",
            background: "#F8FAFC",
            borderRadius: "18px",
            border: "1px solid #E2E8F0",
          }}
        >
          <VisualBalanceBoard
            reading={isConnected ? reading : null}
            isConnected={isConnected}
            isSimulated={false}
          >
            {/* Stage 1: Centre start position indicator and 2-second countdown */}
            {!isSessionComplete && !isCenterConfirmed && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  zIndex: 15,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: centerDetectionState.isInCenterZone ? "#10B981" : "rgba(79, 70, 229, 0.9)",
                    border: "2px solid #FFFFFF",
                    boxShadow: centerDetectionState.isInCenterZone
                      ? "0 0 16px rgba(16, 185, 129, 0.6)"
                      : "0 0 12px rgba(79, 70, 229, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    fontWeight: 900,
                    fontSize: centerDetectionState.isInCenterZone ? "1.125rem" : "0.9375rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  {centerDetectionState.isInCenterZone ? centerDetectionState.holdSecondsCountdown : "⊙"}
                </div>

                {centerDetectionState.isInCenterZone && (
                  <div
                    style={{
                      background: "#065F46",
                      color: "#FFFFFF",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    HOLD CENTRE: {centerDetectionState.holdSecondsCountdown}s
                  </div>
                )}
              </div>
            )}

            {/* Stage 2: Display ONLY the single active balloon target when center has been confirmed; no dashed circle, no inactive balloons */}
            {!isSessionComplete && isCenterConfirmed && (() => {
              const target = activeBalloon;
              const coords = mapCopToBoard(target.copX, target.copY);
              const isPopping = poppingBalloonId === target.id;
              const isDeflating = deflatingBalloonId === target.id;

              return (
                <div
                  key={`active-target-${target.id}`}
                  style={{
                    position: "absolute",
                    left: `${coords.xPercent}%`,
                    top: `${coords.yPercent}%`,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    zIndex: 15,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {/* Radial Burst Particles (only during pop blast animation) */}
                  {isPopping && (
                    <div
                      style={{
                        position: "absolute",
                        top: "24px",
                        left: "24px",
                        pointerEvents: "none",
                        zIndex: 25,
                      }}
                    >
                      {burstParticles.map((p) => (
                        <div
                          key={`particle-${p.id}`}
                          style={
                            {
                              position: "absolute",
                              width: `${p.size}px`,
                              height: `${p.size}px`,
                              borderRadius: "50%",
                              background: p.color,
                              boxShadow: `0 0 6px ${p.color}`,
                              "--p-dx": `${p.dx}px`,
                              "--p-dy": `${p.dy}px`,
                              animation: "burstParticleFly 0.5s ease-out forwards",
                            } as React.CSSProperties
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* Completely Stationary Balloon (no float, drift or bounce; fixed at target position) */}
                  <div
                    className={
                      isPopping
                        ? "balloon-popping"
                        : isDeflating
                          ? "balloon-deflating"
                          : ""
                    }
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    {/* Realistic 2D Balloon SVG with Attached String and Visible Number */}
                    <svg
                      width="48"
                      height="68"
                      viewBox="0 0 48 68"
                      style={{
                        display: "block",
                        overflow: "visible",
                        filter: `drop-shadow(0 4px 10px ${target.color}66)`,
                      }}
                    >
                      <defs>
                        <radialGradient id={`balloon-grad-${target.id}`} cx="35%" cy="30%" r="65%">
                          <stop offset="0%" stopColor={target.colorLight} />
                          <stop offset="60%" stopColor={target.color} />
                          <stop offset="100%" stopColor={target.colorDark} />
                        </radialGradient>
                      </defs>

                      {/* Small Wavy String Attached to Bottom Knot */}
                      <path
                        d="M 24 48 Q 19 54, 26 60 T 22 68"
                        fill="none"
                        stroke={target.colorDark}
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      />

                      {/* Balloon Knot (triangle at base) */}
                      <polygon
                        points="24,44 20,49 28,49"
                        fill={target.colorDark}
                      />

                      {/* Main Balloon 2D Body */}
                      <path
                        d="M 24 4
                           C 10 4, 3 14, 3 26
                           C 3 37, 13 44, 21 46
                           L 27 46
                           C 35 44, 45 37, 45 26
                           C 45 14, 38 4, 24 4 Z"
                        fill={`url(#balloon-grad-${target.id})`}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />

                      {/* Glossy 2D Reflection Highlight */}
                      <ellipse
                        cx="15"
                        cy="15"
                        rx="4"
                        ry="8"
                        transform="rotate(-28 15 15)"
                        fill="#FFFFFF"
                        opacity="0.55"
                      />

                      {/* Visible Balloon Number (1, 2, 3, 4) */}
                      <text
                        x="24"
                        y="27"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#FFFFFF"
                        fontSize="16"
                        fontWeight="900"
                        fontFamily="var(--font-sans, system-ui, sans-serif)"
                        style={{
                          textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
                          userSelect: "none",
                        }}
                      >
                        {target.number}
                      </text>
                    </svg>
                  </div>
                </div>
              );
            })()}
          </VisualBalanceBoard>
        </div>

        {/* Offline / Reconnect Hint (when not connected) */}
        {!isConnected && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "12px 18px",
              background: "#FFFBEB",
              borderRadius: "10px",
              border: "1px solid #FDE68A",
              maxWidth: "760px",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8125rem", color: "#92400E" }}>
              <AlertCircle size={16} color="#D97706" style={{ flexShrink: 0 }} />
              <span>
                Wii Balance Board not detected. Timer paused. Turn on your board and press the red SYNC button to resume.
              </span>
            </div>
            <button
              onClick={() => scanAndConnect()}
              disabled={status.isScanning}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#92400E",
                background: "#FEF3C7",
                borderRadius: "6px",
                border: "1px solid #FCD34D",
                cursor: status.isScanning ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={13} className={status.isScanning ? "spin" : ""} />
              <span>{status.isScanning ? "Connecting..." : "Connect Board"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
