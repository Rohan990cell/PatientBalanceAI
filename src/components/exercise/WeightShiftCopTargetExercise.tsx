import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Clock,
  Compass,
  Award,
  Sliders,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { useBalanceBoard } from "../../context/HardwareContext";
import { mapCopToBoard } from "../../utils/copMapping";
import {
  CopTarget,
  generateSafeTargets,
  calculateCopDistance,
  getDirectionGuidance,
  getCurrentCopDirectionText,
  evaluateDataSourceStatus,
  calculateCopExerciseResult,
  CopExerciseSessionSample,
  CopExerciseResult,
  SAFE_BOARD_BOUNDS,
} from "../../utils/copTargetExercise";
import { PatientProfile } from "../../types/patient";

interface WeightShiftCopTargetExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
}

type ExercisePhase = "INTRO" | "ACTIVE" | "COMPLETED";

export const WeightShiftCopTargetExercise: React.FC<WeightShiftCopTargetExerciseProps> = ({
  patient,
  onExit,
}) => {
  const {
    status: hardwareStatus,
    reading: hardwareReading,
    isSimulated,
    setIsSimulated,
    simCopX,
    setSimCopX,
    simCopY,
    setSimCopY,
  } = useBalanceBoard();

  // Targets generated adhering to conservative safe boundaries
  const targets = useMemo(() => generateSafeTargets(), []);

  // Exercise Phase State
  const [phase, setPhase] = useState<ExercisePhase>("INTRO");
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [targetReachedTimestamp, setTargetReachedTimestamp] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0); // 0 to 100%
  const [dwellSuccess, setDwellSuccess] = useState(false);

  // Timing
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Telemetry buffer & metrics
  const sessionSamplesRef = useRef<CopExerciseSessionSample[]>([]);
  const distanceSamplesRef = useRef<number[]>([]);
  const [exerciseResult, setExerciseResult] = useState<CopExerciseResult | null>(null);

  // Current Target
  const currentTarget: CopTarget | undefined = targets[currentTargetIndex];

  // Evaluate Data Source Status adhering to strict precedence:
  // LIVE HARDWARE > SIMULATION > UNAVAILABLE
  const dataSourceStatus = useMemo(
    () => evaluateDataSourceStatus(hardwareStatus.isConnected, isSimulated),
    [hardwareStatus.isConnected, isSimulated]
  );

  // Extract raw COP telemetry from existing context without modifying formulas
  const liveCopX = hardwareReading ? hardwareReading.copX : null;
  const liveCopY = hardwareReading ? hardwareReading.copY : null;
  const liveWeight = hardwareReading ? hardwareReading.totalWeight : null;

  // Real-time distance and direction calculations
  const distance = useMemo(() => {
    if (!currentTarget || liveCopX === null || liveCopY === null) return null;
    return calculateCopDistance(liveCopX, liveCopY, currentTarget.x, currentTarget.y);
  }, [currentTarget, liveCopX, liveCopY]);

  const guidance = useMemo(() => {
    if (!currentTarget) {
      return {
        primaryInstruction: "Stand on the board",
        dx: 0,
        dy: 0,
        distance: null,
        isInTolerance: false,
      };
    }
    return getDirectionGuidance(liveCopX, liveCopY, currentTarget);
  }, [currentTarget, liveCopX, liveCopY]);

  const currentCopDir = useMemo(
    () => getCurrentCopDirectionText(liveCopX, liveCopY),
    [liveCopX, liveCopY]
  );

  // Visual board coordinate mapping for COP ball
  const visualCop = useMemo(() => {
    if (liveCopX === null || liveCopY === null) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    return mapCopToBoard(liveCopX, liveCopY);
  }, [liveCopX, liveCopY]);

  // Visual board coordinate mapping for Target
  const visualTarget = useMemo(() => {
    if (!currentTarget) return { xPercent: 50.0, yPercent: 50.0 };
    return mapCopToBoard(currentTarget.x, currentTarget.y);
  }, [currentTarget]);

  // Safe boundary rectangle visual coordinates
  const safeBoundsVisual = useMemo(() => {
    const topLeft = mapCopToBoard(SAFE_BOARD_BOUNDS.minX, SAFE_BOARD_BOUNDS.maxY);
    const bottomRight = mapCopToBoard(SAFE_BOARD_BOUNDS.maxX, SAFE_BOARD_BOUNDS.minY);
    return {
      left: `${topLeft.xPercent}%`,
      top: `${topLeft.yPercent}%`,
      width: `${bottomRight.xPercent - topLeft.xPercent}%`,
      height: `${bottomRight.yPercent - topLeft.yPercent}%`,
    };
  }, []);

  // Timer runner for ACTIVE phase
  useEffect(() => {
    if (phase !== "ACTIVE") {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    startTimeRef.current = performance.now() - elapsedMs;

    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMs(performance.now() - startTimeRef.current);
      }
    }, 50);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [phase]);

  // Record Telemetry Samples during ACTIVE phase
  useEffect(() => {
    if (phase !== "ACTIVE" || !currentTarget) return;

    if (distance !== null) {
      distanceSamplesRef.current.push(distance);
    }

    const sample: CopExerciseSessionSample = {
      timestamp: performance.now(),
      copX: liveCopX,
      copY: liveCopY,
      targetX: currentTarget.x,
      targetY: currentTarget.y,
      targetReached: guidance.isInTolerance,
      dataSource: hardwareStatus.isConnected
        ? "wii_balance_board"
        : isSimulated
        ? "simulation"
        : "unavailable",
    };

    sessionSamplesRef.current.push(sample);
  }, [phase, currentTarget, liveCopX, liveCopY, distance, guidance.isInTolerance, hardwareStatus.isConnected, isSimulated]);

  // Target Dwell & Progression Logic (700ms steady dwell confirmation)
  useEffect(() => {
    if (phase !== "ACTIVE" || !currentTarget) return;

    if (guidance.isInTolerance) {
      if (targetReachedTimestamp === null) {
        setTargetReachedTimestamp(performance.now());
      } else {
        const dwellTime = performance.now() - targetReachedTimestamp;
        const progress = Math.min(100, (dwellTime / 700) * 100);
        setDwellProgress(progress);

        if (dwellTime >= 700 && !dwellSuccess) {
          setDwellSuccess(true);

          // Advance to next target after brief celebration
          const timeout = setTimeout(() => {
            if (currentTargetIndex + 1 < targets.length) {
              setCurrentTargetIndex((prev) => prev + 1);
              setTargetReachedTimestamp(null);
              setDwellProgress(0);
              setDwellSuccess(false);
            } else {
              // Final target reached -> COMPLETE
              handleCompleteExercise();
            }
          }, 450);

          return () => clearTimeout(timeout);
        }
      }
    } else {
      // Slipped out of tolerance zone: reset dwell progress
      setTargetReachedTimestamp(null);
      setDwellProgress(0);
      setDwellSuccess(false);
    }
  }, [phase, guidance.isInTolerance, targetReachedTimestamp, dwellSuccess, currentTargetIndex, targets.length]);

  // Start Exercise Handler
  const handleStartExercise = useCallback(() => {
    setPhase("ACTIVE");
    setCurrentTargetIndex(0);
    setElapsedMs(0);
    setTargetReachedTimestamp(null);
    setDwellProgress(0);
    setDwellSuccess(false);
    sessionSamplesRef.current = [];
    distanceSamplesRef.current = [];
    setExerciseResult(null);
  }, []);

  // Complete Exercise Handler
  const handleCompleteExercise = useCallback(() => {
    setPhase("COMPLETED");

    const finalResult = calculateCopExerciseResult({
      completedTargets: targets.length,
      totalTargets: targets.length,
      durationMs: elapsedMs,
      distanceSamples: distanceSamplesRef.current,
      dataSourceMode: dataSourceStatus.mode,
      samplesCount: sessionSamplesRef.current.length,
    });

    setExerciseResult(finalResult);
  }, [targets.length, elapsedMs, dataSourceStatus.mode]);

  // Format mm:ss.d
  const formatTimer = (ms: number): string => {
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const tenths = Math.floor((totalSec % 1) * 10);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${tenths}`;
  };

  // Quick preset helper for Development Simulation testing
  const applySimPreset = (x: number, y: number) => {
    if (!hardwareStatus.isConnected) {
      if (!isSimulated) {
        setIsSimulated(true);
      }
      setSimCopX(x);
      setSimCopY(y);
    }
  };

  // =========================================================================
  // VIEW 1: EXERCISE INTRODUCTION (Camera = OFF, Board Only)
  // =========================================================================
  if (phase === "INTRO") {
    return (
      <div
        style={{
          maxWidth: "880px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "12px 0 40px 0",
        }}
      >
        {/* Top Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {onExit && (
            <button
              onClick={onExit}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "0.875rem",
              }}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          )}

          {/* Mode & Hardware Status Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {patient && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  background: "#F1F5F9",
                  padding: "5px 12px",
                  borderRadius: "16px",
                  border: "1px solid var(--border-light)",
                }}
              >
                Patient: {patient.fullName}
              </span>
            )}
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--teal-primary)",
                background: "var(--bg-subtle-mint)",
                padding: "5px 12px",
                borderRadius: "16px",
                border: "1px solid var(--border-mint)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Activity size={13} />
              <span>BALANCE BOARD ONLY (Camera NOT Required)</span>
            </span>
          </div>
        </div>

        {/* Data Source Banner */}
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            background: hardwareStatus.isConnected
              ? "var(--bg-subtle-mint)"
              : isSimulated
              ? "#FFFBEB"
              : "#F8FAFC",
            border: `1px solid ${
              hardwareStatus.isConnected
                ? "var(--border-mint)"
                : isSimulated
                ? "#FDE68A"
                : "#E2E8F0"
            }`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {hardwareStatus.isConnected ? (
              <CheckCircle2 size={18} color="var(--green-primary)" />
            ) : isSimulated ? (
              <AlertTriangle size={18} color="#D97706" />
            ) : (
              <Scale size={18} color="var(--text-muted)" />
            )}
            <div>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  color: hardwareStatus.isConnected
                    ? "var(--green-primary)"
                    : isSimulated
                    ? "#92400E"
                    : "var(--text-muted)",
                }}
              >
                {dataSourceStatus.badgeLabel}
              </span>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {hardwareStatus.isConnected
                  ? "Live Wii telemetry stream active. Real sensor data will drive the exercise."
                  : isSimulated
                  ? "Development simulation active for automated algorithm testing prior to physical hardware session."
                  : "Connect physical Wii Balance Board or toggle Development Simulation below."}
              </div>
            </div>
          </div>

          {/* Simulation Toggle if real hardware not connected */}
          {!hardwareStatus.isConnected && (
            <button
              onClick={() => setIsSimulated(!isSimulated)}
              className={isSimulated ? "btn-secondary" : "btn-ghost"}
              style={{
                fontSize: "0.75rem",
                padding: "6px 12px",
                borderRadius: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 600,
              }}
            >
              <Sliders size={13} />
              <span>Simulation: {isSimulated ? "ON" : "OFF"}</span>
            </button>
          )}
        </div>

        {/* Main Introduction Card */}
        <div className="medical-card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--teal-primary)",
              }}
            >
              Rehabilitation Exercise &bull; Interactive Target Tracking
            </span>
          </div>

          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: "0 0 10px 0",
              letterSpacing: "-0.01em",
            }}
          >
            Weight Shift — COP Target
          </h1>

          <div
            style={{
              padding: "16px 20px",
              background: "#F8FAFC",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                fontSize: "1.0625rem",
                fontWeight: 700,
                color: "var(--teal-primary)",
                marginBottom: "4px",
              }}
            >
              Instruction:
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-main)", fontWeight: 500 }}>
              &ldquo;Shift your body weight to move the COP toward the target.&rdquo;
            </div>
          </div>

          {/* Exercise Safety Notice */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "10px",
              background: "#F0FDFA",
              border: "1px solid var(--border-teal, #99F6E4)",
              marginBottom: "24px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <ShieldCheck size={20} color="var(--teal-primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--teal-primary)" }}>
                Safety & Conservative Target Boundaries
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "3px", lineHeight: 1.45 }}>
                Targets remain strictly within safe inner board boundaries (maximum ±40% displacement) to prevent extreme leaning or risk of tipping.
                <br />
                <em>Development exercise — clinical validation pending.</em>
              </div>
            </div>
          </div>

          {/* Target Sequence Preview (5 targets) */}
          <div style={{ marginBottom: "28px" }}>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "10px",
              }}
            >
              Target Progression (5 Stages)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
              }}
            >
              {targets.map((t, idx) => (
                <div
                  key={t.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "#FFFFFF",
                    border: "1px solid var(--border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    Target {idx + 1}
                  </div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--teal-primary)", fontFamily: "var(--font-mono)" }}>
                    ({t.x > 0 ? `+${t.x}` : t.x}, {t.y > 0 ? `+${t.y}` : t.y})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Start Exercise Button */}
          <button
            onClick={handleStartExercise}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "1.0625rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              borderRadius: "14px",
              boxShadow: "0 4px 12px rgba(13, 148, 136, 0.25)",
              cursor: "pointer",
            }}
          >
            <Play size={20} fill="#FFFFFF" />
            <span>START EXERCISE</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVE EXERCISE (Target Matching & Real-Time Biofeedback)
  // =========================================================================
  if (phase === "ACTIVE" && currentTarget) {
    return (
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "10px 0 36px 0",
        }}
      >
        {/* Header Bar */}
        <div
          className="medical-card"
          style={{
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                letterSpacing: "0.05em",
              }}
            >
              Weight Shift — COP Target &bull; Stage {currentTargetIndex + 1} of {targets.length}
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", margin: "2px 0 0 0" }}>
              Target: {currentTarget.name} ({currentTarget.label})
            </h2>
          </div>

          {/* Live Timer & Target Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Data Source Badge */}
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: hardwareStatus.isConnected ? "var(--green-primary)" : "#92400E",
                background: hardwareStatus.isConnected ? "var(--bg-subtle-mint)" : "#FEF3C7",
                padding: "4px 10px",
                borderRadius: "10px",
                border: `1px solid ${hardwareStatus.isConnected ? "var(--border-mint)" : "#FDE68A"}`,
              }}
            >
              {dataSourceStatus.badgeLabel}
            </span>

            {/* Timer */}
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
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-main)",
                }}
              >
                {formatTimer(elapsedMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Live Telemetry Status Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "12px",
          }}
        >
          {/* 1. Progress */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Progress
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
              Target {currentTargetIndex + 1} / {targets.length}
            </div>
          </div>

          {/* 2. Current COP */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Current COP
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
              {liveCopX !== null && liveCopY !== null
                ? `X: ${liveCopX >= 0 ? `+${liveCopX.toFixed(2)}` : liveCopX.toFixed(2)} | Y: ${liveCopY >= 0 ? `+${liveCopY.toFixed(2)}` : liveCopY.toFixed(2)}`
                : "--"}
            </div>
          </div>

          {/* 3. Target COP */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Target COP
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
              X: {currentTarget.x >= 0 ? `+${currentTarget.x.toFixed(2)}` : currentTarget.x.toFixed(2)} | Y: {currentTarget.y >= 0 ? `+${currentTarget.y.toFixed(2)}` : currentTarget.y.toFixed(2)}
            </div>
          </div>

          {/* 4. Distance to Target */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Distance to Target
            </div>
            <div
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: guidance.isInTolerance ? "var(--green-primary)" : "var(--text-main)",
                marginTop: "2px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {distance !== null ? distance.toFixed(3) : "--"}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "4px" }}>
                (tol: ±{currentTarget.tolerance})
              </span>
            </div>
          </div>

          {/* 5. Current Direction */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Current Direction
            </div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--text-secondary)", marginTop: "2px" }}>
              {currentCopDir}
            </div>
          </div>

          {/* 6. Balance Status */}
          <div className="medical-card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Balance Status
            </div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 800,
                color: guidance.isInTolerance ? "var(--green-primary)" : "var(--text-main)",
                marginTop: "2px",
              }}
            >
              {liveWeight !== null
                ? guidance.isInTolerance
                  ? "Target Reached ✓"
                  : `Weight: ${liveWeight.toFixed(1)} kg`
                : "--"}
            </div>
          </div>
        </div>

        {/* Real-time Guidance Banner */}
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "12px",
            background: guidance.isInTolerance
              ? "linear-gradient(90deg, #ECFDF5 0%, #D1FAE5 100%)"
              : "#F8FAFC",
            border: `2px solid ${guidance.isInTolerance ? "var(--green-primary)" : "var(--border-light)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: guidance.isInTolerance ? "var(--green-primary)" : "var(--teal-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {guidance.isInTolerance ? "✓" : <Compass size={20} />}
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 800,
                  color: guidance.isInTolerance ? "var(--green-primary)" : "var(--text-main)",
                }}
              >
                {guidance.primaryInstruction}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {currentTarget.instruction}
              </div>
            </div>
          </div>

          {/* Dwell Progress Indicator when in tolerance */}
          {guidance.isInTolerance && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--green-primary)" }}>
                  {dwellSuccess ? "Completed!" : "Holding..."}
                </span>
                <div style={{ width: "120px", height: "8px", background: "#E2E8F0", borderRadius: "4px", overflow: "hidden", marginTop: "4px" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${dwellProgress}%`,
                      background: "var(--green-primary)",
                      transition: "width 0.05s linear",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Visual Balance Board Force Plate */}
        <div
          className="medical-card"
          style={{
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            overflow: "hidden",
          }}
        >
          {/* Top Axis Label: FRONT / ANTERIOR (+Y) */}
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

          {/* Middle Row: LEFT (-X) | FORCE PLATE | RIGHT (+X) */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", maxWidth: "680px", gap: "12px" }}>
            {/* Left Label */}
            <div
              style={{
                width: "48px",
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

            {/* Visual Wii Balance Board Chassis */}
            <div
              style={{
                flex: 1,
                aspectRatio: "446 / 238",
                position: "relative",
                background: "#FFFFFF",
                borderRadius: "28px",
                border: "2px solid #CBD5E1",
                boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08), inset 0 2px 4px rgba(255, 255, 255, 0.8)",
                padding: "16px",
                overflow: "hidden",
              }}
            >
              {/* Inner Surface Perimeter */}
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

                {/* Conservative Safe Boundary Box (Indicator) */}
                <div
                  style={{
                    position: "absolute",
                    left: safeBoundsVisual.left,
                    top: safeBoundsVisual.top,
                    width: safeBoundsVisual.width,
                    height: safeBoundsVisual.height,
                    border: "1px dotted rgba(13, 148, 136, 0.25)",
                    borderRadius: "12px",
                    pointerEvents: "none",
                  }}
                  title="Conservative Safe Target Boundaries"
                />

                {/* TARGET INDICATOR WITH TOLERANCE ZONE */}
                <div
                  style={{
                    position: "absolute",
                    left: `${visualTarget.xPercent}%`,
                    top: `${visualTarget.yPercent}%`,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    zIndex: 4,
                  }}
                >
                  {/* Tolerance Radius Ring */}
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      border: guidance.isInTolerance
                        ? "2px solid var(--green-primary)"
                        : "2px dashed var(--teal-primary)",
                      background: guidance.isInTolerance
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(13, 148, 136, 0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: "translate(-50%, -50%)",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      transition: "all 0.2s ease",
                    }}
                  />

                  {/* Target Bullseye Center */}
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: guidance.isInTolerance ? "var(--green-primary)" : "var(--teal-primary)",
                      border: "3px solid #FFFFFF",
                      boxShadow: "0 0 10px rgba(13, 148, 136, 0.5)",
                      transform: "translate(-50%, -50%)",
                      position: "absolute",
                      top: 0,
                      left: 0,
                    }}
                  />

                  {/* Target Label Tag */}
                  <div
                    style={{
                      position: "absolute",
                      top: "22px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(15, 23, 42, 0.8)",
                      color: "#FFFFFF",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "0.625rem",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    TARGET: {currentTarget.name}
                  </div>
                </div>

                {/* CURRENT LIVE COP BALL */}
                {liveCopX !== null && liveCopY !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${visualCop.xPercent}%`,
                      top: `${visualCop.yPercent}%`,
                      transform: "translate(-50%, -50%)",
                      zIndex: 6,
                      pointerEvents: "none",
                      transition: "left 0.08s ease-out, top 0.08s ease-out",
                    }}
                  >
                    {/* Outer Glow Ring */}
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        background: isSimulated
                          ? "rgba(245, 158, 11, 0.25)"
                          : "rgba(13, 148, 136, 0.25)",
                        transform: "translate(-50%, -50%)",
                      }}
                    />

                    {/* Core Solid COP Ball */}
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: isSimulated ? "#F59E0B" : "var(--teal-primary)",
                        border: "3px solid #FFFFFF",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      }}
                    />

                    {/* Small COP Label */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "24px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: isSimulated ? "#B45309" : "var(--teal-primary)",
                        color: "#FFFFFF",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "0.5625rem",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      COP
                    </div>
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
                fontSize: "0.6875rem",
                fontWeight: 800,
                color: "var(--text-muted)",
              }}
            >
              <span>RIGHT →</span>
              <span style={{ fontSize: "0.625rem", color: "var(--text-light)" }}>(+X)</span>
            </div>
          </div>

          {/* Bottom Axis Label: BACK / POSTERIOR (-Y) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginTop: "8px",
            }}
          >
            <span>↓</span>
            <span>BACK / POSTERIOR (-Y)</span>
          </div>
        </div>

        {/* Development Simulation Controls (Active ONLY when simulation is enabled and hardware is disconnected) */}
        {!hardwareStatus.isConnected && isSimulated && (
          <div
            className="medical-card"
            style={{
              padding: "16px 20px",
              background: "#FFFBEB",
              borderColor: "#FDE68A",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sliders size={16} color="#D97706" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "#92400E" }}>
                  DEVELOPMENT SIMULATION CONTROLS — Shift COP
                </span>
              </div>
              <span style={{ fontSize: "0.6875rem", color: "#B45309" }}>
                Move sliders or click presets to test target hitting logic
              </span>
            </div>

            {/* Sliders */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700, color: "#92400E", marginBottom: "4px" }}>
                  <span>COP X (Left -1.0 to Right +1.0)</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{simCopX.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.05"
                  value={simCopX}
                  onChange={(e) => setSimCopX(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#D97706" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700, color: "#92400E", marginBottom: "4px" }}>
                  <span>COP Y (Back -1.0 to Front +1.0)</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{simCopY.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-1.0"
                  max="1.0"
                  step="0.05"
                  value={simCopY}
                  onChange={(e) => setSimCopY(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#D97706" }}
                />
              </div>
            </div>

            {/* Quick Presets for Demo */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#92400E" }}>Target Presets:</span>
              <button
                onClick={() => applySimPreset(0.0, 0.0)}
                className="btn-ghost"
                style={{ fontSize: "0.6875rem", padding: "4px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
              >
                1. Center (0, 0)
              </button>
              <button
                onClick={() => applySimPreset(-0.40, 0.0)}
                className="btn-ghost"
                style={{ fontSize: "0.6875rem", padding: "4px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
              >
                2. Left (-0.4, 0)
              </button>
              <button
                onClick={() => applySimPreset(0.40, 0.0)}
                className="btn-ghost"
                style={{ fontSize: "0.6875rem", padding: "4px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
              >
                3. Right (+0.4, 0)
              </button>
              <button
                onClick={() => applySimPreset(0.0, 0.35)}
                className="btn-ghost"
                style={{ fontSize: "0.6875rem", padding: "4px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
              >
                4. Front (0, +0.35)
              </button>
              <button
                onClick={() => applySimPreset(0.0, -0.35)}
                className="btn-ghost"
                style={{ fontSize: "0.6875rem", padding: "4px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
              >
                5. Back (0, -0.35)
              </button>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => setPhase("INTRO")}
            className="btn-ghost"
            style={{ fontSize: "0.875rem", padding: "8px 16px" }}
          >
            <span>Exit Exercise</span>
          </button>

          <button
            onClick={handleStartExercise}
            className="btn-ghost"
            style={{ fontSize: "0.875rem", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RotateCcw size={15} />
            <span>Restart Exercise</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: EXERCISE COMPLETE SCREEN
  // =========================================================================
  if (phase === "COMPLETED" && exerciseResult) {
    return (
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          padding: "16px 0 40px 0",
        }}
      >
        {/* Top Trophy Card */}
        <div
          className="medical-card"
          style={{
            padding: "36px 32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "var(--bg-subtle-mint)",
              color: "var(--teal-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "2px",
            }}
          >
            <Award size={38} />
          </div>

          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
            Exercise Complete ✓
          </h1>

          <div
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              maxWidth: "520px",
            }}
          >
            Great job! You successfully completed all 5 Center of Pressure target positions.
          </div>

          {/* Data Source Banner */}
          <div
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              background: exerciseResult.isSimulated ? "#FFFBEB" : "var(--bg-subtle-mint)",
              border: `1px solid ${exerciseResult.isSimulated ? "#FDE68A" : "var(--border-mint)"}`,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: exerciseResult.isSimulated ? "#92400E" : "var(--teal-primary)",
              fontSize: "0.8125rem",
              fontWeight: 800,
              marginTop: "6px",
            }}
          >
            {exerciseResult.isSimulated ? (
              <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={16} color="var(--green-primary)" style={{ flexShrink: 0 }} />
            )}
            <span>
              {exerciseResult.isSimulated
                ? "DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA"
                : "Data Source: LIVE WII BALANCE BOARD"}
            </span>
          </div>

          {/* Clinical Validation Pending Notice */}
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: "2px" }}>
            {exerciseResult.validationNotice}
          </div>
        </div>

        {/* Metric Summary Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {/* Targets Completed */}
          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Targets Completed
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {exerciseResult.targetsCompleted} / {exerciseResult.totalTargets}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--green-primary)", marginTop: "4px", fontWeight: 700 }}>
              ✓ All Targets Reached
            </div>
          </div>

          {/* Completion Percentage */}
          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Completion Percentage
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px" }}>
              {exerciseResult.completionPercentage}%
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Full Protocol Executed
            </div>
          </div>

          {/* Duration */}
          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Duration
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {exerciseResult.durationSeconds}s
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Total elapsed exercise time
            </div>
          </div>

          {/* Average Distance */}
          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Average Distance from Target
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {exerciseResult.averageDistanceFromTarget !== null
                ? exerciseResult.averageDistanceFromTarget.toFixed(3)
                : "--"}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Normalized offset excursion
            </div>
          </div>
        </div>

        {/* Clinical Balance Score Guard Callout (STRICT REQUIREMENT) */}
        <div
          style={{
            padding: "16px 20px",
            background: "#F8FAFC",
            borderRadius: "12px",
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <Scale size={20} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
              Clinical Balance Score: -- (Omitted)
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.45 }}>
              {exerciseResult.isSimulated
                ? "No clinical balance score is generated from development simulation. Real physical load-cell sensors will measure diagnostic metrics during real hardware operation."
                : "Clinical balance score calculation pending formal medical validation protocol."}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={handleStartExercise}
            className="btn-primary"
            style={{
              padding: "12px 28px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9375rem",
              fontWeight: 700,
            }}
          >
            <RotateCcw size={16} />
            <span>Restart Exercise</span>
          </button>

          <button
            onClick={() => setPhase("INTRO")}
            className="btn-secondary"
            style={{
              padding: "12px 28px",
              fontSize: "0.9375rem",
              fontWeight: 700,
            }}
          >
            <span>Return to Overview</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
