import React from "react";

interface AngleSpeedometerProps {
  label: string;
  side: "LEFT" | "RIGHT" | "TRUNK";
  valueDeg: number | null;
  /** Gauge scale max for unsigned 0→maxDeg joints (default 180°) */
  maxDeg?: number;
  /**
   * When set, gauge is bipolar: minDeg … +maxDeg with upright/zero at center.
   * Used for 2D trunk sway (mid-hip → mid-shoulder vs vertical).
   */
  minDeg?: number;
  size?: number;
  /** Optional subtitle under the title (e.g. lean direction) */
  subtitle?: string;
  /** Caption under gauge for 0…max scales (not trunk) */
  scaleHint?: string;
}

/**
 * Semicircle speedometer — needle and color fill share the same upper arc
 * (LEFT → TOP → RIGHT). Color always grows from 0 toward the needle.
 */
export const AngleSpeedometer: React.FC<AngleSpeedometerProps> = ({
  label,
  side,
  valueDeg,
  maxDeg = 180,
  minDeg,
  size = 150,
  subtitle,
  scaleHint = "0° = straight · higher = more bent",
}) => {
  const bipolar = typeof minDeg === "number";
  const lo = bipolar ? minDeg! : 0;
  const hi = maxDeg;
  const span = Math.max(1e-6, hi - lo);

  const cx = size / 2;
  const cy = size * 0.58;
  const r = size * 0.42;
  const strokeW = Math.max(8, size * 0.06);

  const clamped =
    valueDeg === null || Number.isNaN(valueDeg)
      ? null
      : Math.max(lo, Math.min(hi, valueDeg));

  // t: 0 = left end, 1 = right end of upper semicircle
  const t = clamped === null ? (bipolar ? 0.5 : 0) : (clamped - lo) / span;
  // Gauge degrees on upper arc: 180°=left, 90°=top, 0°=right
  const needleGaugeDeg = 180 - t * 180;
  const needleTheta = (needleGaugeDeg * Math.PI) / 180;

  // Full upper track: left → right through TOP (SVG sweep=1 with y-down)
  const trackPath = arcPath(cx, cy, r, 180, 0);

  // Value fill along the SAME upper arc, always from the low end toward the needle
  let valuePath = "";
  if (clamped !== null) {
    if (bipolar) {
      const zeroT = (0 - lo) / span;
      const zeroGaugeDeg = 180 - zeroT * 180; // ~90° upright
      const fromDeg = Math.max(needleGaugeDeg, zeroGaugeDeg);
      const toDeg = Math.min(needleGaugeDeg, zeroGaugeDeg);
      // Only draw if there is a visible span
      if (Math.abs(fromDeg - toDeg) > 0.75) {
        valuePath = arcPath(cx, cy, r, fromDeg, toDeg);
      }
    } else if (t > 0.008) {
      // Always fill LEFT (180°) → needle. Never from the 180-value end backward.
      valuePath = arcPath(cx, cy, r, 180, needleGaugeDeg);
    }
  }

  const sideColor =
    side === "LEFT" ? "#38BDF8" : side === "RIGHT" ? "#34D399" : "#FBBF24";
  const display =
    clamped === null
      ? "--"
      : `${clamped > 0 && bipolar ? "+" : ""}${clamped.toFixed(0)}°`;

  const svgH = size * 0.72;
  const tipX = cx + Math.cos(needleTheta) * (r - 16);
  const tipY = cy - Math.sin(needleTheta) * (r - 16);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        minWidth: size,
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: sideColor,
          textAlign: "center",
        }}
      >
        {side === "TRUNK" ? label : `${side} · ${label}`}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "#94A3B8",
            textAlign: "center",
            maxWidth: size,
          }}
        >
          {subtitle}
        </div>
      )}
      <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
        {/* Track — upper semicircle only */}
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.35)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Value fill — same upper arc, from 0 toward needle */}
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke={sideColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const a = Math.PI * (1 - f);
          return (
            <line
              key={f}
              x1={cx + Math.cos(a) * (r - 12)}
              y1={cy - Math.sin(a) * (r - 12)}
              x2={cx + Math.cos(a) * (r + 3)}
              y2={cy - Math.sin(a) * (r + 3)}
              stroke="rgba(226, 232, 240, 0.55)"
              strokeWidth={2}
            />
          );
        })}
        {bipolar && (
          <line
            x1={cx}
            y1={cy - r - 4}
            x2={cx}
            y2={cy - r + 12}
            stroke="#F8FAFC"
            strokeWidth={2.5}
          />
        )}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke={clamped === null ? "#64748B" : "#F8FAFC"}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={6} fill={sideColor} />
        <circle cx={cx} cy={cy} r={2.5} fill="#0F172A" />
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          fill="#F1F5F9"
          style={{
            fontSize: `${Math.max(16, size * 0.11)}px`,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {display}
        </text>
        {bipolar ? (
          <>
            <text
              x={cx - r + 2}
              y={cy + 14}
              fill="#94A3B8"
              style={{ fontSize: "11px", fontWeight: 700 }}
            >
              L
            </text>
            <text
              x={cx + r - 14}
              y={cy + 14}
              fill="#94A3B8"
              style={{ fontSize: "11px", fontWeight: 700 }}
            >
              R
            </text>
          </>
        ) : (
          <>
            <text
              x={cx - r + 2}
              y={cy + 14}
              fill="#64748B"
              style={{ fontSize: "10px", fontWeight: 700 }}
            >
              0°
            </text>
            <text
              x={cx + r - 28}
              y={cy + 14}
              fill="#64748B"
              style={{ fontSize: "9px", fontWeight: 700 }}
            >
              {hi}°
            </text>
          </>
        )}
      </svg>
      {!bipolar && scaleHint && (
        <div style={{ fontSize: "0.6rem", fontWeight: 600, color: "#94A3B8", textAlign: "center" }}>
          {scaleHint}
        </div>
      )}
    </div>
  );
};

export interface AngleSummaryNeedles {
  minDeg: number | null;
  medianDeg: number | null;
  maxDeg: number | null;
}

interface SummaryAngleSpeedometerProps {
  label: string;
  side: "LEFT" | "RIGHT" | "TRUNK";
  summary: AngleSummaryNeedles;
  maxDeg?: number;
  minDeg?: number;
  size?: number;
  /** Stretch card to fill grid cell / parent width */
  fillWidth?: boolean;
  scaleHint?: string;
}

const NEEDLE_COLORS = {
  min: "#0284C7",
  median: "#0F172A",
  max: "#D97706",
} as const;

/**
 * Session summary speedometer with three sticks: min / median / max.
 */
export const SummaryAngleSpeedometer: React.FC<SummaryAngleSpeedometerProps> = ({
  label,
  side,
  summary,
  maxDeg = 180,
  minDeg,
  size = 220,
  fillWidth = false,
  scaleHint = "0° = straight",
}) => {
  const bipolar = typeof minDeg === "number";
  const lo = bipolar ? minDeg! : 0;
  const hi = maxDeg;
  const span = Math.max(1e-6, hi - lo);

  const cx = size / 2;
  const cy = size * 0.58;
  const r = size * 0.42;
  const strokeW = Math.max(8, size * 0.055);
  const trackPath = arcPath(cx, cy, r, 180, 0);

  const clampVal = (v: number | null) =>
    v === null || Number.isNaN(v) ? null : Math.max(lo, Math.min(hi, v));

  const minV = clampVal(summary.minDeg);
  const medV = clampVal(summary.medianDeg);
  const maxV = clampVal(summary.maxDeg);

  const toNeedle = (v: number | null, color: string, width: number, shorten: number) => {
    if (v === null) return null;
    const t = (v - lo) / span;
    const gaugeDeg = 180 - t * 180;
    const theta = (gaugeDeg * Math.PI) / 180;
    const tipX = cx + Math.cos(theta) * (r - shorten);
    const tipY = cy - Math.sin(theta) * (r - shorten);
    return (
      <line
        key={`${color}-${v}`}
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
    );
  };

  // Range fill from min → max along upper arc (helps read spread)
  let rangePath = "";
  if (minV !== null && maxV !== null && Math.abs(maxV - minV) > 0.5) {
    const tMin = (minV - lo) / span;
    const tMax = (maxV - lo) / span;
    const gMin = 180 - tMin * 180;
    const gMax = 180 - tMax * 180;
    rangePath = arcPath(cx, cy, r, Math.max(gMin, gMax), Math.min(gMin, gMax));
  }

  const sideColor =
    side === "LEFT" ? "#0284C7" : side === "RIGHT" ? "#059669" : "#D97706";
  const fmt = (v: number | null) =>
    v === null ? "--" : `${v > 0 && bipolar ? "+" : ""}${Math.round(v)}°`;

  const svgH = size * 0.78;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        width: fillWidth ? "100%" : undefined,
        minWidth: fillWidth ? 0 : size,
        padding: fillWidth ? "14px 10px" : "8px 6px",
        borderRadius: 12,
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: fillWidth ? "0.75rem" : "0.7rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: sideColor,
          textAlign: "center",
        }}
      >
        {side === "TRUNK" ? label : `${side} · ${label}`}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${svgH}`}
        style={{
          display: "block",
          width: "100%",
          maxWidth: fillWidth ? "100%" : size,
          height: "auto",
        }}
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={trackPath}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {rangePath && (
          <path
            d={rangePath}
            fill="none"
            stroke="rgba(13, 148, 136, 0.28)"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const a = Math.PI * (1 - f);
          return (
            <line
              key={f}
              x1={cx + Math.cos(a) * (r - 12)}
              y1={cy - Math.sin(a) * (r - 12)}
              x2={cx + Math.cos(a) * (r + 3)}
              y2={cy - Math.sin(a) * (r + 3)}
              stroke="#CBD5E1"
              strokeWidth={2}
            />
          );
        })}
        {bipolar && (
          <line
            x1={cx}
            y1={cy - r - 4}
            x2={cx}
            y2={cy - r + 12}
            stroke="#0F172A"
            strokeWidth={2.5}
          />
        )}
        {/* Three sticks: min / median / max */}
        {toNeedle(minV, NEEDLE_COLORS.min, 2.4, 18)}
        {toNeedle(maxV, NEEDLE_COLORS.max, 2.4, 18)}
        {toNeedle(medV, NEEDLE_COLORS.median, 3.4, 14)}
        <circle cx={cx} cy={cy} r={6} fill={sideColor} />
        <circle cx={cx} cy={cy} r={2.5} fill="#FFFFFF" />
        <text
          x={cx}
          y={cy + 26}
          textAnchor="middle"
          fill="#0F172A"
          style={{ fontSize: "11px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
        >
          {fmt(medV)}
        </text>
        <text
          x={cx}
          y={cy + 40}
          textAnchor="middle"
          fill="#64748B"
          style={{ fontSize: "9px", fontWeight: 700 }}
        >
          median
        </text>
        {bipolar ? (
          <>
            <text x={cx - r + 2} y={cy + 14} fill="#64748B" style={{ fontSize: "10px", fontWeight: 700 }}>
              L
            </text>
            <text x={cx + r - 14} y={cy + 14} fill="#64748B" style={{ fontSize: "10px", fontWeight: 700 }}>
              R
            </text>
          </>
        ) : (
          <>
            <text x={cx - r + 2} y={cy + 14} fill="#64748B" style={{ fontSize: "10px", fontWeight: 700 }}>
              0°
            </text>
            <text x={cx + r - 28} y={cy + 14} fill="#64748B" style={{ fontSize: "9px", fontWeight: 700 }}>
              {hi}°
            </text>
          </>
        )}
      </svg>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 12px",
          fontSize: fillWidth ? "0.6875rem" : "0.625rem",
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: NEEDLE_COLORS.min }}>min {fmt(minV)}</span>
        <span style={{ color: NEEDLE_COLORS.median }}>med {fmt(medV)}</span>
        <span style={{ color: NEEDLE_COLORS.max }}>max {fmt(maxV)}</span>
      </div>
      {!bipolar && scaleHint && (
        <div style={{ fontSize: "0.55rem", fontWeight: 600, color: "#94A3B8", textAlign: "center" }}>
          {scaleHint}
        </div>
      )}
    </div>
  );
};

/**
 * Point on upper-arc gauge: 180°=left, 90°=top, 0°=right
 * (y decreases toward top of screen).
 */
function gaugePoint(cx: number, cy: number, radius: number, gaugeDeg: number) {
  const rad = (gaugeDeg * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * radius,
    y: cy - Math.sin(rad) * radius,
  };
}

/**
 * Upper-arc path from startGaugeDeg → endGaugeDeg.
 * In SVG (y-down), left→top→right is clockwise → sweep-flag = 1.
 */
function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startGaugeDeg: number,
  endGaugeDeg: number
): string {
  const start = gaugePoint(cx, cy, radius, startGaugeDeg);
  const end = gaugePoint(cx, cy, radius, endGaugeDeg);
  const delta = Math.abs(startGaugeDeg - endGaugeDeg);
  if (delta < 0.05) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  const largeArc = delta > 180 ? 1 : 0;
  // Decreasing gauge deg (180→0) travels left→top→right = SVG clockwise = sweep 1
  // Increasing gauge deg (0→180) travels right→top→left = SVG ccw = sweep 0
  const sweep = startGaugeDeg > endGaugeDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}
