import React from "react";
import { Scale, Compass, ArrowLeftRight, ArrowUpDown } from "lucide-react";
import { BalanceBoardReading } from "../../types/hardware";

interface BalanceMetricTilesProps {
  reading: BalanceBoardReading | null;
  isConnected: boolean;
  isSimulated?: boolean;
}

export const BalanceMetricTiles: React.FC<BalanceMetricTilesProps> = ({
  reading,
  isConnected,
  isSimulated = false,
}) => {
  const hasData = Boolean(reading && (isConnected || isSimulated));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        width: "100%",
      }}
    >
      {/* 1. Total Weight */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "var(--teal-surface)",
              border: "1px solid var(--border-teal)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--teal-primary)",
            }}
          >
            <Scale size={18} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Total Weight
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "2px" }}>
              Total load on 4 sensors
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: hasData ? "var(--teal-primary)" : "var(--text-light)" }}>
            {hasData && reading ? `${reading.totalWeight.toFixed(1)} kg` : "--"}
          </div>
          {isSimulated && (
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#D97706" }}>
              SIMULATED
            </span>
          )}
        </div>
      </div>

      {/* 2. Lateral Balance (Left / Right) */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ArrowLeftRight size={16} color="var(--teal-primary)" />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Lateral Balance (Left / Right)
            </span>
          </div>

          <div style={{ display: "flex", gap: "16px", fontSize: "0.9375rem", fontWeight: 700 }}>
            <span style={{ color: "var(--text-main)" }}>
              L: {hasData && reading ? `${reading.leftPercent.toFixed(1)}%` : "--"}
            </span>
            <span style={{ color: "var(--text-main)" }}>
              R: {hasData && reading ? `${reading.rightPercent.toFixed(1)}%` : "--"}
            </span>
          </div>
        </div>

        {/* Visual Balance Bar */}
        <div
          style={{
            height: "8px",
            width: "100%",
            borderRadius: "4px",
            background: "#E2E8F0",
            position: "relative",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: hasData && reading ? `${reading.leftPercent}%` : "50%",
              height: "100%",
              background: hasData ? "var(--teal-primary)" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
          <div
            style={{
              width: hasData && reading ? `${reading.rightPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#0EA5E9" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Left: {hasData && reading ? `${reading.leftWeight.toFixed(1)} kg` : "--"}</span>
          <span>Right: {hasData && reading ? `${reading.rightWeight.toFixed(1)} kg` : "--"}</span>
        </div>
      </div>

      {/* 3. Anteroposterior Balance (Anterior / Posterior) */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ArrowUpDown size={16} color="var(--teal-primary)" />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Anteroposterior (Front +Y / Back -Y)
            </span>
          </div>

          <div style={{ display: "flex", gap: "16px", fontSize: "0.9375rem", fontWeight: 700 }}>
            <span style={{ color: "var(--text-main)" }}>
              Ant: {hasData && reading ? `${reading.anteriorPercent.toFixed(1)}%` : "--"}
            </span>
            <span style={{ color: "var(--text-main)" }}>
              Post: {hasData && reading ? `${reading.posteriorPercent.toFixed(1)}%` : "--"}
            </span>
          </div>
        </div>

        {/* Visual Balance Bar */}
        <div
          style={{
            height: "8px",
            width: "100%",
            borderRadius: "4px",
            background: "#E2E8F0",
            position: "relative",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: hasData && reading ? `${reading.anteriorPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#059669" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
          <div
            style={{
              width: hasData && reading ? `${reading.posteriorPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#6366F1" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Front: {hasData && reading ? `${reading.anteriorWeight.toFixed(1)} kg` : "--"}</span>
          <span>Back: {hasData && reading ? `${reading.posteriorWeight.toFixed(1)} kg` : "--"}</span>
        </div>
      </div>

      {/* 4. Center of Pressure (COP X & COP Y) */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Compass size={16} color="var(--teal-primary)" />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Center of Pressure (COP)
            </span>
          </div>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            Normalized [-1.0 to +1.0]
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
              COP X — Lateral (Left -X / Right +X)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: hasData ? "var(--text-main)" : "var(--text-light)" }}>
                {hasData && reading ? `${reading.copX >= 0 ? "+" : ""}${reading.copX.toFixed(2)}` : "--"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {hasData && reading ? `(${reading.copXMm >= 0 ? "+" : ""}${reading.copXMm.toFixed(1)} mm)` : ""}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
              COP Y — Anteroposterior (Back -Y / Front +Y)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: hasData ? "var(--text-main)" : "var(--text-light)" }}>
                {hasData && reading ? `${reading.copY >= 0 ? "+" : ""}${reading.copY.toFixed(2)}` : "--"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {hasData && reading ? `(${reading.copYMm >= 0 ? "+" : ""}${reading.copYMm.toFixed(1)} mm)` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
