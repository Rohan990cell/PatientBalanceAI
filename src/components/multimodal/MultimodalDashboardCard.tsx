/**
 * MultimodalDashboardCard Component
 * Phase 5: Multimodal Integration (Wii Balance Board + Camera Pose + SMPL + COP)
 *
 * Real-time clinical telemetry panel presenting independent hardware (Wii Board)
 * and vision (MediaPipe) streams with rigorous safety and data integrity guarantees.
 *
 * INVARIANTS:
 * - When hardware is unavailable, balance fields display strictly "--".
 * - When camera is unavailable, vision fields display "--" / "Standby".
 * - Development simulation is prominently labeled with amber alert warning.
 */

import React from "react";
import {
  Scale,
  Camera,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Compass,
} from "lucide-react";
import { Card } from "../common/Card";
import {
  MultimodalTelemetryState,
  formatMultimodalWeight,
  formatMultimodalCOP,
  formatMultimodalPercent,
  DEVELOPMENT_SIMULATION_LABEL,
} from "../../types/multimodal";

interface MultimodalDashboardCardProps {
  telemetry: MultimodalTelemetryState;
}

export const MultimodalDashboardCard: React.FC<MultimodalDashboardCardProps> = ({
  telemetry,
}) => {
  const { mode, hardware, vision, simulationWarning } = telemetry;

  const modeBadgeColor = {
    FULL_MULTIMODAL: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
    VISION_ONLY: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
    BALANCE_ONLY: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" },
    UNASSISTED: { bg: "#F1F5F9", border: "#CBD5E1", text: "#475569" },
  }[mode];

  return (
    <Card
      title="Multimodal Telemetry & Coexistence"
      subtitle="Synchronized dual-stream biomechanical & postural assessment"
      headerAction={
        <span
          style={{
            background: modeBadgeColor.bg,
            border: `1px solid ${modeBadgeColor.border}`,
            color: modeBadgeColor.text,
            padding: "3px 10px",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.025em",
          }}
        >
          {mode.replace("_", " ")}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Simulation Warning Banner (MANDATORY when simulation is active) */}
        {(simulationWarning || hardware.isSimulated) && (
          <div
            style={{
              background: "#FFFBEB",
              border: "1px solid #F59E0B",
              borderRadius: "8px",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#92400E",
            }}
          >
            <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <div>{DEVELOPMENT_SIMULATION_LABEL}</div>
              <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "#B45309", marginTop: "2px" }}>
                Balance telemetry is synthetically generated for UI development. Not measured from real patient force sensors.
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Sensor Status Overview */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          {/* Wii Hardware Status */}
          <div
            style={{
              background: hardware.boardConnected ? "#F0FDF4" : hardware.isSimulated ? "#FFFBEB" : "#F8FAFC",
              border: `1px solid ${hardware.boardConnected ? "#BBF7D0" : hardware.isSimulated ? "#FDE68A" : "#E2E8F0"}`,
              borderRadius: "10px",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem", fontWeight: 700, color: "#0F172A" }}>
                <Scale size={16} color="#0D9488" />
                <span>Wii Balance Board</span>
              </div>
              {hardware.boardConnected ? (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 600, color: "#15803D" }}>
                  <CheckCircle2 size={13} /> Connected
                </span>
              ) : hardware.isSimulated ? (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#B45309" }}>
                  Simulated
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>
                  <XCircle size={13} /> Not Connected
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
              Data Source:{" "}
              <strong style={{ color: "#334155" }}>
                {hardware.dataSource === "REAL_HARDWARE"
                  ? "RVL-WBC-01 (100 Hz HID)"
                  : hardware.dataSource === "SIMULATION"
                  ? "Dev Simulation"
                  : "Unavailable"}
              </strong>
            </div>
          </div>

          {/* Camera Status */}
          <div
            style={{
              background: vision.cameraConnected ? "#F0FDF4" : "#F8FAFC",
              border: `1px solid ${vision.cameraConnected ? "#BBF7D0" : "#E2E8F0"}`,
              borderRadius: "10px",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8125rem", fontWeight: 700, color: "#0F172A" }}>
                <Camera size={16} color="#0D9488" />
                <span>Vision Camera</span>
              </div>
              {vision.cameraConnected ? (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 600, color: "#15803D" }}>
                  <CheckCircle2 size={13} /> Active
                </span>
              ) : (
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>
                  Off / Standby
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
              Status:{" "}
              <strong style={{ color: "#334155" }}>
                {vision.cameraConnected
                  ? `Streaming (${Math.round(vision.fps)} FPS)`
                  : vision.cameraStatus === "unavailable"
                  ? "Unavailable"
                  : "Off"}
              </strong>
            </div>
          </div>
        </div>

        {/* Section 2: Detailed Stream Matrices */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          {/* BALANCE METRICS */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#0D9488",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Scale size={13} />
              <span>Balance & COP Telemetry</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Total Weight:</span>
                <strong style={{ color: hardware.sensorDataAvailable ? "#0F172A" : "#94A3B8" }}>
                  {formatMultimodalWeight(hardware.totalWeight)}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Left / Right Distribution:</span>
                <strong style={{ color: hardware.sensorDataAvailable ? "#0F172A" : "#94A3B8" }}>
                  {hardware.sensorDataAvailable
                    ? `${formatMultimodalPercent(hardware.leftPercent)} / ${formatMultimodalPercent(hardware.rightPercent)}`
                    : "--"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Anterior / Posterior:</span>
                <strong style={{ color: hardware.sensorDataAvailable ? "#0F172A" : "#94A3B8" }}>
                  {hardware.sensorDataAvailable
                    ? `${formatMultimodalPercent(hardware.anteriorPercent)} / ${formatMultimodalPercent(hardware.posteriorPercent)}`
                    : "--"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>COP X (Lateral):</span>
                <strong style={{ color: hardware.sensorDataAvailable ? "#0F172A" : "#94A3B8" }}>
                  {formatMultimodalCOP(hardware.copX)}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>COP Y (Sagittal):</span>
                <strong style={{ color: hardware.sensorDataAvailable ? "#0F172A" : "#94A3B8" }}>
                  {formatMultimodalCOP(hardware.copY)}
                </strong>
              </div>
            </div>
          </div>

          {/* VISION METRICS */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "10px",
              padding: "14px",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#0D9488",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Activity size={13} />
              <span>Vision & Pose Telemetry</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Pose Tracking:</span>
                <strong style={{ color: vision.poseAvailable ? "#15803D" : "#94A3B8" }}>
                  {vision.poseAvailable ? "Detected (33 Landmarks)" : "--"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Pose Confidence:</span>
                <strong style={{ color: vision.poseConfidence !== null ? "#0F172A" : "#94A3B8" }}>
                  {vision.poseConfidence !== null
                    ? `${Math.round(vision.poseConfidence * 100)}%`
                    : "--"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>SMPL Pose State:</span>
                <strong style={{ color: vision.isSMPLPoseActive ? "#0D9488" : "#94A3B8" }}>
                  {vision.isSMPLPoseActive
                    ? "Camera-Driven (24 Joints)"
                    : "Neutral Anatomical Fallback"}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", paddingBottom: "4px" }}>
                <span style={{ color: "#64748B" }}>Sensor Independence:</span>
                <strong style={{ color: "#0F172A" }}>
                  Rigid Separation
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748B" }}>Visual Binding:</span>
                <strong style={{ color: "#334155" }}>
                  Surface Plane (y = 0.041m)
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Synchronization Quality Footer */}
        <div
          style={{
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "0.75rem",
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Compass size={14} color="#0D9488" />
            <span>
              Clinical Alignment: <strong>+X Right, -X Left, +Y Front, -Y Back</strong>
            </span>
          </div>
          <div>
            Sync Status:{" "}
            <strong style={{ color: telemetry.synchronization.isSynchronized ? "#15803D" : "#64748B" }}>
              {telemetry.synchronization.isSynchronized
                ? `Active Sync (Skew: ${telemetry.synchronization.timeSkewMs ?? 0}ms)`
                : "Single Stream / Standby"}
            </strong>
          </div>
        </div>
      </div>
    </Card>
  );
};
