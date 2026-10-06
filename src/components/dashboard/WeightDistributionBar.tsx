import React from "react";

interface WeightDistributionBarProps {
  leftPercent?: number | null;
  rightPercent?: number | null;
  frontPercent?: number | null;
  backPercent?: number | null;
}

export const WeightDistributionBar: React.FC<WeightDistributionBarProps> = ({
  leftPercent = null,
  rightPercent = null,
  frontPercent = null,
  backPercent = null,
}) => {
  const displayLeft = leftPercent !== null ? `${leftPercent.toFixed(1)}%` : "--%";
  const displayRight = rightPercent !== null ? `${rightPercent.toFixed(1)}%` : "--%";
  const displayFront = frontPercent !== null ? `${frontPercent.toFixed(1)}%` : "--%";
  const displayBack = backPercent !== null ? `${backPercent.toFixed(1)}%` : "--%";

  const leftBarWidth = leftPercent !== null ? `${leftPercent}%` : "50%";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Lateral Split (Left vs Right) */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
            fontSize: "0.8125rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--teal-primary)", fontWeight: 700 }}>LEFT (-X)</span>
            <span style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {displayLeft}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Lateral Balance
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {displayRight}
            </span>
            <span style={{ color: "var(--green-primary)", fontWeight: 700 }}>RIGHT (+X)</span>
          </div>
        </div>

        {/* Split Progress Track */}
        <div
          style={{
            position: "relative",
            height: "10px",
            borderRadius: "6px",
            backgroundColor: "#E2E8F0",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: leftBarWidth,
              background: "var(--teal-primary)",
              opacity: leftPercent !== null ? 1 : 0.4,
              transition: "width 0.2s ease",
            }}
          />
          <div
            style={{
              flex: 1,
              background: "var(--green-primary)",
              opacity: rightPercent !== null ? 1 : 0.4,
            }}
          />
          {/* Center Detent */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "2px",
              backgroundColor: "#FFFFFF",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </div>

      {/* Anteroposterior Split (Front vs Back) */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
            fontSize: "0.8125rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--teal-primary)", fontWeight: 700 }}>FRONT (+Y)</span>
            <span style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {displayFront}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Anteroposterior
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {displayBack}
            </span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>BACK (-Y)</span>
          </div>
        </div>

        {/* Split Progress Track */}
        <div
          style={{
            position: "relative",
            height: "10px",
            borderRadius: "6px",
            backgroundColor: "#E2E8F0",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: frontPercent !== null ? `${frontPercent}%` : "50%",
              background: "var(--teal-primary)",
              opacity: frontPercent !== null ? 1 : 0.4,
              transition: "width 0.2s ease",
            }}
          />
          <div
            style={{
              flex: 1,
              background: "var(--text-muted)",
              opacity: backPercent !== null ? 1 : 0.4,
            }}
          />
          {/* Center Detent */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "2px",
              backgroundColor: "#FFFFFF",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </div>
    </div>
  );
};
