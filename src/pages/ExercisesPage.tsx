import React from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Award,
  Clock,
  Layers,
  ChevronRight,
  Info,
  Activity,
  Scale,
  Cpu,
} from "lucide-react";
import { RehabilitationScene } from "../components/avatar/RehabilitationScene";
import { AvatarController } from "../components/avatar/AvatarController";
import { MovementState } from "../types/avatar";
import { PatientProfile } from "../types/patient";
import { useExercise } from "../context/ExerciseContext";
import { useVision } from "../context/VisionContext";
import { useBalanceBoard } from "../context/HardwareContext";
import { MultimodalExerciseTelemetry } from "../components/exercise/MultimodalExerciseTelemetry";
import { WeightShiftCopTargetExercise } from "../components/exercise/WeightShiftCopTargetExercise";
import { PostureBalanceMultimodalExercise } from "../components/exercise/PostureBalanceMultimodalExercise";
import { PostureAlignmentExercise } from "../components/exercise/PostureAlignmentExercise";

interface ExercisesPageProps {
  patient?: PatientProfile;
  onBack?: () => void;
}

export const ExercisesPage: React.FC<ExercisesPageProps> = ({ patient, onBack }) => {
  const {
    engineState,
    library,
    telemetryMode,
    selectExercise,
    startCountdown,
    pause,
    resume,
    cancel,
    returnToLibrary,
  } = useExercise();

  const { visionState, isCameraActive, startCamera, getMediaStream } = useVision();
  const {
    status: hardwareStatus,
    reading: hardwareReading,
    isSimulated,
    setIsSimulated,
  } = useBalanceBoard();

  // Helper status labels
  const getCameraStatusLabel = () => {
    switch (visionState.cameraStatus) {
      case "connected":
        return "Active";
      case "starting":
        return "Starting...";
      case "unavailable":
      case "permission-denied":
        return "Unavailable";
      case "error":
        return "Error";
      default:
        return isCameraActive ? "Active" : "Off";
    }
  };

  const getBoardStatusLabel = () => {
    if (hardwareStatus.isConnected) return "Connected";
    if (isSimulated) return "Simulated";
    return "Not Connected";
  };

  const getTelemetryModeLabel = (mode: string) => {
    switch (mode) {
      case "FULL_MULTIMODAL":
        return "FULL MULTIMODAL";
      case "VISION_ONLY":
        return "VISION ONLY";
      case "BALANCE_ONLY":
        return "BALANCE ONLY";
      case "UNASSISTED":
      default:
        return "UNASSISTED";
    }
  };

  // Start exercise handler: ensures camera is initialized if needed, then starts exercise
  const handleStartExercise = async () => {
    if (!isCameraActive && engineState.currentExercise?.sensorRequirements.requiresWebcam) {
      try {
        await startCamera();
      } catch (err) {
        console.warn("[ExercisesPage] Camera start failed, continuing in classified mode:", err);
      }
    }
    startCountdown(patient?.id || "pat-001");
  };

  // Option to mirror live webcam pose onto avatar during active exercise
  const useLivePoseMirroring = true;

  // Compute 3D Avatar movement state based on engine phase and sensory inputs
  const getAvatarMovementState = (): MovementState => {
    const { phase, currentStep } = engineState;

    if (!currentStep) {
      return AvatarController.getTargetMovementState("stand");
    }

    // During active exercise with live camera tracking
    if (
      phase === "ACTIVE" &&
      useLivePoseMirroring &&
      isCameraActive &&
      visionState.hasPose &&
      visionState.pose
    ) {
      return AvatarController.calculateMovementFromPose(visionState.pose);
    }

    // Demonstration posture for current step
    return AvatarController.getTargetMovementState(currentStep.demonstrationPosture);
  };

  const movementState = getAvatarMovementState();

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number): string => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ==========================================
  // PHASE A WEDNESDAY DEMO: BALANCE BOARD ONLY (CAMERA NOT REQUIRED)
  // ==========================================
  if (engineState.currentExercise?.id === "weight-shift-cop-target") {
    return <WeightShiftCopTargetExercise patient={patient} onExit={returnToLibrary} />;
  }

  // ==========================================
  // PHASE B WEDNESDAY DEMO: POSTURE + BALANCE (WII BOARD + INTEL REALSENSE 2D POSE)
  // ==========================================
  if (engineState.currentExercise?.id === "posture-balance-multimodal") {
    return <PostureBalanceMultimodalExercise patient={patient} onExit={returnToLibrary} />;
  }

  // ==========================================
  // PHASE C: CAMERA-ONLY REHABILITATION EXERCISE (WII BOARD NOT REQUIRED)
  // ==========================================
  if (engineState.currentExercise?.id === "posture-alignment") {
    return <PostureAlignmentExercise patient={patient} onExit={returnToLibrary} />;
  }

  // ==========================================
  // VIEW 1: EXERCISE LIBRARY (IDLE)
  // ==========================================
  if (engineState.phase === "IDLE") {
    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          padding: "8px 0 40px 0",
        }}
      >
        {/* Top Header Card */}
        <div
          className="medical-card"
          style={{
            padding: "24px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {onBack && (
              <button
                onClick={onBack}
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
                <span>Home</span>
              </button>
            )}

            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--teal-primary)",
                }}
              >
                Rehabilitation Protocols
              </div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)", margin: "4px 0 0 0" }}>
                Interactive Balance Exercises
              </h1>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                Select a guided exercise to begin real-time biofeedback training with your 3D avatar.
              </p>
            </div>
          </div>

          {/* Hardware, Vision & Telemetry Readiness Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Live Telemetry Mode Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                background: "var(--bg-subtle-mint)",
                border: "1px solid var(--border-mint)",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--teal-primary)",
              }}
            >
              <Activity size={14} />
              <span>{getTelemetryModeLabel(telemetryMode)}</span>
            </div>

            {/* Camera Status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                border: `1px solid ${isCameraActive ? "var(--border-mint)" : "#E2E8F0"}`,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: isCameraActive ? "var(--teal-primary)" : "var(--text-muted)",
              }}
            >
              <Camera size={14} />
              <span>Camera: {getCameraStatusLabel()}</span>
            </div>

            {/* Wii Board Status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                background: hardwareStatus.isConnected
                  ? "var(--bg-subtle-mint)"
                  : isSimulated
                  ? "#FEF3C7"
                  : "#F8FAFC",
                border: `1px solid ${
                  hardwareStatus.isConnected
                    ? "var(--border-mint)"
                    : isSimulated
                    ? "#FDE68A"
                    : "#E2E8F0"
                }`,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: hardwareStatus.isConnected
                  ? "var(--green-primary)"
                  : isSimulated
                  ? "#D97706"
                  : "var(--text-muted)",
              }}
            >
              <Scale size={14} />
              <span>Wii Board: {getBoardStatusLabel()}</span>
            </div>

            {/* Development Simulation Toggle Button */}
            <button
              onClick={() => setIsSimulated(!isSimulated)}
              className={isSimulated ? "btn-secondary" : "btn-ghost"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: isSimulated ? "#FEF3C7" : undefined,
                border: isSimulated ? "1px solid #FDE68A" : "1px solid var(--border-light)",
                color: isSimulated ? "#92400E" : "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Toggle software development simulation of Wii Balance Board"
            >
              <Cpu size={14} color={isSimulated ? "#D97706" : "var(--text-muted)"} />
              <span>Simulation: {isSimulated ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        {/* Development Simulation Active Notice Banner */}
        {isSimulated && (
          <div
            style={{
              padding: "12px 18px",
              background: "#FFFBEB",
              borderRadius: "10px",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#92400E",
              fontSize: "0.8125rem",
              fontWeight: 700,
            }}
          >
            <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
              <span style={{ fontWeight: 400, marginLeft: "8px", color: "#B45309", fontSize: "0.75rem" }}>
                (Simulated balance data active for automated development and interface testing.)
              </span>
            </div>
          </div>
        )}

        {/* Wednesday AIIMS Demo Spotlight Banner */}
        <div
          className="medical-card"
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #F0FDFA 0%, #E6FFFA 100%)",
            border: "2px solid var(--border-teal, #99F6E4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "var(--teal-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Scale size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--teal-primary)",
                    background: "rgba(13, 148, 136, 0.12)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Wednesday Demo Exercise 1 &bull; Board Only
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--green-primary)",
                    background: "#ECFDF5",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: "1px solid #A7F3D0",
                  }}
                >
                  Camera Not Required
                </span>
              </div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "4px 0 2px 0" }}>
                Weight Shift — COP Target
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                Shift body weight to move the Center of Pressure toward displayed safe targets (Center, Left, Right, Front, Back).
              </p>
            </div>
          </div>

          <button
            onClick={() => selectExercise("weight-shift-cop-target")}
            className="btn-primary"
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Play size={16} fill="#FFFFFF" />
            <span>Launch Demo Exercise 1</span>
          </button>
        </div>

        {/* Wednesday AIIMS Demo 2 Spotlight Banner (Phase B: Wii Board + Intel RealSense / Camera 2D Pose) */}
        <div
          className="medical-card"
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #F8FAFC 0%, #F0FDFA 100%)",
            border: "2px solid #CBD5E1",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "var(--teal-primary)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Activity size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--teal-primary)",
                    background: "rgba(13, 148, 136, 0.12)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Wednesday Demo Exercise 2 &bull; Multimodal
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "var(--teal-primary)",
                    background: "var(--bg-subtle-mint)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-mint)",
                  }}
                >
                  Wii Board + Intel RealSense (2D Pose)
                </span>
              </div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "4px 0 2px 0" }}>
                Posture + Balance Exercise
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                Correlates live 2D body skeleton lean (MediaPipe) with plantar Center of Pressure weight distribution.
              </p>
            </div>
          </div>

          <button
            onClick={() => selectExercise("posture-balance-multimodal")}
            className="btn-primary"
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Play size={16} fill="#FFFFFF" />
            <span>Launch Demo Exercise 2</span>
          </button>
        </div>

        {/* Phase C Spotlight Banner: Camera-Only Rehabilitation Exercise (Wii Board NOT Required) */}
        <div
          className="medical-card"
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #F0FDFA 0%, #EFF6FF 100%)",
            border: "2px solid #99F6E4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #0D9488, #2563EB)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                flexShrink: 0,
              }}
            >
              <Camera size={24} />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    backgroundColor: "#CCFBF1",
                    color: "#0F766E",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Phase C Spotlight • Camera Only
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    backgroundColor: "#DBEAFE",
                    color: "#1E40AF",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  Wii Board Not Required
                </span>
              </div>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "4px 0 2px 0" }}>
                Posture Alignment Exercise
              </h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                Interactive MediaPipe 2D optical pose estimation training upright posture alignment, shoulder/hip symmetry, and stability.
              </p>
            </div>
          </div>

          <button
            onClick={() => selectExercise("posture-alignment")}
            className="btn-primary"
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              background: "linear-gradient(135deg, #0D9488 0%, #2563EB 100%)",
            }}
          >
            <Play size={16} fill="#FFFFFF" />
            <span>Launch Camera Exercise</span>
          </button>
        </div>

        {/* Exercise Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: "20px" }}>
          {library.map((exercise) => {
            const getDifficultyColor = (diff: string) => {
              if (diff === "Easy") return "var(--green-primary)";
              if (diff === "Medium") return "#D97706";
              return "var(--purple-doctor)";
            };

            return (
              <div
                key={exercise.id}
                className="medical-card"
                style={{
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease",
                  border: "1px solid var(--border-light)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div>
                  {/* Category and Difficulty row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: "var(--teal-primary)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {exercise.category}
                    </span>
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        color: getDifficultyColor(exercise.difficulty),
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "#F8FAFC",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      {exercise.difficulty}
                    </span>
                  </div>

                  {/* Title & Tagline */}
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)", margin: "0 0 6px 0" }}>
                    {exercise.name}
                  </h3>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 16px 0", lineHeight: 1.45 }}>
                    {exercise.tagline}
                  </p>

                  {/* Duration & Steps Badges */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <Clock size={14} />
                      <span>{exercise.duration}s</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <Layers size={14} />
                      <span>{exercise.steps.length} Steps</span>
                    </div>
                  </div>

                  {/* Telemetry Capability Pill */}
                  <div style={{ marginBottom: "16px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        padding: "4px 8px",
                        borderRadius: "6px",
                        background: "var(--bg-subtle-mint)",
                        color: "var(--teal-primary)",
                      }}
                    >
                      <Activity size={12} />
                      {exercise.sensorRequirements.allowVisionOnlyFallback
                        ? "Vision-only capable (No board needed)"
                        : "Wii Balance Board required"}
                    </span>
                  </div>
                </div>

                {/* Card Action */}
                <button
                  onClick={() => selectExercise(exercise.id)}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px",
                    fontSize: "0.875rem",
                  }}
                >
                  <span>Select Exercise</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: READY / INSTRUCTIONS VIEW
  // ==========================================
  if (engineState.phase === "READY" && engineState.currentExercise) {
    const exercise = engineState.currentExercise;

    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "8px 0 40px 0",
        }}
      >
        {/* Navigation Bar */}
        {/* Navigation Bar & Readiness Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <button
            onClick={returnToLibrary}
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
            <span>Back to Exercises</span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Mode badge */}
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--teal-primary)",
                background: "var(--bg-subtle-mint)",
                padding: "4px 10px",
                borderRadius: "12px",
                border: "1px solid var(--border-mint)",
              }}
            >
              Mode: {getTelemetryModeLabel(telemetryMode)}
            </span>

            {/* Camera Status */}
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: isCameraActive ? "var(--teal-primary)" : "var(--text-muted)",
                background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                padding: "4px 10px",
                borderRadius: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: `1px solid ${isCameraActive ? "var(--border-mint)" : "var(--border-light)"}`,
              }}
            >
              <Camera size={13} />
              <span>Camera: {getCameraStatusLabel()}</span>
            </span>

            {/* Wii Board Status */}
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: hardwareStatus.isConnected
                  ? "var(--green-primary)"
                  : isSimulated
                  ? "#D97706"
                  : "var(--text-muted)",
                background: hardwareStatus.isConnected
                  ? "var(--bg-subtle-mint)"
                  : isSimulated
                  ? "#FEF3C7"
                  : "#F8FAFC",
                padding: "4px 10px",
                borderRadius: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: `1px solid ${
                  hardwareStatus.isConnected
                    ? "var(--border-mint)"
                    : isSimulated
                    ? "#FDE68A"
                    : "var(--border-light)"
                }`,
              }}
            >
              <Scale size={13} />
              <span>Wii Board: {getBoardStatusLabel()}</span>
            </span>

            {/* Simulation toggle */}
            <button
              onClick={() => setIsSimulated(!isSimulated)}
              className={isSimulated ? "btn-secondary" : "btn-ghost"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                background: isSimulated ? "#FEF3C7" : undefined,
                border: isSimulated ? "1px solid #FDE68A" : "1px solid var(--border-light)",
                color: isSimulated ? "#92400E" : "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Toggle software development simulation"
            >
              <Cpu size={13} color={isSimulated ? "#D97706" : "var(--text-muted)"} />
              <span>Simulation: {isSimulated ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        {/* Development Simulation Active Notice Banner */}
        {isSimulated && (
          <div
            style={{
              padding: "12px 18px",
              background: "#FFFBEB",
              borderRadius: "10px",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#92400E",
              fontSize: "0.8125rem",
              fontWeight: 700,
            }}
          >
            <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
              <span style={{ fontWeight: 400, marginLeft: "8px", color: "#B45309", fontSize: "0.75rem" }}>
                (Simulated balance data will be streamed during this exercise.)
              </span>
            </div>
          </div>
        )}

        {/* Telemetry Mode Information Banner */}
        {telemetryMode === "FULL_MULTIMODAL" ? (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "12px",
              background: "var(--bg-subtle-mint)",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "var(--teal-primary)",
            }}
          >
            <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
              <strong>Full Multimodal Telemetry:</strong> Both Computer Vision and Balance Board data streams are active. Optical pose tracking and load-cell equilibrium will be recorded simultaneously.
            </div>
          </div>
        ) : telemetryMode === "VISION_ONLY" ? (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "12px",
              background: "var(--bg-subtle-mint)",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "var(--teal-primary)",
            }}
          >
            <Info size={20} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
              <strong>Vision-only session:</strong> Wii Balance Board is not connected. Postural steadiness and movement will be captured via camera. Balance board metrics will display as "Not available" without fake data.
            </div>
          </div>
        ) : telemetryMode === "BALANCE_ONLY" ? (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "12px",
              background: "#F8FAFC",
              border: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "var(--text-main)",
            }}
          >
            <Scale size={20} color="var(--teal-primary)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
              <strong>Balance-only session:</strong> Camera is off or unavailable. Weight, COP, and load distribution will be recorded from the balance board. Vision metrics will display as "Vision tracking unavailable".
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "12px",
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: "#92400E",
            }}
          >
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.8125rem", lineHeight: 1.4 }}>
              <strong>Unassisted practice session:</strong> Neither camera nor balance board is active. You may practice following the 3D avatar. Performance scores will not be calculated.
            </div>
          </div>
        )}

        {/* Main Stage Grid: 3D Demonstration Avatar + Step Instructions */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "24px", alignItems: "start" }}>
          {/* Left: 3D Avatar Demonstration Stage */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            }}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--teal-primary)" }}>
                3D Demonstration Avatar
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Target Pose: <strong>{movementState.posture}</strong>
              </span>
            </div>

            <div style={{ width: "100%", height: "380px", borderRadius: "12px", overflow: "hidden", background: "#F1F5F9" }}>
              <RehabilitationScene movementState={movementState} />
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "10px", textAlign: "center" }}>
              The 3D avatar demonstrates the target posture. It provides instructional guidance and does not pretend to represent physical load-cell sensors.
            </p>
          </div>

          {/* Right: Step Breakdown & Start Exercise Action */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="medical-card" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 6px 0" }}>
                {exercise.name}
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 16px 0", lineHeight: 1.5 }}>
                {exercise.description}
              </p>

              {/* Steps Timeline */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Protocol Steps ({exercise.steps.length})
                </div>
                {exercise.steps.map((step) => (
                  <div
                    key={step.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "#F8FAFC",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: "var(--teal-primary)",
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: "1px",
                      }}
                    >
                      {step.stepNumber}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                          {step.title}
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {step.durationSeconds}s
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {step.instruction}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartExercise}
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "1rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <Play size={18} />
                <span>Start Exercise</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: ACTIVE EXERCISE (COUNTDOWN / ACTIVE / PAUSED)
  // ==========================================
  if (
    engineState.phase === "COUNTDOWN" ||
    engineState.phase === "ACTIVE" ||
    engineState.phase === "PAUSED"
  ) {
    const exercise = engineState.currentExercise;
    const currentStep = engineState.currentStep;
    const isPaused = engineState.phase === "PAUSED";
    const isCountdown = engineState.phase === "COUNTDOWN";

    return (
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "8px 0 32px 0",
        }}
      >
        {/* Top Exercise Header Bar */}
        <div
          className="medical-card"
          style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--teal-primary)" }}>
              {exercise?.name} &bull; Step {currentStep ? currentStep.stepNumber : 1} of {exercise?.steps.length}
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", margin: "2px 0 0 0" }}>
              {currentStep ? currentStep.title : "Get Ready"}
            </h2>
          </div>

          {/* Telemetry Mode, Sensor Statuses & Step Timer */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--teal-primary)",
                background: "var(--bg-subtle-mint)",
                padding: "4px 8px",
                borderRadius: "8px",
                border: "1px solid var(--border-mint)",
              }}
            >
              Mode: {getTelemetryModeLabel(telemetryMode)}
            </span>

            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: isCameraActive ? "var(--teal-primary)" : "var(--text-muted)",
                background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                padding: "4px 8px",
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                border: `1px solid ${isCameraActive ? "var(--border-mint)" : "var(--border-light)"}`,
              }}
            >
              <Camera size={12} />
              <span>Camera: {getCameraStatusLabel()}</span>
            </span>

            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: hardwareStatus.isConnected
                  ? "var(--green-primary)"
                  : isSimulated
                  ? "#D97706"
                  : "var(--text-muted)",
                background: hardwareStatus.isConnected
                  ? "var(--bg-subtle-mint)"
                  : isSimulated
                  ? "#FEF3C7"
                  : "#F8FAFC",
                padding: "4px 8px",
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                border: `1px solid ${
                  hardwareStatus.isConnected
                    ? "var(--border-mint)"
                    : isSimulated
                    ? "#FDE68A"
                    : "var(--border-light)"
                }`,
              }}
            >
              <Scale size={12} />
              <span>Wii Board: {getBoardStatusLabel()}</span>
            </span>

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
                  color: engineState.stepTimeRemaining <= 3 ? "#D97706" : "var(--text-main)",
                }}
              >
                {formatTime(engineState.stepTimeRemaining)}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                / {formatTime(exercise?.duration || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Development Simulation Active Notice Banner */}
        {isSimulated && (
          <div
            style={{
              padding: "10px 16px",
              background: "#FFFBEB",
              borderRadius: "10px",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#92400E",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
            <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
          </div>
        )}

        {/* Center Stage: Large 3D Avatar */}
        <div
          className="medical-card"
          style={{
            padding: "16px",
            position: "relative",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            overflow: "hidden",
          }}
        >
          {/* Avatar Canvas */}
          <div style={{ height: "420px", width: "100%", borderRadius: "12px", overflow: "hidden", background: "#F1F5F9" }}>
            <RehabilitationScene movementState={movementState} />
          </div>

          {/* Countdown Overlay */}
          {isCountdown && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(255, 255, 255, 0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              <div
                style={{
                  fontSize: "5.5rem",
                  fontWeight: 900,
                  color: "var(--teal-primary)",
                  lineHeight: 1,
                }}
              >
                {engineState.countdownValue}
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-secondary)", marginTop: "8px" }}>
                Stand ready...
              </div>
            </div>
          )}

          {/* Paused Overlay */}
          {isPaused && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(255, 255, 255, 0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                gap: "16px",
              }}
            >
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)" }}>Exercise Paused</div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
                Take a moment to rest. Click Resume when you are ready to continue.
              </p>
              <button
                onClick={resume}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px" }}
              >
                <Play size={18} />
                <span>Resume Exercise</span>
              </button>
            </div>
          )}

          {/* Real-time Biofeedback Banner Below Avatar */}
          <div
            style={{
              marginTop: "14px",
              padding: "14px 20px",
              borderRadius: "10px",
              background: !isCameraActive
                ? "#F8FAFC"
                : engineState.feedback.isCompliant
                ? "var(--bg-subtle-mint)"
                : "#FFFBEB",
              border: `1px solid ${
                !isCameraActive
                  ? "var(--border-light)"
                  : engineState.feedback.isCompliant
                  ? "var(--border-mint)"
                  : "#FDE68A"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {!isCameraActive ? (
                <Info size={22} color="var(--text-muted)" />
              ) : engineState.feedback.isCompliant ? (
                <CheckCircle2 size={22} color="var(--teal-primary)" />
              ) : (
                <AlertTriangle size={22} color="#D97706" />
              )}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                  Real-Time Biofeedback
                </div>
                <div
                  style={{
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: !isCameraActive
                      ? "var(--text-secondary)"
                      : engineState.feedback.isCompliant
                      ? "var(--text-main)"
                      : "#92400E",
                  }}
                >
                  {!isCameraActive ? "Camera inactive — Biofeedback tracking unavailable" : engineState.feedback.message}
                </div>
              </div>
            </div>

            {/* Live Camera Pose Tracking Pill */}
            {isCameraActive && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: visionState.hasPose ? "var(--green-primary)" : "#94A3B8",
                  }}
                />
                <span>Vision Tracking</span>
              </div>
            )}
          </div>
        </div>

        {/* Multimodal Telemetry Panel: Live Wii Balance Board & Optical Camera Feeds (Phase 6) */}
        <MultimodalExerciseTelemetry
          reading={hardwareReading}
          boardConnected={hardwareStatus.isConnected}
          isSimulated={isSimulated}
          cameraActive={isCameraActive}
          cameraStatus={visionState.cameraStatus}
          visionState={visionState}
          videoStream={getMediaStream()}
          showCameraPreview={true}
        />

        {/* Bottom Control Bar: Progress, Timer, Pause & Cancel Actions */}
        <div
          className="medical-card"
          style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          {/* Progress Bar Container */}
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px" }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Overall Exercise Progress</span>
              <span style={{ fontWeight: 700, color: "var(--teal-primary)", fontFamily: "var(--font-mono)" }}>
                {engineState.progressPercent}%
              </span>
            </div>
            <div style={{ height: "8px", background: "#E2E8F0", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${engineState.progressPercent}%`,
                  background: "var(--teal-primary)",
                  borderRadius: "4px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!isPaused ? (
              <button
                onClick={pause}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "0.875rem" }}
              >
                <Pause size={16} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={resume}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "0.875rem" }}
              >
                <Play size={16} />
                <span>Resume</span>
              </button>
            )}

            <button
              onClick={cancel}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 14px",
                fontSize: "0.875rem",
                color: "var(--text-muted)",
              }}
            >
              <span>Exit</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: RESULT SCREEN (COMPLETED)
  // ==========================================
  if (engineState.phase === "COMPLETED" && engineState.sessionResult) {
    const result = engineState.sessionResult;
    const sessionMode = result.sensorsUsed.sessionMode;

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
        {/* Top Completion Trophy Card */}
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
            <Award size={36} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--teal-primary)",
                background: "var(--bg-subtle-mint)",
                padding: "3px 10px",
                borderRadius: "12px",
                border: "1px solid var(--border-mint)",
              }}
            >
              Mode: {getTelemetryModeLabel(sessionMode)}
            </span>
          </div>

          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
            {result.exerciseName} Complete ✓
          </h1>

          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", margin: 0, maxWidth: "520px" }}>
            {result.feedbackSummary}
          </p>

          {/* Development Simulation Banner */}
          {result.sensorsUsed.isSimulated && (
            <div
              style={{
                padding: "10px 18px",
                background: "#FFFBEB",
                borderRadius: "10px",
                border: "1px solid #FDE68A",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#92400E",
                fontSize: "0.8125rem",
                fontWeight: 700,
              }}
            >
              <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
              <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
            </div>
          )}

          {/* Performance Metric Section (NOT Clinical Score) */}
          <div
            style={{
              marginTop: "16px",
              padding: "20px 32px",
              background: "#F8FAFC",
              borderRadius: "16px",
              border: "1px solid var(--border-light)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              minWidth: "320px",
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Exercise Performance Metric
            </div>

            {result.overallScore !== null ? (
              <div style={{ fontSize: "3rem", fontWeight: 900, color: "var(--teal-primary)", lineHeight: 1 }}>
                {result.overallScore}{" "}
                <span style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text-muted)" }}>/ 100</span>
              </div>
            ) : (
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-muted)", lineHeight: 1.2 }}>
                Not available
              </div>
            )}

            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center" }}>
              {result.overallScore !== null
                ? "Calculated strictly from measured exercise sensor telemetry."
                : "No sensor telemetry captured during this session. Score omitted to maintain scientific data integrity."}
            </div>
          </div>
        </div>

        {/* Metric Breakdown Grid (4 Cards) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
          {/* 1. Duration */}
          <div className="medical-card" style={{ padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Duration</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {result.durationSeconds} sec
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--green-primary)", marginTop: "4px", fontWeight: 600 }}>
              ✓ Completed Protocol
            </div>
          </div>

          {/* 2. Posture Steadiness */}
          <div className="medical-card" style={{ padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Posture Tracking</div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: result.postureCompliancePercent !== null ? "var(--text-main)" : "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {result.postureCompliancePercent !== null ? `${result.postureCompliancePercent}%` : "--"}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              {result.postureCompliancePercent !== null
                ? "Good Posture Alignment"
                : result.unmeasuredReasons.posture || "Camera inactive / unavailable"}
            </div>
          </div>

          {/* 3. Eye State Compliance */}
          <div className="medical-card" style={{ padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Eye Instructions</div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: result.eyeCompliancePercent !== null ? "var(--text-main)" : "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {result.eyeCompliancePercent !== null ? `${result.eyeCompliancePercent}%` : "--"}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              {result.eyeCompliancePercent !== null
                ? "Instructions Completed"
                : result.unmeasuredReasons.eyes || "Not available"}
            </div>
          </div>

          {/* 4. Wii Balance Board */}
          <div className="medical-card" style={{ padding: "18px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>Balance Board Data</div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: result.balanceStabilityPercent !== null ? "var(--text-main)" : "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {result.balanceStabilityPercent !== null ? `${result.balanceStabilityPercent}%` : "--"}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              {result.balanceStabilityPercent !== null
                ? result.sensorsUsed.isSimulated
                  ? "Simulation Stability"
                  : "Force Plate Equilibrium"
                : result.unmeasuredReasons.balance || "Wii Balance Board not connected."}
            </div>
          </div>
        </div>

        {/* Data Integrity Standard Box */}
        <div
          style={{
            padding: "14px 18px",
            background: "#F8FAFC",
            borderRadius: "10px",
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.45,
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong>Scientific Data Integrity:</strong> This prototype strictly distinguishes between measured data,
            calculated metrics, and unavailable data. Unavailable metrics are presented as "--" or "Not available" rather
            than defaulting to 0% or fabricating placeholder scores.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "14px" }}>
          <button
            onClick={returnToLibrary}
            className="btn-primary"
            style={{
              flex: 1,
              padding: "12px",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>Continue to Exercises</span>
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => selectExercise(result.exerciseId)}
            className="btn-secondary"
            style={{
              padding: "12px 20px",
              fontSize: "0.9375rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <RotateCcw size={16} />
            <span>Repeat</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
