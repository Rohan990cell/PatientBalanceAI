import React, { useMemo, useState } from "react";
import { Bluetooth, Scale, Info, AlertCircle, Compass, LineChart, Box } from "lucide-react";
import { Card } from "../components/common/Card";
import { StatusBadge } from "../components/common/StatusBadge";
import { useBalanceBoard } from "../context/HardwareContext";
import { VisualBalanceBoard } from "../components/balance/VisualBalanceBoard";
import { BalanceMetricTiles } from "../components/balance/BalanceMetricTiles";
import { DevSimulationControls } from "../components/balance/DevSimulationControls";
import { RealtimeBalanceGraph } from "../components/balance/RealtimeBalanceGraph";
import { generateSimulatedMeasurement } from "../utils/copMapping";
import { useBalanceTimeSeries } from "../hooks/useBalanceTimeSeries";
import { useBalanceSessionRecorder } from "../hooks/useBalanceSessionRecorder";
import { SessionControlsCard } from "../components/balance/SessionControlsCard";
import { SessionSummaryCard } from "../components/balance/SessionSummaryCard";
import { PatientProfile } from "../types/patient";
import {
  useMultimodalTelemetry,
  MultimodalScene3D,
  MultimodalDashboardCard,
} from "../components/multimodal";

interface BodyBalancePageProps {
  patient?: PatientProfile;
}

export const BodyBalancePage: React.FC<BodyBalancePageProps> = ({ patient }) => {
  const { status, reading: liveReading, tare } = useBalanceBoard();

  const activePatient = patient ?? {
    id: "pat-001",
    medicalRecordNumber: "MRN-2026-0841",
    fullName: "Eleanor Vance",
    age: 58,
    gender: "Female" as const,
    heightCm: 165,
    baselineWeightKg: 64.2,
    conditionDiagnosis: "Vestibular Neuritis / Balance Rehabilitation",
    rehabilitationGoal: "Romberg Equilibrium & Unassisted Stance",
    assignedDoctor: "Dr. Rachel Sullivan, MD",
    lastSessionDate: "2026-09-26",
  };

  // Development Simulation State
  const [isSimulated, setIsSimulated] = useState(false);
  const [simCopX, setSimCopX] = useState(0.0);
  const [simCopY, setSimCopY] = useState(0.0);
  const [simTotalWeight, setSimTotalWeight] = useState(70.0);

  // Compute active reading: prefer live hardware data; if simulation is active, use simulated
  const activeReading = useMemo(() => {
    if (isSimulated) {
      return generateSimulatedMeasurement(simCopX, simCopY, simTotalWeight);
    }
    return liveReading;
  }, [isSimulated, simCopX, simCopY, simTotalWeight, liveReading]);

  // Rolling Time-Series Buffer for Real-Time Graphs (Phase 3)
  const isDataActive = status.isConnected || isSimulated;
  const { points, clearHistory, windowDurationMs } = useBalanceTimeSeries({
    reading: activeReading,
    isActive: isDataActive,
    isSimulated,
  });

  // Balance Session Recorder (Phase 4)
  const {
    state: sessionState,
    durationFormatted,
    sampleCount,
    disconnectError,
    completedSession,
    isSaving,
    savedFilePath,
    saveError,
    isVerified,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    saveSession,
    resetSession,
  } = useBalanceSessionRecorder({
    reading: activeReading,
    isConnected: status.isConnected,
    isSimulated,
    patientId: activePatient.id,
    patientName: activePatient.fullName,
  });

  // Multimodal Unified Pipeline (Phase 5)
  const multimodal = useMultimodalTelemetry();
  const [viewMode, setViewMode] = useState<"multimodal-3d" | "force-plate-2d">("multimodal-3d");

  return (
    <div
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      {/* 1. Header Banner */}
      <div
        className="medical-card-mint"
        style={{
          padding: "24px",
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
              background: "#FFFFFF",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--teal-primary)",
            }}
          >
            <Compass size={24} />
          </div>

          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)" }}>
              Body Measurement & Balance
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "3px" }}>
              Real-time Nintendo Wii Balance Board Center of Pressure (COP) and weight distribution.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusBadge
            status={isSimulated ? "ready" : status.isConnected ? "connected" : "disconnected"}
            label={
              isSimulated
                ? "Dev Simulation"
                : status.isConnected
                ? "Board Live"
                : "Not Connected"
            }
          />

          {status.isConnected && !isSimulated && (
            <button
              onClick={tare}
              className="btn-secondary"
              style={{ fontSize: "0.8125rem", padding: "6px 14px" }}
            >
              <Scale size={14} />
              <span>Zero Tare</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Disconnected Notice (when not simulated and not connected) */}
      {!status.isConnected && !isSimulated && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Wii Balance Board not connected.</strong> Showing neutral center placeholder.
              Connect your board in Hardware Status or use the <strong>Development Simulation</strong> controls below to test.
            </span>
          </div>

          <button
            onClick={() => setIsSimulated(true)}
            className="btn-primary"
            style={{
              padding: "4px 12px",
              fontSize: "0.75rem",
              background: "#D97706",
              borderColor: "#D97706",
            }}
          >
            Enable Dev Simulation
          </button>
        </div>
      )}

      {/* 2. Session Recorder Controls (Phase 4) */}
      <SessionControlsCard
        state={sessionState}
        durationFormatted={durationFormatted}
        sampleCount={sampleCount}
        isConnected={status.isConnected}
        isSimulated={isSimulated}
        patient={activePatient}
        disconnectError={disconnectError}
        isSaving={isSaving}
        savedFilePath={savedFilePath}
        saveError={saveError}
        isVerified={isVerified}
        onStart={startSession}
        onPause={pauseSession}
        onResume={resumeSession}
        onStop={stopSession}
        onSave={saveSession}
        onReset={resetSession}
      />

      {/* 3. Session Summary Card (Shown when COMPLETED) */}
      {sessionState === "COMPLETED" && completedSession && (
        <SessionSummaryCard
          session={completedSession}
          isSaving={isSaving}
          savedFilePath={savedFilePath}
          saveError={saveError}
          isVerified={isVerified}
          onSave={saveSession}
          onReset={resetSession}
        />
      )}

      {/* 3b. Multimodal Visualization Mode Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setViewMode("multimodal-3d")}
            style={{
              padding: "8px 16px",
              borderRadius: "10px",
              border: viewMode === "multimodal-3d" ? "1px solid #0D9488" : "1px solid #E2E8F0",
              background: viewMode === "multimodal-3d" ? "#F0FDF4" : "#FFFFFF",
              color: viewMode === "multimodal-3d" ? "#0F766E" : "#64748B",
              fontWeight: 700,
              fontSize: "0.8125rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: viewMode === "multimodal-3d" ? "0 1px 3px rgba(13, 148, 136, 0.15)" : "none",
            }}
          >
            <Box size={16} />
            <span>3D Multimodal Arena (Body + Board + COP)</span>
          </button>

          <button
            onClick={() => setViewMode("force-plate-2d")}
            style={{
              padding: "8px 16px",
              borderRadius: "10px",
              border: viewMode === "force-plate-2d" ? "1px solid #0D9488" : "1px solid #E2E8F0",
              background: viewMode === "force-plate-2d" ? "#F0FDF4" : "#FFFFFF",
              color: viewMode === "force-plate-2d" ? "#0F766E" : "#64748B",
              fontWeight: 700,
              fontSize: "0.8125rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: viewMode === "force-plate-2d" ? "0 1px 3px rgba(13, 148, 136, 0.15)" : "none",
            }}
          >
            <Compass size={16} />
            <span>2D Force Plate & Metrics</span>
          </button>
        </div>

        <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
          Mode: <strong style={{ color: "#0F172A" }}>{multimodal.mode.replace("_", " ")}</strong>
        </div>
      </div>

      {/* 4. Active Visualization: 3D Multimodal View vs 2D Force Plate */}
      {viewMode === "multimodal-3d" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <MultimodalScene3D telemetry={multimodal} height="520px" />
          <MultimodalDashboardCard telemetry={multimodal} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* Left Column: Visual Wii Balance Board */}
          <Card
            title="Force Plate Visualization"
            subtitle="Real-time Center of Pressure (COP Ball) tracking"
            icon={<Bluetooth size={20} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Visual Board Component */}
              <VisualBalanceBoard
                reading={activeReading}
                isConnected={status.isConnected}
                isSimulated={isSimulated}
              />

              {/* Visual Board Legend & Coordinate Guide */}
              <div
                style={{
                  borderRadius: "10px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  padding: "12px 16px",
                  fontSize: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "var(--text-main)" }}>
                  <Info size={14} color="var(--teal-primary)" />
                  <span>How to Read the Center of Pressure (COP) Ball</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  <li>
                    <strong>Center Circle:</strong> Neutral equilibrium zone (50/50 balance).
                  </li>
                  <li>
                    <strong>Lateral Axis (X):</strong> Negative values move <strong>LEFT (-X)</strong>, positive values move <strong>RIGHT (+X)</strong>.
                  </li>
                  <li>
                    <strong>Anteroposterior Axis (Y):</strong> Positive values lean <strong>FORWARD / ANTERIOR (+Y)</strong>, negative values lean <strong>BACKWARD / POSTERIOR (-Y)</strong>.
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Right Column: Live Measurement Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <BalanceMetricTiles
              reading={activeReading}
              isConnected={status.isConnected}
              isSimulated={isSimulated}
            />
          </div>
        </div>
      )}

      {/* 4. Real-Time Balance Trajectory Graphs (Phase 3 Core) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "var(--teal-surface)",
                border: "1px solid var(--border-teal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--teal-primary)",
              }}
            >
              <LineChart size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)" }}>
                Real-Time Balance Analysis Graphs
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1px" }}>
                Continuous 30-second rolling window tracking lateral sway, anteroposterior lean, and bilateral load split.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                background: "#FFFFFF",
                padding: "4px 10px",
                borderRadius: "8px",
                border: "1px solid var(--border-light)",
                fontWeight: 600,
              }}
            >
              Window: 30s ({points.length} pts)
            </span>
            {points.length > 0 && (
              <button
                onClick={clearHistory}
                className="btn-ghost"
                style={{ fontSize: "0.75rem", padding: "4px 10px" }}
              >
                Clear History
              </button>
            )}
          </div>
        </div>

        {isSimulated && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              color: "#92400E",
              fontSize: "0.8125rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
          </div>
        )}

        {/* Horizontal 3-Column Responsive Grid */}
        <div className="balance-graphs-grid">
          {/* Graph 1: COP X — Lateral Movement */}
          <RealtimeBalanceGraph
            type="copX"
            points={points}
            isConnected={status.isConnected}
            isSimulated={isSimulated}
            windowDurationMs={windowDurationMs}
          />

          {/* Graph 2: COP Y — Anteroposterior Movement */}
          <RealtimeBalanceGraph
            type="copY"
            points={points}
            isConnected={status.isConnected}
            isSimulated={isSimulated}
            windowDurationMs={windowDurationMs}
          />

          {/* Graph 3: Weight Distribution */}
          <RealtimeBalanceGraph
            type="weight"
            points={points}
            isConnected={status.isConnected}
            isSimulated={isSimulated}
            windowDurationMs={windowDurationMs}
          />
        </div>
      </div>

      {/* 5. Development Simulation Controls (Dev / Testing Only) */}
      <DevSimulationControls
        isSimulated={isSimulated}
        onToggleSimulated={setIsSimulated}
        copX={simCopX}
        copY={simCopY}
        totalWeight={simTotalWeight}
        onChangeCopX={setSimCopX}
        onChangeCopY={setSimCopY}
        onChangeTotalWeight={setSimTotalWeight}
      />
    </div>
  );
};
