import React, { useState } from "react";
import { Sliders, Database, Shield } from "lucide-react";
import { Card } from "../components/common/Card";

export const SettingsPage: React.FC = () => {
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [autoTare, setAutoTare] = useState(true);

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
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)" }}>
          Settings & Preferences
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px" }}>
          Configure application units, balance board calibration, and system data storage.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Display Units */}
        <Card title="Display Units" icon={<Sliders size={18} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "6px" }}>
                Weight Unit
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setWeightUnit("kg")}
                  className={weightUnit === "kg" ? "btn-primary" : "btn-secondary"}
                  style={{ flex: 1, padding: "8px" }}
                >
                  Kilograms (kg)
                </button>
                <button
                  onClick={() => setWeightUnit("lbs")}
                  className={weightUnit === "lbs" ? "btn-primary" : "btn-secondary"}
                  style={{ flex: 1, padding: "8px" }}
                >
                  Pounds (lbs)
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "12px",
                borderTop: "1px solid var(--border-light)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-main)" }}>
                  Auto-Tare Before Exercise
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Automatically zero the load sensors before each session
                </div>
              </div>
              <button
                onClick={() => setAutoTare(!autoTare)}
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "12px",
                  background: autoTare ? "var(--teal-primary)" : "#CBD5E1",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    position: "absolute",
                    top: "3px",
                    left: autoTare ? "23px" : "3px",
                    transition: "left 0.2s ease",
                  }}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* System & Data Storage */}
        <Card title="Data & Storage" icon={<Database size={18} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.8125rem" }}>
            <div>
              <span style={{ color: "var(--text-muted)" }}>Database Engine</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                Embedded SQLite 3
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)" }}>Local Database File</span>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                  fontSize: "0.75rem",
                  wordBreak: "break-all",
                }}
              >
                Documents\PatientBalanceAI\patient_balance.sqlite
              </div>
            </div>

            <div>
              <span style={{ color: "var(--text-muted)" }}>Sampling Frequency</span>
              <div style={{ fontWeight: 600, color: "var(--text-main)", marginTop: "2px" }}>
                100 Hz (Cubic Spline Interpolated)
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Research Information" icon={<Shield size={18} />}>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          PatientBalanceAI is developed for neuro-rehabilitation and balance analysis research. All data is stored locally on this machine to ensure complete patient privacy.
        </p>
      </Card>
    </div>
  );
};
