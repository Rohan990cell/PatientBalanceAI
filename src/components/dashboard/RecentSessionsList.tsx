import React from "react";
import { CheckCircle2, Clock, Calendar, ArrowRight } from "lucide-react";
import { RecentSessionSummary } from "../../types/patient";

interface RecentSessionsListProps {
  sessions: RecentSessionSummary[];
  onSelectSession?: (id: string) => void;
}

export const RecentSessionsList: React.FC<RecentSessionsListProps> = ({
  sessions,
  onSelectSession,
}) => {
  if (sessions.length === 0) {
    return (
      <div
        style={{
          padding: "30px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.875rem",
        }}
      >
        No recent sessions recorded yet. Start a session when hardware is connected.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {sessions.map((session) => (
        <div
          key={session.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderRadius: "12px",
            background: "rgba(15, 23, 42, 0.5)",
            border: "1px solid var(--border-subtle)",
            transition: "all 0.2s ease",
            cursor: onSelectSession ? "pointer" : "default",
          }}
          onClick={() => onSelectSession?.(session.id)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                color: "var(--accent-emerald)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={18} />
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                {session.protocolName}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Calendar size={12} />
                  {session.date}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} />
                  {session.durationSeconds}s duration
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                Stability Score
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  color: session.balanceScore ? "var(--accent-cyan)" : "var(--text-muted)",
                }}
              >
                {session.balanceScore ? `${session.balanceScore} / 100` : "--"}
              </div>
            </div>

            <div style={{ color: "var(--text-muted)" }}>
              <ArrowRight size={16} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
