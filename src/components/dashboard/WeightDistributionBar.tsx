import React from "react";

interface WeightDistributionBarProps {
  leftPercent?: number | null;
  rightPercent?: number | null;
  frontPercent?: number | null;
  backPercent?: number | null;
  frontLeftKg?: number | null;
  frontRightKg?: number | null;
  backLeftKg?: number | null;
  backRightKg?: number | null;
}

export const WeightDistributionBar: React.FC<WeightDistributionBarProps> = ({
  leftPercent = null,
  rightPercent = null,
  frontPercent = null,
  backPercent = null,
  frontLeftKg = null,
  frontRightKg = null,
  backLeftKg = null,
  backRightKg = null,
}) => {
  const displayLeft = leftPercent !== null && Number.isFinite(leftPercent) ? `${leftPercent.toFixed(1)}%` : "--%";
  const displayRight = rightPercent !== null && Number.isFinite(rightPercent) ? `${rightPercent.toFixed(1)}%` : "--%";
  const displayFront = frontPercent !== null && Number.isFinite(frontPercent) ? `${frontPercent.toFixed(1)}%` : "--%";
  const displayBack = backPercent !== null && Number.isFinite(backPercent) ? `${backPercent.toFixed(1)}%` : "--%";

  const leftBarWidth = leftPercent !== null && Number.isFinite(leftPercent) ? `${Math.max(0, Math.min(100, leftPercent))}%` : "50%";
  const frontBarWidth = frontPercent !== null && Number.isFinite(frontPercent) ? `${Math.max(0, Math.min(100, frontPercent))}%` : "50%";

  const showCornerForces =
    frontLeftKg !== null || frontRightKg !== null || backLeftKg !== null || backRightKg !== null;

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
            Lateral Equilibrium
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
              opacity: leftPercent !== null ? 1 : 0.35,
              transition: "width 0.1s ease",
            }}
          />
          <div
            style={{
              flex: 1,
              background: "var(--green-primary)",
              opacity: rightPercent !== null ? 1 : 0.35,
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
            Anteroposterior Equilibrium
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
              width: frontBarWidth,
              background: "var(--teal-primary)",
              opacity: frontPercent !== null ? 1 : 0.35,
              transition: "width 0.1s ease",
            }}
          />
          <div
            style={{
              flex: 1,
              background: "var(--text-muted)",
              opacity: backPercent !== null ? 1 : 0.35,
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

      {/* Optional Corner Forces 4-Quadrant Display */}
      {showCornerForces && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginTop: "6px",
            padding: "12px 14px",
            background: "#F8FAF9",
            borderRadius: "12px",
            border: "1px solid var(--border-light)",
            fontSize: "0.75rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Front-Left (FL): </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
              {frontLeftKg !== null && Number.isFinite(frontLeftKg) ? `${frontLeftKg.toFixed(1)} kg` : "-- kg"}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Front-Right (FR): </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
              {frontRightKg !== null && Number.isFinite(frontRightKg) ? `${frontRightKg.toFixed(1)} kg` : "-- kg"}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Back-Left (BL): </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
              {backLeftKg !== null && Number.isFinite(backLeftKg) ? `${backLeftKg.toFixed(1)} kg` : "-- kg"}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Back-Right (BR): </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
              {backRightKg !== null && Number.isFinite(backRightKg) ? `${backRightKg.toFixed(1)} kg` : "-- kg"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
