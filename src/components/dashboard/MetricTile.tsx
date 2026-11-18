import React from "react";

interface MetricTileProps {
  label: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
  icon: React.ReactNode;
  accentColor?: "cyan" | "emerald" | "amber" | "purple" | "blue";
  statusText?: string;
  onClick?: () => void;
}

export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  unit,
  subtext,
  icon,
  accentColor = "cyan",
  statusText = "Hardware Idle",
  onClick,
}) => {
  const colorMap = {
    cyan: {
      color: "var(--teal-primary)",
      bg: "var(--bg-subtle-mint)",
      border: "var(--border-mint)",
    },
    emerald: {
      color: "var(--green-primary)",
      bg: "var(--green-light)",
      border: "#BBF7D0",
    },
    amber: {
      color: "var(--amber-soft)",
      bg: "var(--amber-light)",
      border: "#FDE68A",
    },
    purple: {
      color: "var(--purple-doctor)",
      bg: "var(--purple-light)",
      border: "#E9D5FF",
    },
    blue: {
      color: "#2563EB",
      bg: "#EFF6FF",
      border: "#BFDBFE",
    },
  };

  const scheme = colorMap[accentColor] || colorMap.cyan;
  const isAvailable = value !== null && value !== undefined && value !== "";

  return (
    <div
      className="medical-card"
      onClick={onClick}
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        background: "#FFFFFF",
        border: "1px solid var(--border-light)",
        borderRadius: "16px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {/* Header: Label + Icon */}
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
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
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
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      {/* Metric Value */}
      <div style={{ margin: "4px 0 12px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "2rem",
              fontWeight: 800,
              color: isAvailable ? "var(--text-main)" : "var(--text-light)",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              minWidth: "4ch",
              display: "inline-block",
            }}
          >
            {isAvailable ? value : "--"}
          </span>
          {unit && (
            <span
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              {unit}
            </span>
          )}
        </div>
        {subtext && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              marginTop: "4px",
              lineHeight: 1.4,
            }}
          >
            {subtext}
          </p>
        )}
      </div>

      {/* Footer / Status Indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "12px",
          borderTop: "1px solid var(--border-light)",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ fontWeight: 500 }}>Status</span>
        <span
          style={{
            color: scheme.color,
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
};
