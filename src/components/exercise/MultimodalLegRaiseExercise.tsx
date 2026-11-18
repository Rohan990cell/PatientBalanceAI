/**
 * MultimodalLegRaiseExercise.tsx
 *
 * PHASE E: Multimodal Leg Raise & Balance Rehabilitation Exercise
 * 
 * Synchronizes Camera / MediaPipe Pose 2D skeleton tracking with
 * Nintendo Wii Balance Board 4-sensor load telemetry and COP trajectory.
 * 
 * Enforces strict dual-device confirmation:
 * - Camera confirms anatomical foot clearance.
 * - Balance Board confirms contralateral support-side load transfer.
 * - Both devices must confirm before a repetition can be completed.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Scale,
  Camera,
  CameraOff,
  Activity,
  ShieldCheck,
  Download,
  Sliders,
  Eye,
} from "lucide-react";
import { useBalanceBoard } from "../../context/HardwareContext";
import { useVision } from "../../context/VisionContext";
import { mapCopToBoard } from "../../utils/copMapping";
import {
  MultimodalLegRaiseEngine,
  calculateBoardDistribution,
  extractCameraLegObservation,
  LegRaiseSessionSummary,
  POSE_LANDMARK_INDICES,
  MultimodalLegRaiseState,
} from "../../utils/multimodalLegRaiseExercise";
import { PatientProfile } from "../../types/patient";
import { RehabilitationScene } from "../avatar/RehabilitationScene";
import { AvatarController } from "../avatar/AvatarController";
import { PdfReportService } from "../../services/pdfReportService";
import { SessionStorageService } from "../../services/sessionStorage";

interface MultimodalLegRaiseExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
}

type UiPhase = "INTRO" | "ACTIVE" | "COMPLETED";

// Skeleton 2D Connection Bones for Canvas Drawing Overlay
const SKELETON_BONES: Array<[number, number]> = [
  // Torso
  [POSE_LANDMARK_INDICES.LEFT_SHOULDER, POSE_LANDMARK_INDICES.RIGHT_SHOULDER],
  [POSE_LANDMARK_INDICES.LEFT_SHOULDER, POSE_LANDMARK_INDICES.LEFT_HIP],
  [POSE_LANDMARK_INDICES.RIGHT_SHOULDER, POSE_LANDMARK_INDICES.RIGHT_HIP],
  [POSE_LANDMARK_INDICES.LEFT_HIP, POSE_LANDMARK_INDICES.RIGHT_HIP],
  // Left Lower Limb
  [POSE_LANDMARK_INDICES.LEFT_HIP, POSE_LANDMARK_INDICES.LEFT_KNEE],
  [POSE_LANDMARK_INDICES.LEFT_KNEE, POSE_LANDMARK_INDICES.LEFT_ANKLE],
  [POSE_LANDMARK_INDICES.LEFT_ANKLE, POSE_LANDMARK_INDICES.LEFT_HEEL],
  [POSE_LANDMARK_INDICES.LEFT_ANKLE, POSE_LANDMARK_INDICES.LEFT_FOOT_INDEX],
  // Right Lower Limb
  [POSE_LANDMARK_INDICES.RIGHT_HIP, POSE_LANDMARK_INDICES.RIGHT_KNEE],
  [POSE_LANDMARK_INDICES.RIGHT_KNEE, POSE_LANDMARK_INDICES.RIGHT_ANKLE],
  [POSE_LANDMARK_INDICES.RIGHT_ANKLE, POSE_LANDMARK_INDICES.RIGHT_HEEL],
  [POSE_LANDMARK_INDICES.RIGHT_ANKLE, POSE_LANDMARK_INDICES.RIGHT_FOOT_INDEX],
];

export const MultimodalLegRaiseExercise: React.FC<MultimodalLegRaiseExerciseProps> = ({
  patient,
  onExit,
}) => {
  const {
    status: hardwareStatus,
    reading: hardwareReading,
    isSimulated,
    setIsSimulated,
    setSimCopX,
    setSimCopY,
  } = useBalanceBoard();

  const {
    visionState,
    isCameraActive,
    startCamera,
    getMediaStream,
    isMirrored,
  } = useVision();

  // Exercise Phase State
  const [uiPhase, setUiPhase] = useState<UiPhase>("INTRO");
  const [engineState, setEngineState] = useState<MultimodalLegRaiseState>("IDLE");
  const [instructionText, setInstructionText] = useState<string>("PREPARING EXERCISE");
  const [feedbackText, setFeedbackText] = useState<string>("Stand comfortably on the balance board...");
  const [holdSeconds, setHoldSeconds] = useState<number>(0);
  const [targetHoldSeconds, setTargetHoldSeconds] = useState<number>(2.0);
  const [isDualVerified, setIsDualVerified] = useState<boolean>(false);

  // Clinician Configurable Durations
  const [leftTargetSec, setLeftTargetSec] = useState<number>(2.0);
  const [rightTargetSec, setRightTargetSec] = useState<number>(2.0);
  const [supportedStandingMode, setSupportedStandingMode] = useState<boolean>(false);

  // Trajectory Display Filter on Result Screen
  const [trajectoryFilter, setTrajectoryFilter] = useState<"ALL" | "LEFT" | "RIGHT">("ALL");

  // PDF Export States
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfResult, setPdfResult] = useState<{ filename: string; filePath: string } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Engine instance & session summary
  const engineRef = useRef<MultimodalLegRaiseEngine | null>(null);
  const [sessionSummary, setSessionSummary] = useState<LegRaiseSessionSummary | null>(null);

  // DOM Refs for Video and Canvas
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize or reconfigure engine
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new MultimodalLegRaiseEngine({
        holdDurationSecondsLeft: leftTargetSec,
        holdDurationSecondsRight: rightTargetSec,
        supportedStandingMode,
      });
    }
    return engineRef.current;
  }, [leftTargetSec, rightTargetSec, supportedStandingMode]);

  // Connect video stream to video element
  useEffect(() => {
    if (uiPhase === "INTRO" || !isCameraActive) return;

    const stream = getMediaStream();
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn("[MultimodalLegRaise] videoElement.play() warning:", err);
      });
    }
  }, [uiPhase, isCameraActive, getMediaStream]);

  // =========================================================================
  // 2D SKELETON CANVAS OVERLAY RENDER LOOP
  // =========================================================================
  useEffect(() => {
    if (uiPhase !== "ACTIVE") {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderSkeleton = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = visionState.pose?.allRawLandmarks;
      if (landmarks && landmarks.length >= 33 && visionState.hasPose) {
        const w = canvas.width;
        const h = canvas.height;

        // Determine active side highlight
        const activeSide: "LEFT" | "RIGHT" | "NONE" =
          engineState === "AWAITING_LEFT_LIFT" ||
          engineState === "VERIFYING_LEFT_LIFT" ||
          engineState === "HOLDING_LEFT" ||
          engineState === "AWAITING_LEFT_RETURN"
            ? "LEFT"
            : engineState === "AWAITING_RIGHT_LIFT" ||
              engineState === "VERIFYING_RIGHT_LIFT" ||
              engineState === "HOLDING_RIGHT" ||
              engineState === "AWAITING_RIGHT_RETURN"
            ? "RIGHT"
            : "NONE";

        // Draw Bones
        for (const [fromIdx, toIdx] of SKELETON_BONES) {
          const p1 = landmarks[fromIdx];
          const p2 = landmarks[toIdx];
          if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);

            // Highlight instructed leg bones in cyan/blue or emerald/green
            const isLeftLegBone =
              (fromIdx >= 23 && fromIdx <= 31 && fromIdx % 2 === 1) ||
              (toIdx >= 23 && toIdx <= 31 && toIdx % 2 === 1);
            const isRightLegBone =
              (fromIdx >= 24 && fromIdx <= 32 && fromIdx % 2 === 0) ||
              (toIdx >= 24 && toIdx <= 32 && toIdx % 2 === 0);

            if (activeSide === "LEFT" && isLeftLegBone) {
              ctx.strokeStyle = isDualVerified ? "rgba(2, 132, 199, 1.0)" : "rgba(56, 189, 248, 0.9)";
              ctx.lineWidth = 5;
            } else if (activeSide === "RIGHT" && isRightLegBone) {
              ctx.strokeStyle = isDualVerified ? "rgba(5, 150, 105, 1.0)" : "rgba(52, 211, 153, 0.9)";
              ctx.lineWidth = 5;
            } else {
              ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
              ctx.lineWidth = 3;
            }
            ctx.stroke();
          }
        }

        // Draw Joints
        for (const idx of Object.values(POSE_LANDMARK_INDICES)) {
          const p = landmarks[idx];
          if (p && (p.visibility ?? 1) > 0.4) {
            const isLeft = idx % 2 === 1 && idx >= 23;
            const isRight = idx % 2 === 0 && idx >= 24;

            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, idx >= 23 ? 5.5 : 4, 0, 2 * Math.PI);

            if (activeSide === "LEFT" && isLeft) {
              ctx.fillStyle = isDualVerified ? "#0284C7" : "#38BDF8";
            } else if (activeSide === "RIGHT" && isRight) {
              ctx.fillStyle = isDualVerified ? "#059669" : "#34D399";
            } else {
              ctx.fillStyle = "#0D9488";
            }
            ctx.fill();
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderSkeleton);
    };

    animFrameRef.current = requestAnimationFrame(renderSkeleton);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [uiPhase, visionState.hasPose, visionState.pose, engineState, isDualVerified]);

  // =========================================================================
  // REAL-TIME ENGINE STEP TICK
  // =========================================================================
  useEffect(() => {
    if (uiPhase !== "ACTIVE") return;

    const interval = setInterval(() => {
      const engine = getEngine();
      const now = Date.now();

      // Camera observation
      const rawLandmarks = visionState.pose?.allRawLandmarks;
      const camObs = extractCameraLegObservation(
        rawLandmarks,
        engine.getBaseline(),
        engine.getConfig(),
        now,
        isMirrored
      );

      // Balance Board observation
      const rawFl = hardwareReading ? hardwareReading.topLeft : 0;
      const rawFr = hardwareReading ? hardwareReading.topRight : 0;
      const rawRl = hardwareReading ? hardwareReading.bottomLeft : 0;
      const rawRr = hardwareReading ? hardwareReading.bottomRight : 0;
      const copX = hardwareReading ? hardwareReading.copX : 0;
      const copY = hardwareReading ? hardwareReading.copY : 0;

      const boardObs = calculateBoardDistribution(rawFl, rawFr, rawRl, rawRr, copX, copY, now);

      // Execute deterministic engine step
      const res = engine.processStep(camObs, boardObs, now);

      setEngineState(res.state);
      setInstructionText(res.instructionText);
      setFeedbackText(res.feedbackText);
      setHoldSeconds(res.holdSeconds);
      setTargetHoldSeconds(res.targetHoldSeconds);
      setIsDualVerified(res.dualVerified);

      // If assessment completed, generate summary and transition to results
      if (res.state === "COMPLETED") {
        const isHardware = hardwareStatus.isConnected && !isSimulated;
        const summary = engine.generateSessionSummary(
          patient?.id || "pat-001",
          patient?.fullName || "Jane Doe",
          isHardware,
          visionState.activeCameraLabel || "Intel RealSense / Camera"
        );
        setSessionSummary(summary);
        setUiPhase("COMPLETED");

        // Save session asynchronously
        try {
          const fakeSession: any = {
            sessionId: summary.sessionId,
            patientId: summary.patientId,
            patientName: summary.patientName,
            startTime: summary.startTime,
            durationMs: summary.totalElapsedSeconds * 1000,
            measurementCount: summary.completeCopTrajectory.length,
            dataSource: isHardware ? "wii-board" : "simulation",
            summary: {
              durationFormatted: `${Math.round(summary.totalElapsedSeconds)}s`,
              averageWeightKg: summary.baseline.totalWeight,
            },
          };
          SessionStorageService.saveSession(fakeSession).catch((err) =>
            console.warn("Session auto-save warning:", err)
          );
        } catch (e) {
          console.warn("Session storage skipped:", e);
        }
      }
    }, 60);

    return () => clearInterval(interval);
  }, [
    uiPhase,
    hardwareReading,
    hardwareStatus.isConnected,
    isSimulated,
    visionState.pose,
    visionState.activeCameraLabel,
    isMirrored,
    getEngine,
    patient,
  ]);

  // Start exercise handler
  const handleStartExercise = async () => {
    if (!isCameraActive) {
      try {
        await startCamera();
      } catch (err) {
        console.warn("[MultimodalLegRaise] Camera start error:", err);
      }
    }

    const engine = getEngine();
    engine.updateConfig({
      holdDurationSecondsLeft: leftTargetSec,
      holdDurationSecondsRight: rightTargetSec,
      supportedStandingMode,
    });
    engine.startExercise();

    setUiPhase("ACTIVE");
    setEngineState("CHECKING_DEVICES");
    setPdfResult(null);
    setPdfError(null);
  };

  // Restart handler
  const handleRestart = () => {
    if (engineRef.current) {
      engineRef.current.abort();
      engineRef.current = null;
    }
    setUiPhase("INTRO");
    setSessionSummary(null);
    setPdfResult(null);
    setPdfError(null);
  };

  // PDF Export Handler
  const handleExportPdf = async () => {
    if (!sessionSummary) return;
    setIsExportingPdf(true);
    setPdfError(null);
    try {
      const res = await PdfReportService.generateAndSaveMultimodalLegRaiseReport(sessionSummary);
      setPdfResult({ filename: res.filename, filePath: res.filePath });
    } catch (err: any) {
      setPdfError(err?.message || String(err));
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Quick preset helper for Development Simulation testing
  const applySimLift = (leg: "LEFT" | "RIGHT" | "CENTER") => {
    if (!hardwareStatus.isConnected) {
      if (!isSimulated) {
        setIsSimulated(true);
      }
      if (leg === "LEFT") {
        setSimCopX(0.35); // Shift right for left lift
        setSimCopY(0.0);
      } else if (leg === "RIGHT") {
        setSimCopX(-0.35); // Shift left for right lift
        setSimCopY(0.0);
      } else {
        setSimCopX(0.0);
        setSimCopY(0.0);
      }
    }
  };

  // 3D Avatar Movement State
  const avatarMovementState = useMemo(() => {
    if (visionState.hasPose && visionState.pose) {
      return AvatarController.calculateMovementFromPose(visionState.pose);
    }
    return AvatarController.getTargetMovementState("stand");
  }, [visionState.hasPose, visionState.pose]);

  // Visual Force Plate Board Mapping for COP Ball
  const visualCop = useMemo(() => {
    const copX = hardwareReading ? hardwareReading.copX : null;
    const copY = hardwareReading ? hardwareReading.copY : null;
    if (copX === null || copY === null) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    return mapCopToBoard(copX, copY);
  }, [hardwareReading]);

  // Live Load distribution percentages
  const leftPercent = hardwareReading ? hardwareReading.leftPercent : 50.0;
  const rightPercent = hardwareReading ? hardwareReading.rightPercent : 50.0;
  const liveWeight = hardwareReading ? hardwareReading.totalWeight : null;

  // =========================================================================
  // VIEW 1: PRE-EXERCISE INTRO & READINESS SCREEN
  // =========================================================================
  if (uiPhase === "INTRO") {
    return (
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "12px 0 44px 0",
        }}
      >
        {/* Navigation Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
            {patient && (
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 600 }}>
                Patient: <strong style={{ color: "var(--text-main)" }}>{patient.fullName}</strong> ({patient.id})
              </span>
            )}
          </div>

          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
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
            <span>PHASE E • MULTIMODAL DUAL-DEVICE ENGINE</span>
          </span>
        </div>

        {/* Device Readiness Checklist */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {/* Camera Readiness */}
          <div
            className="medical-card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isCameraActive ? "var(--teal-primary)" : "var(--text-muted)",
                }}
              >
                <Camera size={20} />
              </div>
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Camera & Pose Model
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {isCameraActive
                    ? visionState.hasPose
                      ? "Pose detected (Full 33 landmarks)"
                      : "Stream active (Waiting for pose)"
                    : "Camera inactive"}
                </div>
              </div>
            </div>
            {!isCameraActive && (
              <button
                onClick={() => startCamera()}
                className="btn-primary"
                style={{ fontSize: "0.75rem", padding: "6px 12px" }}
              >
                Start Camera
              </button>
            )}
          </div>

          {/* Wii Balance Board Readiness */}
          <div
            className="medical-card"
            style={{
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: hardwareStatus.isConnected ? "var(--bg-subtle-mint)" : isSimulated ? "#FEF3C7" : "#F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: hardwareStatus.isConnected ? "var(--teal-primary)" : isSimulated ? "#D97706" : "var(--text-muted)",
                }}
              >
                <Scale size={20} />
              </div>
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Wii Balance Board
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {hardwareStatus.isConnected
                    ? `Connected (Total load: ${hardwareReading?.totalWeight.toFixed(1) || "--"} kg)`
                    : isSimulated
                    ? "Development Simulation Active"
                    : "Board Disconnected"}
                </div>
              </div>
            </div>
            {!hardwareStatus.isConnected && (
              <button
                onClick={() => setIsSimulated(!isSimulated)}
                className={isSimulated ? "btn-secondary" : "btn-ghost"}
                style={{ fontSize: "0.75rem", padding: "6px 12px" }}
              >
                <Sliders size={13} style={{ marginRight: "4px" }} />
                <span>Sim: {isSimulated ? "ON" : "OFF"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Instruction & Configuration Card */}
        <div className="medical-card" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--teal-primary)",
              }}
            >
              Rehabilitation Assessment &bull; Dual-Device Synchronization
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
            Multimodal Leg Raise & Balance Training
          </h1>

          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 20px 0" }}>
            This exercise evaluates single-leg elevation and contralateral weight transfer. The system requires
            simultaneous agreement: the camera tracks actual foot clearance above the standing baseline while the Wii
            Balance Board confirms the corresponding support load transfer onto the contralateral foot.
          </p>

          {/* Sequential Protocol Steps */}
          <div
            style={{
              padding: "18px 22px",
              background: "#F8FAFC",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              marginBottom: "22px",
            }}
          >
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--teal-primary)", marginBottom: "10px" }}>
              Sequential Assessment Protocol:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#FFFFFF", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#0284C7" }}>Stage 1: LEFT Leg Raise</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Lift left foot &bull; Shift weight right &bull; Hold {leftTargetSec}s &bull; Lower foot &bull; 1.5s stable stance
                </div>
              </div>
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#FFFFFF", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#059669" }}>Stage 2: RIGHT Leg Raise</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Lift right foot &bull; Shift weight left &bull; Hold {rightTargetSec}s &bull; Lower foot &bull; 1.5s final stability
                </div>
              </div>
            </div>
          </div>

          {/* Clinician Settings Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1.2fr",
              gap: "14px",
              marginBottom: "24px",
              padding: "16px",
              background: "#F1F5F9",
              borderRadius: "12px",
            }}
          >
            {/* Left Hold Target */}
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)", display: "block", marginBottom: "6px" }}>
                Left Hold Target: <strong>{leftTargetSec.toFixed(1)}s</strong>
              </label>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.5"
                value={leftTargetSec}
                onChange={(e) => setLeftTargetSec(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#0D9488" }}
              />
            </div>

            {/* Right Hold Target */}
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)", display: "block", marginBottom: "6px" }}>
                Right Hold Target: <strong>{rightTargetSec.toFixed(1)}s</strong>
              </label>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.5"
                value={rightTargetSec}
                onChange={(e) => setRightTargetSec(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#0D9488" }}
              />
            </div>

            {/* Supported-Standing Toggle */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={supportedStandingMode}
                  onChange={(e) => setSupportedStandingMode(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#0D9488" }}
                />
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Supported-Standing Mode (Handrail / Chair)
                </span>
              </label>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {supportedStandingMode
                  ? "Labelled in report: Measured board load may exclude partial arm support."
                  : "Unassisted free-standing protocol."}
              </span>
            </div>
          </div>

          {/* Safety & Protocol Banner */}
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
                Strict Multimodal Non-Negotiable Criterion
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.45 }}>
                A camera-only detection or balance-board-only detection will NOT complete a repetition. Both devices must
                confirm synchronized sensor evidence before a leg raise can be credited.
              </div>
            </div>
          </div>

          {/* Action Button */}
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
            <span>START MULTIMODAL ASSESSMENT</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVE MULTIMODAL EXERCISE (3-PANEL VIEWPORT)
  // =========================================================================
  if (uiPhase === "ACTIVE") {
    const isPaused = engineState === "PAUSED";
    const holdPct = Math.min(100, Math.round((holdSeconds / targetHoldSeconds) * 100));

    return (
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "8px 0 36px 0",
        }}
      >
        {/* Top Control & Status Header */}
        <div
          className="medical-card"
          style={{
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 800,
                color: "var(--text-main)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Activity size={18} color="var(--teal-primary)" />
              <span>Multimodal Leg Raise & Balance</span>
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: hardwareStatus.isConnected ? "var(--teal-primary)" : "#D97706",
                background: hardwareStatus.isConnected ? "var(--bg-subtle-mint)" : "#FFFBEB",
                padding: "3px 8px",
                borderRadius: "6px",
                border: `1px solid ${hardwareStatus.isConnected ? "var(--border-mint)" : "#FDE68A"}`,
              }}
            >
              {hardwareStatus.isConnected ? "LIVE RVL-WBC-01" : "SIMULATION"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => {
                const engine = getEngine();
                if (isPaused) {
                  engine.resume();
                  setEngineState(engine.getState());
                } else {
                  engine.pause();
                  setEngineState("PAUSED");
                }
              }}
              className="btn-secondary"
              style={{ fontSize: "0.75rem", padding: "6px 12px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>
            <button
              onClick={handleRestart}
              className="btn-ghost"
              style={{ fontSize: "0.75rem", padding: "6px 12px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Primary Instruction & Dual-Verification Banner */}
        <div
          className="medical-card"
          style={{
            padding: "16px 20px",
            background: isDualVerified
              ? "linear-gradient(90deg, #ECFDF5 0%, #D1FAE5 100%)"
              : "#F8FAFC",
            border: `2px solid ${isDualVerified ? "#059669" : "var(--border-light)"}`,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  background: isDualVerified ? "#059669" : "var(--teal-primary)",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "1.125rem",
                  flexShrink: 0,
                }}
              >
                {isDualVerified ? "✓" : <Activity size={20} />}
              </div>
              <div>
                <div style={{ fontSize: "1.125rem", fontWeight: 900, color: isDualVerified ? "#059669" : "var(--text-main)" }}>
                  {instructionText}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  {feedbackText}
                </div>
              </div>
            </div>

            {/* Hold Timer Display */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)" }}>
                VERIFIED HOLD
              </div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 900,
                  fontFamily: "var(--font-mono)",
                  color: isDualVerified ? "#059669" : "var(--text-main)",
                }}
              >
                {holdSeconds.toFixed(1)} / {targetHoldSeconds.toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Continuous Hold Progress Bar */}
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "#E2E8F0",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${holdPct}%`,
                height: "100%",
                background: isDualVerified ? "#059669" : "var(--teal-primary)",
                borderRadius: "4px",
                transition: "width 0.1s linear",
              }}
            />
          </div>
        </div>

        {/* 3-PANEL MULTIMODAL VIEWPORT */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr 1fr", gap: "14px", alignItems: "stretch" }}>
          {/* PANEL A: Live Camera + 2D Skeleton Overlay */}
          <div
            className="medical-card"
            style={{
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Camera size={16} color="var(--teal-primary)" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  Panel A: 2D Skeleton Overlay
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: visionState.hasPose ? "var(--teal-primary)" : "#D97706",
                }}
              >
                {visionState.hasPose ? "Tracking (33 Landmarks)" : "Pose Pending"}
              </span>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 3",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#0F172A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />

              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  pointerEvents: "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />

              {!isCameraActive && (
                <div style={{ textAlign: "center", color: "#94A3B8" }}>
                  <CameraOff size={32} style={{ margin: "0 auto 8px auto" }} />
                  <div style={{ fontSize: "0.8125rem" }}>Camera Inactive</div>
                </div>
              )}
            </div>

            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Instructed leg highlighted &bull; Foot clearance verified from baseline
            </div>
          </div>

          {/* PANEL B: 3D SMPL Biofeedback Avatar */}
          <div
            className="medical-card"
            style={{
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Eye size={16} color="var(--teal-primary)" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  Panel B: 3D SMPL Avatar
                </span>
              </div>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Real-Time Kinematics
              </span>
            </div>

            <div
              style={{
                width: "100%",
                aspectRatio: "4 / 3",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#F1F5F9",
              }}
            >
              <RehabilitationScene movementState={avatarMovementState} />
            </div>

            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              SMPL biomechanical model mirrors patient single-leg posture
            </div>
          </div>

          {/* PANEL C: Wii Balance Board Force Plate Visualization */}
          <div
            className="medical-card"
            style={{
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Scale size={16} color="var(--teal-primary)" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  Panel C: Wii Force Plate
                </span>
              </div>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                {liveWeight ? `${liveWeight.toFixed(1)} kg` : "-- kg"}
              </span>
            </div>

            {/* Force Plate Chassis */}
            <div
              style={{
                width: "100%",
                aspectRatio: "446 / 238",
                background: "#FFFFFF",
                borderRadius: "16px",
                border: "2px solid #CBD5E1",
                padding: "8px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  background: "#FAFCFC",
                }}
              >
                {/* Crosshairs */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "5%",
                    right: "5%",
                    height: "1px",
                    borderTop: "1px dashed #CBD5E1",
                    transform: "translateY(-50%)",
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
                  }}
                />

                {/* Center origin ring */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: "1.5px solid rgba(13, 148, 136, 0.35)",
                    transform: "translate(-50%, -50%)",
                  }}
                />

                {/* 4 Corner Labels */}
                <span style={{ position: "absolute", top: 4, left: 6, fontSize: "0.625rem", fontWeight: 800, color: "#94A3B8" }}>
                  FL: {hardwareReading?.topLeft.toFixed(0) || "--"}
                </span>
                <span style={{ position: "absolute", top: 4, right: 6, fontSize: "0.625rem", fontWeight: 800, color: "#94A3B8" }}>
                  FR: {hardwareReading?.topRight.toFixed(0) || "--"}
                </span>
                <span style={{ position: "absolute", bottom: 4, left: 6, fontSize: "0.625rem", fontWeight: 800, color: "#94A3B8" }}>
                  RL: {hardwareReading?.bottomLeft.toFixed(0) || "--"}
                </span>
                <span style={{ position: "absolute", bottom: 4, right: 6, fontSize: "0.625rem", fontWeight: 800, color: "#94A3B8" }}>
                  RR: {hardwareReading?.bottomRight.toFixed(0) || "--"}
                </span>

                {/* Live COP Ball */}
                {hardwareReading && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${visualCop.xPercent}%`,
                      top: `${visualCop.yPercent}%`,
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: isDualVerified ? "#059669" : "#0D9488",
                      border: "2px solid #FFFFFF",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      transform: "translate(-50%, -50%)",
                      transition: "all 0.05s linear",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Load distribution bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", fontWeight: 700 }}>
                <span>Left: {leftPercent.toFixed(1)}%</span>
                <span>Right: {rightPercent.toFixed(1)}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "#E2E8F0", borderRadius: "3px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${leftPercent}%`, background: "#0284C7" }} />
                <div style={{ width: `${rightPercent}%`, background: "#059669" }} />
              </div>
            </div>

            {/* Simulation testing buttons if hardware not connected */}
            {!hardwareStatus.isConnected && (
              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                <button
                  onClick={() => applySimLift("LEFT")}
                  className="btn-secondary"
                  style={{ fontSize: "0.6875rem", padding: "4px 8px", flex: 1 }}
                >
                  Sim Left Lift
                </button>
                <button
                  onClick={() => applySimLift("CENTER")}
                  className="btn-ghost"
                  style={{ fontSize: "0.6875rem", padding: "4px 8px" }}
                >
                  Center
                </button>
                <button
                  onClick={() => applySimLift("RIGHT")}
                  className="btn-secondary"
                  style={{ fontSize: "0.6875rem", padding: "4px 8px", flex: 1 }}
                >
                  Sim Right Lift
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: DEDICATED RESULTS SCREEN (PROMPT SECTION 11)
  // =========================================================================
  if (uiPhase === "COMPLETED" && sessionSummary) {
    const isSim = !sessionSummary.isRealHardware;
    const base = sessionSummary.baseline;

    const baseBoardCoords = mapCopToBoard(base.copX, base.copY);

    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "10px 0 44px 0",
        }}
      >
        {/* Navigation & Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: isSim ? "#D97706" : "var(--teal-primary)",
                  background: isSim ? "#FFFBEB" : "var(--bg-subtle-mint)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${isSim ? "#FDE68A" : "var(--border-mint)"}`,
                }}
              >
                {isSim ? "DEVELOPMENT SIMULATION SESSION" : "CLINICAL HARDWARE SESSION"}
              </span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", margin: "8px 0 2px 0" }}>
              Assessment Results: Multimodal Leg Raise & Balance
            </h1>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Patient: <strong>{sessionSummary.patientName}</strong> &bull; Completed {sessionSummary.completedRepetitions} of 2 Repetitions
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px", fontSize: "0.875rem" }}
            >
              <Download size={16} />
              <span>{isExportingPdf ? "Generating PDF..." : "Export Doctor PDF"}</span>
            </button>
            <button
              onClick={handleRestart}
              className="btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px", fontSize: "0.875rem" }}
            >
              <RotateCcw size={16} />
              <span>Restart Assessment</span>
            </button>
          </div>
        </div>

        {/* PDF Notification Alert */}
        {pdfResult && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              background: "#ECFDF5",
              border: "1px solid #10B981",
              fontSize: "0.8125rem",
              color: "#065F46",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} color="#059669" />
            <span>Doctor PDF exported successfully: <strong>{pdfResult.filename}</strong></span>
          </div>
        )}
        {pdfError && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              background: "#FEF2F2",
              border: "1px solid #EF4444",
              fontSize: "0.8125rem",
              color: "#991B1B",
            }}
          >
            PDF export error: {pdfError}
          </div>
        )}

        {/* CENTERPIECE: LARGE WII BALANCE BOARD VISUALIZATION (SECTION 11.1) */}
        <div
          className="medical-card"
          style={{
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--text-main)" }}>
                Wii Balance Board Force Plate — Recorded COP Trajectories
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                True plantar center-of-pressure trajectory recorded across standing baseline, left lift, and right lift
              </div>
            </div>

            {/* Filter Toggle */}
            <div style={{ display: "flex", gap: "6px", background: "#F1F5F9", padding: "4px", borderRadius: "8px" }}>
              <button
                onClick={() => setTrajectoryFilter("ALL")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  border: "none",
                  background: trajectoryFilter === "ALL" ? "#FFFFFF" : "transparent",
                  color: trajectoryFilter === "ALL" ? "var(--teal-primary)" : "var(--text-muted)",
                  boxShadow: trajectoryFilter === "ALL" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                }}
              >
                All Trajectories
              </button>
              <button
                onClick={() => setTrajectoryFilter("LEFT")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  border: "none",
                  background: trajectoryFilter === "LEFT" ? "#FFFFFF" : "transparent",
                  color: trajectoryFilter === "LEFT" ? "#0284C7" : "var(--text-muted)",
                  boxShadow: trajectoryFilter === "LEFT" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                }}
              >
                Left Leg Only
              </button>
              <button
                onClick={() => setTrajectoryFilter("RIGHT")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  border: "none",
                  background: trajectoryFilter === "RIGHT" ? "#FFFFFF" : "transparent",
                  color: trajectoryFilter === "RIGHT" ? "#059669" : "var(--text-muted)",
                  boxShadow: trajectoryFilter === "RIGHT" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  cursor: "pointer",
                }}
              >
                Right Leg Only
              </button>
            </div>
          </div>

          {/* Large Chassis */}
          <div
            style={{
              width: "100%",
              aspectRatio: "446 / 238",
              background: "#FFFFFF",
              borderRadius: "24px",
              border: "2px solid #CBD5E1",
              boxShadow: "0 8px 24px -4px rgba(15, 23, 42, 0.08)",
              padding: "16px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                background: "#FAFCFC",
              }}
            >
              {/* Crosshairs */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "5%",
                  right: "5%",
                  height: "1px",
                  borderTop: "1px dashed #CBD5E1",
                  transform: "translateY(-50%)",
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
                }}
              />

              {/* Center origin ring */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(13, 148, 136, 0.35)",
                  transform: "translate(-50%, -50%)",
                }}
              />

              {/* Axis Labels */}
              <span style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", fontSize: "0.6875rem", fontWeight: 800, color: "#94A3B8" }}>
                FRONT / ANTERIOR (+Y)
              </span>
              <span style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: "0.6875rem", fontWeight: 800, color: "#94A3B8" }}>
                BACK / POSTERIOR (-Y)
              </span>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.6875rem", fontWeight: 800, color: "#94A3B8" }}>
                ← LEFT (-X)
              </span>
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.6875rem", fontWeight: 800, color: "#94A3B8" }}>
                RIGHT (+X) →
              </span>

              {/* SVG TRAJECTORY OVERLAY */}
              <svg
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Left Leg Trajectory (Cyan/Blue #0284C7) */}
                {(trajectoryFilter === "ALL" || trajectoryFilter === "LEFT") &&
                  sessionSummary.leftLeg.copTrajectory.length > 1 && (
                    <polyline
                      points={sessionSummary.leftLeg.copTrajectory
                        .map((p) => {
                          const b = mapCopToBoard(p.x, p.y);
                          return `${b.xPercent.toFixed(1)},${b.yPercent.toFixed(1)}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#0284C7"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                {/* Right Leg Trajectory (Emerald/Green #059669) */}
                {(trajectoryFilter === "ALL" || trajectoryFilter === "RIGHT") &&
                  sessionSummary.rightLeg.copTrajectory.length > 1 && (
                    <polyline
                      points={sessionSummary.rightLeg.copTrajectory
                        .map((p) => {
                          const b = mapCopToBoard(p.x, p.y);
                          return `${b.xPercent.toFixed(1)},${b.yPercent.toFixed(1)}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#059669"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
              </svg>

              {/* Baseline COP Marker */}
              <div
                style={{
                  position: "absolute",
                  left: `${baseBoardCoords.xPercent}%`,
                  top: `${baseBoardCoords.yPercent}%`,
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "rgba(13, 148, 136, 0.2)",
                  border: "2px solid #0D9488",
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#0D9488" }} />
              </div>
            </div>
          </div>

          {/* Trajectory Legend */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "24px",
              padding: "10px",
              background: "#F8FAFC",
              borderRadius: "8px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #0D9488" }} />
              <span>Standing Baseline COP</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
              <div style={{ width: "16px", height: "4px", background: "#0284C7", borderRadius: "2px" }} />
              <span>Left Leg Lift (Right Support Shift)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 700 }}>
              <div style={{ width: "16px", height: "4px", background: "#059669", borderRadius: "2px" }} />
              <span>Right Leg Lift (Left Support Shift)</span>
            </div>
          </div>
        </div>

        {/* COMPARISON TABLE: EXACT PROMPT SPECIFICATION (SECTION 14.E) */}
        <div className="medical-card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "12px" }}>
            Performance Comparison: Left-Leg vs Right-Leg Protocol
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ background: "#F1F5F9", borderBottom: "2px solid #CBD5E1", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 800, color: "var(--text-main)" }}>Metric</th>
                  <th style={{ padding: "10px 14px", fontWeight: 800, color: "#0284C7" }}>LEFT-leg exercise</th>
                  <th style={{ padding: "10px 14px", fontWeight: 800, color: "#059669" }}>RIGHT-leg exercise</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Required hold</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.leftLeg.requiredHoldSeconds.toFixed(1)} seconds</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.rightLeg.requiredHoldSeconds.toFixed(1)} seconds</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Actual successful hold</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontWeight: 800, color: "#0284C7" }}>
                    {sessionSummary.leftLeg.actualHoldSeconds.toFixed(1)} seconds
                  </td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontWeight: 800, color: "#059669" }}>
                    {sessionSummary.rightLeg.actualHoldSeconds.toFixed(1)} seconds
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Leg lift confirmed (Camera)</td>
                  <td style={{ padding: "9px 14px" }}>{sessionSummary.leftLeg.cameraLiftConfirmed ? "Confirmed (Left ✓)" : "Not Confirmed"}</td>
                  <td style={{ padding: "9px 14px" }}>{sessionSummary.rightLeg.cameraLiftConfirmed ? "Confirmed (Right ✓)" : "Not Confirmed"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Board confirmation (Load transfer)</td>
                  <td style={{ padding: "9px 14px" }}>{sessionSummary.leftLeg.boardTransferConfirmed ? "Confirmed (Right Support ✓)" : "Not Confirmed"}</td>
                  <td style={{ padding: "9px 14px" }}>{sessionSummary.rightLeg.boardTransferConfirmed ? "Confirmed (Left Support ✓)" : "Not Confirmed"}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Load transfer (Support side Δ)</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>
                    +{sessionSummary.leftLeg.supportTransferDeltaPct.toFixed(1)}% (Peak: {sessionSummary.leftLeg.peakSupportLoadPctDuringLift.toFixed(1)}%)
                  </td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>
                    +{sessionSummary.rightLeg.supportTransferDeltaPct.toFixed(1)}% (Peak: {sessionSummary.rightLeg.peakSupportLoadPctDuringLift.toFixed(1)}%)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>COP variability (Radial RMS)</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.leftLeg.copVariabilityRmsMm.toFixed(1)} mm</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.rightLeg.copVariabilityRmsMm.toFixed(1)} mm</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Time to recover stability</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.leftLeg.recoveryDurationSeconds.toFixed(1)} seconds</td>
                  <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)" }}>{sessionSummary.rightLeg.recoveryDurationSeconds.toFixed(1)} seconds</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>Camera tracking quality</td>
                  <td style={{ padding: "9px 14px" }}>{Math.round(sessionSummary.leftLeg.meanCameraConfidence * 100)}% Visibility</td>
                  <td style={{ padding: "9px 14px" }}>{Math.round(sessionSummary.rightLeg.meanCameraConfidence * 100)}% Visibility</td>
                </tr>
                <tr>
                  <td style={{ padding: "9px 14px", fontWeight: 800 }}>Repetition completed</td>
                  <td style={{ padding: "9px 14px", fontWeight: 800, color: sessionSummary.leftLeg.repetitionCompleted ? "#0284C7" : "#D97706" }}>
                    {sessionSummary.leftLeg.repetitionCompleted ? "COMPLETED (Dual-Verified ✓)" : "INCOMPLETE"}
                  </td>
                  <td style={{ padding: "9px 14px", fontWeight: 800, color: sessionSummary.rightLeg.repetitionCompleted ? "#059669" : "#D97706" }}>
                    {sessionSummary.rightLeg.repetitionCompleted ? "COMPLETED (Dual-Verified ✓)" : "INCOMPLETE"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Data Quality & Provenance Audit */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div className="medical-card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--teal-primary)", marginBottom: "6px" }}>
              Sensor Data Quality & Provenance
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Hardware Source: <strong>{sessionSummary.hardwareModel}</strong>
              <br />
              Camera Source: <strong>{sessionSummary.cameraSource}</strong>
              <br />
              Temporal Synchronization: <strong>{sessionSummary.syncQuality}</strong>
              <br />
              Supported-Standing: <strong>{sessionSummary.supportedStandingMode ? "Active" : "Unassisted"}</strong>
            </div>
          </div>

          <div className="medical-card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--teal-primary)", marginBottom: "6px" }}>
              Telemetry Continuity & Sampling
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Valid Measurement Time: <strong>{sessionSummary.totalValidMeasurementSeconds.toFixed(1)}s</strong> of {sessionSummary.totalElapsedSeconds.toFixed(1)}s
              <br />
              Total COP Trajectory Samples: <strong>{sessionSummary.completeCopTrajectory.length.toLocaleString()} points</strong>
              <br />
              Outlier / Missing Data Gaps: <strong>{sessionSummary.totalMissingDataSeconds === 0 ? "0.0s (100% Continuous)" : `${sessionSummary.totalMissingDataSeconds.toFixed(1)}s filtered`}</strong>
              <br />
              Safety Pauses: <strong>{sessionSummary.safetyPausesCount}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
