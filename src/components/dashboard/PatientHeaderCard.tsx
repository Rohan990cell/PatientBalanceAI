import React from "react";
import { User, Activity, ShieldCheck, Stethoscope } from "lucide-react";
import { PatientProfile } from "../../types/patient";

interface PatientHeaderCardProps {
  patient: PatientProfile;
  sessionStatus?: string;
  onViewProfile?: () => void;
}

export const PatientHeaderCard: React.FC<PatientHeaderCardProps> = ({
  patient,
  sessionStatus = "Session Idle (Ready to Calibrate)",
  onViewProfile,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: "24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "18px",
        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(30, 41, 59, 0.6) 100%)",
        border: "1px solid rgba(6, 182, 212, 0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* Patient Avatar Circle */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)",
            border: "1px solid rgba(6, 182, 212, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-cyan)",
          }}
        >
          <User size={28} />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {patient.fullName}
            </h2>
            <span
              style={{
                fontSize: "0.7rem",
                fontFamily: "var(--font-mono)",
                background: "rgba(255, 255, 255, 0.08)",
                padding: "2px 8px",
                borderRadius: "4px",
                color: "var(--text-secondary)",
              }}
            >
              {patient.medicalRecordNumber}
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: "var(--accent-emerald)",
                background: "rgba(16, 185, 129, 0.12)",
                padding: "2px 8px",
                borderRadius: "9999px",
                border: "1px solid rgba(16, 185, 129, 0.25)",
              }}
            >
              Active Patient
            </span>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            {patient.conditionDiagnosis} • Age: {patient.age} • Target: {patient.rehabilitationGoal}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginTop: "8px",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Stethoscope size={13} color="var(--accent-cyan)" />
              {patient.assignedDoctor}
            </span>
            <span>•</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <ShieldCheck size={13} color="var(--accent-emerald)" />
              Research Protocol V1
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
        }}
      >
        <div
          style={{
            textAlign: "right",
          }}
        >
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>
            Session Status
          </div>
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--accent-amber)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              justifyContent: "flex-end",
              marginTop: "2px",
            }}
          >
            <Activity size={15} />
            <span>{sessionStatus}</span>
          </div>
        </div>

        {onViewProfile && (
          <button onClick={onViewProfile} className="btn-ghost" style={{ fontSize: "0.8125rem" }}>
            View Full Clinical Record
          </button>
        )}
      </div>
    </div>
  );
};
