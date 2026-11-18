import React, { useState, useEffect, useMemo } from "react";
import {
  Scale,
  Target,
  Activity,
  Zap,
  Play,
  Bluetooth,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Card } from "../components/common/Card";
import { MetricTile } from "../components/dashboard/MetricTile";
import { CopRadarPlaceholder } from "../components/dashboard/CopRadarPlaceholder";
import { WeightDistributionBar } from "../components/dashboard/WeightDistributionBar";
import { PatientHeaderCard } from "../components/dashboard/PatientHeaderCard";
import { RecentSessionsList, DashboardSessionItem } from "../components/dashboard/RecentSessionsList";
import { PatientProfile } from "../types/patient";
import { useBalanceBoard } from "../context/HardwareContext";
import { useVision } from "../context/VisionContext";
import { SessionStorageService } from "../services/sessionStorage";

interface DashboardPageProps {
  patient: PatientProfile;
  boardConnected: boolean;
  onNavigateToDevices: () => void;
  onNavigateToExercises: () => void;
  onNavigateToProfile: () => void;
  onNavigateToBalance?: () => void;
  onNavigateToReports?: () => void;
  onNavigateToSettings?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  patient,
  boardConnected,
  onNavigateToDevices,
  onNavigateToExercises,
  onNavigateToProfile,
  onNavigateToBalance,
  onNavigateToReports,
  onNavigateToSettings,
}) => {
  const { status, reading, isSimulated } = useBalanceBoard();
  const { isCameraActive } = useVision();

  // Load genuine saved sessions for this specific patient
  const [patientSessions, setPatientSessions] = useState<DashboardSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchPatientSessions = async () => {
      try {
        const allSaved = await SessionStorageService.listSavedSessions();
        // Strict Patient Isolation: Filter strictly by active patient's ID
        const filtered = allSaved
          .filter((s) => s.patientId === patient.id)
          .map((s): DashboardSessionItem => {
            const dateObj = new Date(s.startTime);
            const formattedDate = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recent";

            return {
              id: s.sessionId,
              date: formattedDate,
              protocolName: s.sessionId.includes("directional")
                ? "Directional Weight Shift Protocol"
                : s.sessionId.includes("posture")
                ? "Posture Alignment Protocol"
                : "Romberg Balance Protocol",
              durationFormatted: s.durationFormatted || "00:30",
              measurementCount: s.measurementCount,
              dataSource: s.dataSource,
              balanceScore: null, // Genuine score: not falsified or synthesized
              status: "Completed",
              notes: `${s.measurementCount} force plate samples collected`,
            };
          });

        if (isMounted) {
          setPatientSessions(filtered);
          setIsLoadingSessions(false);
        }
      } catch (err) {
        console.error("Failed to load patient sessions:", err);
        if (isMounted) {
          setPatientSessions([]);
          setIsLoadingSessions(false);
        }
      }
    };

    fetchPatientSessions();
    return () => {
      isMounted = false;
    };
  }, [patient.id]);

  // Telemetry validity evaluation
  const isPhysicalConnected = status.isConnected || boardConnected;
  const isPlateLoaded = Boolean(
    isPhysicalConnected && reading && reading.totalWeight && reading.totalWeight > 1.0
  );
  const isSimActive = Boolean(
    !isPhysicalConnected && isSimulated && reading && reading.totalWeight && reading.totalWeight > 1.0
  );
  const isTelemetryActive = isPlateLoaded || isSimActive;

  // Real-time extracted sensor metrics
  const liveWeightKg = isTelemetryActive && reading ? reading.totalWeight.toFixed(1) : null;
  const leftPct = isTelemetryActive && reading ? reading.leftPercent : null;
  const rightPct = isTelemetryActive && reading ? reading.rightPercent : null;
  const frontPct = isTelemetryActive && reading ? reading.anteriorPercent : null;
  const backPct = isTelemetryActive && reading ? reading.posteriorPercent : null;

  const frontLeftKg = isTelemetryActive && reading ? reading.frontLeft : null;
  const frontRightKg = isTelemetryActive && reading ? reading.frontRight : null;
  const backLeftKg = isTelemetryActive && reading ? reading.backLeft : null;
  const backRightKg = isTelemetryActive && reading ? reading.backRight : null;

  const copX = isTelemetryActive && reading ? reading.copX : null;
  const copY = isTelemetryActive && reading ? reading.copY : null;
  const copXMm = isTelemetryActive && reading ? reading.copXMm : null;
  const copYMm = isTelemetryActive && reading ? reading.copYMm : null;

  // Determine current session status message
  const sessionStatus = useMemo(() => {
    if (isPhysicalConnected) {
      if (isPlateLoaded) {
        return "Patient On Board • 100Hz Telemetry Streaming";
      }
      return "Force Plate Online • Step On Board";
    }
    if (isSimulated) {
      return "Simulation Mode Active";
    }
    return "Hardware Standby (Not Connected)";
  }, [isPhysicalConnected, isPlateLoaded, isSimulated]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "8px 0 40px 0",
      }}
    >
      {/* 1. Patient Profile Header Card */}
      <PatientHeaderCard
        patient={patient}
        sessionStatus={sessionStatus}
        boardConnected={isPhysicalConnected}
        cameraActive={isCameraActive}
        isSimulated={isSimulated}
        onViewProfile={onNavigateToProfile}
      />

      {/* Simulation Warning Banner (Strict Data Transparency) */}
      {isSimulated && !isPhysicalConnected && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderRadius: "14px",
            background: "var(--amber-light)",
            border: "1px solid #FDE68A",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#FEF3C7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--amber-soft)",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#92400E" }}>
                Simulation Mode Active — Synthetic Biomechanical Telemetry
              </div>
              <div style={{ fontSize: "0.75rem", color: "#B45309", marginTop: "2px" }}>
                Measurements shown are generated for interface testing. Real patient evaluations strictly require physical Nintendo Wii Balance Board connection.
              </div>
            </div>
          </div>
          <button
            onClick={onNavigateToDevices}
            className="btn-secondary"
            style={{ fontSize: "0.8125rem", padding: "8px 14px", whiteSpace: "nowrap" }}
          >
            Hardware Settings
          </button>
        </div>
      )}

      {/* Physical Hardware Connection Alert Banner (if disconnected and not simulated) */}
      {!isPhysicalConnected && !isSimulated && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: "14px",
            background: "#FFFFFF",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-card)",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "#F1F5F9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                flexShrink: 0,
              }}
            >
              <Bluetooth size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-main)" }}>
                Nintendo Wii Balance Board Not Connected
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Press the red <strong>SYNC</strong> button inside the board battery compartment or pair in Hardware Status to stream live ground reaction data.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="btn-secondary"
                style={{ fontSize: "0.8125rem", padding: "10px 14px" }}
              >
                Settings
              </button>
            )}
            <button
              onClick={onNavigateToDevices}
              className="btn-primary"
              style={{ fontSize: "0.8125rem", padding: "10px 16px" }}
            >
              <span>Connect Hardware</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Key Biomechanical Telemetry Metric Tiles (Responsive Grid) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "18px",
        }}
      >
        {/* Tile 1: Live Patient Weight */}
        <MetricTile
          label="Live Patient Weight"
          value={liveWeightKg}
          unit="kg"
          subtext={`Baseline Intake: ${patient.baselineWeightKg} kg`}
          icon={<Scale size={18} />}
          accentColor="cyan"
          statusText={
            isPhysicalConnected
              ? isPlateLoaded
                ? "Live Force Plate"
                : "Step on Board (<1.0 kg)"
              : isSimulated
              ? "Synthetic Telemetry"
              : "Hardware Standby"
          }
          onClick={onNavigateToBalance}
        />

        {/* Tile 2: Balance Stability Score */}
        <MetricTile
          label="Balance Stability Score"
          value={null} // Genuine scientific integrity: null when not calculated from session
          unit="/ 100"
          subtext="Computed from continuous session COP sway index"
          icon={<Activity size={18} />}
          accentColor="emerald"
          statusText={
            patientSessions.length > 0
              ? `${patientSessions.length} Completed Session(s)`
              : "Awaiting Session Protocol"
          }
        />

        {/* Tile 3: Lateral Weight Split */}
        <MetricTile
          label="Lateral Weight Split"
          value={
            isTelemetryActive && leftPct !== null && rightPct !== null
              ? `${leftPct.toFixed(0)}% / ${rightPct.toFixed(0)}%`
              : "-- / --"
          }
          unit=""
          subtext="Left (-X) vs Right (+X) Load Distribution"
          icon={<Target size={18} />}
          accentColor="blue"
          statusText={isTelemetryActive ? "100Hz Equilibrium" : "Hardware Standby"}
          onClick={onNavigateToBalance}
        />

        {/* Tile 4: Anteroposterior Split */}
        <MetricTile
          label="Anteroposterior Split"
          value={
            isTelemetryActive && frontPct !== null && backPct !== null
              ? `${frontPct.toFixed(0)}% / ${backPct.toFixed(0)}%`
              : "-- / --"
          }
          unit=""
          subtext="Anterior (+Y) vs Posterior (-Y) Equilibrium"
          icon={<Zap size={18} />}
          accentColor="purple"
          statusText={isTelemetryActive ? "100Hz Equilibrium" : "Hardware Standby"}
          onClick={onNavigateToBalance}
        />
      </div>

      {/* 3. Center Section: Center of Pressure Telemetry & Weight Distribution Analysis */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Left Card: Center of Pressure Radar Target Grid */}
        <Card
          title="Center of Pressure (COP) Telemetry"
          subtitle="Instantaneous Ground Reaction Vector & Postural Sway Coordinates"
          icon={<Target size={18} />}
          headerAction={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span
                className={`status-pill ${
                  isTelemetryActive ? "connected" : isPhysicalConnected ? "standby" : "disconnected"
                }`}
              >
                {isTelemetryActive && copXMm !== null && copYMm !== null
                  ? `Active (${copXMm >= 0 ? "+" : ""}${copXMm.toFixed(1)}, ${copYMm >= 0 ? "+" : ""}${copYMm.toFixed(1)}) mm`
                  : isPhysicalConnected
                  ? "Plate Standby (0.0, 0.0)"
                  : "Standby (0.0, 0.0)"}
              </span>
            </div>
          }
        >
          <CopRadarPlaceholder
            isConnected={isPhysicalConnected || isSimulated}
            isLoaded={isTelemetryActive}
            copX={copX}
            copY={copY}
            copXMm={copXMm}
            copYMm={copYMm}
          />
        </Card>

        {/* Right Card: Four-Quadrant Load Cell Equilibrium & Balance Overview */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Card
            title="Weight Distribution Analysis"
            subtitle="Four-Quadrant Load Cell Equilibrium (TR, BR, TL, BL)"
            icon={<Scale size={18} />}
            headerAction={
              onNavigateToBalance && (
                <button
                  onClick={onNavigateToBalance}
                  className="btn-ghost"
                  style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                >
                  <span>Detailed Analysis</span>
                  <ChevronRight size={13} />
                </button>
              )
            }
          >
            <div style={{ padding: "6px 0 4px 0" }}>
              <WeightDistributionBar
                leftPercent={leftPct}
                rightPercent={rightPct}
                frontPercent={frontPct}
                backPercent={backPct}
                frontLeftKg={frontLeftKg}
                frontRightKg={frontRightKg}
                backLeftKg={backLeftKg}
                backRightKg={backRightKg}
              />
            </div>
          </Card>

          {/* Quick Launch Protocol Box */}
          <div
            className="medical-card-mint"
            style={{
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-main)" }}>
                Start Rehabilitation Protocol
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Launch Directional Weight Shift, Romberg Test, or Multimodal Posture exercises.
              </div>
            </div>
            <button
              onClick={onNavigateToExercises}
              className="btn-primary"
              style={{ whiteSpace: "nowrap" }}
            >
              <Play size={15} fill="#FFFFFF" />
              <span>Launch Exercises</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Quick Protocol Directory (Direct Access to Daily Exercises) */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>
              Prescribed Exercise Protocols
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Targeted balance rehabilitation routines assigned to {patient.fullName}
            </p>
          </div>
          <button
            onClick={onNavigateToExercises}
            className="btn-ghost"
            style={{ fontSize: "0.8125rem", color: "var(--teal-primary)", fontWeight: 700 }}
          >
            <span>View All Exercises</span>
            <ChevronRight size={15} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Protocol 1: Directional Weight Shift */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onClick={onNavigateToExercises}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--bg-subtle-mint)",
                  border: "1px solid var(--border-mint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                1
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    Directional Weight Shift
                  </h4>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "var(--teal-primary)",
                      background: "rgba(13, 148, 136, 0.1)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    FORCE PLATE
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "3px" }}>
                  Guide Center of Pressure toward calibrated left, right, forward, and backward targets.
                </p>
              </div>
            </div>
            <div style={{ color: "var(--teal-primary)", marginLeft: "8px" }}>
              <ChevronRight size={20} />
            </div>
          </div>

          {/* Protocol 2: Romberg Balance Test */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onClick={onNavigateToExercises}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "#F8FAFC",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                2
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    Romberg Balance Test
                  </h4>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "#64748B",
                      background: "#F1F5F9",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    STATIC STANCE
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "3px" }}>
                  Standardized quiet standing with eyes open, followed by eyes closed comparison.
                </p>
              </div>
            </div>
            <div style={{ color: "var(--teal-primary)", marginLeft: "8px" }}>
              <ChevronRight size={20} />
            </div>
          </div>

          {/* Protocol 3: Multimodal Posture + Balance */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onClick={onNavigateToExercises}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--bg-subtle-mint)",
                  border: "1px solid var(--border-mint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                3
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                    Posture + Balance Exercise
                  </h4>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "var(--teal-primary)",
                      background: "rgba(13, 148, 136, 0.1)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    MULTIMODAL
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "3px" }}>
                  Camera 2D skeleton pose combined with Wii Balance Board COP ground reactions.
                </p>
              </div>
            </div>
            <div style={{ color: "var(--teal-primary)", marginLeft: "8px" }}>
              <ChevronRight size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Recent Session History Section (Genuine Patient Records) */}
      <Card
        title="Completed Rehabilitation Sessions"
        subtitle={`Historical balance assessment records strictly filtered for ${patient.fullName} (${patient.medicalRecordNumber})`}
        icon={<Activity size={18} />}
        headerAction={
          onNavigateToReports && (
            <button
              onClick={onNavigateToReports}
              className="btn-ghost"
              style={{ fontSize: "0.8125rem", padding: "6px 12px" }}
            >
              <span>View All Reports</span>
              <FileText size={14} style={{ marginLeft: "4px" }} />
            </button>
          )
        }
      >
        {isLoadingSessions ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Loading patient session history...
          </div>
        ) : (
          <RecentSessionsList
            sessions={patientSessions}
            onStartSession={onNavigateToExercises}
            onSelectSession={onNavigateToReports}
          />
        )}
      </Card>
    </div>
  );
};
