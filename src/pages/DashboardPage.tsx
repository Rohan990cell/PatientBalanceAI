import React from "react";
import { Scale, Target, Activity, Zap, Play, Bluetooth, ArrowRight } from "lucide-react";
import { Card } from "../components/common/Card";
import { MetricTile } from "../components/dashboard/MetricTile";
import { CopRadarPlaceholder } from "../components/dashboard/CopRadarPlaceholder";
import { WeightDistributionBar } from "../components/dashboard/WeightDistributionBar";
import { PatientHeaderCard } from "../components/dashboard/PatientHeaderCard";
import { RecentSessionsList } from "../components/dashboard/RecentSessionsList";
import { PatientProfile, RecentSessionSummary } from "../types/patient";

interface DashboardPageProps {
  patient: PatientProfile;
  boardConnected: boolean;
  onNavigateToDevices: () => void;
  onNavigateToExercises: () => void;
  onNavigateToProfile: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  patient,
  boardConnected,
  onNavigateToDevices,
  onNavigateToExercises,
  onNavigateToProfile,
}) => {
  const recentSessions: RecentSessionSummary[] = [
    {
      id: "sess-001",
      date: "2026-09-26",
      protocolName: "Baseline Romberg Protocol (Eyes Open)",
      durationSeconds: 30,
      balanceScore: 78,
      status: "Completed",
      notes: "Steady unassisted posture, minimal lateral sway.",
    },
    {
      id: "sess-002",
      date: "2026-09-24",
      protocolName: "Static Stance & Tare Calibration",
      durationSeconds: 20,
      balanceScore: 72,
      status: "Completed",
      notes: "Initial weight baseline established.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1500px", margin: "0 auto" }}>
      {/* 1. Patient Profile Header Card */}
      <PatientHeaderCard
        patient={patient}
        sessionStatus={boardConnected ? "Board Online • Ready for Protocol" : "Hardware Standby (Not Connected)"}
        onViewProfile={onNavigateToProfile}
      />

      {/* Hardware Connection Alert Banner (if not connected) */}
      {!boardConnected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderRadius: "14px",
            background: "linear-gradient(90deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(244, 63, 94, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FB7185",
              }}
            >
              <Bluetooth size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#FECDD3" }}>
                Nintendo Wii Balance Board Not Connected
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Windows detects device as "Nintendo RVL-WBC-01". Pair in Hardware Status to begin real-time data acquisition.
              </div>
            </div>
          </div>
          <button onClick={onNavigateToDevices} className="btn-primary" style={{ fontSize: "0.8125rem", padding: "8px 14px" }}>
            <span>Connect Hardware</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* 2. Key Telemetry Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "18px",
        }}
      >
        <MetricTile
          label="LIVE PATIENT WEIGHT"
          value={null}
          unit="kg"
          subtext={`Baseline: ${patient.baselineWeightKg} kg`}
          icon={<Scale size={18} />}
          accentColor="cyan"
          statusText={boardConnected ? "Streaming 100Hz" : "Not Connected"}
        />

        <MetricTile
          label="OVERALL BALANCE SCORE"
          value={null}
          unit="/ 100"
          subtext="Computed from CoP Stability Index"
          icon={<Activity size={18} />}
          accentColor="emerald"
          statusText={boardConnected ? "Calibrated Zero" : "Awaiting Stream"}
        />

        <MetricTile
          label="LATERAL WEIGHT SPLIT"
          value="-- / --"
          unit="%"
          subtext="Left vs Right Load Distribution"
          icon={<Target size={18} />}
          accentColor="blue"
          statusText={boardConnected ? "Equilibrium" : "Hardware Standby"}
        />

        <MetricTile
          label="ACTIVE PROTOCOL"
          value="Romberg Test"
          subtext="Eyes Open vs Closed Comparison"
          icon={<Zap size={18} />}
          accentColor="purple"
          statusText="Next in Queue"
        />
      </div>

      {/* 3. Center Section: Center of Pressure & Weight Distribution & Quick Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "20px",
        }}
      >
        {/* Left: Center of Pressure Radar Target Grid */}
        <Card
          title="Center of Pressure (CoP) Telemetry"
          subtitle="Instantaneous Ground Reaction Vector & Postural Sway Coordinates"
          icon={<Target size={18} />}
          headerAction={
            <div style={{ display: "flex", gap: "8px" }}>
              <span className="status-pill standby">Standby (0.0, 0.0)</span>
            </div>
          }
        >
          <CopRadarPlaceholder isConnected={boardConnected} copX={null} copY={null} />
        </Card>

        {/* Right: Load Cell Distribution & Protocol Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Quad Sensor Balance Distribution Card */}
          <Card
            title="Weight Distribution Analysis"
            subtitle="Four-Quadrant Load Cell Equilibrium (TR, BR, TL, BL)"
            icon={<Scale size={18} />}
          >
            <div style={{ padding: "6px 0 10px 0" }}>
              <WeightDistributionBar
                leftPercent={null}
                rightPercent={null}
                frontPercent={null}
                backPercent={null}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginTop: "18px",
                  padding: "12px",
                  background: "rgba(15, 23, 42, 0.5)",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Top-Left (TL): </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>-- kg</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Top-Right (TR): </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>-- kg</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Bottom-Left (BL): </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>-- kg</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Bottom-Right (BR): </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>-- kg</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Launch Protocol Box */}
          <div
            className="glass-panel"
            style={{
              padding: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)",
              border: "1px solid rgba(6, 182, 212, 0.25)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                Start Rehabilitation Exercise
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Select from Romberg, Single-Leg Stance, or Blink Cognitive protocols.
              </div>
            </div>
            <button onClick={onNavigateToExercises} className="btn-primary" style={{ whiteSpace: "nowrap" }}>
              <Play size={15} fill="currentColor" />
              <span>Launch Exercises</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Recent Session History Section */}
      <Card
        title="Recent Rehabilitation Sessions"
        subtitle="Historical balance assessment logs for this patient profile"
        icon={<Activity size={18} />}
        headerAction={
          <button onClick={onNavigateToProfile} className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 10px" }}>
            View All Records
          </button>
        }
      >
        <RecentSessionsList sessions={recentSessions} />
      </Card>
    </div>
  );
};
