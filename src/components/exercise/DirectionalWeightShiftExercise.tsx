import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
  Camera,
  CameraOff,
  Gauge,
  Info,
} from "lucide-react";
import { useBalanceBoard } from "../../context/HardwareContext";
import { useVision } from "../../context/VisionContext";
import { LiveJointAnglePanel } from "../vision/LiveJointAnglePanel";
import { Pose2DAngleSyncReport } from "../vision/Pose2DAngleSyncReport";
import { HoldWindowMovementGraph } from "./HoldWindowMovementGraph";
// CenterStanceVectorPanel is rendered inside Pose2DAngleSyncReport
import {
  calculatePose2DAngles,
  buildPose2DAngleSessionReport,
  buildTransitAngleBoxPlots,
  buildCenterStanceSnapshot,
  BoardSyncedPose2DSnapshot,
  Pose2DAngleSessionReport,
  Pose2DAngleTimelineSample,
  TransitAngleBoxPlot,
  CenterStanceSnapshot,
} from "../../utils/pose2dAngles";
import { mapCopToBoard } from "../../utils/copMapping";
import {
  DirectionalTarget,
  DirectionalTargetName,
  DEFAULT_DIRECTIONAL_DURATIONS,
  getDirectionalTargets,
  getRandomizedFarDirectionalTargets,
  getCenterStartGateTarget,
  CENTER_START_HOLD_SECONDS,
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
  HoldWindowFrameSample,
  HoldWindowErrorSeries,
  computeHoldFrameTargetError,
  buildHoldWindowErrorSeries,
} from "../../utils/directionalWeightShiftExercise";
import { PdfReportService } from "../../services/pdfReportService";
import { Pose2DAngleReportService } from "../../services/pose2dAngleReportService";
import { PatientProfile } from "../../types/patient";

interface DirectionalWeightShiftExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
  onResultFullScreenChange?: (isFullScreen: boolean) => void;
  onNavigateToDashboard?: () => void;
}

/** Compact (i) control — tooltip portaled to body so table overflow/sticky header cannot clip it */
const MetricInfoButton: React.FC<{
  what: string;
  meaning: string;
  how: string;
  align?: "left" | "right";
}> = ({ what, meaning, how, align = "left" }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setCoords(null);
      return;
    }
    const place = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const tipW = 280;
      const gap = 6;
      let left = align === "right" ? rect.right - tipW : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
      let top = rect.bottom + gap;
      // If near bottom of viewport, flip above the button
      const estimatedH = 140;
      if (top + estimatedH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedH - gap);
      }
      setCoords({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Metric info"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid #94A3B8",
          background: open ? "#0F766E" : "#FFFFFF",
          color: open ? "#FFFFFF" : "#64748B",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          lineHeight: 1,
          position: "relative",
          zIndex: 2,
        }}
      >
        <Info size={10} strokeWidth={2.5} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 99999,
              width: 280,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0F172A",
              color: "#E2E8F0",
              fontSize: "0.6875rem",
              fontWeight: 500,
              lineHeight: 1.45,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.45)",
              textAlign: "left",
              textTransform: "none",
              letterSpacing: "normal",
              pointerEvents: "auto",
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: "#5EEAD4", fontWeight: 800 }}>What: </span>
              {what}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: "#5EEAD4", fontWeight: 800 }}>Number means: </span>
              {meaning}
            </div>
            <div>
              <span style={{ color: "#5EEAD4", fontWeight: 800 }}>How calculated: </span>
              {how}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};

const HOLD_FRAME_COLUMN_INFO = {
  frame: {
    what: "Sample index inside this target’s successful hold window.",
    meaning: "1 = first frame after you hit the border; increases each sync tick until hold completes.",
    how: "Frame 1 is the first border hit. Counting continues through leave/re-enter until the required continuous hold finishes. Approach travel before first hit is excluded.",
  },
  target: {
    what: "Fixed target center coordinates (x₁, y₁) for this step.",
    meaning: "Where the patient is asked to keep their weight. (0,0) is board center; +X right, +Y forward.",
    how: "Taken from the prescribed target in normalized COP space [−1, +1]. Same for every frame of that target.",
  },
  cop: {
    what: "Measured Center of Pressure (xₜ, yₜ) at this sync frame.",
    meaning: "Where the patient’s weight actually was on the board at that instant.",
    how: "From Wii Balance Board load cells (relative COP), soft-synced with the camera tick. Stored from first border hit until hold complete (inside and outside).",
  },
  errorMm: {
    what: "Euclidean distance error between target and COP in millimetres.",
    meaning: "How far off-center the patient was from the target at that frame. Lower is better.",
    how: "e_mm = √((x₁_mm − xₜ_mm)² + (y₁_mm − yₜ_mm)²), converting normalized COP with board half-widths (223 mm X, 119 mm Y).",
  },
  errorNorm: {
    what: "Same distance error in normalized COP units [−1, +1] board space.",
    meaning: "Unitless miss distance; useful to compare without mm scaling. Lower is better.",
    how: "e_norm = √((x₁ − xₜ)² + (y₁ − yₜ)²) using the same normalized coordinates as the targets.",
  },
  pose: {
    what: "Whether the live camera had a MediaPipe body pose at this board tick.",
    meaning: "yes = skeleton/pose was locked when the board sample was stored; no = camera had no pose that tick.",
    how: "Read from the latest VisionEngine state at the same soft-sync timestamp as the board sample (hasPose && pose).",
  },
  boardRel: {
    what: "Board sample time relative to the shared session clock T0.",
    meaning: "Milliseconds after Target 1 start (when the 3s center hold ended). Used for board↔camera sync, not the movement graph X-axis.",
    how: "board_rel_ms = boardTimestamp − syncEpochMs. T0 is stamped when center hold completes and Target 1 begins.",
  },
  visionRel: {
    what: "Camera frame time relative to the shared session clock T0.",
    meaning: "Milliseconds after Target 1 start for the pose frame paired with this board sample.",
    how: "cam_rel_ms = visionFrameTimestamp − syncEpochMs. Same session T0 as the board column.",
  },
  holdRel: {
    what: "Time since this target’s first stored coordinate (first border hit).",
    meaning: "Same gate as coordinate storing. Graph t=0 here. Only exists for frames that were stored.",
    how: "hold_rel_ms = sampleTime − firstBorderHitTime for this target. Starts at 0 on first stored point; stops when hold completes.",
  },
  skew: {
    what: "Time skew between board sample time and camera frame time on the shared session clock.",
    meaning: "How many ms apart the paired board + pose samples were. Near 0 = tight sync; large = one stream was stale.",
    how: "Session T0 locks when the 3s center hold ends and Target 1 starts. skew_ms = |boardTimestamp − visionFrameTimestamp| (wall-clock ms).",
  },
} as const;

const COORD_TABLE_COLUMN_INFO = {
  direction: {
    what: "Which directional weight-shift target this row reports.",
    meaning: "The protocol step (e.g. Fwd-Right, Back-Left, Center) the patient was asked to reach and hold.",
    how: "Taken from the prescribed target sequence for this session (step number + short label).",
  },
  region: {
    what: "Whether the patient’s COP entered the target tolerance region.",
    meaning: "Reached = at least one valid sample was inside the tolerance radius; Missed = closest approach stayed outside.",
    how: "Reached when d_min ≤ tolerance (mm) or samplesInTargetZoneCount > 0 from coordinate error metrics.",
  },
  targetCoord: {
    what: "Prescribed target center in physical millimetres relative to baseline (X₀, Y₀).",
    meaning: "Where the patient should place their weight. +X = right, +Y = forward / anterior.",
    how: "Target offsets (mm) from quiet-standing calibration baseline, or board center if uncalibrated.",
  },
  centroid: {
    what: "Average measured COP position while attempting this target.",
    meaning: "Where the patient’s weight actually clustered during the attempt. Closer to Target Coord is better.",
    how: "Centroid = mean of valid sample COP (X, Y) in mm over the target attempt window.",
  },
  minDist: {
    what: "Smallest Euclidean distance from COP to the target center during the attempt.",
    meaning: "Best (closest) approach to the target. Lower is better; ≤ tolerance means the region was entered.",
    how: "d_min = min_i √((Xᵢ − TargetX)² + (Yᵢ − TargetY)²) over valid weighted samples (mm).",
  },
  meanError: {
    what: "Average distance from COP to the target center across valid samples.",
    meaning: "Typical miss from the target during the whole attempt. Lower is better.",
    how: "d̄ = (1/N) × Σ d(i) where d(i) is the Euclidean distance error of each valid sample (mm).",
  },
  maxDist: {
    what: "Largest Euclidean distance from COP to the target center during the attempt.",
    meaning: "Farthest the patient drifted from the target. Higher means more excursion / overshoot.",
    how: "d_max = max_i √((Xᵢ − TargetX)² + (Yᵢ − TargetY)²) over valid samples (mm).",
  },
  hitRate: {
    what: "Percentage of valid samples that landed inside the target tolerance circle.",
    meaning: "Spatial containment success. 100% = every valid sample was inside the zone.",
    how: "Hit Rate % = (N_inside / N_valid) × 100, where inside means d(i) ≤ toleranceMm.",
  },
  pathLength: {
    what: "Total length of the COP trajectory while attempting this target.",
    meaning: "How much the COP wandered. Shorter paths usually mean more direct, stable control.",
    how: "L = Σ √((Xᵢ₊₁ − Xᵢ)² + (Yᵢ₊₁ − Yᵢ)²) over consecutive valid samples (mm); gaps > 350 ms skipped.",
  },
  protocolHold: {
    what: "Required continuous hold time vs measured successful hold for this target.",
    meaning: "Protocol = seconds the patient must stay inside; Achieved = longest continuous inside hold recorded.",
    how: "Hold timer accumulates only while COP is inside tolerance (with small jitter buffer). Resets on exit.",
  },
} as const;

const SESSION_METRIC_CARD_INFO = {
  meanError: {
    what: "Session-wide average distance from COP to each target center.",
    meaning: "Typical spatial miss across all targets. Lower is better.",
    how: "Mean of each target’s mean distance error (mm), aggregated over the full directional session.",
  },
  hitRate: {
    what: "Share of valid COP samples that landed inside any target’s tolerance zone.",
    meaning: "Overall spatial containment success for the session. Higher is better.",
    how: "Session hit rate % = (total samples inside tolerance / total valid samples) × 100.",
  },
  pathLength: {
    what: "Total length of the COP path across all target attempts.",
    meaning: "How much the COP traveled overall. Longer often means more wandering or less direct control.",
    how: "Sum of per-target path lengths L (mm) from consecutive valid COP samples.",
  },
  returnCenter: {
    what: "How close the patient returned to center on the Return-to-Center target.",
    meaning: "Postural recovery precision to baseline (0,0). Lower is better.",
    how: "Mean (or reported) distance error for the RETURN TO CENTER target in millimetres.",
  },
  variability: {
    what: "How spread out the COP was during the session.",
    meaning: "Trajectory spatial dispersion. Higher = more variable / less stable path.",
    how: "Bivariate SD: √(σX² + σY²) of COP coordinates in mm (or overall COP SD when that metric is used).",
  },
} as const;

type ExercisePhase =
  | "READY"
  | "CENTER_HOLD"
  | "CALIBRATING"
  | "CALIBRATION_FAILED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED";

export const DirectionalWeightShiftExercise: React.FC<DirectionalWeightShiftExerciseProps> = ({
  patient,
  onExit,
  onResultFullScreenChange,
  onNavigateToDashboard,
}) => {
  const { status: hardwareStatus, reading: hardwareReading } = useBalanceBoard();
  const boardTimestampRef = useRef<number | null>(null);
  boardTimestampRef.current =
    hardwareReading && typeof hardwareReading.timestamp === "number" && Number.isFinite(hardwareReading.timestamp)
      ? hardwareReading.timestamp
      : null;
  const {
    visionState,
    getLatestVisionState,
    isCameraActive,
    startCamera,
    getMediaStream,
    setDisplayCanvas,
    isMirrored,
    showSkeleton,
  } = useVision();

  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStartedForSessionRef = useRef(false);
  const [showLiveAngles, setShowLiveAngles] = useState(false);
  const angleSnapshotsRef = useRef<BoardSyncedPose2DSnapshot[]>([]);
  /** Continuous pose angles during ACTIVE — sliced into leave→hit transit box plots */
  const angleTimelineRef = useRef<Pose2DAngleTimelineSample[]>([]);
  /**
   * Live buffer: starts on FIRST border hit for the current target and keeps every
   * sync frame (inside OR outside) until the required continuous hold completes.
   */
  const holdWindowBufferRef = useRef<HoldWindowFrameSample[]>([]);
  /** True after first border contact on this target; false until next target starts */
  const holdRecordingStartedRef = useRef(false);
  /**
   * Wall-clock origin for THIS target's hold-window graph (first stored coordinate /
   * first border hit). Same gate as coordinate storing — graph t=0 here.
   */
  const holdWindowOriginMsRef = useRef<number | null>(null);
  /** Completed hold-window series for every target that finished its required hold */
  const completedHoldWindowsRef = useRef<HoldWindowErrorSeries[]>([]);
  /**
   * Shared multimodal T0 (wall-clock ms). Stamped when the 3s center hold
   * finishes and Target 1 begins — board + camera already live, one clock.
   */
  const syncEpochRef = useRef<number | null>(null);
  /** Board + camera are streaming; center hold may count (T0 not set yet) */
  const [sensorsReady, setSensorsReady] = useState(false);
  const [angleSyncReport, setAngleSyncReport] = useState<Pose2DAngleSessionReport | null>(null);
  const [transitAngleBoxPlots, setTransitAngleBoxPlots] = useState<TransitAngleBoxPlot[] | null>(null);
  const [centerStanceSnapshot, setCenterStanceSnapshot] = useState<CenterStanceSnapshot | null>(null);
  const [angleReportSavePath, setAngleReportSavePath] = useState<string | null>(null);
  const [angleReportSaveError, setAngleReportSaveError] = useState<string | null>(null);
  const [isSavingAngleReport, setIsSavingAngleReport] = useState(false);
  /** Result-board path filters: step N = path from target N−1 → N (0 = start/center) */
  const [visiblePathSteps, setVisiblePathSteps] = useState<Set<number>>(() => new Set());
  const getLatestVisionStateRef = useRef(getLatestVisionState);
  getLatestVisionStateRef.current = getLatestVisionState;

  // Only compute for the Live Angles panel — snapshots use getLatestVisionState at hold time
  const livePose2dAngles = useMemo(
    () =>
      showLiveAngles
        ? calculatePose2DAngles(visionState.pose, Date.now())
        : calculatePose2DAngles(null, 0),
    [showLiveAngles, visionState.pose, visionState.fps, visionState.hasPose]
  );

  // Configurable hold durations per target (seconds)
  const [customDurations, setCustomDurations] = useState<Record<DirectionalTargetName, number>>({
    ...DEFAULT_DIRECTIONAL_DURATIONS,
  });
  const [showDurationConfig, setShowDurationConfig] = useState(false);

  // Baseline calibration state (skipped — board origin used; kept for relative COP math)
  const [calibrationBaseline, setCalibrationBaseline] = useState<DirectionalCalibrationBaseline | null>(null);

  // Session targets: randomized far layout locked in when the patient starts
  const [targets, setTargets] = useState<DirectionalTarget[]>(() =>
    getDirectionalTargets(customDurations, undefined, null)
  );
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const centerGateTarget = useMemo(
    () => getCenterStartGateTarget(calibrationBaseline),
    [calibrationBaseline]
  );
  const pendingBaselineRef = useRef<DirectionalCalibrationBaseline | null>(null);

  // Exercise State
  const [phase, setPhase] = useState<ExercisePhase>("READY");
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100%
  const [centerHoldProgress, setCenterHoldProgress] = useState(0);
  const [showGoodBadge, setShowGoodBadge] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Real-time COP trail — kept in refs + updated imperatively so we don't
  // re-render the whole exercise page on every board sample.
  const activeTrailPointsRef = useRef<{ xPercent: number; yPercent: number }[]>([]);
  const lastTrailPointRef = useRef<{ xPercent: number; yPercent: number } | null>(null);
  const trailPolylineRef = useRef<SVGPolylineElement | null>(null);
  const copBallRef = useRef<HTMLDivElement | null>(null);

  const clearActiveTrail = () => {
    activeTrailPointsRef.current = [];
    lastTrailPointRef.current = null;
    if (trailPolylineRef.current) {
      trailPolylineRef.current.setAttribute("points", "");
    }
  };

  // Timing
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<any>(null);
  const distanceSamplesRef = useRef<number[]>([]);
  const isAdvancingRef = useRef(false);

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

  // Active target (during CENTER_HOLD the gate target is shown instead)
  const currentTarget: DirectionalTarget | undefined =
    phase === "CENTER_HOLD" ? centerGateTarget : targets[currentTargetIndex];

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

  // Real-time ball position — DOM-updated (no React setState) ~30fps
  const lastBallUpdateRef = useRef(0);
  const visualBallPosRef = useRef({ xPercent: 50.0, yPercent: 50.0 });

  // Compute visual coordinates using existing canonical mapCopToBoard
  const targetBoardCoords = useMemo(() => {
    if (liveCopX === null || liveCopY === null) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    return mapCopToBoard(liveCopX, liveCopY);
  }, [liveCopX, liveCopY]);

  // Imperative ball position — avoids an extra setState on top of hardware updates
  useEffect(() => {
    const el = copBallRef.current;
    if ((!isRealConnected && !isSimulationMode) || liveCopX === null || liveCopY === null) {
      visualBallPosRef.current = { xPercent: 50.0, yPercent: 50.0 };
      if (el) {
        el.style.left = "50%";
        el.style.top = "50%";
      }
      return;
    }
    const now = Date.now();
    if (now - lastBallUpdateRef.current < 32) return;
    lastBallUpdateRef.current = now;
    const xPercent = Math.max(5, Math.min(95, targetBoardCoords.xPercent));
    const yPercent = Math.max(8, Math.min(92, targetBoardCoords.yPercent));
    visualBallPosRef.current = { xPercent, yPercent };
    if (el) {
      el.style.left = `${xPercent}%`;
      el.style.top = `${yPercent}%`;
    }
  }, [isRealConnected, isSimulationMode, liveCopX, liveCopY, targetBoardCoords.xPercent, targetBoardCoords.yPercent]);

  // Guidance evaluation — require patient load so empty-board COP (0,0) cannot count as on-target
  const isWithinTargetZone = useMemo(() => {
    if (!currentTarget) return false;
    const hasPatientLoad =
      liveWeight !== null && liveWeight !== undefined && !Number.isNaN(liveWeight) && liveWeight >= 10;
    if (isSimulationMode) {
      return isDirectionalTargetReached(liveCopX, liveCopY, currentTarget);
    }
    if (!isRealConnected || !hasPatientLoad) return false;
    return isDirectionalTargetReached(liveCopX, liveCopY, currentTarget);
  }, [currentTarget, isRealConnected, isSimulationMode, liveCopX, liveCopY, liveWeight]);

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

  // Live travel path — keep only a tiny recent tail (not a long history)
  const MAX_LIVE_TRAIL_POINTS = 8;

  // Drop short trail + reset hold recording gate when target/phase changes.
  useEffect(() => {
    clearActiveTrail();
    holdWindowBufferRef.current = [];
    holdRecordingStartedRef.current = false;
    holdWindowOriginMsRef.current = null;
  }, [currentTargetIndex, phase]);

  useEffect(() => {
    if (phase !== "ACTIVE" || (!isRealConnected && !isSimulationMode) || liveCopX === null || liveCopY === null) {
      return;
    }

    const xPercent = targetBoardCoords.xPercent;
    const yPercent = targetBoardCoords.yPercent;
    const last = lastTrailPointRef.current;
    if (last) {
      const dx = xPercent - last.xPercent;
      const dy = yPercent - last.yPercent;
      // Require a clearer move before adding (~1.2% board) so the tail stays short
      if (dx * dx + dy * dy < 1.44) return;
    }

    const pt = { xPercent, yPercent };
    lastTrailPointRef.current = pt;
    const pts = activeTrailPointsRef.current;
    pts.push(pt);
    if (pts.length > MAX_LIVE_TRAIL_POINTS) {
      activeTrailPointsRef.current = pts.slice(pts.length - MAX_LIVE_TRAIL_POINTS);
    }

    const poly = trailPolylineRef.current;
    if (poly) {
      poly.setAttribute(
        "points",
        activeTrailPointsRef.current
          .map((p) => `${p.xPercent.toFixed(1)},${p.yPercent.toFixed(1)}`)
          .join(" ")
      );
    }
  }, [phase, isRealConnected, isSimulationMode, liveCopX, liveCopY, targetBoardCoords.xPercent, targetBoardCoords.yPercent]);

  // Distinct RGB per target step (no shared hues across 1–7)
  const PATH_STEP_COLORS = [
    "#E11D48", // 1 rose
    "#EA580C", // 2 orange
    "#2563EB", // 3 blue
    "#7C3AED", // 4 violet
    "#059669", // 5 emerald
    "#DB2777", // 6 pink
    "#0891B2", // 7 cyan
  ] as const;

  const pathColorForStep = (step: number): string =>
    PATH_STEP_COLORS[(Math.max(1, step) - 1) % PATH_STEP_COLORS.length];

  /**
   * Split COP trail into travel (solid) vs inside-target (dotted).
   * Inside uses the same geometric zone as the drawn tolerance ellipse
   * (norm distance ≤ tolerance) — not the jitter-buffered tracker flag.
   */
  const buildInsideOutsideSegments = (
    samples: Array<{ copX: number; copY: number; isInside?: boolean }>,
    targetX: number,
    targetY: number,
    tolerance: number
  ): Array<{ isInside: boolean; points: Array<{ xPercent: number; yPercent: number }> }> => {
    const tol = Math.max(0.01, tolerance || 0.16);
    const segments: Array<{
      isInside: boolean;
      points: Array<{ xPercent: number; yPercent: number }>;
    }> = [];
    for (const s of samples) {
      if (typeof s.copX !== "number" || typeof s.copY !== "number") continue;
      if (!Number.isFinite(s.copX) || !Number.isFinite(s.copY)) continue;
      const pt = mapCopToBoard(s.copX, s.copY);
      const dist = Math.hypot(s.copX - targetX, s.copY - targetY);
      const isInside = dist <= tol;
      const last = segments[segments.length - 1];
      if (!last || last.isInside !== isInside) {
        const bridged = last?.points.length ? [last.points[last.points.length - 1], pt] : [pt];
        segments.push({ isInside, points: bridged });
      } else {
        last.points.push(pt);
      }
    }
    return segments.filter((seg) => seg.points.length >= 2);
  };

  /**
   * Break a polyline into short dash pieces so "dotted" stays visible even when
   * the board SVG uses preserveAspectRatio="none" (strokeDasharray gets crushed).
   */
  const toDottedPieces = (
    points: Array<{ xPercent: number; yPercent: number }>,
    dashLen = 1.35,
    gapLen = 1.15
  ): Array<Array<{ xPercent: number; yPercent: number }>> => {
    if (points.length < 2) return [];
    const pieces: Array<Array<{ xPercent: number; yPercent: number }>> = [];
    let drawing = true;
    let budget = dashLen;
    let piece: Array<{ xPercent: number; yPercent: number }> = [{ ...points[0] }];
    let cursor = { ...points[0] };

    for (let i = 1; i < points.length; i++) {
      let remaining = Math.hypot(
        points[i].xPercent - cursor.xPercent,
        points[i].yPercent - cursor.yPercent
      );
      let tx = points[i].xPercent - cursor.xPercent;
      let ty = points[i].yPercent - cursor.yPercent;

      while (remaining > 1e-6) {
        const step = Math.min(budget, remaining);
        const u = step / remaining;
        const next = {
          xPercent: cursor.xPercent + tx * u,
          yPercent: cursor.yPercent + ty * u,
        };
        if (drawing) {
          piece.push(next);
        }
        cursor = next;
        tx = points[i].xPercent - cursor.xPercent;
        ty = points[i].yPercent - cursor.yPercent;
        remaining -= step;
        budget -= step;
        if (budget <= 1e-6) {
          if (drawing && piece.length >= 2) pieces.push(piece);
          drawing = !drawing;
          budget = drawing ? dashLen : gapLen;
          piece = drawing ? [{ ...cursor }] : [];
        }
      }
    }
    if (drawing && piece.length >= 2) pieces.push(piece);
    return pieces;
  };

  /** Small direction arrows along a polyline (viewBox % space). */
  const samplePathArrows = (
    points: Array<{ xPercent: number; yPercent: number }>,
    spacing = 7
  ): Array<{ x: number; y: number; angleDeg: number }> => {
    if (points.length < 2) return [];
    const arrows: Array<{ x: number; y: number; angleDeg: number }> = [];
    let distSince = spacing * 0.45;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.xPercent - a.xPercent;
      const dy = b.yPercent - a.yPercent;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-6) continue;
      let t = 0;
      while (distSince + (segLen - t) >= spacing) {
        const need = spacing - distSince;
        t += need;
        const u = t / segLen;
        arrows.push({
          x: a.xPercent + dx * u,
          y: a.yPercent + dy * u,
          angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
        });
        distSince = 0;
      }
      distSince += segLen - t;
    }
    return arrows;
  };

  /**
   * Transit time (s): leave previous target after completing it → hit this target boundary.
   * Target 1: from when Target 1 starts (after center hold) → first border hit.
   */
  const computeApproachTransitSeconds = (
    curr: { samples: Array<{ timestamp: number; isInside: boolean }>; completionTimeSeconds?: number | null },
    prev: { samples: Array<{ timestamp: number; isInside: boolean }>; completionTimeSeconds?: number | null } | null
  ): number | null => {
    if (!curr.samples.length) return null;
    const hit = curr.samples.find((s) => s.isInside);
    if (!hit) return null;

    let leaveTs = curr.samples[0].timestamp;
    if (prev && prev.samples.length > 0) {
      const prevStart = prev.samples[0].timestamp;
      const completeTs =
        typeof prev.completionTimeSeconds === "number" && Number.isFinite(prev.completionTimeSeconds)
          ? prevStart + prev.completionTimeSeconds * 1000
          : prev.samples[prev.samples.length - 1].timestamp;

      let foundLeave: number | null = null;
      for (const s of prev.samples) {
        if (s.timestamp + 1 >= completeTs && !s.isInside) {
          foundLeave = s.timestamp;
          break;
        }
      }
      // Still inside when previous target ended → travel clock starts as next target activates
      leaveTs = foundLeave ?? curr.samples[0].timestamp;
      if (leaveTs > hit.timestamp) leaveTs = curr.samples[0].timestamp;
    }

    return parseFloat(Math.max(0, (hit.timestamp - leaveTs) / 1000).toFixed(2));
  };

  const midpointOfPoints = (
    points: Array<{ xPercent: number; yPercent: number }>
  ): { xPercent: number; yPercent: number } | null => {
    if (points.length < 2) return points[0] ?? null;
    let total = 0;
    const lens: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(
        points[i].xPercent - points[i - 1].xPercent,
        points[i].yPercent - points[i - 1].yPercent
      );
      lens.push(total);
    }
    if (total < 1e-6) return points[Math.floor(points.length / 2)];
    const half = total / 2;
    for (let i = 1; i < points.length; i++) {
      if (lens[i] >= half) {
        const seg = lens[i] - lens[i - 1] || 1;
        const u = (half - lens[i - 1]) / seg;
        return {
          xPercent: points[i - 1].xPercent + (points[i].xPercent - points[i - 1].xPercent) * u,
          yPercent: points[i - 1].yPercent + (points[i].yPercent - points[i - 1].yPercent) * u,
        };
      }
    }
    return points[points.length - 1];
  };

  const perTargetPaths = useMemo(() => {
    if (!sessionSummary) return [];
    return sessionSummary.targets.map((t, index) => {
      const points = t.samples.map((s) => mapCopToBoard(s.copX, s.copY));
      const pathSegments = buildInsideOutsideSegments(
        t.samples,
        t.targetX,
        t.targetY,
        t.tolerance
      );
      const prev = index > 0 ? sessionSummary.targets[index - 1] : null;
      const transitSeconds = computeApproachTransitSeconds(t, prev);
      // Arrows on travel (outside) path; denser on approach
      const arrows = pathSegments.flatMap((seg) =>
        samplePathArrows(seg.points, seg.isInside ? 10 : 6.5)
      );
      // Time label sits on the first approach (outside) segment before first hit
      const approachSeg = pathSegments.find((seg) => !seg.isInside) ?? pathSegments[0];
      const transitLabelPos = approachSeg ? midpointOfPoints(approachSeg.points) : null;

      // Closest recorded COP to target center — the "hit" marker on the result board
      let achievementPoint: { xPercent: number; yPercent: number } | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const s of t.samples) {
        if (typeof s.copX !== "number" || typeof s.copY !== "number") continue;
        const d =
          typeof s.distanceNorm === "number" && !Number.isNaN(s.distanceNorm)
            ? s.distanceNorm
            : Math.hypot(s.copX - t.targetX, s.copY - t.targetY);
        if (d < bestDist) {
          bestDist = d;
          achievementPoint = mapCopToBoard(s.copX, s.copY);
        }
      }
      return {
        name: t.name,
        shortLabel: t.shortLabel,
        stepNumber: t.stepNumber,
        color: pathColorForStep(t.stepNumber),
        isCompleted: t.isCompleted,
        isTargetReached: Boolean(t.isTargetReached),
        timeInsideSeconds: t.timeInsideSeconds,
        requiredHoldDurationSeconds: t.requiredHoldDurationSeconds,
        actualSuccessfulHoldDurationSeconds: t.actualSuccessfulHoldDurationSeconds,
        accuracyPercentage: t.accuracyPercentage,
        sensorQuality: t.sensorQuality,
        hasData: t.samples.length > 0,
        points,
        pathSegments,
        arrows,
        transitSeconds,
        transitLabelPos,
        achievementPoint,
        targetBoardPos: mapCopToBoard(t.targetX, t.targetY),
        tolerance: t.tolerance,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSummary]);

  // When results load, show every path by default; keep prior picks if same steps
  useEffect(() => {
    if (perTargetPaths.length === 0) {
      setVisiblePathSteps(new Set());
      return;
    }
    setVisiblePathSteps((prev) => {
      const steps = perTargetPaths.map((tp) => tp.stepNumber);
      if (prev.size === 0) return new Set(steps);
      const next = new Set<number>();
      for (const s of steps) {
        if (prev.has(s)) next.add(s);
      }
      return next.size > 0 ? next : new Set(steps);
    });
  }, [perTargetPaths]);

  const togglePathStep = (step: number) => {
    setVisiblePathSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  };

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

  // Keep latest sensor + 2D pose angles in refs so the hold timer can sample on a steady clock
  // and board-target completion can snapshot angles in the same instant.
  const liveTelemetryRef = useRef({
    liveCopX,
    liveCopY,
    liveWeight,
    rawCopX: filteredRawCop.x,
    rawCopY: filteredRawCop.y,
    isConnected: isRealConnected || isSimulationMode,
    completedCount,
    targetsLength: targets.length,
    pose2dAngles: livePose2dAngles,
    hasPose: visionState.hasPose,
  });
  liveTelemetryRef.current = {
    liveCopX,
    liveCopY,
    liveWeight,
    rawCopX: filteredRawCop.x,
    rawCopY: filteredRawCop.y,
    isConnected: isRealConnected || isSimulationMode,
    completedCount,
    targetsLength: targets.length,
    pose2dAngles: livePose2dAngles,
    hasPose: visionState.hasPose,
  };

  // Hold progress is driven by the SAME geometric "on target" check as the UI,
  // on a fixed wall-clock interval. Do NOT depend on DirectionalTargetTracker.holdProgressPct
  // (that path can stay at 0 when weight/timestamp validation rejects samples).
  useEffect(() => {
    if (phase !== "ACTIVE" || !currentTarget) return;

    let holdMs = 0;
    let lastTick = Date.now();
    const requiredMs = Math.max(500, Math.round(currentTarget.requiredHoldDurationSeconds * 1000));
    const targetForHold = currentTarget;

    const interval = setInterval(() => {
      if (isAdvancingRef.current) return;

      const now = Date.now();
      const dt = Math.min(100, Math.max(0, now - lastTick));
      lastTick = now;

      const telem = liveTelemetryRef.current;
      const hasCop =
        telem.liveCopX !== null &&
        telem.liveCopX !== undefined &&
        !Number.isNaN(telem.liveCopX) &&
        telem.liveCopY !== null &&
        telem.liveCopY !== undefined &&
        !Number.isNaN(telem.liveCopY);
      const hasPatientLoad =
        telem.liveWeight !== null &&
        telem.liveWeight !== undefined &&
        !Number.isNaN(telem.liveWeight) &&
        telem.liveWeight >= 10;

      const inside =
        hasCop &&
        hasPatientLoad &&
        isDirectionalTargetReached(telem.liveCopX, telem.liveCopY, targetForHold);

      // Still record into the clinical tracker for session/PDF metrics
      const tracker = trackersRef.current[currentTargetIndex];
      if (tracker) {
        tracker.recordSample(
          now,
          telem.liveCopX,
          telem.liveCopY,
          telem.liveWeight,
          telem.isConnected && hasPatientLoad,
          telem.rawCopX,
          telem.rawCopY
        );
      }

      // Continuous angle timeline (~20 Hz) — same wall clock as tracker COP samples (`now`).
      // Always compute from the live vision pose — do NOT use livePose2dAngles here
      // (that object is emptied when the Live Angles panel is hidden).
      {
        const latestVision = getLatestVisionStateRef.current();
        if (latestVision?.pose && (latestVision.hasPose || telem.hasPose)) {
          angleTimelineRef.current.push({
            timestamp: now,
            visionFps: typeof latestVision.fps === "number" ? latestVision.fps : null,
            angles: calculatePose2DAngles(latestVision.pose, now),
          });
        }
      }

      // RULE (per target) — coordinates AND hold-graph time share this gate:
      //  travel before first border hit → DO NOT record
      //  FIRST border touch → START recording (holdRel t=0) and keep going
      //  leave / re-enter many times → KEEP recording (hold timer still resets when outside)
      //  continuous hold completes → STOP / freeze series
      //  travel to next target → DO NOT record until that target's first border hit
      if (inside) {
        holdMs += dt;
        if (!holdRecordingStartedRef.current) {
          holdRecordingStartedRef.current = true;
          // Graph clock origin = first stored coordinate time (same instant as first border)
          const boardTs0 = boardTimestampRef.current;
          holdWindowOriginMsRef.current =
            boardTs0 !== null && Number.isFinite(boardTs0) ? boardTs0 : now;
        }
      } else {
        holdMs = 0; // hold must be continuous, but frame buffer is kept
      }

      if (holdRecordingStartedRef.current && hasCop && hasPatientLoad) {
        const latestVision = getLatestVisionStateRef.current();
        const epoch = syncEpochRef.current;
        const boardTs = boardTimestampRef.current;
        // Use the camera frame's own wall-clock stamp (same domain as board HID),
        // not the hold-interval tick — so skew reflects true sample pairing.
        const visionTs =
          typeof latestVision.frameTimestampMs === "number" &&
          Number.isFinite(latestVision.frameTimestampMs)
            ? latestVision.frameTimestampMs
            : now;
        // Hold-graph time: same samples as coordinates, t=0 at first border hit
        const holdOrigin = holdWindowOriginMsRef.current;
        const sampleClock =
          boardTs !== null && Number.isFinite(boardTs) ? boardTs : now;
        const holdRelMs =
          holdOrigin !== null ? Math.max(0, sampleClock - holdOrigin) : 0;
        const err = computeHoldFrameTargetError(
          targetForHold.x,
          targetForHold.y,
          telem.liveCopX as number,
          telem.liveCopY as number
        );
        const frame: HoldWindowFrameSample = {
          frameIndex: holdWindowBufferRef.current.length + 1,
          syncTimestamp: now,
          syncEpochMs: epoch,
          boardTimestampMs: boardTs,
          visionTimestampMs: visionTs,
          boardRelMs:
            epoch !== null && boardTs !== null && Number.isFinite(boardTs)
              ? boardTs - epoch
              : null,
          visionRelMs:
            epoch !== null && Number.isFinite(visionTs) ? visionTs - epoch : null,
          holdRelMs,
          timeSkewMs:
            boardTs !== null && Number.isFinite(boardTs) && Number.isFinite(visionTs)
              ? Math.abs(boardTs - visionTs)
              : null,
          targetX: targetForHold.x,
          targetY: targetForHold.y,
          targetXMm: err.targetXMm,
          targetYMm: err.targetYMm,
          copX: telem.liveCopX as number,
          copY: telem.liveCopY as number,
          copXMm: err.copXMm,
          copYMm: err.copYMm,
          errorNorm: err.errorNorm,
          errorMm: err.errorMm,
          dxMm: parseFloat((err.copXMm - err.targetXMm).toFixed(2)),
          dyMm: parseFloat((err.copYMm - err.targetYMm).toFixed(2)),
          isInside: inside,
          weightKg: telem.liveWeight,
          hasPose: Boolean(latestVision.hasPose && latestVision.pose),
          visionFps: typeof latestVision.fps === "number" ? latestVision.fps : null,
        };
        holdWindowBufferRef.current.push(frame);
      }

      const pct = Math.min(100, Math.round((holdMs / requiredMs) * 100));
      setHoldProgress((prev) => (prev === pct ? prev : pct));

      if (holdMs >= requiredMs && !isAdvancingRef.current) {
        isAdvancingRef.current = true;
        holdMs = 0;
        setShowGoodBadge(true);
        setHoldProgress(100);

        // Hold complete → freeze frames from first border hit → completion, then STOP
        const holdSeries = buildHoldWindowErrorSeries({
          targetId: targetForHold.id,
          stepNumber: targetForHold.stepNumber || currentTargetIndex + 1,
          targetName: targetForHold.name,
          shortLabel: targetForHold.shortLabel,
          requiredHoldDurationSeconds: targetForHold.requiredHoldDurationSeconds,
          samples: [...holdWindowBufferRef.current],
        });
        completedHoldWindowsRef.current.push(holdSeries);
        holdWindowBufferRef.current = [];
        holdRecordingStartedRef.current = false;
        holdWindowOriginMsRef.current = null;

        // Board-synced 2D angle snapshot at the exact hold-complete instant
        const nowTs = Date.now();
        const latestVision = getLatestVisionStateRef.current();
        const snapAngles = calculatePose2DAngles(latestVision.pose, nowTs);
        angleSnapshotsRef.current.push({
          stepNumber: targetForHold.stepNumber || currentTargetIndex + 1,
          targetIndex: currentTargetIndex,
          targetId: targetForHold.id,
          targetName: targetForHold.name,
          shortLabel: targetForHold.shortLabel,
          targetX: targetForHold.x,
          targetY: targetForHold.y,
          copX: telem.liveCopX,
          copY: telem.liveCopY,
          weightKg: telem.liveWeight,
          boardSynced: true,
          poseConfidence: snapAngles.confidence ?? null,
          timestamp: nowTs,
          angles: {
            ...snapAngles,
            timestamp: nowTs,
          },
        });

        const newCompletedCount = telem.completedCount + 1;
        setCompletedCount(newCompletedCount);

        setTimeout(() => {
          setShowGoodBadge(false);
          setHoldProgress(0);

          if (currentTargetIndex + 1 < telem.targetsLength) {
            const nextIdx = currentTargetIndex + 1;
            setCurrentTargetIndex(nextIdx);
            trackersRef.current[nextIdx]?.start(Date.now());
            isAdvancingRef.current = false;
          } else {
            isAdvancingRef.current = false;
            finishSession(newCompletedCount);
          }
        }, 900);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, currentTarget, currentTargetIndex]);

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

    // Attach hold-window per-frame errors (inside border only → hold complete)
    const holdSeriesList = [...completedHoldWindowsRef.current];
    const holdByTargetId = new Map(holdSeriesList.map((s) => [s.targetId, s]));
    const assessmentsWithHoldFrames = finalizedAssessments.map((t) => {
      const series = holdByTargetId.get(t.targetId);
      if (!series) return t;
      return {
        ...t,
        holdWindowFrameSamples: series.samples,
        holdWindowErrorSeries: series,
      };
    });

    // In Simulation Mode, isRealHardware is strictly FALSE so simulated data is never mixed with clinical history
    const isAuthenticRealHardware = !isSimulationMode && isRealConnected;

    const summary: DirectionalWeightShiftSessionSummary = {
      ...calculateDirectionalSessionSummary({
        sessionId: `session-dir-${isSimulationMode ? "sim" : "real"}-${Date.now()}`,
        patientId: isSimulationMode ? "SIM-TEST" : (patient?.id || patient?.medicalRecordNumber || "P-DEFAULT"),
        patientName: isSimulationMode ? "Simulated Test Patient" : (patient?.fullName || "Unspecified Patient"),
        startTime: sessionStartTimeRef.current || (Date.now() - elapsedMs),
        endTime: Date.now(),
        targets: assessmentsWithHoldFrames,
        isRealHardware: isAuthenticRealHardware,
        calibrationBaseline: calibrationBaseline || undefined,
      }),
      holdWindowErrorSeries: holdSeriesList,
      multimodalSyncEpochMs: syncEpochRef.current,
    };

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
    const angleReport = buildPose2DAngleSessionReport(angleSnapshotsRef.current);
    setAngleSyncReport(angleReport);
    const transitPlots = buildTransitAngleBoxPlots(
      assessmentsWithHoldFrames.map((t) => ({
        stepNumber: t.stepNumber,
        shortLabel: t.shortLabel,
        samples: t.samples.map((s) => ({
          timestamp: s.timestamp,
          isInside: s.isInside,
        })),
        completionTimeSeconds: t.completionTimeSeconds,
      })),
      angleTimelineRef.current
    );
    setTransitAngleBoxPlots(transitPlots);

    // Auto-save board-synced 2D angle report locally (JSON + CSV)
    if (angleReport.snapshots.length > 0) {
      void (async () => {
        setIsSavingAngleReport(true);
        setAngleReportSaveError(null);
        try {
          const saved = await Pose2DAngleReportService.saveLocally(angleReport, {
            sessionId: summary.sessionId,
            patientId: summary.patientId,
            patientName: summary.patientName,
            sessionDate: summary.sessionDate,
            isRealHardware: summary.isRealHardware,
          });
          setAngleReportSavePath(saved.jsonPath);
        } catch (err: unknown) {
          setAngleReportSaveError(err instanceof Error ? err.message : String(err));
        } finally {
          setIsSavingAngleReport(false);
        }
      })();
    }
  };

  // START → 3s center hold → then randomized far targets
  const handleStartCalibration = () => {
    if (!isSimulationMode && !isRealConnected) {
      return;
    }
    setPauseReason(null);
    setCalibrationError(null);
    calibrationCollectorRef.current.reset();
    rollingFilterRef.current.reset();
    setCalibrationLiveWeight(null);
    setCalibrationLiveSwayMm(null);
    setCenterHoldProgress(0);
    setHoldProgress(0);
    setCurrentTargetIndex(0);
    setCompletedCount(0);
    setShowGoodBadge(false);
    isAdvancingRef.current = false;
    angleSnapshotsRef.current = [];
    angleTimelineRef.current = [];
    holdWindowBufferRef.current = [];
    holdRecordingStartedRef.current = false;
    holdWindowOriginMsRef.current = null;
    completedHoldWindowsRef.current = [];
    syncEpochRef.current = null;
    setSensorsReady(false);
    setAngleSyncReport(null);
    setTransitAngleBoxPlots(null);
    setCenterStanceSnapshot(null);
    setAngleReportSavePath(null);
    setAngleReportSaveError(null);

    const skippedBaseline: DirectionalCalibrationBaseline = {
      baselineX0: 0,
      baselineY0: 0,
      baselineX0Mm: 0,
      baselineY0Mm: 0,
      calibratedWeightKg: liveWeight ?? 0,
      weightStdDevKg: 0,
      copSdXNorm: 0,
      copSdYNorm: 0,
      copSdMm: 0,
      copSwayDispersionMm: 0,
      sampleCount: 0,
      calibrationDurationSeconds: 0,
      timestamp: Date.now(),
      isCalibrated: true,
      statusMessage: "Board origin (0, 0) — center hold required before Target 1",
    };
    setCalibrationBaseline(skippedBaseline);
    pendingBaselineRef.current = skippedBaseline;

    // Lock in a new random far target sequence for this session
    const randomized = getRandomizedFarDirectionalTargets(customDurations, skippedBaseline);
    setTargets(randomized);
    targetsRef.current = randomized;
    trackersRef.current = randomized.map((t) => new DirectionalTargetTracker(t, skippedBaseline));

    setPhase("CENTER_HOLD");

    // Start live RealSense/webcam + MediaPipe skeleton as the exercise begins
    cameraStartedForSessionRef.current = true;
    void (async () => {
      const ok = await startCamera();
      if (ok && cameraVideoRef.current) {
        const stream = getMediaStream();
        if (stream && cameraVideoRef.current.srcObject !== stream) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        }
        if (cameraCanvasRef.current) {
          setDisplayCanvas(cameraCanvasRef.current);
        }
      }
    })();
  };

  // Keep video/canvas attached while exercise is running
  useEffect(() => {
    const live = phase === "CENTER_HOLD" || phase === "ACTIVE" || phase === "PAUSED";
    if (!live) {
      setDisplayCanvas(null);
      return;
    }

    if (isCameraActive && cameraVideoRef.current) {
      const stream = getMediaStream();
      if (stream && cameraVideoRef.current.srcObject !== stream) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
      if (cameraCanvasRef.current) {
        setDisplayCanvas(cameraCanvasRef.current);
      }
    }

    return () => {
      // Detach this exercise's canvas when leaving live phases (do not stop global camera mid-nav)
      setDisplayCanvas(null);
    };
  }, [
    phase,
    isCameraActive,
    getMediaStream,
    setDisplayCanvas,
    visionState.selectedCameraId,
    visionState.activeCameraLabel,
  ]);

  // Pre-start gate:
  // 1) Wait until board + camera are both live (ready, not T0 yet)
  // 2) Patient holds center for 3 seconds
  // 3) When 3s ends → stamp shared T0 and start Target 1 together
  useEffect(() => {
    if (phase !== "CENTER_HOLD") return;

    let holdMs = 0;
    let lastTick = Date.now();
    const syncWaitStartedAt = Date.now();
    const requiredMs = CENTER_START_HOLD_SECONDS * 1000;
    const gate = centerGateTarget;
    /** Prefer both streams; after this, allow board-only so a camera glitch can't soft-lock */
    const CAMERA_SYNC_GRACE_MS = 8000;

    const interval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(100, Math.max(0, now - lastTick));
      lastTick = now;

      const telem = liveTelemetryRef.current;
      const latestVision = getLatestVisionStateRef.current();
      const hasCop =
        telem.liveCopX !== null &&
        telem.liveCopX !== undefined &&
        !Number.isNaN(telem.liveCopX) &&
        telem.liveCopY !== null &&
        telem.liveCopY !== undefined &&
        !Number.isNaN(telem.liveCopY);
      // Empty board reports COP at (0,0) after unload zeroing — require real standing weight
      // so the 3s center gate cannot pass with nobody on the board.
      const hasPatientLoad =
        telem.liveWeight !== null &&
        telem.liveWeight !== undefined &&
        !Number.isNaN(telem.liveWeight) &&
        telem.liveWeight >= 10;

      const boardLive =
        (isSimulationMode || telem.isConnected) && hasCop && hasPatientLoad;
      const cameraFrameAgeMs =
        typeof latestVision.frameTimestampMs === "number"
          ? now - latestVision.frameTimestampMs
          : Number.POSITIVE_INFINITY;
      const cameraLive =
        latestVision.cameraStatus === "connected" &&
        Boolean(latestVision.hasPose && latestVision.pose) &&
        cameraFrameAgeMs < 500;
      const waitedMs = now - syncWaitStartedAt;
      const streamsReady =
        boardLive && (cameraLive || waitedMs >= CAMERA_SYNC_GRACE_MS);

      if (!streamsReady) {
        holdMs = 0;
        setCenterHoldProgress((prev) => (prev === 0 ? prev : 0));
        setSensorsReady(false);
        return;
      }

      setSensorsReady((prev) => (prev ? prev : true));

      const inside =
        hasCop &&
        hasPatientLoad &&
        isDirectionalTargetReached(telem.liveCopX, telem.liveCopY, gate);

      if (inside) {
        holdMs += dt;
      } else {
        holdMs = 0;
      }

      const pct = Math.min(100, Math.round((holdMs / requiredMs) * 100));
      setCenterHoldProgress((prev) => (prev === pct ? prev : pct));

      if (holdMs >= requiredMs) {
        clearInterval(interval);
        setCenterHoldProgress(100);

        // 3s done → lock shared T0 and start Target 1 on the same clock
        const t0 = Date.now();
        syncEpochRef.current = t0;
        sessionStartTimeRef.current = t0;

        // Snapshot person image + angle vectors + mid-hip at center-hold complete
        try {
          const visionAtT0 = getLatestVisionStateRef.current();
          const canvas = cameraCanvasRef.current;
          const video = cameraVideoRef.current;
          let imageDataUrl: string | null = null;
          let imageWidth = 0;
          let imageHeight = 0;
          if (canvas && canvas.width > 0 && canvas.height > 0) {
            imageWidth = canvas.width;
            imageHeight = canvas.height;
            try {
              imageDataUrl = canvas.toDataURL("image/jpeg", 0.88);
            } catch {
              imageDataUrl = null;
            }
          }
          // Fallback: grab a frame from the live video if canvas export failed
          if (
            !imageDataUrl &&
            video &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            try {
              const tmp = document.createElement("canvas");
              tmp.width = video.videoWidth;
              tmp.height = video.videoHeight;
              const ctx = tmp.getContext("2d");
              ctx?.drawImage(video, 0, 0);
              imageWidth = tmp.width;
              imageHeight = tmp.height;
              imageDataUrl = tmp.toDataURL("image/jpeg", 0.88);
            } catch {
              // keep null
            }
          }
          const stance = buildCenterStanceSnapshot({
            pose: visionAtT0.pose,
            imageDataUrl,
            imageWidth,
            imageHeight,
            isMirrored,
            timestamp: t0,
          });
          setCenterStanceSnapshot(stance);
        } catch {
          setCenterStanceSnapshot(null);
        }

        const baseline = pendingBaselineRef.current;
        if (baseline) {
          startActiveExercise(baseline, targetsRef.current, t0);
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [phase, centerGateTarget, isSimulationMode]);

  const startActiveExercise = (
    baseline: DirectionalCalibrationBaseline,
    sessionTargets?: DirectionalTarget[],
    sharedT0Ms?: number
  ) => {
    const lockedTargets =
      sessionTargets && sessionTargets.length > 0
        ? sessionTargets
        : targetsRef.current.length > 0
          ? targetsRef.current
          : getRandomizedFarDirectionalTargets(customDurations, baseline);

    const t0 = sharedT0Ms ?? syncEpochRef.current ?? Date.now();
    syncEpochRef.current = t0;
    sessionStartTimeRef.current = t0;

    setCalibrationBaseline(baseline);
    setCalibrationError(null);
    setTargets(lockedTargets);
    setPhase("ACTIVE");
    setPauseReason(null);
    isAdvancingRef.current = false;
    clearActiveTrail();
    setHoldProgress(0);
    setCenterHoldProgress(0);
    setCurrentTargetIndex(0);
    setCompletedCount(0);
    simCopRef.current = { x: 0.0, y: 0.0 };
    setSimCop({ x: 0.0, y: 0.0 });
    simTargetGoalRef.current = null;
    keysPressedRef.current = {};
    trackersRef.current = lockedTargets.map((t) => new DirectionalTargetTracker(t, baseline));
    // Target 1 tracker + multimodal timeline both start at T0
    trackersRef.current[0]?.start(t0);
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
    pendingBaselineRef.current = null;
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
    setCenterHoldProgress(0);
    setShowGoodBadge(false);
    setCompletedCount(0);
    setElapsedMs(0);
    setTargets(getDirectionalTargets(customDurations, undefined, null));
    distanceSamplesRef.current = [];
    clearActiveTrail();
    isAdvancingRef.current = false;
    setFinalResult(null);
    setSessionSummary(null);
    angleSnapshotsRef.current = [];
    angleTimelineRef.current = [];
    holdWindowBufferRef.current = [];
    holdRecordingStartedRef.current = false;
    holdWindowOriginMsRef.current = null;
    completedHoldWindowsRef.current = [];
    syncEpochRef.current = null;
    setSensorsReady(false);
    setAngleSyncReport(null);
    setTransitAngleBoxPlots(null);
    setCenterStanceSnapshot(null);
    setAngleReportSavePath(null);
    setAngleReportSaveError(null);
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
      // Download includes: board PDF pages + 2D angle tables (absolute + T1→T2 changes)
      // and also writes JSON/CSV for both angle sections locally.
      const res = await PdfReportService.generateAndSaveDirectionalReport(
        sessionSummary,
        angleSyncReport
      );
      setPdfExportResult({ filename: res.filename, filePath: res.filePath });
      if (res.angleJsonPath) {
        setAngleReportSavePath(res.angleJsonPath);
      }
    } catch (err: any) {
      setPdfExportError(err?.message || String(err));
    } finally {
      setIsExportingPdf(false);
    }
  };


  // Color theme: Medical Light-Green / White
  // Live exercise uses full content width so board + camera can grow; results already 100%.
  const isLiveStage =
    phase === "CENTER_HOLD" ||
    phase === "ACTIVE" ||
    phase === "PAUSED" ||
    phase === "CALIBRATING";
  return (
    <div
      style={{
        width: "100%",
        maxWidth: phase === "COMPLETED" || isLiveStage ? "100%" : "980px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: phase === "COMPLETED" ? "20px" : "18px",
        padding: phase === "COMPLETED" ? "20px 32px 64px 32px" : isLiveStage ? "8px 0 32px 0" : "10px 0 40px 0",
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
              <span>{isExportingPdf ? "Generating PDF..." : "Download Full Report (Board + Angles)"}</span>
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
                    { name: "SHIFT FORWARD-RIGHT" as DirectionalTargetName, label: "Fwd-Right" },
                    { name: "SHIFT BACKWARD-LEFT" as DirectionalTargetName, label: "Back-Left" },
                    { name: "SHIFT FORWARD" as DirectionalTargetName, label: "Forward" },
                    { name: "SHIFT BACKWARD" as DirectionalTargetName, label: "Backward" },
                    { name: "SHIFT FORWARD-LEFT" as DirectionalTargetName, label: "Fwd-Left" },
                    { name: "SHIFT BACKWARD-RIGHT" as DirectionalTargetName, label: "Back-Right" },
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
                padding: "10px 14px",
                textAlign: "center",
                background: showGoodBadge
                  ? "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)"
                  : isWithinTargetZone
                    ? "linear-gradient(135deg, #F0FDFA 0%, #E6FFFA 100%)"
                    : "#FFFFFF",
                border: `1.5px solid ${showGoodBadge
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
                  gap: "6px",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: "rgba(13, 148, 136, 0.1)",
                  color: "var(--teal-primary)",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                {phase === "CENTER_HOLD" ? (
                  <span>
                    {sensorsReady
                      ? "Sensors Ready · Center Stance"
                      : "Waiting Board + Camera"}
                  </span>
                ) : (
                  <>
                    <span>Target {currentTargetIndex + 1} of {targets.length}</span>
                    <span>&bull;</span>
                    <span>{currentTarget?.shortLabel}</span>
                  </>
                )}
              </div>

              {/* Compact direction suggestion */}
              <h2
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: showGoodBadge ? "#059669" : "var(--text-main)",
                  letterSpacing: "0.02em",
                  margin: "2px 0",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                {phase === "CENTER_HOLD"
                  ? sensorsReady
                    ? "STAND IN CENTER"
                    : "WAITING FOR SENSORS"
                  : currentTarget?.name}
              </h2>

              {/* Sequential Target Instruction */}
              <p
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  margin: "0 0 4px 0",
                  lineHeight: 1.35,
                }}
              >
                {phase === "CENTER_HOLD"
                  ? sensorsReady
                    ? `Hold center for ${CENTER_START_HOLD_SECONDS}s. When it ends, the shared clock starts and Target 1 begins.`
                    : "Stand on the board and face the camera until both are live — then the 3s center hold can start."
                  : currentTarget?.instruction}
              </p>

              {/* GUIDANCE MESSAGE & GOOD BADGE */}
              <div style={{ minHeight: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showGoodBadge ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "#059669",
                      color: "#FFFFFF",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      boxShadow: "0 2px 8px rgba(5, 150, 105, 0.28)",
                      animation: "pulse 0.8s infinite alternate",
                    }}
                  >
                    <Check size={14} strokeWidth={3} />
                    <span>GOOD</span>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: "0.75rem",
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
                  maxWidth: "280px",
                  margin: "6px auto 0 auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.625rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                  }}
                >
                  <span>
                    {phase === "CENTER_HOLD"
                      ? `Center Hold (${CENTER_START_HOLD_SECONDS}s to Start)`
                      : `Hold Duration (${currentTarget?.requiredHoldDurationSeconds}s Required)`}
                  </span>
                  <span
                    style={{
                      color:
                        (phase === "CENTER_HOLD" ? centerHoldProgress : holdProgress) === 100
                          ? "#059669"
                          : "var(--teal-primary)",
                      fontWeight: 800,
                    }}
                  >
                    {phase === "CENTER_HOLD"
                      ? `${(Math.min(CENTER_START_HOLD_SECONDS, (centerHoldProgress / 100) * CENTER_START_HOLD_SECONDS)).toFixed(1)}s / ${CENTER_START_HOLD_SECONDS}s`
                      : currentTarget
                        ? `${(Math.min(currentTarget.requiredHoldDurationSeconds, (holdProgress / 100) * currentTarget.requiredHoldDurationSeconds)).toFixed(1)}s / ${currentTarget.requiredHoldDurationSeconds}s`
                        : "0.0s"}
                  </span>
                </div>
                <div
                  style={{
                    height: "5px",
                    background: "#E2E8F0",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${phase === "CENTER_HOLD" ? centerHoldProgress : holdProgress}%`,
                      background:
                        (phase === "CENTER_HOLD" ? centerHoldProgress : holdProgress) === 100
                          ? "#059669"
                          : "linear-gradient(90deg, var(--teal-primary), #10B981)",
                      transition: "width 0.05s linear",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. BOARD + LIVE CAMERA (MediaPipe skeleton) — full-width visual stage */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
              gap: "16px",
              alignItems: "start",
              width: "100%",
            }}
          >
          <div
            className="medical-card"
            style={{
              padding: "16px 14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
              width: "100%",
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
                maxWidth: "100%",
                gap: "10px",
              }}
            >
              {/* Left Label */}
              <div
                style={{
                  width: "48px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                }}
              >
                <span>← LEFT</span>
                <span style={{ fontSize: "0.5625rem", color: "var(--text-light)" }}>(-X)</span>
              </div>

              {/* Physical Balance Board Chassis */}
              <div
                style={{
                  flex: "1 1 auto",
                  width: "100%",
                  aspectRatio: "446 / 238",
                  height: "auto",
                  position: "relative",
                  background: "#FFFFFF",
                  borderRadius: "28px",
                  border: "2px solid #CBD5E1",
                  boxShadow:
                    "0 10px 25px -5px rgba(15, 23, 42, 0.08), inset 0 2px 4px rgba(255, 255, 255, 0.8)",
                  padding: "14px",
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

                  {/* REAL-TIME SVG COP MOVEMENT TRAIL (imperative points — no React state) */}
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
                    <polyline
                      ref={trailPolylineRef}
                      points=""
                      fill="none"
                      stroke="rgba(13, 148, 136, 0.22)"
                      strokeWidth="0.55"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Coordinate origin (0,0) + clear X/Y axes at board center */}
                  {(phase === "CENTER_HOLD" || phase === "ACTIVE" || phase === "PAUSED") && (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 96,
                        height: 96,
                        pointerEvents: "none",
                        zIndex: 5,
                      }}
                      aria-hidden
                    >
                      <svg width="96" height="96" viewBox="0 0 96 96" style={{ display: "block", overflow: "visible" }}>
                        <defs>
                          <marker
                            id="cop-axis-arrow-x"
                            markerWidth="7"
                            markerHeight="7"
                            refX="5"
                            refY="3.5"
                            orient="auto"
                          >
                            <path d="M0,0 L7,3.5 L0,7 Z" fill="#0F172A" />
                          </marker>
                          <marker
                            id="cop-axis-arrow-y"
                            markerWidth="7"
                            markerHeight="7"
                            refX="5"
                            refY="3.5"
                            orient="auto"
                          >
                            <path d="M0,0 L7,3.5 L0,7 Z" fill="#0F172A" />
                          </marker>
                        </defs>
                        {/* Crosshair through origin */}
                        <line
                          x1="10"
                          y1="48"
                          x2="86"
                          y2="48"
                          stroke="rgba(15, 23, 42, 0.55)"
                          strokeWidth="1.5"
                          markerEnd="url(#cop-axis-arrow-x)"
                        />
                        <line
                          x1="48"
                          y1="86"
                          x2="48"
                          y2="10"
                          stroke="rgba(15, 23, 42, 0.55)"
                          strokeWidth="1.5"
                          markerEnd="url(#cop-axis-arrow-y)"
                        />
                        {/* Origin dot = (0,0) in COP space */}
                        <circle cx="48" cy="48" r="3.2" fill="#0F172A" stroke="#FFFFFF" strokeWidth="1.5" />
                        <text
                          x="54"
                          y="62"
                          fill="#0F172A"
                          fontSize="9"
                          fontWeight="800"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          (0,0)
                        </text>
                        <text
                          x="78"
                          y="44"
                          fill="#0F172A"
                          fontSize="10"
                          fontWeight="800"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >
                          +X
                        </text>
                        <text
                          x="52"
                          y="16"
                          fill="#0F172A"
                          fontSize="10"
                          fontWeight="800"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >
                          +Y
                        </text>
                      </svg>
                    </div>
                  )}

                  {/* VISUAL TARGETS — only reveal current + completed (never show future targets) */}
                  {targets.map((t, idx) => {
                    const coords = mapCopToBoard(t.x, t.y);
                    const isCenterGate = phase === "CENTER_HOLD" && t.name === "RETURN TO CENTER";
                    const isCurrent = phase === "CENTER_HOLD" ? isCenterGate : idx === currentTargetIndex;
                    const isCompleted = phase === "CENTER_HOLD" ? false : idx < currentTargetIndex;
                    // Before start / ready: show nothing. Center hold: only center. Active: current + done.
                    const shouldReveal =
                      phase === "CENTER_HOLD"
                        ? isCenterGate
                        : phase === "ACTIVE" || phase === "PAUSED"
                          ? isCurrent || isCompleted
                          : false;
                    if (!shouldReveal) return null;

                    const zoneDiamPct = Math.max(8, (t.tolerance || 0.16) * 100);
                    return (
                      <div
                        key={t.id}
                        style={{
                          position: "absolute",
                          left: `${coords.xPercent}%`,
                          top: `${coords.yPercent}%`,
                          width: `${zoneDiamPct}%`,
                          height: `${zoneDiamPct}%`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "none",
                          zIndex: isCurrent ? 4 : 3,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        {/* Target zone sized to real COP tolerance (same radius as hold detection) */}
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
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
                            boxSizing: "border-box",
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
                      ref={copBallRef}
                      style={{
                        position: "absolute",
                        left: `${visualBallPosRef.current.xPercent}%`,
                        top: `${visualBallPosRef.current.yPercent}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                        zIndex: 6,
                        transition: "left 80ms cubic-bezier(0.2, 0.8, 0.4, 1), top 80ms cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 0.15s ease",
                        willChange: "left, top",
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
                  width: "48px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  color: "var(--text-muted)",
                }}
              >
                <span>RIGHT →</span>
                <span style={{ fontSize: "0.5625rem", color: "var(--text-light)" }}>(+X)</span>
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

          {/* Live camera + MediaPipe skeleton (starts with exercise) */}
          <div
            className="medical-card"
            style={{
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
              width: "100%",
              alignSelf: "start",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#E2E8F0",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {isCameraActive ? <Camera size={14} color="#34D399" /> : <CameraOff size={14} color="#94A3B8" />}
                <span>Live Camera · MediaPipe Skeleton</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#94A3B8" }}>
                  {isCameraActive
                    ? `${visionState.fps || 0} FPS · ${visionState.hasPose ? "Pose locked" : "Seeking pose"}`
                    : phase === "CENTER_HOLD" || phase === "ACTIVE" || phase === "PAUSED"
                      ? "Starting camera…"
                      : "Standby"}
                  {showSkeleton && isCameraActive ? " · Skeleton ON" : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setShowLiveAngles((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: showLiveAngles
                      ? "1px solid rgba(52, 211, 153, 0.55)"
                      : "1px solid rgba(148, 163, 184, 0.35)",
                    background: showLiveAngles
                      ? "rgba(16, 185, 129, 0.18)"
                      : "rgba(15, 23, 42, 0.75)",
                    color: showLiveAngles ? "#6EE7B7" : "#E2E8F0",
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  title="Show live left/right 2D joint angle speedometers"
                >
                  <Gauge size={14} />
                  {showLiveAngles ? "Hide Angles" : "Live Angles"}
                </button>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                // Keep true 4:3 — do not flex-stretch (that made the feed wide + short)
                aspectRatio: "4 / 3",
                height: "auto",
                flex: "0 0 auto",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#020617",
              }}
            >
              <video
                ref={cameraVideoRef}
                playsInline
                muted
                autoPlay
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />
              <canvas
                ref={cameraCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  // Video frame is painted into this canvas (WebView-safe); mirror with CSS
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  pointerEvents: "none",
                  display: isCameraActive ? "block" : "none",
                  background: "#020617",
                }}
              />
              {!isCameraActive && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    color: "#94A3B8",
                    padding: "20px",
                    textAlign: "center",
                  }}
                >
                  <Camera size={28} color="#64748B" />
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#CBD5E1" }}>
                    {phase === "READY"
                      ? "Camera starts when you press START"
                      : "Connecting RealSense / webcam…"}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "#64748B" }}>
                    MediaPipe 2D skeleton overlays automatically when pose is detected.
                  </div>
                </div>
              )}
            </div>

            <div style={{ fontSize: "0.6875rem", color: "#94A3B8", lineHeight: 1.4 }}>
              {visionState.activeCameraLabel
                ? `Source: ${visionState.activeCameraLabel}`
                : "Prefers Intel RealSense D455f RGB @ 30 FPS"}
              {isCameraActive && visionState.hasPose
                ? " · Skeleton tracking active"
                : isCameraActive
                  ? " · Stand in frame for skeleton"
                  : ""}
            </div>
          </div>
          </div>

          {showLiveAngles && (
            <LiveJointAnglePanel
              angles={livePose2dAngles}
              hasPose={Boolean(visionState.hasPose && visionState.pose)}
            />
          )}

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
                <Play size={18} />
                <span>START — HOLD CENTER 3s</span>
              </button>
            )}

            {phase === "CENTER_HOLD" && (
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
                <span>Cancel</span>
              </button>
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

          {/* Board-synced 2D joint angle report (T1 → T2 …) */}
          {(angleSyncReport || centerStanceSnapshot || (transitAngleBoxPlots && transitAngleBoxPlots.length > 0)) && (
            <Pose2DAngleSyncReport
              report={angleSyncReport}
              centerStance={centerStanceSnapshot}
              transitBoxPlots={transitAngleBoxPlots}
              isSaving={isSavingAngleReport}
              savedJsonPath={angleReportSavePath}
              saveError={angleReportSaveError}
              onSaveAgain={async () => {
                if (!angleSyncReport || !sessionSummary) return;
                setIsSavingAngleReport(true);
                setAngleReportSaveError(null);
                try {
                  const saved = await Pose2DAngleReportService.saveLocally(angleSyncReport, {
                    sessionId: sessionSummary.sessionId,
                    patientId: sessionSummary.patientId,
                    patientName: sessionSummary.patientName,
                    sessionDate: sessionSummary.sessionDate,
                    isRealHardware: sessionSummary.isRealHardware,
                  });
                  setAngleReportSavePath(saved.jsonPath);
                } catch (err: unknown) {
                  setAngleReportSaveError(err instanceof Error ? err.message : String(err));
                } finally {
                  setIsSavingAngleReport(false);
                }
              }}
            />
          )}

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
                    {perTargetPaths.map((tp) => {
                      if (!visiblePathSteps.has(tp.stepNumber)) return null;

                      // Tolerance ellipse in viewBox % space (matches mapCopToBoard: 1.0 norm = 50%)
                      const tolRx = (tp.tolerance ?? 0.16) * 50;
                      const tolRy = (tp.tolerance ?? 0.16) * 50;
                      const tx = tp.targetBoardPos.xPercent;
                      const ty = tp.targetBoardPos.yPercent;

                      const startPt = tp.points[0];
                      const endPt = tp.points[tp.points.length - 1];
                      const hitPt = tp.achievementPoint;

                      return (
                        <g key={tp.name}>
                          {/* Real hit-zone outline (same radius used for completion) */}
                          <ellipse
                            cx={tx}
                            cy={ty}
                            rx={tolRx}
                            ry={tolRy}
                            fill={`${tp.color}14`}
                            stroke={tp.color}
                            strokeWidth="1.25"
                            strokeDasharray="3 2.5"
                            vectorEffect="non-scaling-stroke"
                            strokeOpacity="0.85"
                          />

                          {/* Solid = travel / outside · Dotted pieces = movement inside target zone */}
                          {tp.pathSegments.map((seg, segIdx) => {
                            if (!seg.isInside) {
                              return (
                                <polyline
                                  key={`${tp.name}-seg-${segIdx}`}
                                  points={seg.points
                                    .map((p) => `${p.xPercent.toFixed(2)},${p.yPercent.toFixed(2)}`)
                                    .join(" ")}
                                  fill="none"
                                  stroke={tp.color}
                                  strokeWidth="2.2"
                                  vectorEffect="non-scaling-stroke"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeOpacity="0.72"
                                />
                              );
                            }
                            // Inside target: draw real gaps (dasharray fails on stretched board SVG)
                            return (
                              <g key={`${tp.name}-seg-${segIdx}-dots`}>
                                {toDottedPieces(seg.points).map((piece, pIdx) => (
                                  <polyline
                                    key={`${tp.name}-seg-${segIdx}-d${pIdx}`}
                                    points={piece
                                      .map((p) => `${p.xPercent.toFixed(2)},${p.yPercent.toFixed(2)}`)
                                      .join(" ")}
                                    fill="none"
                                    stroke={tp.color}
                                    strokeWidth="2.6"
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeOpacity="0.95"
                                  />
                                ))}
                              </g>
                            );
                          })}

                          {/* Small direction arrows along the path */}
                          {tp.arrows.map((a, aIdx) => (
                            <g
                              key={`${tp.name}-arrow-${aIdx}`}
                              transform={`translate(${a.x.toFixed(2)}, ${a.y.toFixed(2)}) rotate(${a.angleDeg.toFixed(1)})`}
                            >
                              <polygon
                                points="1.35,0 -1.1,-0.85 -0.55,0 -1.1,0.85"
                                fill={tp.color}
                                stroke="#FFFFFF"
                                strokeWidth="0.15"
                                opacity="0.95"
                              />
                            </g>
                          ))}

                          {tp.hasData && startPt && endPt && (
                            <>
                              <circle
                                cx={startPt.xPercent}
                                cy={startPt.yPercent}
                                r="0.5"
                                fill="#FFFFFF"
                                stroke={tp.color}
                                strokeWidth="1.5"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle
                                cx={endPt.xPercent}
                                cy={endPt.yPercent}
                                r="0.65"
                                fill={tp.color}
                                stroke="#FFFFFF"
                                strokeWidth="1.5"
                                vectorEffect="non-scaling-stroke"
                              />
                            </>
                          )}

                          {/* Closest COP sample — the achieved hit point inside / at the target */}
                          {hitPt && (tp.isTargetReached || tp.isCompleted) && (
                            <g>
                              <circle
                                cx={hitPt.xPercent}
                                cy={hitPt.yPercent}
                                r="1.35"
                                fill={tp.color}
                                stroke="#FFFFFF"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                              />
                              <circle
                                cx={hitPt.xPercent}
                                cy={hitPt.yPercent}
                                r="0.45"
                                fill="#FFFFFF"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>

                  {/* Transit time labels (HTML so text is not stretched by SVG none-aspect) */}
                  {perTargetPaths.map((tp) => {
                    if (!visiblePathSteps.has(tp.stepNumber)) return null;
                    if (tp.transitSeconds === null || !tp.transitLabelPos) return null;
                    return (
                      <div
                        key={`${tp.name}-transit`}
                        style={{
                          position: "absolute",
                          left: `${tp.transitLabelPos.xPercent}%`,
                          top: `${tp.transitLabelPos.yPercent}%`,
                          transform: "translate(-50%, -120%)",
                          zIndex: 5,
                          pointerEvents: "none",
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: "#FFFFFF",
                          border: `1.5px solid ${tp.color}`,
                          boxShadow: "0 1px 4px rgba(15, 23, 42, 0.12)",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: "0.6875rem",
                          fontWeight: 800,
                          color: tp.color,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                        }}
                        title={`Travel time from leave previous (after complete) → hit target ${tp.stepNumber} boundary`}
                      >
                        {tp.transitSeconds.toFixed(2)} s
                      </div>
                    );
                  })}

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
                    tolerance: t.tolerance,
                    toleranceMm: t.toleranceMm,
                    requiredHoldDurationSeconds: t.requiredHoldDurationSeconds,
                    actualSuccessfulHoldDurationSeconds: 0,
                    isCompleted: false,
                    isTargetReached: false,
                    minDistanceMm: null as number | null,
                    minDistanceErrorMm: null as number | null,
                    coordinateMetrics: undefined,
                    sensorQuality: "Unavailable" as const,
                    samples: [],
                  }))).map((t) => {
                    if (!visiblePathSteps.has(t.stepNumber)) return null;
                    const coords = mapCopToBoard(t.targetX, t.targetY);
                    const dirColor = pathColorForStep(t.stepNumber);
                    const validN = t.coordinateMetrics?.validSampleCount ?? 0;
                    const minDist = t.coordinateMetrics?.minDistanceErrorMm ?? t.minDistanceErrorMm ?? t.minDistanceMm;
                    const isReached = Boolean(
                      t.isTargetReached ||
                      (validN > 0 &&
                        typeof minDist === "number" &&
                        Number.isFinite(minDist) &&
                        minDist <= (t.toleranceMm ?? 40.4)) ||
                      (t.coordinateMetrics &&
                        t.coordinateMetrics.validSampleCount > 0 &&
                        t.coordinateMetrics.samplesInTargetZoneCount > 0)
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
                        }}
                      >
                        {/* Number only — no direction text labels */}
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: dirColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#FFFFFF",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            boxShadow: isReached
                              ? `0 0 0 3px ${dirColor}55, 0 1px 3px rgba(0,0,0,0.18)`
                              : "0 1px 3px rgba(0,0,0,0.18)",
                          }}
                        >
                          {t.stepNumber}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: axis + path visibility filters */}
              <div
                style={{
                  width: "168px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: "10px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    color: "var(--text-muted)",
                  }}
                >
                  <span>RIGHT →</span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-light)" }}>(+X)</span>
                </div>

                <div
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "12px",
                    padding: "10px 10px 8px",
                    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#0F766E",
                      marginBottom: "8px",
                    }}
                  >
                    Show paths
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {perTargetPaths.map((tp) => {
                      const checked = visiblePathSteps.has(tp.stepNumber);
                      const from = tp.stepNumber - 1;
                      const to = tp.stepNumber;
                      return (
                        <label
                          key={tp.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "5px 6px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            background: checked ? `${tp.color}12` : "transparent",
                            border: checked ? `1px solid ${tp.color}44` : "1px solid transparent",
                            userSelect: "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePathStep(tp.stepNumber)}
                            style={{
                              width: 14,
                              height: 14,
                              accentColor: tp.color,
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: tp.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                fontWeight: 800,
                                color: "#0F172A",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              }}
                            >
                              {from} → {to}
                            </span>
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.625rem",
                                fontWeight: 600,
                                color: "#64748B",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {tp.shortLabel}
                              {tp.transitSeconds !== null ? ` · ${tp.transitSeconds.toFixed(2)}s` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {perTargetPaths.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: "1px solid #F1F5F9",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setVisiblePathSteps(new Set(perTargetPaths.map((tp) => tp.stepNumber)))
                        }
                        style={{
                          flex: 1,
                          padding: "4px 6px",
                          fontSize: "0.625rem",
                          fontWeight: 800,
                          borderRadius: 6,
                          border: "1px solid #E2E8F0",
                          background: "#F8FAFC",
                          color: "#334155",
                          cursor: "pointer",
                        }}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisiblePathSteps(new Set())}
                        style={{
                          flex: 1,
                          padding: "4px 6px",
                          fontSize: "0.625rem",
                          fontWeight: 800,
                          borderRadius: 6,
                          border: "1px solid #E2E8F0",
                          background: "#F8FAFC",
                          color: "#334155",
                          cursor: "pointer",
                        }}
                      >
                        None
                      </button>
                    </div>
                  )}
                </div>
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

            {/* Colour Legend — unique RGB per target + solid/dotted meaning */}
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
              {(perTargetPaths.length > 0
                ? perTargetPaths.map((tp) => ({
                    step: tp.stepNumber,
                    label: `Target ${tp.stepNumber}: ${tp.shortLabel}`,
                    color: tp.color,
                  }))
                : PATH_STEP_COLORS.map((color, i) => ({
                    step: i + 1,
                    label: `Target ${i + 1}`,
                    color,
                  }))
              ).map(({ step, label, color }) => (
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
                <span style={{ width: "22px", height: "2.5px", background: "#334155", display: "inline-block", borderRadius: "2px" }} />
                <span style={{ fontWeight: 600 }}>Travel / outside</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    width: "22px",
                    height: 0,
                    borderTop: "2.5px dotted #334155",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontWeight: 600 }}>Inside target</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 900, color: "#334155" }}>▶</span>
                <span style={{ fontWeight: 600 }}>Path direction</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 4,
                    border: "1px solid #CBD5E1",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.625rem",
                    fontWeight: 800,
                    color: "#0F172A",
                  }}
                >
                  1.20 s
                </span>
                <span style={{ fontWeight: 600 }}>Leave→hit transit</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", border: "1.5px solid #0F766E", background: "#FFFFFF", display: "inline-block" }} />
                <span style={{ fontWeight: 600 }}>Start Point</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#475569", display: "inline-block" }} />
                <span style={{ fontWeight: 600 }}>Final Position</span>
              </div>
            </div>
          </div>

          {/* 3. PRIMARY OBJECTIVE COORDINATE METRICS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Mean Coordinate Error (d̄)
                <MetricInfoButton {...SESSION_METRIC_CARD_INFO.meanError} />
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

            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Coordinate Hit Rate
                <MetricInfoButton {...SESSION_METRIC_CARD_INFO.hitRate} />
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

            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Overall COP Path Length (L)
                <MetricInfoButton {...SESSION_METRIC_CARD_INFO.pathLength} />
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

            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Return-to-Center Error
                <MetricInfoButton {...SESSION_METRIC_CARD_INFO.returnCenter} />
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

            <div className="medical-card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Trajectory Variability (SD)
                <MetricInfoButton {...SESSION_METRIC_CARD_INFO.variability} />
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
                    <th style={{ padding: "12px 16px", borderTopLeftRadius: "6px", whiteSpace: "nowrap" }}>
                      Target Direction
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.direction} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Region Status
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.region} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Target Coord (mm)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.targetCoord} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Actual Centroid COP (mm)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.centroid} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Min Dist (d_min)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.minDist} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Mean Error (d̄)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.meanError} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Max Dist (d_max)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.maxDist} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Hit Rate %
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.hitRate} />
                    </th>
                    <th style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      Path Length (L)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.pathLength} />
                    </th>
                    <th style={{ padding: "12px 16px", borderTopRightRadius: "6px", whiteSpace: "nowrap" }}>
                      Protocol Hold (Secondary)
                      <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.protocolHold} align="right" />
                    </th>
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

          {/* Hold-window per-frame target errors (inside border only → hold complete) */}
          {sessionSummary?.holdWindowErrorSeries && sessionSummary.holdWindowErrorSeries.length > 0 && (
            <div
              className="medical-card"
              style={{
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#0F766E",
                  }}
                >
                  Per-frame target error during hold
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: 4, lineHeight: 1.45 }}>
                  Before the first border hit: not recorded. After first border hit: keeps recording even if
                  you leave and come back, until the continuous hold finishes — then stops until the next
                  target’s first border hit. Error per frame:{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: "#0F172A" }}>
                    e = √((x₁ − xₜ)² + (y₁ − yₜ)²)
                  </span>
                  {" "}
                  Graph X = ms since that target’s first border hit (same gate as coordinate store).
                  {sessionSummary.multimodalSyncEpochMs ? (
                    <>
                      {" "}
                      Session sync T0 ={" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "#0F766E", fontWeight: 700 }}>
                        {new Date(sessionSummary.multimodalSyncEpochMs).toLocaleTimeString()}
                      </span>{" "}
                      (board↔camera). Hold t is for the graph.
                    </>
                  ) : null}
                </div>
              </div>

              {sessionSummary.holdWindowErrorSeries.map((series) => (
                <div
                  key={series.targetId}
                  style={{
                    border: "1px solid #E2E8F0",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "#FFFFFF",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px 20px",
                      alignItems: "center",
                      padding: "12px 16px",
                      background: "#F0FDFA",
                      borderBottom: "1px solid #CCFBF1",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#0F172A" }}>
                      Target {series.stepNumber} · {series.shortLabel}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
                      {series.sampleCount} frames · hold {series.requiredHoldDurationSeconds}s
                      {series.finalHoldStartFrameIndex != null &&
                        series.finalHoldEndFrameIndex != null && (
                          <>
                            {" "}
                            · final hold frames {series.finalHoldStartFrameIndex}–
                            {series.finalHoldEndFrameIndex}
                          </>
                        )}
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "6px 10px",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        color: "#0F766E",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        mean {series.meanErrorMm?.toFixed(1) ?? "--"} mm
                        <MetricInfoButton
                          what="Average per-frame distance error (mm) during this target’s completed hold."
                          meaning="Typical miss from the target center across all recorded hold frames. Lower is better."
                          how="mean = (1/N) × Σ e_mm(i) over all frames from first border hit through leave/re-enter until hold complete."
                        />
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        RMS {series.rmsErrorMm?.toFixed(1) ?? "--"} mm
                        <MetricInfoButton
                          what="Root-mean-square of per-frame distance errors (mm)."
                          meaning="Overall miss that weights larger spikes more heavily than the plain average. Usually ≥ mean."
                          how="RMS = √((1/N) × Σ e_mm(i)²) over the same first-hit→completion frame window."
                        />
                      </span>
                      <span>
                        min {series.minErrorMm?.toFixed(1) ?? "--"} · max{" "}
                        {series.maxErrorMm?.toFixed(1) ?? "--"}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: "0 12px 8px" }}>
                    <HoldWindowMovementGraph series={series} />
                  </div>

                  <div style={{ maxHeight: 260, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC", color: "#475569", position: "sticky", top: 0, zIndex: 2 }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Frame
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.frame} />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Target (x₁,y₁)
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.target} />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            COP (xₜ,yₜ)
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.cop} />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Error mm
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.errorMm} />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Error norm
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.errorNorm} />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Pose
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.pose} align="right" />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Hold t (ms)
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.holdRel} align="right" />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Board t (ms)
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.boardRel} align="right" />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Cam t (ms)
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.visionRel} align="right" />
                          </th>
                          <th style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                            Skew ms
                            <MetricInfoButton {...HOLD_FRAME_COLUMN_INFO.skew} align="right" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {series.samples.map((s) => {
                          const inFinalHold =
                            series.finalHoldStartFrameIndex != null &&
                            series.finalHoldEndFrameIndex != null &&
                            s.frameIndex >= series.finalHoldStartFrameIndex &&
                            s.frameIndex <= series.finalHoldEndFrameIndex;
                          return (
                          <tr
                            key={`${series.targetId}-${s.frameIndex}`}
                            style={{
                              borderTop: "1px solid #F1F5F9",
                              background: inFinalHold ? "rgba(16, 185, 129, 0.12)" : undefined,
                            }}
                          >
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)" }}>
                              {s.frameIndex}
                              {inFinalHold ? (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    fontSize: "0.5625rem",
                                    fontWeight: 800,
                                    color: "#059669",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  hold
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "#64748B" }}>
                              ({s.targetX.toFixed(3)}, {s.targetY.toFixed(3)})
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                              ({s.copX.toFixed(3)}, {s.copY.toFixed(3)})
                            </td>
                            <td
                              style={{
                                padding: "7px 10px",
                                fontFamily: "var(--font-mono)",
                                fontWeight: 800,
                                color: "#0F766E",
                              }}
                            >
                              {s.errorMm.toFixed(2)}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "#64748B" }}>
                              {s.errorNorm.toFixed(4)}
                            </td>
                            <td style={{ padding: "7px 10px", color: s.hasPose ? "#059669" : "#D97706" }}>
                              {s.hasPose ? "yes" : "no"}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#0F766E" }}>
                              {s.holdRelMs !== null && s.holdRelMs !== undefined ? s.holdRelMs : "--"}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "#64748B" }}>
                              {s.boardRelMs !== null && s.boardRelMs !== undefined ? s.boardRelMs : "--"}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "#64748B" }}>
                              {s.visionRelMs !== null && s.visionRelMs !== undefined ? s.visionRelMs : "--"}
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", color: "#94A3B8" }}>
                              {s.timeSkewMs !== null ? s.timeSkewMs : "--"}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

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
                <span>{isExportingPdf ? "Generating PDF..." : "Download Full Report (Board + Angles)"}</span>
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
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Direction
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.direction} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Region Status
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.region} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Target (X, Y) mm
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.targetCoord} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Centroid (X, Y) mm
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.centroid} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Min Dist (mm)
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.minDist} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Mean Error (mm)
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.meanError} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Max Dist (mm)
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.maxDist} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Hit Rate %
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.hitRate} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Path Length (mm)
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.pathLength} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          Protocol Hold
                          <MetricInfoButton {...COORD_TABLE_COLUMN_INFO.protocolHold} />
                        </th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Time In / Out</th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Attempts</th>
                        <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Missing Data</th>
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

