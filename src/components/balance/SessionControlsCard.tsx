import React from "react";
import { Play, Pause, Square, Save, RotateCcw, AlertTriangle, CheckCircle, Radio, User } from "lucide-react";
import { SessionState } from "../../types/session";
import { PatientProfile } from "../../types/patient";

interface SessionControlsCardProps {
  state: SessionState;
  durationFormatted: string;
  sampleCount: number;
  isConnected: boolean;
  isSimulated: boolean;
  patient: PatientProfile | null;
  disconnectError: string | null;
  isSaving: boolean;
  savedFilePath: string | null;
  saveError: string | null;
  isVerified: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSave: () => void;
  onReset: () => void;
}

export const SessionControlsCard: React.FC<SessionControlsCardProps> = ({
  state,
  durationFormatted,
  sampleCount,
  isConnected,
  isSimulated,
  patient,
  disconnectError,
  isSaving,
  savedFilePath,
  saveError,
  isVerified,
  onStart,
  onPause,
  onResume,
  onStop,
  onSave,
  onReset,
}) => {
  const canStart = (isConnected || isSimulated) && patient !== null && state === "IDLE";

  return (
    <div
      className="medical-card"
      style={{
        padding: "18px 22px",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* 1. Header with Patient Association and Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: state === "RECORDING" ? "#FEE2E2" : "var(--teal-surface)",
              border: `1px solid ${state === "RECORDING" ? "#FCA5A5" : "var(--border-teal)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: state === "RECORDING" ? "#DC2626" : "var(--teal-primary)",
              transition: "all var(--transition-fast)",
            }}
          >
            <Radio size={18} className={state === "RECORDING" ? "pulse-anim" : undefined} />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)" }}>
                Balance Session Recorder
              </h2>

              {/* Status Pill */}
              {state === "RECORDING" && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#FEE2E2",
                    border: "1px solid #FCA5A5",
                    color: "#DC2626",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#DC2626" }} />
                  Recording
                </span>
              )}

              {state === "PAUSED" && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#FEF3C7",
                    border: "1px solid #FCD34D",
                    color: "#92400E",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#D97706" }} />
                  Paused
                </span>
              )}

              {state === "COMPLETED" && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#DCFCE7",
                    border: "1px solid #BBF7D0",
                    color: "#166534",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16A34A" }} />
                  Completed
                </span>
              )}

              {state === "IDLE" && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    color: "#64748B",
                  }}
                >
                  Session Status: Ready
                </span>
              )}
            </div>

            {/* Patient Association Tag */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
              <User size={13} color="var(--text-muted)" />
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                Patient: <strong>{patient ? `${patient.fullName} (${patient.medicalRecordNumber})` : "None Selected"}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Live Duration and Sample Counter Callout */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "10px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                Active Duration
              </span>
              <span style={{ fontSize: "1.125rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: state === "RECORDING" ? "#DC2626" : "var(--text-main)" }}>
                {durationFormatted}
              </span>
            </div>

            <div style={{ width: "1px", height: "24px", background: "var(--border-light)" }} />

            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.625rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                Samples
              </span>
              <span style={{ fontSize: "0.9375rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                {sampleCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect Warning */}
      {disconnectError && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            background: "#FEE2E2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={16} />
          <span>{disconnectError}</span>
        </div>
      )}

      {/* Save Error Notice */}
      {saveError && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            background: "#FEE2E2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={16} />
          <span>Save Error: {saveError}</span>
        </div>
      )}

      {/* 2. Controls Action Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          borderTop: "1px solid var(--border-light)",
          paddingTop: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Start Button (Visible when IDLE) */}
          {state === "IDLE" && (
            <button
              onClick={onStart}
              disabled={!canStart}
              className="btn-primary"
              style={{
                padding: "8px 18px",
                fontSize: "0.875rem",
                opacity: canStart ? 1 : 0.5,
                cursor: canStart ? "pointer" : "not-allowed",
              }}
            >
              <Play size={16} />
              <span>{isSimulated ? "Start Session (Simulated)" : "Start Session"}</span>
            </button>
          )}

          {/* Pause Button (Visible when RECORDING) */}
          {state === "RECORDING" && (
            <button
              onClick={onPause}
              className="btn-secondary"
              style={{ padding: "8px 16px", fontSize: "0.875rem", color: "#B45309" }}
            >
              <Pause size={16} />
              <span>Pause</span>
            </button>
          )}

          {/* Resume Button (Visible when PAUSED) */}
          {state === "PAUSED" && (
            <button
              onClick={onResume}
              className="btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.875rem" }}
            >
              <Play size={16} />
              <span>Resume</span>
            </button>
          )}

          {/* Stop Session Button (Visible when RECORDING or PAUSED) */}
          {(state === "RECORDING" || state === "PAUSED") && (
            <button
              onClick={onStop}
              className="btn-secondary"
              style={{
                padding: "8px 16px",
                fontSize: "0.875rem",
                background: "#FEF2F2",
                borderColor: "#FCA5A5",
                color: "#DC2626",
              }}
            >
              <Square size={15} />
              <span>Stop Session</span>
            </button>
          )}

          {/* Save Session Button (Visible when COMPLETED) */}
          {state === "COMPLETED" && (
            <button
              onClick={onSave}
              disabled={isSaving || isVerified}
              className="btn-primary"
              style={{
                padding: "8px 18px",
                fontSize: "0.875rem",
                background: isVerified ? "#16A34A" : "var(--teal-primary)",
              }}
            >
              {isVerified ? <CheckCircle size={16} /> : <Save size={16} />}
              <span>
                {isSaving
                  ? "Saving to Disk..."
                  : isVerified
                  ? "Session Saved & Verified"
                  : "Save Session"}
              </span>
            </button>
          )}

          {/* Discard / Reset Button (Visible when COMPLETED) */}
          {state === "COMPLETED" && (
            <button
              onClick={onReset}
              className="btn-ghost"
              style={{ padding: "8px 14px", fontSize: "0.8125rem" }}
            >
              <RotateCcw size={14} />
              <span>New Session</span>
            </button>
          )}
        </div>

        {/* Helpful status hint */}
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {state === "IDLE" && !canStart && (
            <span>
              {!patient
                ? "Select a patient before starting a session."
                : "Connect Wii Balance Board or enable Development Simulation to record."}
            </span>
          )}
          {state === "RECORDING" && (
            <span>Recording high-frequency balance measurements...</span>
          )}
          {state === "PAUSED" && (
            <span>Recording paused. Measurements stopped. Timer held.</span>
          )}
          {state === "COMPLETED" && !savedFilePath && (
            <span>Review session summary below and save to persistent storage.</span>
          )}
          {savedFilePath && isVerified && (
            <span style={{ color: "#16A34A", fontWeight: 600 }}>
              ✓ Saved and verified on disk
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
