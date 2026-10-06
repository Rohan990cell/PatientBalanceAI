import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Camera,
  CameraOff,
  Clock,
  Compass,
  Award,
  Sliders,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { useBalanceBoard } from "../../context/HardwareContext";
import { useVision } from "../../context/VisionContext";
import { mapCopToBoard } from "../../utils/copMapping";
import {
  SKELETON_2D_KEY_JOINTS,
  SKELETON_2D_BONES,
  calculatePostureFromLandmarks,
  evaluateMultimodalCorrelation,
  calculatePostureBalanceResult,
  PostureBalanceSessionResult,
} from "../../utils/postureBalanceExercise";
import { PatientProfile } from "../../types/patient";

interface PostureBalanceMultimodalExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
}

type ExercisePhase = "INTRO" | "COUNTDOWN" | "ACTIVE" | "COMPLETED";

export const PostureBalanceMultimodalExercise: React.FC<PostureBalanceMultimodalExerciseProps> = ({
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
  const [phase, setPhase] = useState<ExercisePhase>("INTRO");
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const targetDurationSeconds = 45;

  // DOM Refs for Camera Video & 2D Skeleton Canvas
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Active Session Metrics Counters
  const sessionStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const postureSamplesCountRef = useRef<number>(0);
  const balanceSamplesCountRef = useRef<number>(0);
  const alignedSamplesCountRef = useRef<number>(0);
  const [exerciseResult, setExerciseResult] = useState<PostureBalanceSessionResult | null>(null);

  // Extract raw COP telemetry from existing context without modifying formulas
  const liveCopX = hardwareReading ? hardwareReading.copX : null;
  const liveCopY = hardwareReading ? hardwareReading.copY : null;
  const liveWeight = hardwareReading ? hardwareReading.totalWeight : null;
  const leftPercent = hardwareReading ? hardwareReading.leftPercent : null;
  const rightPercent = hardwareReading ? hardwareReading.rightPercent : null;
  const anteriorPercent = hardwareReading ? hardwareReading.anteriorPercent : null;
  const posteriorPercent = hardwareReading ? hardwareReading.posteriorPercent : null;

  // Real-time Posture Metrics from MediaPipe 2D Pose
  const posture = useMemo(() => {
    if (visionState.hasPose && visionState.pose) {
      return {
        shoulderTiltDeg: visionState.pose.shoulderTiltDeg,
        hipTiltDeg: visionState.pose.hipTiltDeg,
        trunkPitchDeg: visionState.pose.trunkPitchDeg,
        postureLean: visionState.pose.postureLean,
        isTracking: true,
      };
    }
    // Fallback calculation from raw landmarks if pose summary is pending
    if (visionState.pose?.allRawLandmarks) {
      return calculatePostureFromLandmarks(visionState.pose.allRawLandmarks);
    }
    return {
      shoulderTiltDeg: 0,
      hipTiltDeg: 0,
      trunkPitchDeg: 0,
      postureLean: "NEUTRAL" as const,
      isTracking: false,
    };
  }, [visionState.hasPose, visionState.pose]);

  // Task 5: Multimodal Correlation between Camera Posture and Wii Balance Board
  const multimodal = useMemo(() => {
    return evaluateMultimodalCorrelation({
      postureLean: posture.isTracking ? posture.postureLean : null,
      hasPose: posture.isTracking,
      copX: liveCopX,
      copY: liveCopY,
      isBoardConnected: hardwareStatus.isConnected || isSimulated,
    });
  }, [posture.isTracking, posture.postureLean, liveCopX, liveCopY, hardwareStatus.isConnected, isSimulated]);

  // Visual Force Plate Board Mapping for COP Ball
  const visualCop = useMemo(() => {
    if (liveCopX === null || liveCopY === null) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    return mapCopToBoard(liveCopX, liveCopY);
  }, [liveCopX, liveCopY]);

  // Determine Data Source Badge adhering to strict precedence:
  // LIVE HARDWARE > SIMULATION > UNAVAILABLE
  const balanceSourceLabel = useMemo(() => {
    if (hardwareStatus.isConnected) return "Data Source: LIVE WII BALANCE BOARD";
    if (isSimulated) return "DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA";
    return "Data Source: --";
  }, [hardwareStatus.isConnected, isSimulated]);

  // Preferred Camera Label (RealSense vs Default)
  const cameraDeviceName = useMemo(() => {
    if (!isCameraActive) return "Camera: Off";
    if (visionState.isRealSenseAvailable || visionState.activeCameraLabel?.toLowerCase().includes("realsense")) {
      return `Intel RealSense RGB (${visionState.activeCameraLabel || "Connected"})`;
    }
    return visionState.activeCameraLabel || "Active Camera Feed";
  }, [isCameraActive, visionState.isRealSenseAvailable, visionState.activeCameraLabel]);

  // =========================================================================
  // CAMERA LIFECYCLE (TASK 8)
  // Connects to existing media stream without stopping or creating duplicate streams
  // =========================================================================
  useEffect(() => {
    if (phase === "INTRO" || !isCameraActive) return;

    const stream = getMediaStream();
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn("[PostureBalanceExercise] videoElement.play() warning:", err);
      });
    }
  }, [phase, isCameraActive, getMediaStream]);

  // =========================================================================
  // TASK 2: 2D SKELETON CANVAS OVERLAY RENDER LOOP
  // Draws HEAD, SHOULDERS, ELBOWS, WRISTS, HIPS, KNEES, ANKLES directly over video
  // =========================================================================
  useEffect(() => {
    if (phase !== "ACTIVE" && phase !== "COUNTDOWN") {
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

    const render2DSkeleton = () => {
      // Sync canvas dimensions with video stream
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = visionState.pose?.allRawLandmarks;
      if (landmarks && landmarks.length >= 29 && visionState.hasPose) {
        const w = canvas.width;
        const h = canvas.height;

        // Color coding based on multimodal alignment:
        // Green if aligned with balance board, Teal if neutral, Amber if posture imbalance
        const strokeColor = multimodal.isAligned
          ? "rgba(16, 185, 129, 0.95)"
          : posture.postureLean !== "NEUTRAL"
          ? "rgba(245, 158, 11, 0.92)"
          : "rgba(13, 148, 136, 0.90)";

        const jointColor = multimodal.isAligned ? "#10B981" : "#0D9488";

        // 1. Draw Kinematic 2D Bone Lines
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = strokeColor;

        for (const [fromIdx, toIdx] of SKELETON_2D_BONES) {
          const p1 = landmarks[fromIdx];
          const p2 = landmarks[toIdx];
          if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
            ctx.stroke();
          }
        }

        // 2. Draw Spine midline connection (Nose -> Mid-Shoulder -> Mid-Hip)
        const nose = landmarks[SKELETON_2D_KEY_JOINTS.NOSE];
        const ls = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
        const rs = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
        const lh = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
        const rh = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];

        if (ls && rs && lh && rh) {
          const midShoulderX = ((ls.x + rs.x) / 2) * w;
          const midShoulderY = ((ls.y + rs.y) / 2) * h;
          const midHipX = ((lh.x + rh.x) / 2) * w;
          const midHipY = ((lh.y + rh.y) / 2) * h;

          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 2.5;

          // Head to mid-shoulder
          if (nose) {
            ctx.beginPath();
            ctx.moveTo(nose.x * w, nose.y * h);
            ctx.lineTo(midShoulderX, midShoulderY);
            ctx.stroke();
          }

          // Spine: mid-shoulder to mid-hip
          ctx.beginPath();
          ctx.moveTo(midShoulderX, midShoulderY);
          ctx.lineTo(midHipX, midHipY);
          ctx.stroke();
          ctx.restore();
        }

        // 3. Draw Key 2D Joints (HEAD, SHOULDERS, ELBOWS, WRISTS, HIPS, KNEES, ANKLES)
        for (const [, jointIdx] of Object.entries(SKELETON_2D_KEY_JOINTS)) {
          const joint = landmarks[jointIdx];
          if (joint && (joint.visibility ?? 1) > 0.35) {
            const jx = joint.x * w;
            const jy = joint.y * h;

            // Outer ring
            ctx.beginPath();
            ctx.arc(jx, jy, 7, 0, Math.PI * 2);
            ctx.fillStyle = jointColor;
            ctx.fill();

            // Inner white core
            ctx.beginPath();
            ctx.arc(jx, jy, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render2DSkeleton);
    };

    animFrameRef.current = requestAnimationFrame(render2DSkeleton);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [phase, visionState.pose, visionState.hasPose, multimodal.isAligned, posture.postureLean]);

  // =========================================================================
  // EXERCISE TIMER & ACTIVE METRIC COLLECTION (TASK 9)
  // =========================================================================
  useEffect(() => {
    if (phase !== "ACTIVE") {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    sessionStartTimeRef.current = performance.now() - elapsedMs;

    timerIntervalRef.current = setInterval(() => {
      if (sessionStartTimeRef.current !== null) {
        const curElapsed = performance.now() - sessionStartTimeRef.current;
        setElapsedMs(curElapsed);

        // Auto-complete when target duration is reached
        if (curElapsed >= targetDurationSeconds * 1000) {
          handleCompleteExercise();
        }
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [phase, elapsedMs]);

  // Ingest continuous samples for multimodal compliance evaluation
  useEffect(() => {
    if (phase !== "ACTIVE") return;

    if (posture.isTracking) {
      postureSamplesCountRef.current += 1;
    }
    if (hardwareStatus.isConnected || isSimulated) {
      balanceSamplesCountRef.current += 1;
    }
    if (multimodal.isAligned) {
      alignedSamplesCountRef.current += 1;
    }
  }, [phase, posture.isTracking, hardwareStatus.isConnected, isSimulated, multimodal.isAligned]);

  // Start Exercise: 3s Countdown Handler
  const handleStartExercise = useCallback(async () => {
    // If camera is currently off, start it cleanly
    if (!isCameraActive) {
      try {
        await startCamera();
      } catch (err) {
        console.warn("[PostureBalanceExercise] Camera start error:", err);
      }
    }

    setPhase("COUNTDOWN");
    setCountdownValue(3);
    setElapsedMs(0);
    postureSamplesCountRef.current = 0;
    balanceSamplesCountRef.current = 0;
    alignedSamplesCountRef.current = 0;
    setExerciseResult(null);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownValue(count);
      } else {
        clearInterval(interval);
        setPhase("ACTIVE");
      }
    }, 1000);
  }, [isCameraActive, startCamera]);

  // Complete Exercise Handler
  const handleCompleteExercise = useCallback(() => {
    setPhase("COMPLETED");

    const result = calculatePostureBalanceResult({
      durationMs: elapsedMs,
      postureSamplesCount: postureSamplesCountRef.current,
      balanceSamplesCount: balanceSamplesCountRef.current,
      alignedSamplesCount: alignedSamplesCountRef.current,
      isSimulated: isSimulated && !hardwareStatus.isConnected,
      isConnected: hardwareStatus.isConnected,
    });

    setExerciseResult(result);
  }, [elapsedMs, isSimulated, hardwareStatus.isConnected]);

  // Reset Exercise Handler
  const handleRestart = useCallback(() => {
    setPhase("INTRO");
    setElapsedMs(0);
    setExerciseResult(null);
  }, []);

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

  // Format mm:ss
  const formatTimer = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // =========================================================================
  // VIEW 1: INTRO VIEW
  // =========================================================================
  if (phase === "INTRO") {
    return (
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "12px 0 40px 0",
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
                Patient: <strong style={{ color: "var(--text-main)" }}>{patient.fullName}</strong>
              </span>
            )}
          </div>

          {/* Multimodal Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              <span>WII BALANCE BOARD + INTEL REALSENSE (2D POSE)</span>
            </span>
          </div>
        </div>

        {/* Dual Sensor Status Toolbar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {/* Camera Status */}
          <div
            className="medical-card"
            style={{
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                  color: isCameraActive ? "var(--teal-primary)" : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Camera size={18} />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  Optical Sensor Feed
                </div>
                <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "var(--text-main)" }}>
                  {cameraDeviceName}
                </div>
              </div>
            </div>
            {!isCameraActive ? (
              <button
                onClick={() => startCamera()}
                className="btn-primary"
                style={{ fontSize: "0.75rem", padding: "6px 14px" }}
              >
                Enable Camera
              </button>
            ) : (
              <span style={{ fontSize: "0.75rem", color: "var(--green-primary)", fontWeight: 700 }}>
                ✓ Ready
              </span>
            )}
          </div>

          {/* Wii Board Status */}
          <div
            className="medical-card"
            style={{
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: hardwareStatus.isConnected
                ? "var(--bg-subtle-mint)"
                : isSimulated
                ? "#FFFBEB"
                : "#FFFFFF",
              borderColor: hardwareStatus.isConnected
                ? "var(--border-mint)"
                : isSimulated
                ? "#FDE68A"
                : "var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: hardwareStatus.isConnected
                    ? "var(--green-light)"
                    : isSimulated
                    ? "#FEF3C7"
                    : "#F1F5F9",
                  color: hardwareStatus.isConnected
                    ? "var(--green-primary)"
                    : isSimulated
                    ? "#D97706"
                    : "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Scale size={18} />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  Force Plate Telemetry
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: hardwareStatus.isConnected
                      ? "var(--green-primary)"
                      : isSimulated
                      ? "#92400E"
                      : "var(--text-main)",
                  }}
                >
                  {balanceSourceLabel}
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

        {/* Main Instruction Card */}
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
              Wednesday Demo Exercise 2 &bull; Multimodal Biofeedback
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
            Posture + Balance Exercise
          </h1>

          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 20px 0" }}>
            The patient stands comfortably on the Wii Balance Board while the camera captures upper-body coronal and sagittal posture.
            The exercise correlates 2D body skeleton lean with plantar center of pressure weight distribution.
          </p>

          {/* Simple Posture Guidance (Task 3) */}
          <div
            style={{
              padding: "16px 20px",
              background: "#F8FAFC",
              borderRadius: "12px",
              border: "1px solid var(--border-light)",
              marginBottom: "20px",
            }}
          >
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--teal-primary)", marginBottom: "6px" }}>
              Target Postural Alignment States:
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ padding: "4px 10px", borderRadius: "6px", background: "#FFFFFF", border: "1px solid var(--border-light)", fontSize: "0.75rem", fontWeight: 600 }}>
                1. Stand Upright (Neutral)
              </span>
              <span style={{ padding: "4px 10px", borderRadius: "6px", background: "#FFFFFF", border: "1px solid var(--border-light)", fontSize: "0.75rem", fontWeight: 600 }}>
                2. Lean Left &bull; Shift Weight Left
              </span>
              <span style={{ padding: "4px 10px", borderRadius: "6px", background: "#FFFFFF", border: "1px solid var(--border-light)", fontSize: "0.75rem", fontWeight: 600 }}>
                3. Lean Right &bull; Shift Weight Right
              </span>
              <span style={{ padding: "4px 10px", borderRadius: "6px", background: "#FFFFFF", border: "1px solid var(--border-light)", fontSize: "0.75rem", fontWeight: 600 }}>
                4. Center Your Posture
              </span>
            </div>
          </div>

          {/* Safety & Clinical Disclosure Banner */}
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
                Development Biofeedback Protocol
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px", lineHeight: 1.45 }}>
                <em>Development posture feedback — clinical validation pending. Not a clinical diagnosis.</em>
                <br />
                Uses 2D MediaPipe skeleton tracking and live load-cell distribution without requiring final 3D SMPL mesh reconstruction.
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
            <span>START EXERCISE</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ACTIVE EXERCISE (COUNTDOWN OR RUNNING 45s STANCE)
  // =========================================================================
  if (phase === "COUNTDOWN" || phase === "ACTIVE") {
    const isCountdown = phase === "COUNTDOWN";

    return (
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "10px 0 36px 0",
        }}
      >
        {/* Top Header Bar */}
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
            <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", color: "var(--teal-primary)" }}>
              Phase B Wednesday Demo &bull; Posture + Balance Multimodal Stance
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", margin: "2px 0 0 0" }}>
              {isCountdown ? "Get Ready" : "Active Multimodal Posture & Balance"}
            </h2>
          </div>

          {/* Timer & Sensor Indicators */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
              {balanceSourceLabel}
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
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                / {formatTimer(targetDurationSeconds * 1000)}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Multimodal Alignment Biofeedback Banner (Task 5) */}
        <div
          style={{
            padding: "14px 20px",
            borderRadius: "12px",
            background: multimodal.isAligned
              ? "linear-gradient(90deg, #ECFDF5 0%, #D1FAE5 100%)"
              : "#F8FAFC",
            border: `2px solid ${multimodal.isAligned ? "var(--green-primary)" : "var(--border-light)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            transition: "all 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: multimodal.isAligned ? "var(--green-primary)" : "var(--teal-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {multimodal.isAligned ? "✓" : <Compass size={20} />}
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 800,
                  color: multimodal.isAligned ? "var(--green-primary)" : "var(--text-main)",
                }}
              >
                {multimodal.primaryFeedback}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                <span>Camera Posture: <strong>{multimodal.cameraPostureText}</strong></span>
                <span style={{ margin: "0 8px" }}>&bull;</span>
                <span>Wii Balance: <strong>{multimodal.balanceShiftText}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            {multimodal.disclosure}
          </div>
        </div>

        {/* DUAL STAGE VIEW: LEFT = CAMERA + 2D SKELETON | RIGHT = WII BALANCE BOARD */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* LEFT STAGE: Live Camera Feed with 2D Skeleton Overlay (Task 2) */}
          <div
            className="medical-card"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Viewport Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Camera size={16} color="var(--teal-primary)" />
                <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  2D Pose Skeleton Overlay (MediaPipe)
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: posture.isTracking ? "var(--green-primary)" : "#D97706",
                  background: posture.isTracking ? "var(--bg-subtle-mint)" : "#FFFBEB",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  border: `1px solid ${posture.isTracking ? "var(--border-mint)" : "#FDE68A"}`,
                }}
              >
                {posture.isTracking ? "Pose: Tracking (2D Skeleton)" : "Pose: Not detected"}
              </span>
            </div>

            {/* Video + Canvas Viewport */}
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 3",
                borderRadius: "12px",
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
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  pointerEvents: "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />

              {/* Inactive Camera Fallback */}
              {!isCameraActive && (
                <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px" }}>
                  <CameraOff size={36} style={{ margin: "0 auto 8px auto" }} />
                  <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>Camera Stream Inactive</div>
                  <button
                    onClick={() => startCamera()}
                    className="btn-primary"
                    style={{ fontSize: "0.75rem", marginTop: "10px", padding: "6px 14px" }}
                  >
                    Start Camera
                  </button>
                </div>
              )}

              {/* Countdown Overlay */}
              {isCountdown && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(15, 23, 42, 0.75)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    zIndex: 20,
                  }}
                >
                  <div style={{ fontSize: "5rem", fontWeight: 900, color: "var(--teal-primary)", lineHeight: 1 }}>
                    {countdownValue}
                  </div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, marginTop: "8px" }}>
                    Stand ready on the balance board...
                  </div>
                </div>
              )}
            </div>

            {/* Posture Angle Biofeedback Row (Task 3) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <div style={{ padding: "8px 10px", borderRadius: "8px", background: "#F8FAFC", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700 }}>Shoulder Coronal Tilt</div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                  {posture.isTracking ? `${posture.shoulderTiltDeg > 0 ? `+${posture.shoulderTiltDeg}` : posture.shoulderTiltDeg}°` : "--"}
                </div>
              </div>

              <div style={{ padding: "8px 10px", borderRadius: "8px", background: "#F8FAFC", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700 }}>Trunk Sagittal Pitch</div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                  {posture.isTracking ? `${posture.trunkPitchDeg > 0 ? `+${posture.trunkPitchDeg}` : posture.trunkPitchDeg}°` : "--"}
                </div>
              </div>

              <div style={{ padding: "8px 10px", borderRadius: "8px", background: "#F8FAFC", border: "1px solid var(--border-light)" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700 }}>Posture Classification</div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: posture.postureLean === "NEUTRAL" ? "var(--green-primary)" : "#D97706" }}>
                  {posture.isTracking ? posture.postureLean.replace("LEAN_", "") : "NOT DETECTED"}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT STAGE: Wii Balance Board Force Plate & Live Telemetry (Task 4) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Force Plate Chassis Visualization */}
            <div
              className="medical-card"
              style={{
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
              }}
            >
              {/* Anterior Label */}
              <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "var(--teal-primary)", marginBottom: "6px" }}>
                FRONT / ANTERIOR (+Y) ↑
              </div>

              {/* Force Plate Dimensions */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "446 / 238",
                  background: "#FFFFFF",
                  borderRadius: "24px",
                  border: "2px solid #CBD5E1",
                  boxShadow: "0 8px 20px -4px rgba(15, 23, 42, 0.08)",
                  padding: "14px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Surface area */}
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
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      border: "1.5px solid rgba(13, 148, 136, 0.35)",
                      transform: "translate(-50%, -50%)",
                    }}
                  />

                  {/* LIVE COP BALL */}
                  {liveCopX !== null && liveCopY !== null && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${visualCop.xPercent}%`,
                        top: `${visualCop.yPercent}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 6,
                        transition: "left 0.08s ease-out, top 0.08s ease-out",
                      }}
                    >
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: isSimulated ? "#F59E0B" : "var(--teal-primary)",
                          border: "3px solid #FFFFFF",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Posterior Label */}
              <div style={{ fontSize: "0.6875rem", fontWeight: 800, color: "var(--text-muted)", marginTop: "6px" }}>
                ↓ BACK / POSTERIOR (-Y)
              </div>
            </div>

            {/* Numerical Telemetry Metrics Grid (Task 4 & 6) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {/* Total Weight */}
              <div className="medical-card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  Total Weight
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
                  {liveWeight !== null ? `${liveWeight.toFixed(1)} kg` : "--"}
                </div>
              </div>

              {/* Center of Pressure (COP) */}
              <div className="medical-card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  COP (X, Y)
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                  {liveCopX !== null && liveCopY !== null
                    ? `(${liveCopX >= 0 ? `+${liveCopX.toFixed(2)}` : liveCopX.toFixed(2)}, ${liveCopY >= 0 ? `+${liveCopY.toFixed(2)}` : liveCopY.toFixed(2)})`
                    : "--"}
                </div>
              </div>

              {/* Left / Right % */}
              <div className="medical-card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  Left / Right Load
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-secondary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                  {leftPercent !== null && rightPercent !== null
                    ? `${leftPercent.toFixed(1)}% / ${rightPercent.toFixed(1)}%`
                    : "--"}
                </div>
              </div>

              {/* Anterior / Posterior % */}
              <div className="medical-card" style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  Front / Back Load
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-secondary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                  {anteriorPercent !== null && posteriorPercent !== null
                    ? `${anteriorPercent.toFixed(1)}% / ${posteriorPercent.toFixed(1)}%`
                    : "--"}
                </div>
              </div>
            </div>

            {/* Development Simulation Controls (Task 7) */}
            {!hardwareStatus.isConnected && isSimulated && (
              <div
                className="medical-card"
                style={{
                  padding: "12px 16px",
                  background: "#FFFBEB",
                  borderColor: "#FDE68A",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Sliders size={14} color="#D97706" />
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400E" }}>
                      DEV SIMULATION WEIGHT SHIFT
                    </span>
                  </div>
                  <span style={{ fontSize: "0.625rem", color: "#B45309" }}>Shift COP to test multimodal alignment</span>
                </div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => applySimPreset(0.0, 0.0)}
                    className="btn-ghost"
                    style={{ fontSize: "0.6875rem", padding: "3px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
                  >
                    Center
                  </button>
                  <button
                    onClick={() => applySimPreset(-0.40, 0.0)}
                    className="btn-ghost"
                    style={{ fontSize: "0.6875rem", padding: "3px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
                  >
                    Shift Left
                  </button>
                  <button
                    onClick={() => applySimPreset(0.40, 0.0)}
                    className="btn-ghost"
                    style={{ fontSize: "0.6875rem", padding: "3px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
                  >
                    Shift Right
                  </button>
                  <button
                    onClick={() => applySimPreset(0.0, 0.35)}
                    className="btn-ghost"
                    style={{ fontSize: "0.6875rem", padding: "3px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
                  >
                    Shift Forward
                  </button>
                  <button
                    onClick={() => applySimPreset(0.0, -0.35)}
                    className="btn-ghost"
                    style={{ fontSize: "0.6875rem", padding: "3px 8px", background: "#FEF3C7", borderColor: "#FDE68A" }}
                  >
                    Shift Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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
            onClick={handleCompleteExercise}
            className="btn-secondary"
            style={{ fontSize: "0.875rem", padding: "8px 16px" }}
          >
            <span>Finish Protocol Early</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: EXERCISE COMPLETE VIEW
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
        {/* Completion Card */}
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

          <div style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", maxWidth: "520px" }}>
            Multimodal stance protocol completed. Body posture and weight distribution telemetry were captured simultaneously.
          </div>

          {/* Data Source Notice */}
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
                : "Data Source: LIVE WII BALANCE BOARD + OPTICAL TRACKING"}
            </span>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
            {exerciseResult.validationNotice}
          </div>
        </div>

        {/* Metric Summary Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Duration
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {exerciseResult.durationSeconds}s
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Total elapsed active stance time
            </div>
          </div>

          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Multimodal Alignment
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px" }}>
              {exerciseResult.alignmentCompliancePercent}%
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Posture & weight shift agreement
            </div>
          </div>

          <div className="medical-card" style={{ padding: "20px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Telemetry Samples
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {exerciseResult.postureSamplesCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--green-primary)", marginTop: "4px", fontWeight: 700 }}>
              ✓ Real-time Optical & Force Synchronized
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
            onClick={handleRestart}
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
