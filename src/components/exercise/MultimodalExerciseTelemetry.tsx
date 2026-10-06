import React from "react";
import { Camera, Scale, AlertTriangle } from "lucide-react";
import { BalanceBoardReading } from "../../types/hardware";
import { VisionState } from "../../types/vision";
import { mapCopToBoard } from "../../utils/copMapping";

interface MultimodalExerciseTelemetryProps {
  reading: BalanceBoardReading | null;
  boardConnected: boolean;
  isSimulated: boolean;
  cameraActive: boolean;
  cameraStatus: string;
  visionState: VisionState;
  videoStream: MediaStream | null;
  showCameraPreview?: boolean;
}

export const MultimodalExerciseTelemetry: React.FC<MultimodalExerciseTelemetryProps> = ({
  reading,
  boardConnected,
  isSimulated,
  cameraActive,
  cameraStatus,
  visionState,
  videoStream,
  showCameraPreview = true,
}) => {
  const hasBoardData = Boolean(reading && (boardConnected || isSimulated));

  // Center of Pressure mapping using existing Phase 2 scientific coordinate mapping
  const copCoords = hasBoardData && reading ? mapCopToBoard(reading.copX, reading.copY) : null;

  // Video stream reference for optional compact camera preview in exercise
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (previewVideoRef.current && videoStream && cameraActive) {
      if (previewVideoRef.current.srcObject !== videoStream) {
        previewVideoRef.current.srcObject = videoStream;
        previewVideoRef.current.play().catch(() => {});
      }
    }
  }, [videoStream, cameraActive]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
        marginTop: "16px",
      }}
    >
      {/* ============================================================ */}
      {/* 1. BALANCE SENSOR TELEMETRY (Wii Balance Board / Simulation)  */}
      {/* ============================================================ */}
      <div
        className="medical-card"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          border: isSimulated ? "1px solid #FDE68A" : undefined,
          background: isSimulated ? "#FFFDF5" : "#FFFFFF",
        }}
      >
        {/* Card Header & Sensor Status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Scale size={16} color="var(--teal-primary)" />
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
              Wii Balance Board Telemetry
            </span>
          </div>

          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "10px",
              background: boardConnected
                ? "var(--bg-subtle-mint)"
                : isSimulated
                ? "#FEF3C7"
                : "#F1F5F9",
              color: boardConnected
                ? "var(--green-primary)"
                : isSimulated
                ? "#D97706"
                : "var(--text-muted)",
              border: `1px solid ${
                boardConnected
                  ? "var(--border-mint)"
                  : isSimulated
                  ? "#FDE68A"
                  : "var(--border-light)"
              }`,
            }}
          >
            {boardConnected ? "● CONNECTED" : isSimulated ? "● SIMULATED" : "○ NOT CONNECTED"}
          </span>
        </div>

        {/* Development Simulation Alert Banner */}
        {isSimulated && (
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "#92400E",
              background: "#FEF3C7",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid #FDE68A",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertTriangle size={12} color="#D97706" />
            <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
          </div>
        )}

        {/* Live Balance Data vs Missing Sensor Standard */}
        {hasBoardData && reading ? (
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {/* Numerical Readout Grid */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Total Weight</span>
                <span style={{ fontWeight: 800, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                  {reading.totalWeight.toFixed(1)} kg
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Left / Right</span>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                  {reading.leftPercent.toFixed(1)}% / {reading.rightPercent.toFixed(1)}%
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Ant / Post</span>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                  {(reading.frontPercent ?? reading.anteriorPercent).toFixed(1)}% /{" "}
                  {(reading.backPercent ?? reading.posteriorPercent).toFixed(1)}%
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>COP (X, Y)</span>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--teal-primary)" }}>
                  {reading.copX >= 0 ? `+${reading.copX.toFixed(2)}` : reading.copX.toFixed(2)},{" "}
                  {reading.copY >= 0 ? `+${reading.copY.toFixed(2)}` : reading.copY.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Mini COP Ball Force Plate Viewport */}
            <div
              style={{
                width: "92px",
                height: "92px",
                borderRadius: "10px",
                background: "#0F172A",
                border: "1px solid #334155",
                position: "relative",
                flexShrink: 0,
                overflow: "hidden",
              }}
              title="Mini Force Plate Center of Pressure (COP)"
            >
              {/* Crosshairs */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: "1px",
                  background: "rgba(255, 255, 255, 0.15)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  right: 0,
                  height: "1px",
                  background: "rgba(255, 255, 255, 0.15)",
                }}
              />

              {/* Quadrant hints */}
              <span style={{ position: "absolute", top: 3, left: 4, fontSize: "8px", color: "#64748B", fontWeight: 700 }}>
                FL
              </span>
              <span style={{ position: "absolute", top: 3, right: 4, fontSize: "8px", color: "#64748B", fontWeight: 700 }}>
                FR
              </span>
              <span style={{ position: "absolute", bottom: 3, left: 4, fontSize: "8px", color: "#64748B", fontWeight: 700 }}>
                BL
              </span>
              <span style={{ position: "absolute", bottom: 3, right: 4, fontSize: "8px", color: "#64748B", fontWeight: 700 }}>
                BR
              </span>

              {/* Dynamic Live COP Ball */}
              {copCoords && (
                <div
                  style={{
                    position: "absolute",
                    left: `${copCoords.xPercent}%`,
                    top: `${copCoords.yPercent}%`,
                    transform: "translate(-50%, -50%)",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: isSimulated ? "#F59E0B" : "var(--teal-primary)",
                    boxShadow: isSimulated
                      ? "0 0 10px rgba(245, 158, 11, 0.8)"
                      : "0 0 10px rgba(13, 148, 136, 0.8)",
                    border: "2px solid #FFFFFF",
                    transition: "left 0.08s ease-out, top 0.08s ease-out",
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          /* Scientific Data Integrity Fallback for Missing Sensor */
          <div
            style={{
              padding: "16px 14px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px dashed var(--border-light)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Total Weight:</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-muted)" }}>--</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)" }}>COP Trajectory:</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-muted)" }}>--</span>
            </div>
            <div
              style={{
                marginTop: "4px",
                padding: "6px 10px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#991B1B",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>Balance sensor unavailable</span>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 2. OPTICAL & VISION TELEMETRY (Camera / MediaPipe Pose)       */}
      {/* ============================================================ */}
      <div
        className="medical-card"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Card Header & Vision Status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Camera size={16} color="var(--teal-primary)" />
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
              Computer Vision Telemetry
            </span>
          </div>

          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "10px",
              background: cameraActive
                ? "var(--bg-subtle-mint)"
                : cameraStatus === "starting"
                ? "#FEF3C7"
                : "#F1F5F9",
              color: cameraActive
                ? "var(--green-primary)"
                : cameraStatus === "starting"
                ? "#D97706"
                : "var(--text-muted)",
              border: `1px solid ${
                cameraActive
                  ? "var(--border-mint)"
                  : cameraStatus === "starting"
                  ? "#FDE68A"
                  : "var(--border-light)"
              }`,
            }}
          >
            {cameraActive
              ? "● ACTIVE"
              : cameraStatus === "starting"
              ? "● STARTING..."
              : "○ CAMERA OFF"}
          </span>
        </div>

        {/* Live Vision Metrics vs Missing Vision Standard */}
        {cameraActive ? (
          <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {/* Numerical Vision Readouts */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Pose Tracking</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: visionState.hasPose ? "var(--green-primary)" : "#D97706",
                  }}
                >
                  {visionState.hasPose ? "✓ Detected (Active)" : "Locating Person..."}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Posture Alignment</span>
                <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                  {visionState.pose
                    ? visionState.pose.postureLean === "NEUTRAL"
                      ? "Centered (Neutral)"
                      : visionState.pose.postureLean === "LEAN_LEFT"
                      ? "Leaning Left"
                      : visionState.pose.postureLean === "LEAN_RIGHT"
                      ? "Leaning Right"
                      : "Forward Extension"
                    : "--"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>EAR / Eye State</span>
                <span style={{ fontWeight: 700, color: "var(--text-main)" }}>
                  {visionState.face?.hasFace
                    ? `${visionState.face.overallEyeState === "EYES CLOSED" ? "Closed" : "Open"} (EAR: ${visionState.face.averageEAR.toFixed(2)})`
                    : "Not in view"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  padding: "4px 8px",
                  background: "#F8FAFC",
                  borderRadius: "6px",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Frame Rate / Res</span>
                <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {visionState.fps > 0 ? `${visionState.fps} FPS` : "--"} &bull; {visionState.activeResolution || "--"}
                </span>
              </div>
            </div>

            {/* Compact Webcam Feed Preview */}
            {showCameraPreview && (
              <div
                style={{
                  width: "110px",
                  height: "92px",
                  borderRadius: "10px",
                  background: "#0F172A",
                  border: "1px solid #334155",
                  position: "relative",
                  flexShrink: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <video
                  ref={previewVideoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: visionState.isMirrored ? "scaleX(-1)" : "none",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: 3,
                    right: 4,
                    fontSize: "8px",
                    color: "#FFFFFF",
                    background: "rgba(0, 0, 0, 0.6)",
                    padding: "1px 4px",
                    borderRadius: "4px",
                    fontWeight: 700,
                  }}
                >
                  LIVE
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Scientific Data Integrity Fallback for Missing Vision */
          <div
            style={{
              padding: "16px 14px",
              background: "#F8FAFC",
              borderRadius: "8px",
              border: "1px dashed var(--border-light)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Pose Tracking:</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-muted)" }}>
                Vision tracking unavailable
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Posture Alignment:</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-muted)" }}>--</span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
              <em>Vision data unavailable. Camera is currently off or denied permission.</em>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
