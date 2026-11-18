import React from "react";
import { CheckCircle2, Clock, Calendar, ArrowRight, Play, Database, Activity } from "lucide-react";
import { RecentSessionSummary } from "../../types/patient";

export interface DashboardSessionItem {
  id: string;
  date: string;
  protocolName: string;
  durationFormatted?: string;
  durationSeconds?: number;
  measurementCount?: number;
  balanceScore?: number | null;
  dataSource?: "wii_balance_board" | "simulation";
  status?: "Completed" | "Partial" | "Pending";
  notes?: string;
}

interface RecentSessionsListProps {
  sessions: (RecentSessionSummary | DashboardSessionItem)[];
  onSelectSession?: (id: string) => void;
  onStartSession?: () => void;
}

export const RecentSessionsList: React.FC<RecentSessionsListProps> = ({
  sessions,
  onSelectSession,
  onStartSession,
}) => {
  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: "36px 20px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          color: "var(--text-muted)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "var(--bg-subtle-mint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--teal-primary)",
          }}
        >
          <Activity size={24} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-main)" }}>
            No Sessions Recorded Yet
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "4px", maxWidth: "420px" }}>
            Complete an exercise protocol to record real-time force plate and balance stability telemetry for this patient.
          </div>
        </div>
        {onStartSession && (
          <button
            onClick={onStartSession}
            className="btn-primary"
            style={{ fontSize: "0.8125rem", padding: "8px 16px", marginTop: "6px" }}
          >
            <Play size={14} fill="currentColor" />
            <span>Launch Exercise Protocol</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {sessions.map((session) => {
        const durationText =
          "durationFormatted" in session && session.durationFormatted
            ? session.durationFormatted
            : "durationSeconds" in session && session.durationSeconds !== undefined
            ? `${session.durationSeconds}s`
            : "30s";

        const dataSource = "dataSource" in session ? session.dataSource : undefined;
        const measurementCount = "measurementCount" in session ? session.measurementCount : undefined;

        return (
          <div
            key={session.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderRadius: "12px",
              background: "#FFFFFF",
              border: "1px solid var(--border-light)",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              cursor: onSelectSession ? "pointer" : "default",
            }}
            onClick={() => onSelectSession?.(session.id)}
          >
            {/* Session Info */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "var(--green-light)",
                  border: "1px solid #BBF7D0",
                  color: "var(--green-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={20} />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-main)" }}>
                    {session.protocolName}
                  </span>
                  {dataSource && (
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: "4px",
                        background: dataSource === "wii_balance_board" ? "var(--green-light)" : "var(--amber-light)",
                        color: dataSource === "wii_balance_board" ? "var(--green-primary)" : "var(--amber-soft)",
                        border: `1px solid ${dataSource === "wii_balance_board" ? "#BBF7D0" : "#FDE68A"}`,
                      }}
                    >
                      {dataSource === "wii_balance_board" ? "Authentic Force Plate" : "Simulation"}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "3px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={12} />
                    {session.date}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} />
                    {durationText} duration
                  </span>
                  {measurementCount !== undefined && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Database size={12} />
                      {measurementCount.toLocaleString()} points
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Score & Navigation */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Stability Score
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 800,
                    fontSize: "0.9375rem",
                    color: session.balanceScore ? "var(--teal-primary)" : "var(--text-muted)",
                  }}
                >
                  {session.balanceScore !== null && session.balanceScore !== undefined
                    ? `${session.balanceScore} / 100`
                    : "--"}
                </div>
              </div>

              {onSelectSession && (
                <div style={{ color: "var(--text-muted)" }}>
                  <ArrowRight size={16} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
