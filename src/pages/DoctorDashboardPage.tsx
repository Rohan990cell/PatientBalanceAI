import React, { useState } from "react";
import { Users, TrendingUp, AlertTriangle, Download } from "lucide-react";
import { Card } from "../components/common/Card";

export const DoctorDashboardPage: React.FC = () => {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("P001");

  const patients = [
    {
      id: "P001",
      name: "Eleanor Vance",
      age: 58,
      mrn: "MRN-2026-0841",
      diagnosis: "Vestibular Neuritis",
      sessionsCompleted: 6,
      balanceScore: 78,
      weightTrend: "Stable (-0.4 kg)",
      balanceTrend: "+18% Stability Gain",
      alert: null,
    },
    {
      id: "P002",
      name: "Marcus Sterling",
      age: 64,
      mrn: "MRN-2026-0129",
      diagnosis: "Diabetic Neuropathy",
      sessionsCompleted: 3,
      balanceScore: 62,
      weightTrend: "Stable",
      balanceTrend: "+6% Stability Gain",
      alert: "Mild asymmetric lateral sway detected",
    },
    {
      id: "P003",
      name: "Sophia Chen",
      age: 42,
      mrn: "MRN-2026-0592",
      diagnosis: "Post-Concussion Syndrome",
      sessionsCompleted: 8,
      balanceScore: 84,
      weightTrend: "Stable",
      balanceTrend: "+24% Stability Gain",
      alert: null,
    },
  ];

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      {/* Top Clinical Header */}
      <div
        className="medical-card"
        style={{
          padding: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderLeft: "4px solid var(--purple-doctor)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)" }}>
              Doctor Clinical Oversight
            </h1>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--purple-doctor)",
                background: "var(--purple-light)",
                padding: "3px 10px",
                borderRadius: "9999px",
              }}
            >
              Clinician Portal
            </span>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Supervise patient balance rehabilitation cohorts, monitor compliance, and export clinical reports.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-secondary" style={{ fontSize: "0.8125rem" }}>
            <Download size={15} />
            <span>Export Cohort Data</span>
          </button>
        </div>
      </div>

      {/* 2-Column Clinical Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "20px" }}>
        {/* Left: Patient Cohort List */}
        <Card title="Active Patients" subtitle="Select patient to view detailed trends" icon={<Users size={18} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {patients.map((p) => {
              const isSelected = p.id === selectedPatientId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: `1px solid ${isSelected ? "var(--purple-doctor)" : "var(--border-light)"}`,
                    background: isSelected ? "var(--purple-light)" : "#FFFFFF",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-main)" }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        ({p.age}y)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                      {p.diagnosis} • {p.mrn}
                    </div>

                    {p.alert && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          marginTop: "6px",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          color: "var(--amber-soft)",
                          background: "var(--amber-light)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        <AlertTriangle size={12} />
                        <span>{p.alert}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Balance Score</div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>
                      {p.balanceScore} / 100
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right: Selected Patient Clinical Detail */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Card
            title={`${selectedPatient.name} — Progress & Baselines`}
            subtitle={`Medical Record: ${selectedPatient.mrn}`}
            icon={<TrendingUp size={18} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div style={{ padding: "14px", borderRadius: "10px", background: "var(--bg-app)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Balance Recovery Trend</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--green-primary)", marginTop: "2px" }}>
                    {selectedPatient.balanceTrend}
                  </div>
                </div>

                <div style={{ padding: "14px", borderRadius: "10px", background: "var(--bg-app)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Weight Trend</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>
                    {selectedPatient.weightTrend}
                  </div>
                </div>

                <div style={{ padding: "14px", borderRadius: "10px", background: "var(--bg-app)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sessions Completed</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>
                    {selectedPatient.sessionsCompleted} Sessions
                  </div>
                </div>

                <div style={{ padding: "14px", borderRadius: "10px", background: "var(--bg-app)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Adherence</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--teal-primary)", marginTop: "2px" }}>
                    95% On Track
                  </div>
                </div>
              </div>

              {/* Clean Minimal Chart Placeholder */}
              <div
                style={{
                  padding: "20px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-light)",
                  background: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)", marginBottom: "8px" }}>
                  Session Balance Stability Trajectory (Recent 6 Sessions)
                </div>
                <div
                  style={{
                    height: "80px",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "0 10px",
                  }}
                >
                  {[55, 62, 68, 70, 74, 78].map((score, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: "28px",
                          height: `${score}px`,
                          background: "var(--teal-primary)",
                          borderRadius: "4px 4px 0 0",
                          opacity: 0.85,
                        }}
                      />
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        S{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
