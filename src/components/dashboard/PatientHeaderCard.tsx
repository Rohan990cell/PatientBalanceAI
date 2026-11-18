import React from "react";
import { User, Activity, Stethoscope, ShieldCheck, ChevronRight, Bluetooth, Camera } from "lucide-react";
import { PatientProfile } from "../../types/patient";

interface PatientHeaderCardProps {
  patient: PatientProfile;
  sessionStatus?: string;
  boardConnected?: boolean;
  cameraActive?: boolean;
  isSimulated?: boolean;
  onViewProfile?: () => void;
}

export const PatientHeaderCard: React.FC<PatientHeaderCardProps> = ({
  patient,
  sessionStatus = "Session Standby",
  boardConnected = false,
  cameraActive = false,
  isSimulated = false,
  onViewProfile,
}) => {
  return (
    <div
      className="medical-card"
      style={{
        padding: "22px 24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "18px",
        background: "#FFFFFF",
        border: "1px solid var(--border-light)",
        borderRadius: "16px",
      }}
    >
      {/* Patient Avatar & Clinical Details */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "280px" }}>
        <div
          style={{
            width: "54px",
            height: "54px",
            borderRadius: "14px",
            background: "var(--bg-subtle-mint)",
            border: "1px solid var(--border-mint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--teal-primary)",
            flexShrink: 0,
          }}
        >
          <User size={26} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", letterSpacing: "-0.01em" }}>
              {patient.fullName}
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                background: "#F1F5F9",
                border: "1px solid var(--border-light)",
                padding: "2px 8px",
                borderRadius: "6px",
                color: "var(--text-secondary)",
                fontWeight: 600,
              }}
            >
              {patient.medicalRecordNumber}
            </span>
            <span
              className="status-pill ready"
              style={{ fontSize: "0.6875rem", padding: "2px 8px" }}
            >
              Active Patient
            </span>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            <strong style={{ color: "var(--text-main)" }}>Diagnosis:</strong> {patient.conditionDiagnosis} • Age: {patient.age} • Target: {patient.rehabilitationGoal}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              marginTop: "6px",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Stethoscope size={13} color="var(--teal-primary)" />
              {patient.assignedDoctor}
            </span>
            <span>•</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ShieldCheck size={13} color="var(--green-primary)" />
              Clinical Rehabilitation Protocol
            </span>
            {patient.lastSessionDate && (
              <>
                <span>•</span>
                <span>Last Session: {patient.lastSessionDate}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Device & Session Status Pills + Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {/* Force Plate Status */}
            <span
              className={`status-pill ${
                boardConnected ? "connected" : isSimulated ? "warning" : "disconnected"
              }`}
            >
              <Bluetooth size={12} />
              {boardConnected
                ? "Force Plate Online"
                : isSimulated
                ? "Simulated Plate"
                : "Force Plate Standby"}
            </span>

            {/* Camera Status */}
            <span className={`status-pill ${cameraActive ? "connected" : "disconnected"}`}>
              <Camera size={12} />
              {cameraActive ? "Camera Active" : "Camera Standby"}
            </span>
          </div>

          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Activity size={13} color="var(--teal-primary)" />
            <span>{sessionStatus}</span>
          </div>
        </div>

        {onViewProfile && (
          <button
            onClick={onViewProfile}
            className="btn-secondary"
            style={{ fontSize: "0.8125rem", padding: "8px 14px", marginLeft: "4px" }}
          >
            <span>Patient Profile</span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
