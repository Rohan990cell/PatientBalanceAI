import React from "react";

interface MetricTileProps {
  label: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
  icon: React.ReactNode;
  accentColor?: "cyan" | "emerald" | "amber" | "purple" | "blue";
  statusText?: string;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  unit,
  subtext,
  icon,
  accentColor = "cyan",
  statusText = "Hardware Idle",
}) => {
  const colorMap = {
    cyan: {
      color: "var(--accent-cyan)",
      bg: "rgba(6, 182, 212, 0.1)",
      border: "rgba(6, 182, 212, 0.25)",
    },
    emerald: {
      color: "var(--accent-emerald)",
      bg: "rgba(16, 185, 129, 0.1)",
      border: "rgba(16, 185, 129, 0.25)",
    },
    amber: {
      color: "var(--accent-amber)",
      bg: "rgba(245, 158, 11, 0.1)",
      border: "rgba(245, 158, 11, 0.25)",
    },
    purple: {
      color: "var(--accent-purple)",
      bg: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.25)",
    },
    blue: {
      color: "var(--accent-blue)",
      bg: "rgba(59, 130, 246, 0.1)",
      border: "rgba(59, 130, 246, 0.25)",
    },
  };

  const scheme = colorMap[accentColor];

  return (
    <div
      className="glass-panel"
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient background glow accent */}
      <div
        style={{
          position: "absolute",
          top: "-20px",
          right: "-20px",
          width: "90px",
          height: "90px",
          borderRadius: "50%",
          background: scheme.bg,
          filter: "blur(25px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: scheme.bg,
            border: `1px solid ${scheme.border}`,
            color: scheme.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>

      <div style={{ margin: "6px 0 10px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "2rem",
              fontWeight: 700,
              color: value !== null ? "var(--text-primary)" : "var(--text-muted)",
              letterSpacing: "-0.03em",
            }}
          >
            {value !== null ? value : "--"}
          </span>
          {unit && (
            <span
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              {unit}
            </span>
          )}
        </div>
        {subtext && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: "4px",
            }}
          >
            {subtext}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "10px",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}
      >
        <span>Status</span>
        <span style={{ color: scheme.color, fontWeight: 500 }}>{statusText}</span>
      </div>
    </div>
  );
};
