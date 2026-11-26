import React, { useMemo, useState } from "react";
import { TransitAngleBoxPlot, computePairedBoxCenters } from "../../utils/pose2dAngles";

interface TransitAngleBoxPlotPanelProps {
  plots: TransitAngleBoxPlot[];
}

/**
 * Per-transit joint-angle box plots.
 * X = trunk first, then L/R joint pairs (tight) with gaps between groups.
 */
export const TransitAngleBoxPlotPanel: React.FC<TransitAngleBoxPlotPanelProps> = ({
  plots,
}) => {
  const [selectedKey, setSelectedKey] = useState<string>("all");

  const visible = useMemo(() => {
    if (selectedKey === "all") return plots;
    return plots.filter((p) => `${p.fromStep}-${p.toStep}` === selectedKey);
  }, [plots, selectedKey]);

  if (!plots.length) {
    return (
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: "#FFFBEB",
          border: "1px solid #FDE68A",
          color: "#92400E",
          fontSize: "0.8125rem",
          fontWeight: 600,
          lineHeight: 1.45,
        }}
      >
        No leave→hit angle samples for this session. Keep the camera on with a full-body pose
        and run the exercise again — transit box plots are built from the live pose stream
        during travel between targets.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div
          style={{
            fontSize: "0.6875rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#0F766E",
          }}
        >
          Transit angle box plots (Δ vs T0 center)
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#64748B", lineHeight: 1.45 }}>
          Window = leave→hit travel. Values are Δ° from center-stance T0 (always vs center).
          X-axis: trunk first, then L/R pairs close together with larger gaps between joint groups.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <FilterChip
          active={selectedKey === "all"}
          label="All transits"
          onClick={() => setSelectedKey("all")}
        />
        {plots.map((p) => {
          const key = `${p.fromStep}-${p.toStep}`;
          return (
            <FilterChip
              key={key}
              active={selectedKey === key}
              label={`${p.fromStep} → ${p.toStep}`}
              onClick={() => setSelectedKey(key)}
            />
          );
        })}
      </div>

      {visible.map((plot, idx) => (
        <TransitBoxChart
          key={`${plot.fromStep}-${plot.toStep}`}
          plot={plot}
          showXAxisLabels={idx === visible.length - 1}
        />
      ))}
    </div>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "5px 10px",
      borderRadius: 8,
      border: active ? "1px solid #5EEAD4" : "1px solid #E2E8F0",
      background: active ? "#F0FDFA" : "#FFFFFF",
      color: active ? "#0F766E" : "#475569",
      fontSize: "0.6875rem",
      fontWeight: 800,
      cursor: "pointer",
    }}
  >
    {label}
  </button>
);

const TransitBoxChart: React.FC<{
  plot: TransitAngleBoxPlot;
  showXAxisLabels?: boolean;
}> = ({ plot, showXAxisLabels = true }) => {
  const W = 920;
  const H = 300;
  const pad = { top: 28, right: 16, bottom: showXAxisLabels ? 78 : 18, left: 72 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const boxes = plot.boxes;
  const centers = computePairedBoxCenters(boxes.length, pad.left, innerW);
  const pairSpanPx =
    centers.length >= 3 ? Math.abs(centers[2]! - centers[1]!) : innerW / Math.max(1, boxes.length);

  const allVals = boxes.flatMap((b) => [
    b.minDeg,
    b.maxDeg,
    b.whiskerLowDeg ?? b.minDeg,
    b.whiskerHighDeg ?? b.maxDeg,
    ...(b.outliersDeg ?? []),
  ]);
  // Domain always includes 0° (mandatory tick)
  const yMin = Math.min(0, ...(allVals.length ? allVals : [0])) - 2;
  const yMax = Math.max(0, ...(allVals.length ? allVals : [0])) + 3;
  const ySpan = Math.max(1, yMax - yMin);
  const yOf = (v: number) => pad.top + innerH - ((v - yMin) / ySpan) * innerH;

  // Always keep 0°; drop neighbors that would overlap after rounding (e.g. 0° + 1°)
  const yTicksRaw = Array.from(
    new Set([
      ...[0, 0.25, 0.5, 0.75, 1].map((t) =>
        parseFloat((yMin + t * ySpan).toFixed(0))
      ),
      0,
    ])
  ).sort((a, b) => a - b);
  const minTickGap = Math.max(2, ySpan / 10);
  const yTicks: number[] = [];
  for (const v of yTicksRaw) {
    if (v === 0) {
      yTicks.push(0);
      continue;
    }
    if (Math.abs(v - 0) < minTickGap) continue;
    const prev = yTicks[yTicks.length - 1];
    if (prev !== undefined && Math.abs(v - prev) < minTickGap) continue;
    yTicks.push(v);
  }
  if (!yTicks.includes(0)) yTicks.push(0);
  yTicks.sort((a, b) => a - b);

  const trunkCount = boxes.filter((b) => b.region === "trunk").length;
  const upperCount = boxes.filter((b) => b.region === "upper").length;
  const lowerCount = boxes.filter((b) => b.region === "lower").length;

  const regionColor = (region: "upper" | "lower" | "trunk") =>
    region === "upper" ? "#0284C7" : region === "lower" ? "#059669" : "#D97706";

  const regionMidX = (region: "upper" | "lower" | "trunk") => {
    const idxs = boxes
      .map((b, i) => (b.region === region ? i : -1))
      .filter((i) => i >= 0);
    if (!idxs.length) return null;
    const xs = idxs.map((i) => centers[i]!);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: "12px 12px 8px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          marginBottom: 8,
          fontSize: "0.75rem",
        }}
      >
        <span style={{ fontWeight: 900, color: "#0F172A" }}>
          Target {plot.fromStep} → {plot.toStep}
          <span style={{ color: "#64748B", fontWeight: 600 }}> · {plot.toLabel}</span>
          {plot.relativeToT0 ? (
            <span style={{ color: "#0F766E", fontWeight: 700 }}> · Δ T{plot.toStep}−T0</span>
          ) : null}
        </span>
        <span style={{ fontWeight: 700, color: "#0F766E" }}>
          {plot.transitSeconds.toFixed(2)} s transit
        </span>
        <span style={{ color: "#64748B" }}>
          {plot.sampleCount} samples · ~{plot.expectedPoints} expected ({plot.fpsUsed} FPS ×{" "}
          {plot.transitSeconds.toFixed(2)} s)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#64748B" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              border: "1.5px solid #DC2626",
              background: "#FEE2E2",
              display: "inline-block",
            }}
          />
          Outliers (&gt;1.5×IQR)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Angle box plot for transit ${plot.fromStep} to ${plot.toStep}`}
        style={{ display: "block", background: "#F8FAFC", borderRadius: 10 }}
      >
        {trunkCount > 0 && regionMidX("trunk") != null && (
          <text
            x={regionMidX("trunk")!}
            y={16}
            textAnchor="middle"
            fill="#D97706"
            fontSize={10}
            fontWeight={800}
          >
            TRUNK
          </text>
        )}
        {upperCount > 0 && regionMidX("upper") != null && (
          <text
            x={regionMidX("upper")!}
            y={16}
            textAnchor="middle"
            fill="#0284C7"
            fontSize={10}
            fontWeight={800}
          >
            UPPER
          </text>
        )}
        {lowerCount > 0 && regionMidX("lower") != null && (
          <text
            x={regionMidX("lower")!}
            y={16}
            textAnchor="middle"
            fill="#059669"
            fontSize={10}
            fontWeight={800}
          >
            LOWER
          </text>
        )}

        {yTicks.map((v) => (
          <text
            key={`y-${v}`}
            x={pad.left - 6}
            y={yOf(v) + 3}
            textAnchor="end"
            fill="#000000"
            fontSize={9}
            fontWeight={700}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {v}°
          </text>
        ))}

        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={pad.left + innerW}
          y2={pad.top + innerH}
          stroke="#000000"
          strokeWidth={1.5}
        />
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + innerH}
          stroke="#000000"
          strokeWidth={1.5}
        />

        {boxes.map((b, i) => {
          const cx = centers[i] ?? pad.left + innerW / 2;
          const boxW = Math.min(28, Math.max(14, pairSpanPx * 0.85));
          const whiskerLow = b.whiskerLowDeg ?? b.minDeg;
          const whiskerHigh = b.whiskerHighDeg ?? b.maxDeg;
          const outliers = b.outliersDeg ?? [];
          const yWhiskerLow = yOf(whiskerLow);
          const yQ1 = yOf(b.q1Deg);
          const yMed = yOf(b.medianDeg);
          const yQ3 = yOf(b.q3Deg);
          const yWhiskerHigh = yOf(whiskerHigh);
          const color = regionColor(b.region);
          const boxTop = Math.min(yQ3, yQ1);
          const boxH = Math.max(2, Math.abs(yQ1 - yQ3));
          const labelY = pad.top + innerH + 8;

          return (
            <g key={b.key}>
              <line
                x1={cx}
                y1={yWhiskerHigh}
                x2={cx}
                y2={yWhiskerLow}
                stroke={color}
                strokeWidth={1.4}
                opacity={0.85}
              />
              <line
                x1={cx - boxW * 0.35}
                y1={yWhiskerHigh}
                x2={cx + boxW * 0.35}
                y2={yWhiskerHigh}
                stroke={color}
                strokeWidth={1.4}
              />
              <line
                x1={cx - boxW * 0.35}
                y1={yWhiskerLow}
                x2={cx + boxW * 0.35}
                y2={yWhiskerLow}
                stroke={color}
                strokeWidth={1.4}
              />
              <rect
                x={cx - boxW / 2}
                y={boxTop}
                width={boxW}
                height={boxH}
                fill={`${color}22`}
                stroke={color}
                strokeWidth={1.6}
                rx={2}
              />
              <line
                x1={cx - boxW / 2}
                y1={yMed}
                x2={cx + boxW / 2}
                y2={yMed}
                stroke="#0F172A"
                strokeWidth={2}
              />
              {outliers.map((v, oi) => {
                const jitter = ((oi % 3) - 1) * 2.2;
                return (
                  <circle
                    key={`${b.key}-out-${oi}`}
                    cx={cx + jitter}
                    cy={yOf(v)}
                    r={2.4}
                    fill="#FEE2E2"
                    stroke="#DC2626"
                    strokeWidth={1.2}
                  >
                    <title>{`${b.label} outlier: ${v}°`}</title>
                  </circle>
                );
              })}
              {showXAxisLabels ? (
                <text
                  x={cx}
                  y={labelY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#0F172A"
                  fontSize={9}
                  fontWeight={700}
                  transform={`rotate(-90 ${cx} ${labelY})`}
                >
                  {b.label}
                </text>
              ) : null}
            </g>
          );
        })}

        <text
          x={14}
          y={pad.top + innerH / 2}
          fill="#000000"
          fontSize={9}
          fontWeight={800}
          transform={`rotate(-90 14 ${pad.top + innerH / 2})`}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {plot.relativeToT0 ? "Δ Angle (° vs T0)" : "Angle (°)"}
        </text>
      </svg>
    </div>
  );
};
