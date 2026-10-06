import React from "react";
import { User, HeartPulse, Shield } from "lucide-react";
import { Card } from "../components/common/Card";
import { PatientProfile } from "../types/patient";

interface PatientProfilePageProps {
  patient: PatientProfile;
}

export const PatientProfilePage: React.FC<PatientProfilePageProps> = ({ patient }) => {
  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      {/* Patient Hero Card */}
      <div
        className="medical-card-mint"
        style={{
          padding: "24px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#FFFFFF",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--teal-primary)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            <User size={32} />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)" }}>
                {patient.fullName}
              </h2>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  background: "#FFFFFF",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-muted)",
                }}
              >
                {patient.medicalRecordNumber}
              </span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px" }}>
              {patient.conditionDiagnosis}
            </p>
          </div>
        </div>

        <span className="status-pill connected" style={{ padding: "6px 14px", fontSize: "0.8125rem" }}>
          Active Patient
        </span>
      </div>

      {/* Demographics & Clinical Profile */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <Card title="Demographic Information" icon={<User size={18} />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "0.875rem" }}>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Age</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                {patient.age} Years
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Biological Sex</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                {patient.gender}
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Standing Height</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                {patient.heightCm} cm
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Baseline Weight</span>
              <div style={{ fontWeight: 600, color: "var(--teal-primary)", marginTop: "2px" }}>
                {patient.baselineWeightKg} kg
              </div>
            </div>
          </div>
        </Card>

        <Card title="Care Plan & Targets" icon={<HeartPulse size={18} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.875rem" }}>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Supervising Clinician</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                {patient.assignedDoctor}
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Rehabilitation Goal</span>
              <div style={{ fontWeight: 600, color: "var(--green-primary)", marginTop: "2px" }}>
                {patient.rehabilitationGoal}
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Last Session</span>
              <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                {patient.lastSessionDate || "Initial Assessment"}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Clinical Notes Notice */}
      <Card title="Patient Notice" icon={<Shield size={18} />}>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          All recorded weights and balance scores are tracked for rehabilitation monitoring. Please consult your physician before altering your prescribed exercises.
        </p>
      </Card>
    </div>
  );
};
