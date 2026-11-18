import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  AlertCircle,
  Clock,
  Award,
  Scale,
  Check,
  Download,
  SkipForward,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  StopCircle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Crosshair,
  Compass,
  Home,
} from "lucide-react";
import { useBalanceBoard } from "../../context/HardwareContext";
import { mapCopToBoard } from "../../utils/copMapping";
import {
  DirectionalTarget,
  DirectionalTargetName,
  DEFAULT_DIRECTIONAL_DURATIONS,
  getDirectionalTargets,
  isDirectionalTargetReached,
  computeDirectionalGuidance,
  formatWeightTelemetry,
  formatCopTelemetry,
  formatSessionTime,
  calculateDirectionalExerciseResult,
  DirectionalExerciseResult,
  DirectionalWeightShiftSessionSummary,
  DirectionalTargetTracker,
  calculateDirectionalSessionSummary,
  DirectionalCalibrationBaseline,
  calculateCopFromLoadCells,
  calculateRelativeCop,
  BaselineCalibrationCollector,
  WII_BOARD_DIMENSIONS,
  CopRollingFilter,
} from "../../utils/directionalWeightShiftExercise";
import { PdfReportService } from "../../services/pdfReportService";
import { PatientProfile } from "../../types/patient";

interface DirectionalWeightShiftExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
  onResultFullScreenChange?: (isFullScreen: boolean) => void;
  onNavigateToDashboard?: () => void;
}

type ExercisePhase = "READY" | "CALIBRATING" | "CALIBRATION_FAILED" | "ACTIVE" | "PAUSED" | "COMPLETED";

export const DirectionalWeightShiftExercise: React.FC<DirectionalWeightShiftExerciseProps> = ({
  patient,
  onExit,
  onResultFullScreenChange,
  onNavigateToDashboard,
}) => {
  const { status: hardwareStatus, reading: hardwareReading } = useBalanceBoard();

  // Configurable hold durations per target (seconds)
  const [customDurations, setCustomDurations] = useState<Record<DirectionalTargetName, number>>({
    "SHIFT LEFT": 2,
    "SHIFT RIGHT": 3,
    "SHIFT FORWARD": 1,
    "SHIFT BACKWARD": 2,
    "RETURN TO CENTER": 3,
  });
  const [showDurationConfig, setShowDurationConfig] = useState(false);

  // Baseline calibration state (5-second quiet standing calibration establishes individual baseline X0, Y0)
  const [calibrationBaseline, setCalibrationBaseline] = useState<DirectionalCalibrationBaseline | null>(null);

  // Targets: canonical 5 sequential movements with configured hold durations and patient-specific baseline calibration
  const targets = useMemo(
    () => getDirectionalTargets(customDurations, undefined, calibrationBaseline),
    [customDurations, calibrationBaseline]
  );

  // Exercise State
  const [phase, setPhase] = useState<ExercisePhase>("READY");
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100%
  const [showGoodBadge, setShowGoodBadge] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Real-time COP movement trail points on the board
  const [activeTrailPoints, setActiveTrailPoints] = useState<{ xPercent: number; yPercent: number }[]>([]);

  // Timing
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<any>(null);
  const distanceSamplesRef = useRef<number[]>([]);
  const isAdvancingRef = useRef(false);
  const lastDebugLogRef = useRef<number>(0);

  // Final Result
  const [finalResult, setFinalResult] = useState<DirectionalExerciseResult | null>(null);
  void finalResult;

  // Full-screen result screen trigger: hide sidebar ONLY on completed result screen
  useEffect(() => {
    if (phase === "COMPLETED") {
      onResultFullScreenChange?.(true);
    } else {
      onResultFullScreenChange?.(false);
    }
  }, [phase, onResultFullScreenChange]);

  // Clean-up on unmount ensures sidebar is always restored
  useEffect(() => {
    return () => {
      onResultFullScreenChange?.(false);
    };
  }, [onResultFullScreenChange]);

  const handleBackToDashboard = () => {
    onResultFullScreenChange?.(false);
    if (onNavigateToDashboard) {
      onNavigateToDashboard();
    } else if (onExit) {
      onExit();
    }
  };

  const handleExitToLibrary = () => {
    onResultFullScreenChange?.(false);
    onExit?.();
  };

  // Active target
  const currentTarget: DirectionalTarget | undefined = targets[currentTargetIndex];

  // =========================================================================
  // BASELINE CALIBRATION STATE (STEP 1: INITIAL PATIENT CALIBRATION)
  // Requirement 1: 5-second quiet standing calibration before first target.
  // Requirement 2: Establishes individual neutral baseline (X0, Y0) and sets relative center to (0, 0).
  // Requirement 3: Confirms all 4 load cells, stable weight, finite limits, low sway dispersion.
  // =========================================================================
  const [calibrationProgress, setCalibrationProgress] = useState({
    elapsedSeconds: 0,
    targetSeconds: 5.0,
    progressPct: 0,
    sampleCount: 0,
    isComplete: false,
  });
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationLiveWeight, setCalibrationLiveWeight] = useState<number | null>(null);
  const [calibrationLiveSwayMm, setCalibrationLiveSwayMm] = useState<number | null>(null);
  const calibrationCollectorRef = useRef<BaselineCalibrationCollector>(new BaselineCalibrationCollector(5.0));

  // =========================================================================
  // TELEMETRY SOURCE: REAL HARDWARE vs INTERACTIVE SIMULATION MODE
  // Requirement 1: User-selectable Real Hardware / Simulation Mode before start.
  // Requirement 2: Generates realistic, smoothly changing COP X/Y values for all 5 targets.
  // Requirement 3: Control via Keyboard Arrow Keys (or WASD) and on-screen controls.
  // Requirement 7: Never mix simulated data with real clinical telemetry.
  // Requirement 8: Real Hardware Mode remains 100% unchanged.
  // =========================================================================
  const [isSimulationMode, setIsSimulationMode] = useState<boolean>(false);

  // Simulated Center of Pressure (COP) Kinematics
  const [simCop, setSimCop] = useState<{ x: number; y: number }>({ x: 0.0, y: 0.0 });
  const simCopRef = useRef<{ x: number; y: number }>({ x: 0.0, y: 0.0 });
  const simTargetGoalRef = useRef<{ x: number; y: number } | null>(null);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  const isRealConnected = !isSimulationMode && Boolean(hardwareStatus.isConnected && hardwareReading);

  // 4-Load-Cell COP Calculation for Real Hardware
  const loadCellCop = useMemo(() => {
    if (isSimulationMode || !isRealConnected || !hardwareReading) {
      return null;
    }
    return calculateCopFromLoadCells(
      hardwareReading.frontLeft,
      hardwareReading.frontRight,
      hardwareReading.backLeft,
      hardwareReading.backRight
    );
  }, [isSimulationMode, isRealConnected, hardwareReading]);

  // Raw physical sensor COP
  const rawLiveCopX = isSimulationMode
    ? simCop.x
    : loadCellCop && loadCellCop.isValid
      ? loadCellCop.copX
      : hardwareReading
        ? hardwareReading.copX
        : null;

  const rawLiveCopY = isSimulationMode
    ? simCop.y
    : loadCellCop && loadCellCop.isValid
      ? loadCellCop.copY
      : hardwareReading
        ? hardwareReading.copY
        : null;

  const liveWeight = isSimulationMode
    ? 68.4
    : loadCellCop && loadCellCop.isValid
      ? loadCellCop.totalWeight
      : hardwareReading
        ? hardwareReading.totalWeight
        : null;

  // Low-latency rolling filter to reduce sensor ADC micro-jitter (window size: 4 samples ~80ms)
  const rollingFilterRef = useRef<CopRollingFilter>(new CopRollingFilter(4));

  // Filtered raw COP coordinates to eliminate ADC micro-jitter
  const filteredRawCop = useMemo(() => {
    if (rawLiveCopX === null || rawLiveCopY === null || liveWeight === null) {
      rollingFilterRef.current.reset();
      return { x: null, y: null, weight: null };
    }
    const filtered = rollingFilterRef.current.pushSample(
      Date.now(),
      rawLiveCopX,
      rawLiveCopY,
      liveWeight
    );
    return {
      x: filtered.filteredX ?? rawLiveCopX,
      y: filtered.filteredY ?? rawLiveCopY,
      weight: filtered.filteredWeight ?? liveWeight,
    };
  }, [rawLiveCopX, rawLiveCopY, liveWeight]);

  // Relative COP relative to calibrated neutral baseline (X0, Y0)
  // When baseline is established, neutral stance is strictly (0, 0)
  const relativeCop = useMemo(() => {
    return calculateRelativeCop(filteredRawCop.x, filteredRawCop.y, calibrationBaseline);
  }, [filteredRawCop.x, filteredRawCop.y, calibrationBaseline]);

  const liveCopX = relativeCop.relCopX;
  const liveCopY = relativeCop.relCopY;

  // Real-time ball position — updated at most every ~30ms via throttled useEffect
  // CSS transition handles visual smoothing
  const [visualBallPos, setVisualBallPos] = useState({ xPercent: 50.0, yPercent: 50.0 });
  const lastUpdateRef = useRef(0);

  // Compute visual coordinates using existing canonical mapCopToBoard
  const targetBoardCoords = useMemo(() => {
    if (liveCopX === null || liveCopY === null) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    return mapCopToBoard(liveCopX, liveCopY);
  }, [liveCopX, liveCopY]);

  // Throttled ball position update
  useEffect(() => {
    if ((!isRealConnected && !isSimulationMode) || liveCopX === null || liveCopY === null) {
      setVisualBallPos({ xPercent: 50.0, yPercent: 50.0 });
      return;
    }
    const now = Date.now();
    if (now - lastUpdateRef.current >= 30) {
      lastUpdateRef.current = now;
      setVisualBallPos({
        xPercent: Math.max(5, Math.min(95, targetBoardCoords.xPercent)),
        yPercent: Math.max(8, Math.min(92, targetBoardCoords.yPercent)),
      });
    }
  }, [isRealConnected, isSimulationMode, liveCopX, liveCopY, targetBoardCoords.xPercent, targetBoardCoords.yPercent]);

  // Guidance evaluation
  const isWithinTargetZone = useMemo(() => {
    if (!currentTarget) return false;
    if (isSimulationMode) {
      return isDirectionalTargetReached(liveCopX, liveCopY, currentTarget);
    }
    if (!isRealConnected) return false;
    return isDirectionalTargetReached(liveCopX, liveCopY, currentTarget);
  }, [currentTarget, isRealConnected, isSimulationMode, liveCopX, liveCopY]);

  const guidance = useMemo(() => {
    if (!currentTarget) {
      return {
        guidanceMessage: isSimulationMode ? "Simulation Ready" : "Waiting for Balance Board",
        isGood: false,
        isInTargetZone: false,
        isBoardWaiting: !isSimulationMode,
        dx: 0,
        dy: 0,
        distance: null,
      };
    }

    if (!isRealConnected && !isSimulationMode) {
      return {
        guidanceMessage: "Waiting for Balance Board",
        isGood: false,
        isInTargetZone: false,
        isBoardWaiting: true,
        dx: 0,
        dy: 0,
        distance: null,
      };
    }

    return computeDirectionalGuidance(
      liveCopX,
      liveCopY,
      currentTarget,
      showGoodBadge,
      holdProgress > 0
    );
  }, [currentTarget, isRealConnected, isSimulationMode, liveCopX, liveCopY, showGoodBadge, holdProgress]);

  // Keyboard Arrow Keys (and WASD) controller for Simulation Mode
  useEffect(() => {
    if (!isSimulationMode || phase !== "ACTIVE") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting keystrokes if typing inside inputs or textareas
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const code = e.code;
      const key = e.key;

      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "KeyA",
          "KeyD",
          "KeyW",
          "KeyS",
          "Space",
          "KeyC",
        ].includes(code) ||
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(key)
      ) {
        e.preventDefault();
        keysPressedRef.current[key] = true;
        keysPressedRef.current[code] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key;
      keysPressedRef.current[key] = false;
      keysPressedRef.current[code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keysPressedRef.current = {};
    };
  }, [isSimulationMode, phase]);

  // Simulation physics loop: runs at ~30Hz (33ms) when isSimulationMode && phase === "ACTIVE"
  // Generates realistic, continuous physiological COP movement with smooth momentum and micro-sway
  useEffect(() => {
    if (!isSimulationMode || phase !== "ACTIVE") return;

    const interval = setInterval(() => {
      const keys = keysPressedRef.current;
      let dx = 0;
      let dy = 0;

      // Lateral step (ArrowLeft / KeyA = negative X / Left, ArrowRight / KeyD = positive X / Right)
      if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 0.024;
      if (keys["ArrowRight"] || keys["KeyD"]) dx += 0.024;

      // Anteroposterior step (ArrowUp / KeyW = positive Y / Forward, ArrowDown / KeyS = negative Y / Backward)
      if (keys["ArrowUp"] || keys["KeyW"]) dy += 0.022;
      if (keys["ArrowDown"] || keys["KeyS"]) dy -= 0.022;

      let nextX = simCopRef.current.x;
      let nextY = simCopRef.current.y;

      if (keys["Space"] || keys["KeyC"] || keys[" "]) {
        // Return to neutral center smoothly
        simTargetGoalRef.current = null;
        nextX = nextX * 0.88;
        nextY = nextY * 0.88;
      } else if (dx !== 0 || dy !== 0) {
        // Direct manual steering cancels auto-glide
        simTargetGoalRef.current = null;
        nextX += dx;
        nextY += dy;
      } else if (simTargetGoalRef.current) {
        // Smoothly glide towards selected target goal
        const target = simTargetGoalRef.current;
        const dist = Math.hypot(target.x - nextX, target.y - nextY);
        if (dist > 0.012) {
          nextX += (target.x - nextX) * 0.085;
          nextY += (target.y - nextY) * 0.085;
        } else {
          nextX = target.x;
          nextY = target.y;
        }
      }

      // Add realistic microscopic human physiological postural tremor (approx. ±0.002 to ±0.003)
      const now = Date.now();
      const swayX = Math.sin(now * 0.004) * 0.0025 + (Math.random() - 0.5) * 0.002;
      const swayY = Math.cos(now * 0.0035) * 0.0025 + (Math.random() - 0.5) * 0.002;

      // Safe bounds clamp within physical board limit: X in [-0.70, 0.70], Y in [-0.60, 0.60]
      const clampedX = Math.max(-0.70, Math.min(0.70, nextX + swayX));
      const clampedY = Math.max(-0.60, Math.min(0.60, nextY + swayY));

      simCopRef.current = { x: clampedX, y: clampedY };
      setSimCop({ x: parseFloat(clampedX.toFixed(3)), y: parseFloat(clampedY.toFixed(3)) });
    }, 33);

    return () => clearInterval(interval);
  }, [isSimulationMode, phase]);

  // On-screen control handlers for simulation mode
  const handleSimNudge = (deltaX: number, deltaY: number) => {
    if (!isSimulationMode || phase !== "ACTIVE") return;
    simTargetGoalRef.current = null;
    const nextX = Math.max(-0.70, Math.min(0.70, simCopRef.current.x + deltaX));
    const nextY = Math.max(-0.60, Math.min(0.60, simCopRef.current.y + deltaY));
    simCopRef.current = { x: nextX, y: nextY };
    setSimCop({ x: parseFloat(nextX.toFixed(3)), y: parseFloat(nextY.toFixed(3)) });
  };

  const handleSimGlideToTarget = (targetX: number, targetY: number) => {
    if (!isSimulationMode || phase !== "ACTIVE") return;
    simTargetGoalRef.current = { x: targetX, y: targetY };
  };

  const handleSimResetToCenter = () => {
    if (!isSimulationMode) return;
    simTargetGoalRef.current = { x: 0.0, y: 0.0 };
  };

  // Active Session Timer
  useEffect(() => {
    if (phase === "ACTIVE") {
      timerRef.current = setInterval(() => {
        setElapsedMs((prev) => prev + 100);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // Collect 4-load-cell quiet standing samples during CALIBRATING phase (Real Hardware Mode)
  useEffect(() => {
    if (phase !== "CALIBRATING" || isSimulationMode) return;

    if (!isRealConnected || !hardwareReading) {
      return;
    }

    const copCalc = calculateCopFromLoadCells(
      hardwareReading.frontLeft,
      hardwareReading.frontRight,
      hardwareReading.backLeft,
      hardwareReading.backRight
    );

    const timestamp = hardwareReading.timestamp || Date.now();
    if (copCalc.isValid) {
      calibrationCollectorRef.current.addCopSample(
        timestamp,
        copCalc.copX,
        copCalc.copY,
        copCalc.totalWeight
      );
      setCalibrationLiveWeight(copCalc.totalWeight);
    }
  }, [phase, isSimulationMode, isRealConnected, hardwareReading]);

  // Simulate quiet, natural standing samples during CALIBRATING phase (Simulation Mode)
  useEffect(() => {
    if (phase !== "CALIBRATING" || !isSimulationMode) return;

    const simInterval = setInterval(() => {
      const now = Date.now();
      const swayX = Math.sin(now * 0.003) * 0.006 + (Math.random() - 0.5) * 0.003;
      const swayY = Math.cos(now * 0.0025) * 0.006 + (Math.random() - 0.5) * 0.003;
      const simWeight = 68.4 + (Math.random() - 0.5) * 0.15;

      calibrationCollectorRef.current.addCopSample(now, swayX, swayY, simWeight);
      setCalibrationLiveWeight(parseFloat(simWeight.toFixed(1)));
    }, 40);

    return () => clearInterval(simInterval);
  }, [phase, isSimulationMode]);

  // Calibration countdown ticker, sway computation, and 5-second validation check
  useEffect(() => {
    if (phase !== "CALIBRATING") return;

    const tickInterval = setInterval(() => {
      // Disconnection guard during hardware calibration
      if (!isSimulationMode && !isRealConnected) {
        clearInterval(tickInterval);
        setCalibrationError("Balance board disconnected during calibration. Please step onto the board to recalibrate.");
        setPhase("CALIBRATION_FAILED");
        return;
      }

      const collector = calibrationCollectorRef.current;
      const status = collector.getStatus();
      setCalibrationProgress(status);

      // Real-time sway calculation for visual doctor feedback
      const samples = collector.getSamples();
      if (samples.length >= 5) {
        const copXs = samples.map((s) => s.copX);
        const copYs = samples.map((s) => s.copY);
        const meanX = copXs.reduce((a, b) => a + b, 0) / copXs.length;
        const meanY = copYs.reduce((a, b) => a + b, 0) / copYs.length;
        const varX = copXs.reduce((acc, x) => acc + Math.pow(x - meanX, 2), 0) / copXs.length;
        const varY = copYs.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0) / copXs.length;
        const sdX = Math.sqrt(varX) * WII_BOARD_DIMENSIONS.halfDistanceXMm;
        const sdY = Math.sqrt(varY) * WII_BOARD_DIMENSIONS.halfDistanceYMm;
        setCalibrationLiveSwayMm(parseFloat(Math.hypot(sdX, sdY).toFixed(1)));
      }

      if (status.isComplete) {
        clearInterval(tickInterval);
        const validation = collector.validateAndFinalize(5.0);
        if (validation.isValid && validation.baseline) {
          startActiveExercise(validation.baseline);
        } else {
          setCalibrationError(validation.errorReason || "Baseline calibration failed. Please stand still and try again.");
          setPhase("CALIBRATION_FAILED");
        }
      }
    }, 100);

    return () => clearInterval(tickInterval);
  }, [phase, isSimulationMode, isRealConnected, targets]);

  // Collect distance samples for session accuracy
  useEffect(() => {
    if (phase === "ACTIVE" && (isRealConnected || isSimulationMode) && currentTarget && guidance.distance !== null) {
      distanceSamplesRef.current.push(guidance.distance);
    }
  }, [phase, isRealConnected, isSimulationMode, currentTarget, guidance.distance]);

  // Directional Target Trackers (accumulating exact samples and timestamp metrics)
  const trackersRef = useRef<DirectionalTargetTracker[]>(targets.map((t) => new DirectionalTargetTracker(t)));
  const sessionStartTimeRef = useRef<number | null>(null);

  // Additional Assessment & Modal State
  const [sessionSummary, setSessionSummary] = useState<DirectionalWeightShiftSessionSummary | null>(null);
  const [showDetailedModal, setShowDetailedModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportResult, setPdfExportResult] = useState<{ filename: string; filePath: string } | null>(null);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);

  // Record live COP trail points during active exercise
  useEffect(() => {
    if (phase !== "ACTIVE" || (!isRealConnected && !isSimulationMode) || liveCopX === null || liveCopY === null) return;
    setActiveTrailPoints((prev) => {
      const next = [...prev, { xPercent: targetBoardCoords.xPercent, yPercent: targetBoardCoords.yPercent }];
      return next.length > 600 ? next.slice(next.length - 600) : next;
    });
  }, [phase, isRealConnected, isSimulationMode, liveCopX, liveCopY, targetBoardCoords.xPercent, targetBoardCoords.yPercent]);

  // Per-target colour-coded path data for the completed result board
  const TARGET_PATH_COLORS: Record<DirectionalTargetName, string> = {
    "SHIFT LEFT": "#EF4444",
    "SHIFT RIGHT": "#F59E0B",
    "SHIFT FORWARD": "#3B82F6",
    "SHIFT BACKWARD": "#8B5CF6",
    "RETURN TO CENTER": "#10B981",
  };

  const perTargetPaths = useMemo(() => {
    if (!sessionSummary) return [];
    return sessionSummary.targets.map((t) => ({
      name: t.name,
      shortLabel: t.shortLabel,
      stepNumber: t.stepNumber,
      color: TARGET_PATH_COLORS[t.name],
      isCompleted: t.isCompleted,
      timeInsideSeconds: t.timeInsideSeconds,
      requiredHoldDurationSeconds: t.requiredHoldDurationSeconds,
      actualSuccessfulHoldDurationSeconds: t.actualSuccessfulHoldDurationSeconds,
      accuracyPercentage: t.accuracyPercentage,
      sensorQuality: t.sensorQuality,
      hasData: t.samples.length > 0,
      points: t.samples.map((s) => mapCopToBoard(s.copX, s.copY)),
      targetBoardPos: mapCopToBoard(t.targetX, t.targetY),
      tolerance: t.tolerance,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSummary]);

  const handleDurationChange = (name: DirectionalTargetName, delta: number) => {
    setCustomDurations((prev) => {
      const current = prev[name] ?? DEFAULT_DIRECTIONAL_DURATIONS[name];
      const next = Math.max(1, Math.min(15, current + delta));
      return { ...prev, [name]: next };
    });
  };

  const handleResetDurations = () => {
    setCustomDurations({ ...DEFAULT_DIRECTIONAL_DURATIONS });
  };

  // Telemetry Processing through DirectionalTargetTracker
  useEffect(() => {
    if (phase !== "ACTIVE" || !currentTarget || isAdvancingRef.current) return;

    const tracker = trackersRef.current[currentTargetIndex];
    if (!tracker) return;

    const sampleTimestamp = isSimulationMode ? Date.now() : (hardwareReading?.timestamp || Date.now());
    const result = tracker.recordSample(
      sampleTimestamp,
      liveCopX,
      liveCopY,
      liveWeight,
      isRealConnected || isSimulationMode,
      filteredRawCop.x,
      filteredRawCop.y
    );

    // Diagnostic telemetry logging for clinical debugging (baseline, targets, live COP, distance error)
    if (process.env.NODE_ENV !== "production") {
      const now = Date.now();
      if (!lastDebugLogRef.current || now - lastDebugLogRef.current >= 500) {
        lastDebugLogRef.current = now;
        console.debug("[DirectionalWeightShift:Telemetry]", {
          phase: "ACTIVE",
          targetIndex: currentTargetIndex,
          targetName: currentTarget.name,
          baseline: {
            x0Mm: calibrationBaseline?.baselineX0Mm ?? 0,
            y0Mm: calibrationBaseline?.baselineY0Mm ?? 0,
          },
          targetCoordinates: {
            targetXMm: currentTarget.targetXMm,
            targetYMm: currentTarget.targetYMm,
            relTargetXMm: currentTarget.relTargetXMm,
            relTargetYMm: currentTarget.relTargetYMm,
            normX: currentTarget.x,
            normY: currentTarget.y,
          },
          currentCop: {
            rawCopX: filteredRawCop.x,
            rawCopY: filteredRawCop.y,
            relCopX: liveCopX,
            relCopY: liveCopY,
            weightKg: liveWeight,
          },
          distanceError: {
            distNorm: guidance.distance,
            distMm: guidance.distance !== null ? parseFloat((guidance.distance * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(2)) : null,
            isInside: isWithinTargetZone,
          },
        });
      }
    }

    setHoldProgress(result.holdProgressPct);

    if (result.isCompleted && !isAdvancingRef.current) {
      // SUCCESS: Target reached and held continuously for required duration!
      isAdvancingRef.current = true;
      setShowGoodBadge(true);
      setHoldProgress(100);

      const newCompletedCount = completedCount + 1;
      setCompletedCount(newCompletedCount);

      // Display "GOOD" for 900ms then move to the next target
      setTimeout(() => {
        setShowGoodBadge(false);
        setHoldProgress(0);

        if (currentTargetIndex + 1 < targets.length) {
          const nextIdx = currentTargetIndex + 1;
          setCurrentTargetIndex(nextIdx);
          trackersRef.current[nextIdx].start(Date.now());
          isAdvancingRef.current = false;
        } else {
          // All 5 directional movements completed!
          isAdvancingRef.current = false;
          finishSession(newCompletedCount);
        }
      }, 900);
    }
  }, [
    phase,
    hardwareReading,
    liveCopX,
    liveCopY,
    liveWeight,
    filteredRawCop.x,
    filteredRawCop.y,
    calibrationBaseline,
    guidance.distance,
    isWithinTargetZone,
    isRealConnected,
    isSimulationMode,
    currentTargetIndex,
    currentTarget,
    completedCount,
    targets.length,
  ]);

  // Heartbeat to detect disconnection/inactivity and pause assessment safely (Real Hardware Mode only)
  useEffect(() => {
    if (phase !== "ACTIVE" || !currentTarget || isAdvancingRef.current) return;

    const interval = setInterval(() => {
      // In Simulation Mode, physical hardware is intentionally not connected
      if (isSimulationMode) return;

      if (!isRealConnected) {
        const tracker = trackersRef.current[currentTargetIndex];
        if (tracker) {
          tracker.recordSample(Date.now(), null, null, null, false);
        }
        setHoldProgress(0);
        // pause assessment and clearly display the reason if board disconnects
        setPhase("PAUSED");
        setPauseReason(
          "Balance board connection interrupted or no valid weight detected on the force plate. Please step onto the board to resume."
        );
      }
    }, 120);

    return () => clearInterval(interval);
  }, [phase, currentTarget, currentTargetIndex, isRealConnected, isSimulationMode]);

  // Finalizes session and computes comprehensive clinical summary
  const finishSession = (finalCompletedCount?: number) => {
    const finalCount = typeof finalCompletedCount === "number" ? finalCompletedCount : completedCount;
    setPhase("COMPLETED");

    // Finalize all target trackers up to this point
    const finalizedAssessments = trackersRef.current.map((t) => t.finalize());

    // In Simulation Mode, isRealHardware is strictly FALSE so simulated data is never mixed with clinical history
    const isAuthenticRealHardware = !isSimulationMode && isRealConnected;

    const summary = calculateDirectionalSessionSummary({
      sessionId: `session-dir-${isSimulationMode ? "sim" : "real"}-${Date.now()}`,
      patientId: isSimulationMode ? "SIM-TEST" : (patient?.id || patient?.medicalRecordNumber || "P-DEFAULT"),
      patientName: isSimulationMode ? "Simulated Test Patient" : (patient?.fullName || "Unspecified Patient"),
      startTime: sessionStartTimeRef.current || (Date.now() - elapsedMs),
      endTime: Date.now(),
      targets: finalizedAssessments,
      isRealHardware: isAuthenticRealHardware,
      calibrationBaseline: calibrationBaseline || undefined,
    });

    const result = calculateDirectionalExerciseResult({
      completedTargets: finalCount,
      totalTargets: targets.length,
      elapsedMs,
      distanceSamples: distanceSamplesRef.current,
      isConnected: isAuthenticRealHardware,
      targetAssessments: finalizedAssessments,
      patientId: isSimulationMode ? "SIM-TEST" : patient?.id,
      patientName: isSimulationMode ? "Simulated Test Patient" : patient?.fullName,
      startTime: sessionStartTimeRef.current || (Date.now() - elapsedMs),
      endTime: Date.now(),
      calibrationBaseline: calibrationBaseline || undefined,
    });

    setSessionSummary(summary);
    setFinalResult(result);
  };

  // Controls Handlers
  const handleStartCalibration = () => {
    if (!isSimulationMode && !isRealConnected) {
      return;
    }
    setPhase("CALIBRATING");
    setPauseReason(null);
    setCalibrationError(null);
    setCalibrationBaseline(null);
    calibrationCollectorRef.current = new BaselineCalibrationCollector(5.0);
    calibrationCollectorRef.current.reset();
    rollingFilterRef.current.reset();
    setCalibrationProgress({
      elapsedSeconds: 0,
      targetSeconds: 5.0,
      progressPct: 0,
      sampleCount: 0,
      isComplete: false,
    });
    setCalibrationLiveWeight(null);
    setCalibrationLiveSwayMm(null);
  };

  const startActiveExercise = (baseline: DirectionalCalibrationBaseline) => {
    setCalibrationBaseline(baseline);
    setCalibrationError(null);
    setPhase("ACTIVE");
    setPauseReason(null);
    isAdvancingRef.current = false;
    sessionStartTimeRef.current = Date.now();
    setActiveTrailPoints([]);
    simCopRef.current = { x: 0.0, y: 0.0 };
    setSimCop({ x: 0.0, y: 0.0 });
    simTargetGoalRef.current = null;
    keysPressedRef.current = {};
    const calibratedTargets = getDirectionalTargets(customDurations, undefined, baseline);
    trackersRef.current = calibratedTargets.map((t) => new DirectionalTargetTracker(t, baseline));
    trackersRef.current[0].start(Date.now());
  };

  const handlePause = () => {
    setPhase("PAUSED");
  };

  const handleResume = () => {
    setPhase("ACTIVE");
    setPauseReason(null);
  };

  const handleSkipTarget = () => {
    if (phase !== "ACTIVE" || !currentTarget || isAdvancingRef.current) return;

    // Finalize current target attempt as incomplete
    const tracker = trackersRef.current[currentTargetIndex];
    if (tracker) {
      tracker.finalize();
    }

    setHoldProgress(0);
    setShowGoodBadge(false);

    if (currentTargetIndex + 1 < targets.length) {
      const nextIdx = currentTargetIndex + 1;
      setCurrentTargetIndex(nextIdx);
      trackersRef.current[nextIdx].start(Date.now());
    } else {
      finishSession();
    }
  };

  const handleFinishEarly = () => {
    if (phase !== "ACTIVE" && phase !== "PAUSED") return;
    finishSession();
  };

  const handleRestart = () => {
    onResultFullScreenChange?.(false);
    setPhase("READY");
    setPauseReason(null);
    setCalibrationBaseline(null);
    setCalibrationError(null);
    setCalibrationLiveWeight(null);
    setCalibrationLiveSwayMm(null);
    setCalibrationProgress({
      elapsedSeconds: 0,
      targetSeconds: 5.0,
      progressPct: 0,
      sampleCount: 0,
      isComplete: false,
    });
    calibrationCollectorRef.current.reset();
    rollingFilterRef.current.reset();
    setCurrentTargetIndex(0);
    setHoldProgress(0);
    setShowGoodBadge(false);
    setCompletedCount(0);
    setElapsedMs(0);
    distanceSamplesRef.current = [];
    setActiveTrailPoints([]);
    isAdvancingRef.current = false;
    setFinalResult(null);
    setSessionSummary(null);
    setShowDetailedModal(false);
    setPdfExportResult(null);
    setPdfExportError(null);
    sessionStartTimeRef.current = null;
    simCopRef.current = { x: 0.0, y: 0.0 };
    setSimCop({ x: 0.0, y: 0.0 });
    simTargetGoalRef.current = null;
    keysPressedRef.current = {};
    trackersRef.current = targets.map((t) => new DirectionalTargetTracker(t));
  };

  const handleExportPdf = async () => {
    if (!sessionSummary) return;
    setIsExportingPdf(true);
    setPdfExportError(null);
    try {
      const res = await PdfReportService.generateAndSaveDirectionalReport(sessionSummary);
      setPdfExportResult({ filename: res.filename, filePath: res.filePath });
    } catch (err: any) {
      setPdfExportError(err?.message || String(err));
    } finally {
      setIsExportingPdf(false);
    }
  };


  // Color theme: Medical Light-Green / White
  return (
    <div
      style={{
        width: "100%",
        maxWidth: phase === "COMPLETED" ? "100%" : "980px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: phase === "COMPLETED" ? "20px" : "18px",
        padding: phase === "COMPLETED" ? "20px 32px 64px 32px" : "10px 0 40px 0",
        boxSizing: "border-box",
        minHeight: phase === "COMPLETED" ? "100vh" : undefined,
      }}
    >
      {/* Top Header Card */}
      {phase === "COMPLETED" ? (
        <div
          className="medical-card"
          style={{
            padding: "16px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
            background: "#FFFFFF",
            border: "1px solid var(--border-light)",
            borderLeft: "6px solid var(--teal-primary, #0D9488)",
            borderRadius: "16px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {/* Left: Navigation Actions & Assessment Identification */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button
              onClick={handleBackToDashboard}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "0.9375rem",
                fontWeight: 800,
                borderRadius: "10px",
              }}
            >
              <Home size={18} />
              <span>Back to Dashboard</span>
            </button>

            {onExit && (
              <button
                onClick={handleExitToLibrary}
                className="btn-secondary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                }}
              >
                <ArrowLeft size={16} />
                <span>Return to Exercises</span>
              </button>
            )}

            <div style={{ marginLeft: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h1
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "var(--text-main)",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Directional Weight Shift &bull; Assessment Result
                </h1>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    color: "#0F766E",
                    background: "#CCFBF1",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  FULL SCREEN RESULT
                </span>
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Patient: <strong style={{ color: "var(--text-main)" }}>{patient?.fullName || "Rohan"}</strong> ({patient?.medicalRecordNumber || "MRN-2026-0841"}) &bull; Calibrated Force Plate Biomechanics
              </div>
            </div>
          </div>

          {/* Right: PDF Export & Restart Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || !sessionSummary}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                fontSize: "0.875rem",
                fontWeight: 800,
                borderRadius: "10px",
                background: "var(--teal-primary)",
              }}
            >
              <Download size={16} />
              <span>{isExportingPdf ? "Generating PDF..." : "Download PDF Report"}</span>
            </button>

            <button
              onClick={handleRestart}
              className="btn-secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 16px",
                fontSize: "0.875rem",
                fontWeight: 700,
                borderRadius: "10px",
              }}
            >
              <RotateCcw size={15} />
              <span>Restart Exercise</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="medical-card"
          style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
            borderLeft: "5px solid var(--teal-primary, #0D9488)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {onExit && (
              <button
                onClick={onExit}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  fontSize: "0.875rem",
                }}
              >
                <ArrowLeft size={16} />
                <span>Exercises</span>
              </button>
            )}

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#0F766E",
                    background: "#CCFBF1",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Phase D &bull; Wii Board Only
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "#059669",
                    background: "#ECFDF5",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: "1px solid #A7F3D0",
                  }}
                >
                  No Camera Required
                </span>
              </div>
              <h1
                style={{
                  fontSize: "1.375rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  margin: "4px 0 0 0",
                }}
              >
                Directional Weight Shift
                {patient?.fullName && (
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      marginLeft: "10px",
                    }}
                  >
                    &bull; Patient: {patient.fullName}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Real Hardware Telemetry Status & Timer */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Hardware / Simulation Mode Connection Indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: isSimulationMode ? "#FEF3C7" : isRealConnected ? "#ECFDF5" : "#FEF2F2",
                border: `1px solid ${isSimulationMode ? "#FCD34D" : isRealConnected ? "#A7F3D0" : "#FECACA"}`,
                fontSize: "0.75rem",
                fontWeight: 700,
                color: isSimulationMode ? "#92400E" : isRealConnected ? "#059669" : "#DC2626",
              }}
            >
              {isSimulationMode ? <Gamepad2 size={14} /> : <Scale size={14} />}
              <span>
                {isSimulationMode
                  ? "SIMULATION MODE — NOT REAL PATIENT DATA"
                  : isRealConnected
                    ? "Wii Board: Connected"
                    : "Waiting for Balance Board"}
              </span>
            </div>

            {/* Session Timer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 14px",
                background: "#F8FAFC",
                borderRadius: "10px",
                border: "1px solid var(--border-light)",
              }}
            >
              <Clock size={16} color="var(--teal-primary)" />
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-main)",
                }}
              >
                {formatSessionTime(Math.round(elapsedMs / 1000))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 1: Prominent Real Hardware / Simulation Mode Selector (Before Start) */}
      {phase === "READY" && (
        <div
          className="medical-card"
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
            background: isSimulationMode ? "#FFFBEB" : "#F8FAFC",
            border: `1.5px solid ${isSimulationMode ? "#FCD34D" : "#E2E8F0"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: isSimulationMode ? "#FEF3C7" : "#E0F2FE",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isSimulationMode ? "#D97706" : "#0284C7",
                flexShrink: 0,
              }}
            >
              {isSimulationMode ? <Gamepad2 size={24} /> : <Scale size={24} />}
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>
                Telemetry Source: {isSimulationMode ? "Simulation Mode (Interactive Testing)" : "Real Hardware Mode (Nintendo Wii Board)"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                {isSimulationMode
                  ? "Control COP using Keyboard Arrow Keys or on-screen directional buttons. Strictly marked as simulation data."
                  : isRealConnected
                    ? "Streaming live from physical Nintendo Wii Balance Board load cells."
                    : "Physical Wii Balance Board is offline. You can select Simulation Mode to test all 5 targets."}
              </div>
            </div>
          </div>

          {/* Segmented Mode Selector */}
          <div
            style={{
              display: "inline-flex",
              background: "#E2E8F0",
              padding: "4px",
              borderRadius: "10px",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setIsSimulationMode(false)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: "pointer",
                background: !isSimulationMode ? "#FFFFFF" : "transparent",
                color: !isSimulationMode ? "#0F766E" : "#64748B",
                boxShadow: !isSimulationMode ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Scale size={15} />
              <span>Real Hardware Mode</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSimulationMode(true)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.8125rem",
                fontWeight: 700,
                cursor: "pointer",
                background: isSimulationMode ? "#D97706" : "transparent",
                color: isSimulationMode ? "#FFFFFF" : "#64748B",
                boxShadow: isSimulationMode ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Gamepad2 size={15} />
              <span>Simulation Mode (Testing)</span>
            </button>
          </div>
        </div>
      )}

      {/* Persistent Simulation Mode Notification Banner throughout active exercise */}
      {isSimulationMode && (
        <div
          style={{
            padding: "14px 20px",
            background: "#FEF3C7",
            borderRadius: "12px",
            border: "2px solid #F59E0B",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            color: "#92400E",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Gamepad2 size={24} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.875rem", letterSpacing: "0.03em" }}>
                SIMULATION MODE ACTIVE — NOT REAL PATIENT DATA
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#B45309", marginTop: "2px" }}>
                Steer simulated COP using <strong>Keyboard Arrow Keys (← ↑ → ↓ / WASD)</strong> or the on-screen controls below.
                Continuous target hold is required to advance.
              </div>
            </div>
          </div>
          {phase === "READY" && (
            <button
              type="button"
              onClick={() => setIsSimulationMode(false)}
              className="btn-secondary"
              style={{
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 700,
                background: "#FFFFFF",
              }}
            >
              Switch to Real Hardware
            </button>
          )}
        </div>
      )}

      {/* Disconnection Warning Banner if board is not connected (Real Hardware Mode only) */}
      {!isSimulationMode && !isRealConnected && (
        <div
          style={{
            padding: "14px 20px",
            background: "#FFFBEB",
            borderRadius: "12px",
            border: "2px solid #FDE68A",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            color: "#92400E",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertCircle size={22} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.875rem" }}>
                Waiting for Balance Board Connection
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#B45309", marginTop: "2px" }}>
                This exercise strictly uses real Wii Balance Board telemetry. If physical hardware is unavailable,
                you can test using Simulation Mode.
              </div>
            </div>
          </div>
          {phase === "READY" && (
            <button
              type="button"
              onClick={() => setIsSimulationMode(true)}
              className="btn-primary"
              style={{
                padding: "8px 14px",
                fontSize: "0.75rem",
                fontWeight: 800,
                background: "#D97706",
                borderColor: "#D97706",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Gamepad2 size={14} />
              <span>Enable Simulation Mode</span>
            </button>
          )}
        </div>
      )}

      {/* Pause Reason Banner if assessment was paused due to board interruption */}
      {phase === "PAUSED" && pauseReason && (
        <div
          style={{
            padding: "14px 20px",
            background: "#FEF2F2",
            borderRadius: "12px",
            border: "2px solid #FCA5A5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            color: "#991B1B",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={22} color="#DC2626" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.875rem" }}>
                Assessment Paused
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#B91C1C", marginTop: "2px" }}>
                {pauseReason}
              </div>
            </div>
          </div>
          {(isRealConnected || isSimulationMode) && (
            <button
              onClick={handleResume}
              className="btn-primary"
              style={{
                padding: "8px 16px",
                fontSize: "0.8125rem",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              Resume Assessment
            </button>
          )}
        </div>
      )}

      {/* Configurable Target Hold Durations Panel (Available in READY phase) */}
      {phase === "READY" && (
        <div
          className="medical-card"
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            background: "#F8FAFC",
            border: "1px solid var(--border-mint)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
            onClick={() => setShowDurationConfig((prev) => !prev)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <SlidersHorizontal size={18} color="var(--teal-primary)" />
              <span style={{ fontWeight: 800, fontSize: "0.875rem", color: "var(--text-main)" }}>
                Configurable Target Hold Durations
              </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                (Protocol Defaults: Left: 2s, Right: 3s, Forward: 1s, Backward: 2s, Center: 3s)
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--teal-primary)",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              <span>{showDurationConfig ? "Hide" : "Customize"}</span>
              {showDurationConfig ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {showDurationConfig && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "10px",
                }}
              >
                {(
                  [
                    { name: "SHIFT LEFT" as DirectionalTargetName, label: "Left" },
                    { name: "SHIFT RIGHT" as DirectionalTargetName, label: "Right" },
                    { name: "SHIFT FORWARD" as DirectionalTargetName, label: "Forward" },
                    { name: "SHIFT BACKWARD" as DirectionalTargetName, label: "Backward" },
                    { name: "RETURN TO CENTER" as DirectionalTargetName, label: "Center" },
                  ] as const
                ).map(({ name, label }) => {
                  const sec = customDurations[name] ?? DEFAULT_DIRECTIONAL_DURATIONS[name];
                  return (
                    <div
                      key={name}
                      style={{
                        padding: "10px 12px",
                        background: "#FFFFFF",
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)" }}>
                        {label} Target
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleDurationChange(name, -1)}
                          disabled={sec <= 1}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "4px",
                            border: "1px solid #CBD5E1",
                            background: sec <= 1 ? "#F1F5F9" : "#FFFFFF",
                            cursor: sec <= 1 ? "not-allowed" : "pointer",
                            fontWeight: 800,
                            fontSize: "0.875rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          -
                        </button>
                        <span style={{ fontWeight: 800, fontSize: "0.9375rem", minWidth: "26px", textAlign: "center" }}>
                          {sec}s
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDurationChange(name, 1)}
                          disabled={sec >= 15}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "4px",
                            border: "1px solid #CBD5E1",
                            background: sec >= 15 ? "#F1F5F9" : "#FFFFFF",
                            cursor: sec >= 15 ? "not-allowed" : "pointer",
                            fontWeight: 800,
                            fontSize: "0.875rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={handleResetDurations}
                  className="btn-ghost"
                  style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MAIN EXERCISE VIEW
         ===================================================================== */}
      {phase !== "COMPLETED" ? (
        <>
          {/* 1. TOP LARGE CLEAR INSTRUCTION CARD */}
          {phase === "CALIBRATING" ? (
            <div
              className="medical-card"
              style={{
                padding: "24px 28px",
                textAlign: "center",
                background: "linear-gradient(135deg, #F0FDFA 0%, #E6FFFA 100%)",
                border: "2px solid var(--teal-primary)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#CCFBF1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                }}
              >
                <Scale size={32} />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "var(--teal-primary)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Initial Patient Calibration &bull; 5-Second Quiet Standing
                </div>
                <h2
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 900,
                    color: "var(--text-main)",
                    margin: "4px 0 6px 0",
                  }}
                >
                  ESTABLISHING NEUTRAL BASELINE (X₀, Y₀)
                </h2>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    margin: 0,
                    maxWidth: "580px",
                  }}
                >
                  Please stand naturally with both feet stationary on the Wii Balance Board, arms relaxed at sides, and look straight ahead.
                </p>
              </div>

              {/* Countdown & Progress bar */}
              <div style={{ width: "100%", maxWidth: "420px", marginTop: "4px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    color: "var(--teal-primary)",
                    marginBottom: "6px",
                  }}
                >
                  <span>Calibrating quiet stance...</span>
                  <span>{(Math.max(0, 5.0 - calibrationProgress.elapsedSeconds)).toFixed(1)}s remaining</span>
                </div>
                <div
                  style={{
                    height: "10px",
                    background: "#E2E8F0",
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${calibrationProgress.progressPct}%`,
                      background: "linear-gradient(90deg, var(--teal-primary), #10B981)",
                      transition: "width 0.1s linear",
                    }}
                  />
                </div>
              </div>

              {/* Live calibration telemetry stats */}
              <div
                style={{
                  display: "flex",
                  gap: "14px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  marginTop: "4px",
                }}
              >
                <div
                  style={{
                    padding: "6px 14px",
                    background: "#FFFFFF",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                  }}
                >
                  Patient Weight: <strong>{calibrationLiveWeight ? `${calibrationLiveWeight.toFixed(1)} kg` : liveWeight ? `${liveWeight.toFixed(1)} kg` : "-- kg"}</strong>
                </div>
                <div
                  style={{
                    padding: "6px 14px",
                    background: "#FFFFFF",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                  }}
                >
                  Valid Samples: <strong>{calibrationProgress.sampleCount}</strong>
                </div>
                <div
                  style={{
                    padding: "6px 14px",
                    background: "#FFFFFF",
                    borderRadius: "8px",
                    border: "1px solid #CBD5E1",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "var(--text-main)",
                  }}
                >
                  Quiet Sway: <strong>{calibrationLiveSwayMm !== null ? `${calibrationLiveSwayMm.toFixed(1)} mm` : "Measuring..."}</strong>
                </div>
              </div>
            </div>
          ) : phase === "CALIBRATION_FAILED" ? (
            <div
              className="medical-card"
              style={{
                padding: "24px 28px",
                textAlign: "center",
                background: "#FEF2F2",
                border: "2px solid #EF4444",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#FEE2E2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#DC2626",
                }}
              >
                <AlertTriangle size={32} />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#DC2626",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Calibration Incomplete &bull; Scientific Validation Check
                </div>
                <h2
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 900,
                    color: "#991B1B",
                    margin: "4px 0 6px 0",
                  }}
                >
                  BASELINE CALIBRATION REJECTED
                </h2>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color: "#B91C1C",
                    margin: "0 auto",
                    maxWidth: "600px",
                    background: "#FFFFFF",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid #FCA5A5",
                  }}
                >
                  {calibrationError || "Baseline calibration failed. Please stand still and try again."}
                </p>
              </div>

              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "#7F1D1D",
                  maxWidth: "540px",
                  lineHeight: 1.5,
                }}
              >
                <strong>Protocol Guidelines:</strong> Ensure both feet are stationary on the board, body weight exceeds 15 kg without stepping off, and maintain quiet standing during the 5-second window.
              </div>
            </div>
          ) : (
            <div
              className="medical-card"
              style={{
                padding: "20px 24px",
                textAlign: "center",
                background: showGoodBadge
                  ? "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)"
                  : isWithinTargetZone
                    ? "linear-gradient(135deg, #F0FDFA 0%, #E6FFFA 100%)"
                    : "#FFFFFF",
                border: `2px solid ${showGoodBadge
                    ? "#059669"
                    : isWithinTargetZone
                      ? "var(--teal-primary)"
                      : "var(--border-light)"
                  }`,
                transition: "all 0.25s ease",
              }}
            >
              {/* Step Progress & Target Tag */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 12px",
                  borderRadius: "14px",
                  background: "rgba(13, 148, 136, 0.1)",
                  color: "var(--teal-primary)",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                <span>Target {currentTargetIndex + 1} of {targets.length}</span>
                <span>&bull;</span>
                <span>{currentTarget?.shortLabel}</span>
              </div>

              {/* LARGE CLEAR INSTRUCTION AT TOP */}
              <h2
                style={{
                  fontSize: "2.125rem",
                  fontWeight: 900,
                  color: showGoodBadge ? "#059669" : "var(--text-main)",
                  letterSpacing: "0.02em",
                  margin: "4px 0 4px 0",
                  textTransform: "uppercase",
                }}
              >
                {currentTarget?.name}
              </h2>

              {/* Sequential Target Instruction */}
              <p
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  margin: "0 0 10px 0",
                }}
              >
                {currentTarget?.instruction}
              </p>

              {/* GUIDANCE MESSAGE & GOOD BADGE */}
              <div style={{ minHeight: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showGoodBadge ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#059669",
                      color: "#FFFFFF",
                      padding: "6px 20px",
                      borderRadius: "20px",
                      fontSize: "1.25rem",
                      fontWeight: 900,
                      letterSpacing: "0.05em",
                      boxShadow: "0 4px 12px rgba(5, 150, 105, 0.35)",
                      animation: "pulse 0.8s infinite alternate",
                    }}
                  >
                    <Check size={22} strokeWidth={3} />
                    <span>GOOD! Target Reached</span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: isWithinTargetZone
                        ? "var(--teal-primary)"
                        : guidance.isBoardWaiting
                          ? "var(--text-muted)"
                          : "#D97706",
                    }}
                  >
                    {guidance.guidanceMessage}
                  </div>
                )}
              </div>

              {/* Live Hold Progress Indicator */}
              <div
                style={{
                  maxWidth: "360px",
                  margin: "12px auto 0 auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                  }}
                >
                  <span>Hold Duration ({currentTarget?.requiredHoldDurationSeconds}s Required)</span>
                  <span style={{ color: holdProgress === 100 ? "#059669" : "var(--teal-primary)", fontWeight: 800 }}>
                    {currentTarget
                      ? `${(Math.min(currentTarget.requiredHoldDurationSeconds, (holdProgress / 100) * currentTarget.requiredHoldDurationSeconds)).toFixed(1)}s / ${currentTarget.requiredHoldDurationSeconds}s`
                      : "0.0s"}
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: "#E2E8F0",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${holdProgress}%`,
                      background:
                        holdProgress === 100
                          ? "#059669"
                          : "linear-gradient(90deg, var(--teal-primary), #10B981)",
                      transition: "width 0.05s linear",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. CENTER BALANCE BOARD VISUALIZATION */}
          <div
            className="medical-card"
            style={{
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            }}
          >
            {/* Calibrated Baseline Indicator (Step 1) */}
            {calibrationBaseline?.isCalibrated && (phase === "ACTIVE" || phase === "PAUSED") && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--teal-primary)",
                  background: "#F0FDFA",
                  padding: "5px 14px",
                  borderRadius: "16px",
                  border: "1px solid var(--border-mint)",
                  marginBottom: "12px",
                }}
              >
                <Crosshair size={14} />
                <span>
                  Neutral Baseline: X₀ = {calibrationBaseline.baselineX0Mm >= 0 ? "+" : ""}{calibrationBaseline.baselineX0Mm.toFixed(1)} mm,
                  Y₀ = {calibrationBaseline.baselineY0Mm >= 0 ? "+" : ""}{calibrationBaseline.baselineY0Mm.toFixed(1)} mm &bull; Patient Weight: {calibrationBaseline.calibratedWeightKg} kg
                </span>
              </div>
            )}

            {/* Front / Anterior (+Y) Axis Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                marginBottom: "8px",
              }}
            >
              <span>FRONT / ANTERIOR (+Y)</span>
              <span>↑</span>
            </div>

            {/* Board Row: Left Label | Force Plate | Right Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                maxWidth: "680px",
                gap: "12px",
              }}
            >
              {/* Left Label */}
              <div
                style={{
                  width: "56px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.6875rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                }}
              >
                <span>← LEFT</span>
                <span style={{ fontSize: "0.625rem", color: "var(--text-light)" }}>(-X)</span>
              </div>

              {/* Physical Balance Board Chassis */}
              <div
                style={{
                  flex: 1,
                  aspectRatio: "446 / 238",
                  position: "relative",
                  background: "#FFFFFF",
                  borderRadius: "28px",
                  border: "2px solid #CBD5E1",
                  boxShadow:
                    "0 10px 25px -5px rgba(15, 23, 42, 0.08), inset 0 2px 4px rgba(255, 255, 255, 0.8)",
                  padding: "16px",
                  overflow: "hidden",
                }}
              >
                {/* Surface Perimeter */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderRadius: "20px",
                    border: "1px solid #E2E8F0",
                    background: "#FAFCFC",
                  }}
                >
                  {/* Center Crosshair Lines */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "6%",
                      right: "6%",
                      height: "1px",
                      borderTop: "1px dashed #CBD5E1",
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
                      borderLeft: "1px dashed #CBD5E1",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Simulation Mode Watermark Badge inside Force Plate */}
                  {isSimulationMode && (
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "12px",
                        background: "rgba(254, 243, 199, 0.90)",
                        border: "1px solid #FCD34D",
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "0.625rem",
                        fontWeight: 800,
                        color: "#92400E",
                        letterSpacing: "0.04em",
                        pointerEvents: "none",
                        zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <Gamepad2 size={12} />
                      <span>SIMULATION MODE — NOT REAL PATIENT DATA</span>
                    </div>
                  )}

                  {/* REAL-TIME SVG COP MOVEMENT TRAIL */}
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {activeTrailPoints.length > 1 && (
                      <polyline
                        points={activeTrailPoints.map((p) => `${p.xPercent.toFixed(1)},${p.yPercent.toFixed(1)}`).join(" ")}
                        fill="none"
                        stroke="rgba(13, 148, 136, 0.5)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>

                  {/* VISUAL TARGETS (ALL 5 SEQUENTIAL TARGETS) */}
                  {targets.map((t, idx) => {
                    const coords = mapCopToBoard(t.x, t.y);
                    const isCurrent = idx === currentTargetIndex;
                    const isCompleted = idx < currentTargetIndex;

                    return (
                      <div
                        key={t.id}
                        style={{
                          position: "absolute",
                          left: `${coords.xPercent}%`,
                          top: `${coords.yPercent}%`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "none",
                          zIndex: isCurrent ? 4 : 3,
                        }}
                      >
                        {/* Target Circle */}
                        <div
                          style={{
                            width: isCurrent ? "68px" : "44px",
                            height: isCurrent ? "68px" : "44px",
                            borderRadius: "50%",
                            border: isCurrent
                              ? isWithinTargetZone
                                ? "3px solid #059669"
                                : "2px dashed var(--teal-primary)"
                              : isCompleted
                                ? "2.5px solid #059669"
                                : "1.5px dashed #CBD5E1",
                            background: isCurrent
                              ? isWithinTargetZone
                                ? "rgba(5, 150, 105, 0.18)"
                                : "rgba(13, 148, 136, 0.08)"
                              : isCompleted
                                ? "rgba(16, 185, 129, 0.18)"
                                : "rgba(241, 245, 249, 0.4)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {isCompleted ? (
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                background: "#059669",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#FFFFFF",
                                fontSize: "0.6875rem",
                                fontWeight: 900,
                              }}
                            >
                              ✓
                            </div>
                          ) : isCurrent ? (
                            <div
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "50%",
                                background: isWithinTargetZone ? "#059669" : "var(--teal-primary)",
                                boxShadow: isWithinTargetZone
                                  ? "0 0 12px rgba(5, 150, 105, 0.6)"
                                  : "0 0 8px rgba(13, 148, 136, 0.4)",
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#94A3B8" }}>
                              {t.stepNumber}
                            </span>
                          )}
                        </div>

                        {/* Label Badge */}
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: "2px",
                            whiteSpace: "nowrap",
                            fontSize: "0.625rem",
                            fontWeight: 800,
                            color: isCurrent
                              ? isWithinTargetZone
                                ? "#059669"
                                : "var(--teal-primary)"
                              : isCompleted
                                ? "#059669"
                                : "var(--text-muted)",
                            background: "rgba(255, 255, 255, 0.92)",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            border: `1px solid ${isCurrent
                                ? isWithinTargetZone
                                  ? "#A7F3D0"
                                  : "var(--border-mint)"
                                : isCompleted
                                  ? "#A7F3D0"
                                  : "#E2E8F0"
                              }`,
                          }}
                        >
                          {isCompleted
                            ? `✓ ${t.shortLabel}`
                            : isCurrent
                              ? `${t.shortLabel} (${t.requiredHoldDurationSeconds}s)`
                              : t.shortLabel}
                        </div>
                      </div>
                    );
                  })}

                  {/* REAL-TIME MOVING COP BALL */}
                  {(isRealConnected || isSimulationMode) && liveCopX !== null && liveCopY !== null ? (
                    <div
                      style={{
                        position: "absolute",
                        left: `${visualBallPos.xPercent}%`,
                        top: `${visualBallPos.yPercent}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                        zIndex: 5,
                        transition: "left 80ms cubic-bezier(0.2, 0.8, 0.4, 1), top 80ms cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 0.15s ease",
                      }}
                    >
                      {/* Glowing Real-Time COP Ball */}
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: isWithinTargetZone
                            ? "#059669"
                            : "var(--teal-primary, #0D9488)",
                          border: "3px solid #FFFFFF",
                          boxShadow: isWithinTargetZone
                            ? "0 0 16px rgba(5, 150, 105, 0.8), 0 2px 6px rgba(0,0,0,0.3)"
                            : "0 0 12px rgba(13, 148, 136, 0.7), 0 2px 6px rgba(0,0,0,0.25)",
                        }}
                      />

                      {/* Small Live COP Coordinate Badge */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "100%",
                          left: "50%",
                          transform: "translateX(-50%)",
                          marginBottom: "4px",
                          background: "rgba(15, 23, 42, 0.85)",
                          color: "#FFFFFF",
                          fontSize: "0.5625rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        COP
                      </div>
                    </div>
                  ) : (
                    /* Waiting for Balance Board Placeholder */
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        padding: "8px 16px",
                        background: "rgba(255, 255, 255, 0.95)",
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                        color: "var(--text-muted)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textAlign: "center",
                        pointerEvents: "none",
                      }}
                    >
                      Waiting for Balance Board
                    </div>
                  )}
                </div>
              </div>

              {/* Right Label */}
              <div
                style={{
                  width: "56px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.6875rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                }}
              >
                <span>RIGHT →</span>
                <span style={{ fontSize: "0.625rem", color: "var(--text-light)" }}>(+X)</span>
              </div>
            </div>

            {/* Back / Posterior (-Y) Axis Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                marginTop: "8px",
              }}
            >
              <span>BACK / POSTERIOR (-Y)</span>
              <span>↓</span>
            </div>
          </div>

          {/* 3. REAL-TIME WEIGHT / COP TELEMETRY & PROGRESS BAR */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {/* Progress: 1/5, 2/5, etc. */}
            <div className="medical-card" style={{ padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                Exercise Progress
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  marginTop: "2px",
                }}
              >
                {currentTargetIndex + 1} / {targets.length} Targets
              </div>
            </div>

            {/* Real-time Patient Weight Telemetry */}
            <div className="medical-card" style={{ padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>Total Weight</span>
                {isSimulationMode && <span style={{ color: "#D97706", fontWeight: 800 }}>[SIM]</span>}
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: (isRealConnected || isSimulationMode) ? "var(--teal-primary)" : "var(--text-muted)",
                  marginTop: "2px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatWeightTelemetry(liveWeight, isRealConnected || isSimulationMode)}
              </div>
            </div>

            {/* Real-time COP X Telemetry */}
            <div className="medical-card" style={{ padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>COP X (Left / Right)</span>
                {isSimulationMode && <span style={{ color: "#D97706", fontWeight: 800 }}>[SIM]</span>}
              </div>
              <div
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 800,
                  color: (isRealConnected || isSimulationMode) ? "var(--text-main)" : "var(--text-muted)",
                  marginTop: "2px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatCopTelemetry(liveCopX, isRealConnected || isSimulationMode)}
              </div>
            </div>

            {/* Real-time COP Y Telemetry */}
            <div className="medical-card" style={{ padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>COP Y (Front / Back)</span>
                {isSimulationMode && <span style={{ color: "#D97706", fontWeight: 800 }}>[SIM]</span>}
              </div>
              <div
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 800,
                  color: (isRealConnected || isSimulationMode) ? "var(--text-main)" : "var(--text-muted)",
                  marginTop: "2px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatCopTelemetry(liveCopY, isRealConnected || isSimulationMode)}
              </div>
            </div>
          </div>

          {/* SIMULATION ON-SCREEN CONTROLS (Active during simulation mode) */}
          {isSimulationMode && (phase === "ACTIVE" || phase === "PAUSED") && (
            <div
              className="medical-card"
              style={{
                padding: "16px 20px",
                background: "#FFFBEB",
                border: "1.5px solid #FCD34D",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Gamepad2 size={18} color="#D97706" />
                  <span style={{ fontSize: "0.875rem", fontWeight: 800, color: "#92400E" }}>
                    Interactive Simulation Controls (Arrow Keys Active)
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#B45309", fontWeight: 600 }}>
                  Steer COP ball into target zone & hold continuous position for {currentTarget?.requiredHoldDurationSeconds}s
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: "16px",
                  alignItems: "center",
                }}
              >
                {/* Left Column: Quick Target Navigation Shortcuts */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", color: "#78350F" }}>
                    Target Quick-Steer
                  </span>
                  {currentTarget && (
                    <button
                      type="button"
                      onClick={() => handleSimGlideToTarget(currentTarget.x, currentTarget.y)}
                      className="btn-primary"
                      style={{
                        padding: "8px 14px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        background: "#D97706",
                        borderColor: "#D97706",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Crosshair size={14} />
                      <span>Glide into Target {currentTarget.stepNumber}: {currentTarget.shortLabel}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSimResetToCenter}
                    className="btn-secondary"
                    style={{
                      padding: "8px 14px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Compass size={14} />
                    <span>Return to Neutral Center (Space)</span>
                  </button>
                </div>

                {/* Center Column: Directional D-Pad */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <button
                    type="button"
                    title="Forward / Anterior (+Y)"
                    onMouseDown={() => { keysPressedRef.current["ArrowUp"] = true; }}
                    onMouseUp={() => { keysPressedRef.current["ArrowUp"] = false; }}
                    onMouseLeave={() => { keysPressedRef.current["ArrowUp"] = false; }}
                    onTouchStart={() => { keysPressedRef.current["ArrowUp"] = true; }}
                    onTouchEnd={() => { keysPressedRef.current["ArrowUp"] = false; }}
                    onClick={() => handleSimNudge(0, 0.05)}
                    style={{
                      width: "60px",
                      height: "36px",
                      borderRadius: "8px",
                      border: "1px solid #D97706",
                      background: "#FEF3C7",
                      color: "#92400E",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    <ArrowUp size={18} />
                  </button>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      title="Left (-X)"
                      onMouseDown={() => { keysPressedRef.current["ArrowLeft"] = true; }}
                      onMouseUp={() => { keysPressedRef.current["ArrowLeft"] = false; }}
                      onMouseLeave={() => { keysPressedRef.current["ArrowLeft"] = false; }}
                      onTouchStart={() => { keysPressedRef.current["ArrowLeft"] = true; }}
                      onTouchEnd={() => { keysPressedRef.current["ArrowLeft"] = false; }}
                      onClick={() => handleSimNudge(-0.05, 0)}
                      style={{
                        width: "60px",
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px solid #D97706",
                        background: "#FEF3C7",
                        color: "#92400E",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      <ArrowLeft size={18} />
                    </button>

                    <button
                      type="button"
                      title="Center (0,0)"
                      onClick={handleSimResetToCenter}
                      style={{
                        width: "50px",
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        background: "#FFFFFF",
                        color: "#475569",
                        fontWeight: 800,
                        fontSize: "0.6875rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      CTR
                    </button>

                    <button
                      type="button"
                      title="Right (+X)"
                      onMouseDown={() => { keysPressedRef.current["ArrowRight"] = true; }}
                      onMouseUp={() => { keysPressedRef.current["ArrowRight"] = false; }}
                      onMouseLeave={() => { keysPressedRef.current["ArrowRight"] = false; }}
                      onTouchStart={() => { keysPressedRef.current["ArrowRight"] = true; }}
                      onTouchEnd={() => { keysPressedRef.current["ArrowRight"] = false; }}
                      onClick={() => handleSimNudge(0.05, 0)}
                      style={{
                        width: "60px",
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px solid #D97706",
                        background: "#FEF3C7",
                        color: "#92400E",
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>

                  <button
                    type="button"
                    title="Backward / Posterior (-Y)"
                    onMouseDown={() => { keysPressedRef.current["ArrowDown"] = true; }}
                    onMouseUp={() => { keysPressedRef.current["ArrowDown"] = false; }}
                    onMouseLeave={() => { keysPressedRef.current["ArrowDown"] = false; }}
                    onTouchStart={() => { keysPressedRef.current["ArrowDown"] = true; }}
                    onTouchEnd={() => { keysPressedRef.current["ArrowDown"] = false; }}
                    onClick={() => handleSimNudge(0, -0.05)}
                    style={{
                      width: "60px",
                      height: "36px",
                      borderRadius: "8px",
                      border: "1px solid #D97706",
                      background: "#FEF3C7",
                      color: "#92400E",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    <ArrowDown size={18} />
                  </button>
                </div>

                {/* Right Column: Live Status Readout */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    background: "#FEF9C3",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #FDE047",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#713F12" }}>Simulated COP:</span>
                    <strong style={{ fontFamily: "var(--font-mono)", color: "#713F12" }}>
                      X: {liveCopX !== null ? (liveCopX >= 0 ? `+${liveCopX.toFixed(2)}` : liveCopX.toFixed(2)) : "--"} | Y: {liveCopY !== null ? (liveCopY >= 0 ? `+${liveCopY.toFixed(2)}` : liveCopY.toFixed(2)) : "--"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#713F12" }}>Target Zone:</span>
                    <strong style={{ color: isWithinTargetZone ? "#059669" : "#B45309" }}>
                      {isWithinTargetZone ? "Inside Target Zone ✓" : "Outside Target Zone"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#713F12" }}>Continuous Hold:</span>
                    <strong style={{ color: isWithinTargetZone ? "#059669" : "#713F12" }}>
                      {holdProgress}% ({((holdProgress / 100) * (currentTarget?.requiredHoldDurationSeconds || 2)).toFixed(1)}s / {currentTarget?.requiredHoldDurationSeconds}s)
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. CONTROLS: START / PAUSE / RESTART */}
          <div
            className="medical-card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            {phase === "READY" && (
              <button
                onClick={handleStartCalibration}
                disabled={!isSimulationMode && !isRealConnected}
                className="btn-primary"
                style={{
                  padding: "12px 28px",
                  fontSize: "1rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "12px",
                  opacity: (!isSimulationMode && !isRealConnected) ? 0.6 : 1,
                  cursor: (!isSimulationMode && !isRealConnected) ? "not-allowed" : "pointer",
                }}
              >
                <Scale size={18} />
                <span>START BASELINE CALIBRATION (5s)</span>
              </button>
            )}

            {phase === "CALIBRATING" && (
              <button
                onClick={handleRestart}
                className="btn-secondary"
                style={{
                  padding: "10px 22px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <RotateCcw size={16} />
                <span>Cancel Calibration</span>
              </button>
            )}

            {phase === "CALIBRATION_FAILED" && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={handleStartCalibration}
                  className="btn-primary"
                  style={{
                    padding: "10px 22px",
                    fontSize: "0.9375rem",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    borderRadius: "10px",
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Retry Baseline Calibration (5s)</span>
                </button>
                <button
                  onClick={handleRestart}
                  className="btn-secondary"
                  style={{
                    padding: "10px 18px",
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "10px",
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Setup Screen</span>
                </button>
              </div>
            )}

            {phase === "ACTIVE" && (
              <button
                onClick={handlePause}
                className="btn-secondary"
                style={{
                  padding: "10px 22px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <Pause size={16} />
                <span>Pause</span>
              </button>
            )}

            {phase === "PAUSED" && (
              <button
                onClick={handleResume}
                className="btn-primary"
                style={{
                  padding: "10px 22px",
                  fontSize: "0.9375rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <Play size={16} fill="#FFFFFF" />
                <span>Resume</span>
              </button>
            )}

            {(phase === "ACTIVE" || phase === "PAUSED") && (
              <button
                onClick={handleSkipTarget}
                className="btn-secondary"
                style={{
                  padding: "10px 18px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "10px",
                }}
                title="Skip this target and mark as Incomplete"
              >
                <SkipForward size={16} />
                <span>Skip Target</span>
              </button>
            )}

            {(phase === "ACTIVE" || phase === "PAUSED") && (
              <button
                onClick={handleFinishEarly}
                className="btn-ghost"
                style={{
                  padding: "10px 18px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "10px",
                  color: "#DC2626",
                }}
                title="End session early and record results"
              >
                <StopCircle size={16} />
                <span>End Early</span>
              </button>
            )}

            <button
              onClick={handleRestart}
              className="btn-ghost"
              style={{
                padding: "10px 20px",
                fontSize: "0.9375rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RotateCcw size={16} />
              <span>Restart</span>
            </button>
          </div>
        </>
      ) : (
        /* =====================================================================
            FINAL SESSION SUMMARY VIEW (SCIENTIFIC 5-TARGET ASSESSMENT)
           ===================================================================== */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            width: "100%",
          }}
        >
          {/* SIMULATION MODE NOTIFICATION BANNER (Requirement 6 & 7) */}
          {(isSimulationMode || !sessionSummary?.isRealHardware) && (
            <div
              style={{
                padding: "16px 20px",
                background: "#FEF3C7",
                borderRadius: "12px",
                border: "2px solid #F59E0B",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                color: "#92400E",
              }}
            >
              <Gamepad2 size={28} color="#D97706" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  SIMULATION MODE — NOT REAL PATIENT DATA
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#B45309", marginTop: "3px" }}>
                  This session was recorded in Simulation Mode using interactive keyboard/on-screen controls.
                  All metrics are strictly flagged as simulated data and excluded from real patient history and doctor clinical reports.
                </div>
              </div>
            </div>
          )}

          {/* 1. Header Trophy Card */}
          <div
            className="medical-card"
            style={{
              padding: "32px 28px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              border: `2px solid ${sessionSummary?.allTargetsCompleted ? "#A7F3D0" : "#FDE68A"}`,
              background: sessionSummary?.allTargetsCompleted
                ? "linear-gradient(180deg, #FFFFFF 0%, #F0FDFA 100%)"
                : "linear-gradient(180deg, #FFFFFF 0%, #FFFBEB 100%)",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                background: sessionSummary?.allTargetsCompleted ? "#ECFDF5" : "#FEF3C7",
                border: `3px solid ${sessionSummary?.allTargetsCompleted ? "#059669" : "#D97706"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: sessionSummary?.allTargetsCompleted ? "#059669" : "#D97706",
                boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
              }}
            >
              {sessionSummary?.allTargetsCompleted ? <Award size={38} /> : <AlertTriangle size={38} />}
            </div>

            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 14px",
                  borderRadius: "14px",
                  background: (isSimulationMode || !sessionSummary?.isRealHardware)
                    ? "#FEF3C7"
                    : sessionSummary?.allTargetsCompleted ? "#CCFBF1" : "#FEF3C7",
                  color: (isSimulationMode || !sessionSummary?.isRealHardware)
                    ? "#92400E"
                    : sessionSummary?.allTargetsCompleted ? "#0F766E" : "#92400E",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: "10px",
                }}
              >
                <span>
                  {(isSimulationMode || !sessionSummary?.isRealHardware)
                    ? "SIMULATION MODE — NOT REAL PATIENT DATA"
                    : "Session Assessment Complete"}
                </span>
                <span>&bull;</span>
                <span>{sessionSummary?.sessionDate || new Date().toLocaleDateString()}</span>
                {patient?.fullName && (
                  <>
                    <span>&bull;</span>
                    <span>Patient: {patient.fullName} (ID: {patient.medicalRecordNumber || patient.id})</span>
                  </>
                )}
              </div>

              <h2
                style={{
                  fontSize: "2rem",
                  fontWeight: 900,
                  color: "var(--text-main)",
                  margin: "4px 0 8px 0",
                  letterSpacing: "-0.01em",
                }}
              >
                {sessionSummary?.allTargetsCompleted
                  ? "All 5 Directional Targets Completed"
                  : `${sessionSummary?.completedTargetsCount ?? completedCount} of 5 Targets Completed`}
              </h2>

              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  maxWidth: "760px",
                  margin: "0 auto",
                  lineHeight: 1.55,
                }}
              >
                Objective weight-shift telemetry and postural sway metrics recorded using the Nintendo Wii Balance Board force plate.
              </p>

              {/* Patient Weight and Quiet Sway Measurements */}
              {sessionSummary?.calibrationBaseline?.isCalibrated && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                    padding: "8px 18px",
                    background: "#F8FAFC",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                    margin: "12px auto 0 auto",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>
                    Patient Weight: <strong style={{ color: "var(--text-main)" }}>{sessionSummary.calibrationBaseline.calibratedWeightKg} kg</strong> (±{sessionSummary.calibrationBaseline.weightStdDevKg} kg)
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>&bull;</span>
                  <span>
                    Quiet Sway: <strong style={{ color: "var(--text-main)" }}>{sessionSummary.calibrationBaseline.copSwayDispersionMm.toFixed(1)} mm</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Notification of PDF download success / error */}
            {pdfExportResult && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  background: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  borderRadius: "8px",
                  color: "#065F46",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                }}
              >
                <CheckCircle2 size={16} />
                <span>Doctor PDF exported successfully: {pdfExportResult.filename}</span>
              </div>
            )}

            {pdfExportError && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  color: "#991B1B",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={16} />
                <span>PDF export error: {pdfExportError}</span>
              </div>
            )}
          </div>

          {/* 2. MAIN RESULT HERO: LARGE WII BALANCE BOARD VISUALIZATION */}
          <div
            className="medical-card"
            style={{
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
              border: "2px solid var(--border-mint)",
              boxShadow: "0 6px 20px rgba(15, 23, 42, 0.04)",
            }}
          >
            {/* Header info for the visualization */}
            <div
              style={{
                textAlign: "center",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--teal-primary)",
                  background: "rgba(13, 148, 136, 0.1)",
                  padding: "3px 10px",
                  borderRadius: "10px",
                }}
              >
                Primary Assessment Result &bull; Force Plate Visualization
              </span>
              <h3
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  margin: "2px 0 0 0",
                  letterSpacing: "-0.01em",
                }}
              >
                Nintendo Wii Balance Board &bull; Recorded Center of Pressure Trajectory
              </h3>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  margin: 0,
                  maxWidth: "720px",
                  lineHeight: 1.5,
                }}
              >
                Complete multi-directional weight shift path across all 5 targets, displaying continuous hold durations and target completion status.
              </p>
            </div>

            {/* Front / Anterior (+Y) Axis Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8125rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                marginBottom: "8px",
              }}
            >
              <span>FRONT / ANTERIOR (+Y)</span>
              <span>↑</span>
            </div>

            {/* Board Row: Left Label | Force Plate | Right Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "88%",
                maxWidth: "1380px",
                gap: "14px",
                margin: "0 auto",
              }}
            >
              {/* Left Label */}
              <div
                style={{
                  width: "60px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                <span>← LEFT</span>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-light)" }}>(-X)</span>
              </div>

              {/* Physical Balance Board Chassis */}
              <div
                style={{
                  flex: 1,
                  maxWidth: "1300px",
                  aspectRatio: "446 / 238",
                  position: "relative",
                  background: "#FFFFFF",
                  borderRadius: "28px",
                  border: "2.5px solid #CBD5E1",
                  boxShadow:
                    "0 14px 32px -8px rgba(15, 23, 42, 0.10), inset 0 2px 4px rgba(255, 255, 255, 0.9)",
                  padding: "16px",
                  overflow: "hidden",
                }}
              >
                {/* Surface Perimeter */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    borderRadius: "20px",
                    border: "1.5px solid #E2E8F0",
                    background: "#FAFCFC",
                  }}
                >
                  {/* Center Crosshairs */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "5%",
                      right: "5%",
                      height: "1px",
                      borderTop: "1px dashed #CBD5E1",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "5%",
                      bottom: "5%",
                      width: "1px",
                      borderLeft: "1px dashed #CBD5E1",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* SVG OVERLAY: PER-TARGET COLOUR-CODED COP TRAJECTORY PATHS */}
                  <svg
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {/* COP origin reference marker at force plate centre (0, 0) */}
                    <circle cx="50" cy="50" r="0.6" fill="#FFFFFF" stroke="#0F766E" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    <circle cx="50" cy="50" r="0.25" fill="#0F766E" />

                    {perTargetPaths.map((tp) => {
                      if (!tp.hasData || tp.points.length === 0) return null;

                      const polyPoints = tp.points
                        .map((p) => `${p.xPercent.toFixed(2)},${p.yPercent.toFixed(2)}`)
                        .join(" ");

                      const startPt = tp.points[0];
                      const endPt = tp.points[tp.points.length - 1];

                      return (
                        <g key={tp.name}>
                          {/* Actual recorded COP trajectory polyline: clean ~2.2px stroke, smooth rounded joins, 70% opacity */}
                          <polyline
                            points={polyPoints}
                            fill="none"
                            stroke={tp.color}
                            strokeWidth="2.2"
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeOpacity="0.70"
                          />

                          {/* Starting COP position for this target: small, clear marker */}
                          <circle
                            cx={startPt.xPercent}
                            cy={startPt.yPercent}
                            r="0.5"
                            fill="#FFFFFF"
                            stroke={tp.color}
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />

                          {/* Final COP position for this target: small, clear marker */}
                          <circle
                            cx={endPt.xPercent}
                            cy={endPt.yPercent}
                            r="0.65"
                            fill={tp.color}
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* ALL FIVE TARGET NODES: CLEAN & MINIMAL WITH THIN DASHED BORDERS & SMALL SEQUENCE MARKERS */}
                  {(sessionSummary?.targets || targets.map((t) => ({
                    targetId: t.id,
                    stepNumber: t.stepNumber,
                    name: t.name,
                    shortLabel: t.shortLabel,
                    targetX: t.x,
                    targetY: t.y,
                    targetXMm: t.targetXMm,
                    targetYMm: t.targetYMm,
                    relTargetXMm: t.relTargetXMm,
                    relTargetYMm: t.relTargetYMm,
                    toleranceMm: t.toleranceMm,
                    requiredHoldDurationSeconds: t.requiredHoldDurationSeconds,
                    actualSuccessfulHoldDurationSeconds: 0,
                    isCompleted: false,
                    isTargetReached: false,
                    minDistanceMm: null as number | null,
                    coordinateMetrics: undefined,
                    sensorQuality: "Unavailable" as const,
                    samples: [],
                  }))).map((t) => {
                    const coords = mapCopToBoard(t.targetX, t.targetY);
                    const dirColor = TARGET_PATH_COLORS[t.name as DirectionalTargetName] || "#0D9488";
                    const hasSampleData = Array.isArray(t.samples) && t.samples.length > 0;
                    const minDist = t.coordinateMetrics?.minDistanceErrorMm ?? t.minDistanceMm;
                    const isReached = Boolean(
                      t.isTargetReached ||
                      (typeof minDist === "number" && minDist <= (t.toleranceMm ?? 40.4)) ||
                      (t.coordinateMetrics && t.coordinateMetrics.samplesInTargetZoneCount > 0)
                    );

                    return (
                      <div
                        key={t.targetId}
                        style={{
                          position: "absolute",
                          left: `${coords.xPercent}%`,
                          top: `${coords.yPercent}%`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "none",
                          zIndex: 3,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        {/* Target Circle: Clean & minimal, thin dashed border, subtle background */}
                        <div
                          style={{
                            width: "56px",
                            height: "56px",
                            borderRadius: "50%",
                            border: `1.5px dashed ${dirColor}`,
                            background: `${dirColor}0D`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {/* Center sequence marker (1–5) */}
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: dirColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#FFFFFF",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                            }}
                          >
                            {t.stepNumber}
                          </div>
                        </div>

                        {/* Physical Target Name Label & Objective Status Badge */}
                        <div
                          style={{
                            marginTop: "4px",
                            whiteSpace: "nowrap",
                            fontSize: "0.625rem",
                            fontWeight: 800,
                            color: !hasSampleData ? "#64748B" : isReached ? "#047857" : "#DC2626",
                            background: !hasSampleData ? "#F8FAFC" : isReached ? "#ECFDF5" : "#FEF2F2",
                            padding: "2px 7px",
                            borderRadius: "5px",
                            border: `1px solid ${!hasSampleData ? "#E2E8F0" : isReached ? "#A7F3D0" : "#FECACA"}`,
                            fontFamily: "var(--font-mono)",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          }}
                        >
                          <span>{!hasSampleData ? "--" : isReached ? "✓" : "✗"}</span>
                          <span>{t.shortLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Label */}
              <div
                style={{
                  width: "60px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                <span>RIGHT →</span>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-light)" }}>(+X)</span>
              </div>
            </div>

            {/* Back / Posterior (-Y) Axis Label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8125rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                marginTop: "8px",
              }}
            >
              <span>BACK / POSTERIOR (-Y)</span>
              <span>↓</span>
            </div>

            {/* Colour Legend — Five Directional Paths (Direction Names Remain Here in the Legend) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "14px",
                flexWrap: "wrap",
                marginTop: "16px",
                padding: "8px 16px",
                background: "#FFFFFF",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
              }}
            >
              {([
                { step: 1, label: "Target 1: Shift Left", color: "#EF4444" },
                { step: 2, label: "Target 2: Shift Right", color: "#F59E0B" },
                { step: 3, label: "Target 3: Shift Forward", color: "#3B82F6" },
                { step: 4, label: "Target 4: Shift Backward", color: "#8B5CF6" },
                { step: 5, label: "Target 5: Return to Center", color: "#10B981" },
              ] as const).map(({ step, label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: color,
                      color: "#FFFFFF",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.625rem",
                      fontWeight: 900,
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ width: "20px", height: "2.5px", background: color, opacity: 0.72, display: "inline-block", borderRadius: "2px" }} />
                  <span style={{ fontWeight: 700, color: "var(--text-main)" }}>{label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", border: "1.5px solid #0F766E", background: "#FFFFFF", display: "inline-block" }} />
                <span style={{ fontWeight: 600 }}>Start Point</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#475569", display: "inline-block" }} />
                <span style={{ fontWeight: 600 }}>Final Position</span>
              </div>
            </div>
          </div>

          {/* 3. PRIMARY OBJECTIVE COORDINATE METRICS (6 CARDS GRID) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            {/* Card 1: Mean Coordinate Error */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Mean Coordinate Error (d̄)
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {sessionSummary?.meanCoordinateErrorMm !== undefined && sessionSummary?.meanCoordinateErrorMm !== null
                  ? `${sessionSummary.meanCoordinateErrorMm.toFixed(1)} mm`
                  : (sessionSummary?.meanCopDistanceMm !== null && sessionSummary?.meanCopDistanceMm !== undefined
                    ? `${sessionSummary.meanCopDistanceMm.toFixed(1)} mm`
                    : "--")}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Average spatial error across all 5 targets
              </div>
            </div>

            {/* Card 2: Coordinate Hit Rate */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Coordinate Hit Rate
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--teal-primary)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {sessionSummary?.sessionHitRatePercentage !== undefined
                  ? `${sessionSummary.sessionHitRatePercentage.toFixed(1)}%`
                  : `${(sessionSummary?.overallAccuracyPercentage ?? 0).toFixed(1)}%`}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Valid samples inside target tolerance radius
              </div>
            </div>

            {/* Card 3: Overall COP Path Length */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Overall COP Path Length (L)
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {sessionSummary?.overallPathLengthMm !== undefined
                  ? `${sessionSummary.overallPathLengthMm.toFixed(1)} mm`
                  : "--"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Cumulative trajectory excursion distance
              </div>
            </div>

            {/* Card 4: Return-to-Center Error */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Return-to-Center Error
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#059669", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {sessionSummary?.returnToCenterErrorMm !== null && sessionSummary?.returnToCenterErrorMm !== undefined
                  ? `${sessionSummary.returnToCenterErrorMm.toFixed(1)} mm`
                  : "--"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Postural recovery precision to baseline (0,0)
              </div>
            </div>

            {/* Card 5: COP Trajectory Variability */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Trajectory Variability (SD)
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                {sessionSummary?.trajectoryVariabilityMm !== null && sessionSummary?.trajectoryVariabilityMm !== undefined
                  ? `${sessionSummary.trajectoryVariabilityMm.toFixed(1)} mm`
                  : (sessionSummary?.overallCopSdMm !== null && sessionSummary?.overallCopSdMm !== undefined
                    ? `${sessionSummary.overallCopSdMm.toFixed(1)} mm`
                    : "--")}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Bivariate spatial dispersion √(σX² + σY²)
              </div>
            </div>

            {/* Card 6: Target Reach Success */}
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Target Reach Success
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 900,
                  color: (sessionSummary?.successfulTargetsCount ?? 0) >= 5 ? "#059669" : "#D97706",
                  marginTop: "4px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {sessionSummary?.successfulTargetsCount ?? 0} / 5 Reached
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                {sessionSummary?.unsuccessfulTargetsCount ?? 0} target{(sessionSummary?.unsuccessfulTargetsCount ?? 0) === 1 ? "" : "s"} outside tolerance boundary
              </div>
            </div>
          </div>

          {/* 4. OBJECTIVE BIOMECHANICAL COORDINATE PERFORMANCE TABLE */}
          <div
            className="medical-card"
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                  Directional Coordinate Performance Breakdown
                </h3>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                  Physical coordinate measurements calculated in millimetres relative to calibrated baseline (X₀, Y₀).
                </p>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--teal-primary)",
                  background: "rgba(13, 148, 136, 0.1)",
                  padding: "4px 10px",
                  borderRadius: "8px",
                }}
              >
                Physical Geometry Telemetry (mm)
              </span>
            </div>

            <div style={{ overflowX: "auto", width: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--teal-primary)", color: "#FFFFFF" }}>
                    <th style={{ padding: "12px 16px", borderTopLeftRadius: "6px" }}>Target Direction</th>
                    <th style={{ padding: "12px 16px" }}>Region Status</th>
                    <th style={{ padding: "12px 16px" }}>Target Coord (mm)</th>
                    <th style={{ padding: "12px 16px" }}>Actual Centroid COP (mm)</th>
                    <th style={{ padding: "12px 16px" }}>Min Dist (d_min)</th>
                    <th style={{ padding: "12px 16px" }}>Mean Error (d̄)</th>
                    <th style={{ padding: "12px 16px" }}>Max Dist (d_max)</th>
                    <th style={{ padding: "12px 16px" }}>Hit Rate %</th>
                    <th style={{ padding: "12px 16px" }}>Path Length (L)</th>
                    <th style={{ padding: "12px 16px", borderTopRightRadius: "6px" }}>Protocol Hold (Secondary)</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessionSummary?.targets || targets.map((t) => ({
                    targetId: t.id,
                    stepNumber: t.stepNumber,
                    name: t.name,
                    shortLabel: t.shortLabel,
                    targetX: t.x,
                    targetY: t.y,
                    targetXMm: t.targetXMm ?? 0,
                    targetYMm: t.targetYMm ?? 0,
                    relTargetXMm: t.relTargetXMm,
                    relTargetYMm: t.relTargetYMm,
                    tolerance: t.tolerance,
                    toleranceMm: t.toleranceMm,
                    isCompleted: false,
                    completionTimeSeconds: null,
                    requiredHoldDurationSeconds: t.requiredHoldDurationSeconds,
                    actualSuccessfulHoldDurationSeconds: 0,
                    longestContinuousHoldSeconds: 0,
                    continuousHoldDurationSeconds: 0,
                    accumulatedHoldDurationSeconds: 0,
                    validDurationSeconds: 0,
                    timeInsideSeconds: 0,
                    timeOutsideSeconds: 0,
                    timeInsidePercentage: 0,
                    timeAccuracyPercentage: 0,
                    attemptCount: 0,
                    enterCount: 0,
                    exitCount: 0,
                    accuracyPercentage: 0,
                    validSampleCount: 0,
                    samplesInsideCount: 0,
                    samplesOutsideCount: 0,
                    meanDistanceNorm: null,
                    meanDistanceMm: null,
                    medianDistanceNorm: null,
                    medianDistanceMm: null,
                    maxDistanceNorm: null,
                    maxDistanceMm: null,
                    minDistanceNorm: null,
                    minDistanceMm: null,
                    copSdNorm: null,
                    copSdMm: null,
                    copSdXNorm: null,
                    copSdYNorm: null,
                    actualCopXMm: null,
                    actualCopYMm: null,
                    actualRelCopXMm: null,
                    actualRelCopYMm: null,
                    minDistanceErrorMm: null,
                    meanDistanceErrorMm: null,
                    maxDistanceErrorMm: null,
                    coordinateHitRatePercentage: 0,
                    pathLengthMm: 0,
                    isTargetReached: false,
                    missingDataDurationSeconds: 0,
                    invalidSampleCount: 0,
                    dataGapsCount: 0,
                    sensorQuality: "Unavailable" as const,
                    validSamplePercentage: 0,
                    samples: [],
                  }))).map((t, idx) => {
                    const isReached = t.isTargetReached ?? (t.minDistanceErrorMm !== null && t.minDistanceErrorMm !== undefined ? t.minDistanceErrorMm <= t.toleranceMm : t.isCompleted);
                    const targetXStr = t.relTargetXMm !== undefined ? `${t.relTargetXMm >= 0 ? "+" : ""}${t.relTargetXMm.toFixed(1)}` : "--";
                    const targetYStr = t.relTargetYMm !== undefined ? `${t.relTargetYMm >= 0 ? "+" : ""}${t.relTargetYMm.toFixed(1)}` : "--";
                    const actualXStr = t.actualRelCopXMm !== null && t.actualRelCopXMm !== undefined ? `${t.actualRelCopXMm >= 0 ? "+" : ""}${t.actualRelCopXMm.toFixed(1)}` : "--";
                    const actualYStr = t.actualRelCopYMm !== null && t.actualRelCopYMm !== undefined ? `${t.actualRelCopYMm >= 0 ? "+" : ""}${t.actualRelCopYMm.toFixed(1)}` : "--";
                    const minErrStr = t.minDistanceErrorMm !== null && t.minDistanceErrorMm !== undefined ? `${t.minDistanceErrorMm.toFixed(1)} mm` : "--";
                    const meanErrStr = t.meanDistanceErrorMm !== null && t.meanDistanceErrorMm !== undefined ? `${t.meanDistanceErrorMm.toFixed(1)} mm` : (t.meanDistanceMm !== null ? `${t.meanDistanceMm.toFixed(1)} mm` : "--");
                    const maxErrStr = t.maxDistanceErrorMm !== null && t.maxDistanceErrorMm !== undefined ? `${t.maxDistanceErrorMm.toFixed(1)} mm` : (t.maxDistanceMm !== null ? `${t.maxDistanceMm.toFixed(1)} mm` : "--");
                    const hitRate = t.coordinateHitRatePercentage ?? t.accuracyPercentage;
                    const pathLenStr = t.pathLengthMm !== undefined ? `${t.pathLengthMm.toFixed(1)} mm` : "--";

                    return (
                      <tr
                        key={t.targetId || idx}
                        style={{
                          borderBottom: "1px solid #E2E8F0",
                          background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                        }}
                      >
                        <td style={{ padding: "12px 16px", fontWeight: 800, color: "var(--text-main)" }}>
                          Target {t.stepNumber}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: isReached ? "#DCFCE7" : "#FEF3C7",
                              color: isReached ? "#166534" : "#92400E",
                            }}
                          >
                            {isReached ? "REACHED" : "NOT REACHED"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          ({targetXStr}, {targetYStr})
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)" }}>
                          ({actualXStr}, {actualYStr})
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: isReached ? "#059669" : "var(--text-main)" }}>
                          {minErrStr}
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--teal-primary)" }}>
                          {meanErrStr}
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                          {maxErrStr}
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 800, color: hitRate >= 50 ? "#059669" : "#D97706" }}>
                          {hitRate.toFixed(1)}%
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                          {pathLenStr}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                          <span style={{ fontWeight: 700, color: t.isCompleted ? "#059669" : "#D97706" }}>
                            {t.actualSuccessfulHoldDurationSeconds.toFixed(1)}s
                          </span>
                          {" / "}{t.requiredHoldDurationSeconds}s {t.isCompleted ? "✓" : ""}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Session Totals Row */}
                  {sessionSummary && (
                    <tr style={{ background: "#F1F5F9", fontWeight: 800, borderTop: "2px solid #CBD5E1" }}>
                      <td style={{ padding: "12px 16px", color: "var(--text-main)" }}>
                        SESSION OVERALL
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            fontWeight: 800,
                            color: (sessionSummary.successfulTargetsCount ?? 0) >= 5 ? "#059669" : "#D97706",
                          }}
                        >
                          {sessionSummary.successfulTargetsCount ?? 0}/5 Reached
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>-</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>-</td>
                      <td style={{ padding: "12px 16px", color: "#059669", fontFamily: "var(--font-mono)" }}>
                        {(() => {
                          const minErrors = sessionSummary.targets
                            .map((t) => t.minDistanceErrorMm)
                            .filter((d): d is number => d !== null && d !== undefined);
                          return minErrors.length > 0 ? `${Math.min(...minErrors).toFixed(1)} mm` : "--";
                        })()}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--teal-primary)", fontFamily: "var(--font-mono)" }}>
                        {(sessionSummary.meanCoordinateErrorMm ?? 0).toFixed(1)} mm
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {(() => {
                          const maxErrors = sessionSummary.targets
                            .map((t) => t.maxDistanceErrorMm ?? t.maxDistanceMm)
                            .filter((d): d is number => d !== null && d !== undefined);
                          return maxErrors.length > 0 ? `${Math.max(...maxErrors).toFixed(1)} mm` : "--";
                        })()}
                      </td>
                      <td style={{ padding: "12px 16px", color: (sessionSummary.sessionHitRatePercentage ?? 0) >= 50 ? "#059669" : "#D97706" }}>
                        {(sessionSummary.sessionHitRatePercentage ?? 0).toFixed(1)}%
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                        {(sessionSummary.overallPathLengthMm ?? 0).toFixed(1)} mm
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                        Mean: {sessionSummary.meanHoldTimeSeconds.toFixed(1)}s ({sessionSummary.completedTargetsCount}/5)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. SECONDARY DESCRIPTIVE PROTOCOL METRICS & SENSOR INTEGRITY */}
          <div
            className="medical-card"
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
            }}
          >
            <div>
              <h4 style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                Secondary Descriptive Metrics (Protocol Durations & Hardware Quality)
              </h4>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                Hold times, dwell distributions, and sensor telemetry serve as descriptive protocol context and do not determine coordinate accuracy.
              </p>
            </div>

            {/* Quick stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              <div style={{ background: "#FFFFFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Protocol Hold Required
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
                  {targets.reduce((sum, t) => sum + t.requiredHoldDurationSeconds, 0).toFixed(1)}s
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>Total protocol target hold</div>
              </div>

              <div style={{ background: "#FFFFFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Actual Hold Achieved
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: sessionSummary?.allTargetsCompleted ? "#059669" : "#D97706", marginTop: "2px" }}>
                  {sessionSummary
                    ? sessionSummary.targets.reduce((sum, t) => sum + (t.actualSuccessfulHoldDurationSeconds ?? 0), 0).toFixed(1)
                    : "0.0"}s
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                  {sessionSummary?.completedTargetsCount ?? 0}/5 targets completed hold
                </div>
              </div>

              <div style={{ background: "#FFFFFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Total Valid Evaluation Time
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
                  {((sessionSummary?.totalTimeInsideSeconds ?? 0) + (sessionSummary?.totalTimeOutsideSeconds ?? 0)).toFixed(1)}s
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                  Inside: {sessionSummary?.totalTimeInsideSeconds.toFixed(1) ?? "0.0"}s · Outside: {sessionSummary?.totalTimeOutsideSeconds.toFixed(1) ?? "0.0"}s
                </div>
              </div>

              <div style={{ background: "#FFFFFF", padding: "12px 16px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Target Attempts / Entries
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
                  {sessionSummary?.totalAttemptsCount ?? 0}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>Total entries into target zones</div>
              </div>
            </div>

            {/* Time Inside vs Outside All Targets Distribution Bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-main)", letterSpacing: "0.04em" }}>
                  Time Distribution Inside vs Outside Tolerance Region
                </span>
                <div style={{ display: "flex", gap: "16px", fontSize: "0.75rem", fontWeight: 700 }}>
                  <span style={{ color: "#059669" }}>
                    Inside: {sessionSummary?.totalTimeInsideSeconds.toFixed(1) ?? "0.0"}s ({(() => {
                      const inside = sessionSummary?.totalTimeInsideSeconds ?? 0;
                      const outside = sessionSummary?.totalTimeOutsideSeconds ?? 0;
                      const total = inside + outside;
                      return total > 0 ? Math.round((inside / total) * 100) : 0;
                    })()}%)
                  </span>
                  <span style={{ color: "#D97706" }}>
                    Outside: {sessionSummary?.totalTimeOutsideSeconds.toFixed(1) ?? "0.0"}s ({(() => {
                      const inside = sessionSummary?.totalTimeInsideSeconds ?? 0;
                      const outside = sessionSummary?.totalTimeOutsideSeconds ?? 0;
                      const total = inside + outside;
                      return total > 0 ? 100 - Math.round((inside / total) * 100) : 0;
                    })()}%)
                  </span>
                </div>
              </div>

              {(() => {
                const inside = sessionSummary?.totalTimeInsideSeconds ?? 0;
                const outside = sessionSummary?.totalTimeOutsideSeconds ?? 0;
                const total = inside + outside;
                const insidePct = total > 0 ? Math.round((inside / total) * 100) : 0;
                const outsidePct = 100 - insidePct;

                return (
                  <div
                    style={{
                      height: "10px",
                      background: "#E2E8F0",
                      borderRadius: "5px",
                      overflow: "hidden",
                      display: "flex",
                    }}
                  >
                    <div
                      style={{
                        width: `${insidePct}%`,
                        background: "#059669",
                        transition: "width 0.3s ease",
                      }}
                      title={`Inside: ${inside.toFixed(1)}s (${insidePct}%)`}
                    />
                    <div
                      style={{
                        width: `${outsidePct}%`,
                        background: "#F59E0B",
                        transition: "width 0.3s ease",
                      }}
                      title={`Outside: ${outside.toFixed(1)}s (${outsidePct}%)`}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Sensor Telemetry & Data Quality Assurance */}
            <div
              style={{
                marginTop: "4px",
                padding: "12px 16px",
                background: "#FFFFFF",
                borderRadius: "8px",
                border: "1px solid #E2E8F0",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Scale size={16} color="var(--teal-primary)" />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>
                    Sensor Telemetry & Data Quality Assurance
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: (isSimulationMode || !sessionSummary?.isRealHardware)
                      ? "#FEF3C7"
                      : isRealConnected ? "#DCFCE7" : "#FEF2F2",
                    color: (isSimulationMode || !sessionSummary?.isRealHardware)
                      ? "#92400E"
                      : isRealConnected ? "#166534" : "#DC2626",
                  }}
                >
                  {(isSimulationMode || !sessionSummary?.isRealHardware)
                    ? "SIMULATED TEST DATA (NOT REAL PATIENT DATA)"
                    : isRealConnected
                      ? "Hardware Connected"
                      : "Hardware Disconnected"}
                </span>
              </div>

              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span>
                  <strong>Hardware Model:</strong> {(isSimulationMode || !sessionSummary?.isRealHardware) ? "Interactive Simulator (Test Only)" : (sessionSummary?.hardwareModel || "RVL-WBC-01")}
                </span>
                <span>
                  <strong>Real Hardware Telemetry:</strong> {(isSimulationMode || !sessionSummary?.isRealHardware) ? "No (Simulated)" : "Yes (Authentic Load Cells)"}
                </span>
                <span>
                  <strong>Valid Samples:</strong> {sessionSummary?.totalValidSamples.toLocaleString() || 0} ({sessionSummary?.validSamplePercentage ?? 100}% quality)
                </span>
                <span>
                  <strong>Missing Data Duration:</strong> {sessionSummary?.totalMissingDataDurationSeconds.toFixed(1) || "0.0"}s
                </span>
                <span>
                  <strong>Signal Integrity:</strong> {(isSimulationMode || !sessionSummary?.isRealHardware) ? "Synthetic Simulation (Excluded from Clinical History)" : (sessionSummary?.overallSensorQuality || "Optimal")}
                </span>
              </div>

              {sessionSummary?.qualityWarnings && sessionSummary.qualityWarnings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                  {sessionSummary.qualityWarnings.map((warn, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.6875rem", color: "#D97706" }}>
                      <AlertCircle size={14} />
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Objective Biomechanical Measurement Notice */}
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(13, 148, 136, 0.06)",
                borderRadius: "8px",
                borderLeft: "3px solid var(--teal-primary)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: "var(--text-main)" }}>Objective Biomechanical Measurement Notice: </strong>
              All directional assessments are calculated directly from physical COP coordinates measured in millimetres relative to the patient's calibrated neutral baseline (X₀, Y₀). Results reflect measured balance platform telemetry and do not represent a clinical prognosis or predictive recovery score.
            </div>
          </div>

          {/* 6. Primary Action Buttons */}
          <div
            className="medical-card"
            style={{
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Button A: Back to Dashboard */}
              <button
                onClick={handleBackToDashboard}
                className="btn-primary"
                style={{
                  padding: "12px 24px",
                  fontSize: "0.9375rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <Home size={18} />
                <span>Back to Dashboard</span>
              </button>

              {/* Button B: Download Doctor PDF */}
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf || !sessionSummary}
                className="btn-secondary"
                style={{
                  padding: "12px 22px",
                  fontSize: "0.9375rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                  background: "#FFFFFF",
                  borderColor: "var(--teal-primary)",
                  color: "var(--teal-primary)",
                }}
              >
                <Download size={18} />
                <span>{isExportingPdf ? "Generating PDF..." : "Download PDF Report"}</span>
              </button>

              {/* Button C: View Detailed Report */}
              <button
                onClick={() => setShowDetailedModal(true)}
                className="btn-secondary"
                style={{
                  padding: "12px 20px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <Eye size={18} />
                <span>View Detailed Report</span>
              </button>

              {/* Button D: Restart Exercise */}
              <button
                onClick={handleRestart}
                className="btn-secondary"
                style={{
                  padding: "12px 20px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "10px",
                }}
              >
                <RotateCcw size={16} />
                <span>Restart Exercise</span>
              </button>
            </div>

            {/* Button E: Return to Exercises */}
            {onExit && (
              <button
                onClick={handleExitToLibrary}
                className="btn-ghost"
                style={{
                  padding: "12px 20px",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <ArrowLeft size={16} />
                <span>Return to Exercises</span>
              </button>
            )}
          </div>

          {/* 7. Detailed Report Modal */}
          {showDetailedModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "20px",
              }}
            >
              <div
                className="medical-card"
                style={{
                  width: "100%",
                  maxWidth: "1180px",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  padding: "26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                  background: "#FFFFFF",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
                  borderRadius: "16px",
                }}
              >
                {/* Modal Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                      Directional Weight Shift — Clinical Assessment Detail
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                      Target-by-target coordinate metrics, distance errors, hit rates, and continuous hold telemetry.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDetailedModal(false)}
                    className="btn-ghost"
                    style={{ padding: "8px", borderRadius: "8px" }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Granular Table */}
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      fontSize: "0.75rem",
                      borderCollapse: "collapse",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--teal-primary)", color: "#FFFFFF" }}>
                        <th style={{ padding: "8px 10px" }}>Direction</th>
                        <th style={{ padding: "8px 10px" }}>Region Status</th>
                        <th style={{ padding: "8px 10px" }}>Target (X, Y) mm</th>
                        <th style={{ padding: "8px 10px" }}>Centroid (X, Y) mm</th>
                        <th style={{ padding: "8px 10px" }}>Min Dist (mm)</th>
                        <th style={{ padding: "8px 10px" }}>Mean Error (mm)</th>
                        <th style={{ padding: "8px 10px" }}>Max Dist (mm)</th>
                        <th style={{ padding: "8px 10px" }}>Hit Rate %</th>
                        <th style={{ padding: "8px 10px" }}>Path Length (mm)</th>
                        <th style={{ padding: "8px 10px" }}>Protocol Hold</th>
                        <th style={{ padding: "8px 10px" }}>Time In / Out</th>
                        <th style={{ padding: "8px 10px" }}>Attempts</th>
                        <th style={{ padding: "8px 10px" }}>Missing Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionSummary?.targets.map((t, idx) => {
                        const isReached = t.isTargetReached ?? (t.minDistanceErrorMm !== null && t.minDistanceErrorMm !== undefined ? t.minDistanceErrorMm <= t.toleranceMm : t.isCompleted);
                        const targetXStr = t.relTargetXMm !== undefined ? `${t.relTargetXMm >= 0 ? "+" : ""}${t.relTargetXMm.toFixed(1)}` : "--";
                        const targetYStr = t.relTargetYMm !== undefined ? `${t.relTargetYMm >= 0 ? "+" : ""}${t.relTargetYMm.toFixed(1)}` : "--";
                        const actualXStr = t.actualRelCopXMm !== null && t.actualRelCopXMm !== undefined ? `${t.actualRelCopXMm >= 0 ? "+" : ""}${t.actualRelCopXMm.toFixed(1)}` : "--";
                        const actualYStr = t.actualRelCopYMm !== null && t.actualRelCopYMm !== undefined ? `${t.actualRelCopYMm >= 0 ? "+" : ""}${t.actualRelCopYMm.toFixed(1)}` : "--";
                        const minErrStr = t.minDistanceErrorMm !== null && t.minDistanceErrorMm !== undefined ? `${t.minDistanceErrorMm.toFixed(1)}` : "--";
                        const meanErrStr = t.meanDistanceErrorMm !== null && t.meanDistanceErrorMm !== undefined ? `${t.meanDistanceErrorMm.toFixed(1)}` : (t.meanDistanceMm !== null ? `${t.meanDistanceMm.toFixed(1)}` : "--");
                        const maxErrStr = t.maxDistanceErrorMm !== null && t.maxDistanceErrorMm !== undefined ? `${t.maxDistanceErrorMm.toFixed(1)}` : (t.maxDistanceMm !== null ? `${t.maxDistanceMm.toFixed(1)}` : "--");
                        const hitRate = t.coordinateHitRatePercentage ?? t.accuracyPercentage;
                        const pathLenStr = t.pathLengthMm !== undefined ? `${t.pathLengthMm.toFixed(1)}` : "--";

                        return (
                          <tr
                            key={t.targetId || idx}
                            style={{
                              borderBottom: "1px solid #E2E8F0",
                              background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                            }}
                          >
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                              Target {t.stepNumber}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  fontSize: "0.6875rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: isReached ? "#DCFCE7" : "#FEF3C7",
                                  color: isReached ? "#166534" : "#92400E",
                                }}
                              >
                                {isReached ? "REACHED" : "NOT REACHED"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)" }}>
                              ({targetXStr}, {targetYStr})
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                              ({actualXStr}, {actualYStr})
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: isReached ? "#059669" : "inherit" }}>
                              {minErrStr}
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--teal-primary)" }}>
                              {meanErrStr}
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)" }}>
                              {maxErrStr}
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: hitRate >= 50 ? "#059669" : "#D97706" }}>
                              {hitRate.toFixed(1)}%
                            </td>
                            <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)" }}>
                              {pathLenStr}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontWeight: 800, color: t.isCompleted ? "#059669" : "#D97706" }}>
                                {t.actualSuccessfulHoldDurationSeconds.toFixed(1)}s
                              </span> / {t.requiredHoldDurationSeconds}s
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {t.timeInsideSeconds.toFixed(1)}s / {t.timeOutsideSeconds.toFixed(1)}s
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                              {t.attemptCount ?? t.enterCount}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {t.missingDataDurationSeconds.toFixed(1)}s
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Disclaimer in Modal */}
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#F8FAFC",
                    borderRadius: "8px",
                    fontSize: "0.6875rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                  }}
                >
                  <strong>Objective Biomechanical Measurement Notice:</strong> Directional assessments are calculated directly from physical COP coordinates measured in millimetres relative to the calibrated neutral baseline (X₀, Y₀). Distance errors, hit rates, and path length represent objective balance platform telemetry and are not predictive clinical recovery scores.
                </div>

                {/* Modal Footer Buttons */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    className="btn-primary"
                    style={{
                      padding: "10px 20px",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      borderRadius: "8px",
                    }}
                  >
                    <Download size={16} />
                    <span>{isExportingPdf ? "Generating..." : "Export Doctor PDF"}</span>
                  </button>
                  <button
                    onClick={() => setShowDetailedModal(false)}
                    className="btn-secondary"
                    style={{
                      padding: "10px 18px",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      borderRadius: "8px",
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

