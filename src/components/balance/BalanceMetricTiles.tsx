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
        minWidth: 0,
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
          flexWrap: "wrap",
          gap: "10px",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
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
              flexShrink: 0,
            }}
          >
            <Scale size={18} />
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#334155" }}>
              Total Weight
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#475569", marginTop: "2px" }}>
              Total load on 4 sensors
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 0, flexShrink: 0 }}>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              color: hasData ? "#0F766E" : "var(--text-light)",
              fontVariantNumeric: "tabular-nums",
              minWidth: "6ch",
              display: "inline-block",
            }}
          >
            {hasData && reading && typeof reading.totalWeight === "number" && Number.isFinite(reading.totalWeight)
              ? `${reading.totalWeight.toFixed(1)} kg`
              : "--"}
          </div>
          {isSimulated && (
            <span style={{ fontSize: "0.6875rem", fontWeight: 800, color: "#B45309", background: "#FEF3C7", padding: "1px 6px", borderRadius: "3px" }}>
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
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ArrowLeftRight size={16} color="#0F766E" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#334155" }}>
              Lateral Balance (Left / Right)
            </span>
          </div>

          <div style={{ display: "flex", gap: "12px", fontSize: "0.9375rem", fontWeight: 800, flexWrap: "wrap", justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "#0F172A", whiteSpace: "nowrap", minWidth: "8ch", display: "inline-block", textAlign: "right" }}>
              L: {hasData && reading && typeof reading.leftPercent === "number" && Number.isFinite(reading.leftPercent) ? `${reading.leftPercent.toFixed(1)}%` : "--"}
            </span>
            <span style={{ color: "#0F172A", whiteSpace: "nowrap", minWidth: "8ch", display: "inline-block", textAlign: "right" }}>
              R: {hasData && reading && typeof reading.rightPercent === "number" && Number.isFinite(reading.rightPercent) ? `${reading.rightPercent.toFixed(1)}%` : "--"}
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
              width: hasData && reading && typeof reading.leftPercent === "number" && Number.isFinite(reading.leftPercent) ? `${reading.leftPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#0D9488" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
          <div
            style={{
              width: hasData && reading && typeof reading.rightPercent === "number" && Number.isFinite(reading.rightPercent) ? `${reading.rightPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#0284C7" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#334155", fontWeight: 600, flexWrap: "wrap", gap: "6px" }}>
          <span>Left: <strong style={{ color: "#0F172A", fontWeight: 700 }}>{hasData && reading && typeof reading.leftWeight === "number" && Number.isFinite(reading.leftWeight) ? `${reading.leftWeight.toFixed(1)} kg` : "--"}</strong></span>
          <span>Right: <strong style={{ color: "#0F172A", fontWeight: 700 }}>{hasData && reading && typeof reading.rightWeight === "number" && Number.isFinite(reading.rightWeight) ? `${reading.rightWeight.toFixed(1)} kg` : "--"}</strong></span>
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
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ArrowUpDown size={16} color="#0F766E" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#334155" }}>
              Anteroposterior (Front +Y / Back -Y)
            </span>
          </div>

          <div style={{ display: "flex", gap: "12px", fontSize: "0.9375rem", fontWeight: 800, flexWrap: "wrap", justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "#0F172A", whiteSpace: "nowrap", minWidth: "9ch", display: "inline-block", textAlign: "right" }}>
              Ant: {hasData && reading && typeof reading.anteriorPercent === "number" && Number.isFinite(reading.anteriorPercent) ? `${reading.anteriorPercent.toFixed(1)}%` : "--"}
            </span>
            <span style={{ color: "#0F172A", whiteSpace: "nowrap", minWidth: "10ch", display: "inline-block", textAlign: "right" }}>
              Post: {hasData && reading && typeof reading.posteriorPercent === "number" && Number.isFinite(reading.posteriorPercent) ? `${reading.posteriorPercent.toFixed(1)}%` : "--"}
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
              width: hasData && reading && typeof reading.anteriorPercent === "number" && Number.isFinite(reading.anteriorPercent) ? `${reading.anteriorPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#059669" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
          <div
            style={{
              width: hasData && reading && typeof reading.posteriorPercent === "number" && Number.isFinite(reading.posteriorPercent) ? `${reading.posteriorPercent}%` : "50%",
              height: "100%",
              background: hasData ? "#4F46E5" : "#CBD5E1",
              transition: "width 120ms ease",
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#334155", fontWeight: 600, flexWrap: "wrap", gap: "6px" }}>
          <span>Front: <strong style={{ color: "#0F172A", fontWeight: 700 }}>{hasData && reading && typeof reading.anteriorWeight === "number" && Number.isFinite(reading.anteriorWeight) ? `${reading.anteriorWeight.toFixed(1)} kg` : "--"}</strong></span>
          <span>Back: <strong style={{ color: "#0F172A", fontWeight: 700 }}>{hasData && reading && typeof reading.posteriorWeight === "number" && Number.isFinite(reading.posteriorWeight) ? `${reading.posteriorWeight.toFixed(1)} kg` : "--"}</strong></span>
        </div>
      </div>

      {/* 4. Center of Pressure (COP X & COP Y) */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Compass size={16} color="#0F766E" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#334155" }}>
              Center of Pressure (COP)
            </span>
          </div>
          <span style={{ fontSize: "0.6875rem", color: "#475569", fontWeight: 600 }}>
            Normalized [-1.0 to +1.0]
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", width: "100%" }}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#334155", fontWeight: 700, wordBreak: "break-word" }}>
              COP X — Lateral (Left -X / Right +X)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: hasData ? "#0F172A" : "var(--text-light)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: "5ch",
                  display: "inline-block",
                }}
              >
                {hasData && reading && typeof reading.copX === "number" && Number.isFinite(reading.copX)
                  ? `${reading.copX >= 0 ? "+" : ""}${reading.copX.toFixed(2)}`
                  : "--"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 600, minWidth: "8ch", display: "inline-block" }}>
                {hasData && reading && typeof reading.copXMm === "number" && Number.isFinite(reading.copXMm)
                  ? `(${reading.copXMm >= 0 ? "+" : ""}${reading.copXMm.toFixed(1)} mm)`
                  : ""}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "#FFFFFF",
              border: "1.5px solid #CBD5E1",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#334155", fontWeight: 700, wordBreak: "break-word" }}>
              COP Y — Anteroposterior (Back -Y / Front +Y)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: hasData ? "#0F172A" : "var(--text-light)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: "5ch",
                  display: "inline-block",
                }}
              >
                {hasData && reading && typeof reading.copY === "number" && Number.isFinite(reading.copY)
                  ? `${reading.copY >= 0 ? "+" : ""}${reading.copY.toFixed(2)}`
                  : "--"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 600, minWidth: "8ch", display: "inline-block" }}>
                {hasData && reading && typeof reading.copYMm === "number" && Number.isFinite(reading.copYMm)
                  ? `(${reading.copYMm >= 0 ? "+" : ""}${reading.copYMm.toFixed(1)} mm)`
                  : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
