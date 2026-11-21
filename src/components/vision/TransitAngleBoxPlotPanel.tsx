import React, { useMemo, useState } from "react";
import { TransitAngleBoxPlot } from "../../utils/pose2dAngles";

interface TransitAngleBoxPlotPanelProps {
  plots: TransitAngleBoxPlot[];
}

/**
 * Per-transit joint-angle box plots.
 * X = upper body joints first, then lower. One chart per leave→hit window.
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
          Transit angle box plots
        </div>
        <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#64748B", lineHeight: 1.45 }}>
          Each chart uses angles from the moment you leave the previous target (after completing
          it) until you hit the next target border. Expected points ≈ transit seconds × camera
          FPS. X-axis: upper body, then lower body, then trunk sway.
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

      {visible.map((plot) => (
        <TransitBoxChart key={`${plot.fromStep}-${plot.toStep}`} plot={plot} />
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

const TransitBoxChart: React.FC<{ plot: TransitAngleBoxPlot }> = ({ plot }) => {
  const W = 920;
  const H = 280;
  const pad = { top: 28, right: 16, bottom: 58, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const boxes = plot.boxes;
  const n = Math.max(1, boxes.length);
  const slot = innerW / n;

  const allVals = boxes.flatMap((b) => [
    b.minDeg,
    b.maxDeg,
    b.whiskerLowDeg ?? b.minDeg,
    b.whiskerHighDeg ?? b.maxDeg,
    ...(b.outliersDeg ?? []),
  ]);
  const yMin = Math.min(0, ...allVals) - 2;
  const yMax = Math.max(20, ...allVals) + 2;
  const ySpan = Math.max(1, yMax - yMin);
  const yOf = (v: number) => pad.top + innerH - ((v - yMin) / ySpan) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    parseFloat((yMin + t * ySpan).toFixed(0))
  );

  const upperCount = boxes.filter((b) => b.region === "upper").length;
  const lowerCount = boxes.filter((b) => b.region === "lower").length;
  const trunkCount = boxes.filter((b) => b.region === "trunk").length;

  const regionColor = (region: "upper" | "lower" | "trunk") =>
    region === "upper" ? "#0284C7" : region === "lower" ? "#059669" : "#D97706";

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
        {/* Region dividers: upper | lower | trunk */}
        {upperCount > 0 && upperCount < n && (
          <line
            x1={pad.left + upperCount * slot}
            y1={pad.top}
            x2={pad.left + upperCount * slot}
            y2={pad.top + innerH}
            stroke="#CBD5E1"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        {lowerCount > 0 && upperCount + lowerCount < n && (
          <line
            x1={pad.left + (upperCount + lowerCount) * slot}
            y1={pad.top}
            x2={pad.left + (upperCount + lowerCount) * slot}
            y2={pad.top + innerH}
            stroke="#CBD5E1"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        {upperCount > 0 && (
          <text
            x={pad.left + (upperCount * slot) / 2}
            y={16}
            textAnchor="middle"
            fill="#0284C7"
            fontSize={10}
            fontWeight={800}
          >
            UPPER
          </text>
        )}
        {lowerCount > 0 && (
          <text
            x={pad.left + upperCount * slot + (lowerCount * slot) / 2}
            y={16}
            textAnchor="middle"
            fill="#059669"
            fontSize={10}
            fontWeight={800}
          >
            LOWER
          </text>
        )}
        {trunkCount > 0 && (
          <text
            x={pad.left + (upperCount + lowerCount) * slot + (trunkCount * slot) / 2}
            y={16}
            textAnchor="middle"
            fill="#D97706"
            fontSize={10}
            fontWeight={800}
          >
            TRUNK
          </text>
        )}

        {yTicks.map((v) => (
          <text
            key={`y-${v}`}
            x={pad.left - 6}
            y={yOf(v) + 3}
            textAnchor="end"
            fill="#64748B"
            fontSize={9}
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
          stroke="#94A3B8"
          strokeWidth={1.2}
        />
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + innerH}
          stroke="#94A3B8"
          strokeWidth={1.2}
        />

        {boxes.map((b, i) => {
          const cx = pad.left + slot * i + slot / 2;
          const boxW = Math.min(28, slot * 0.55);
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
          const outlierN = outliers.length;

          return (
            <g key={b.key}>
              {/* Tukey whiskers (inliers only) */}
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
              {/* IQR box */}
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
              {/* Median */}
              <line
                x1={cx - boxW / 2}
                y1={yMed}
                x2={cx + boxW / 2}
                y2={yMed}
                stroke="#0F172A"
                strokeWidth={2}
              />
              {/* Outlier points */}
              {outliers.map((v, oi) => {
                // Slight horizontal jitter so stacked outliers stay visible
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
              <text
                x={cx}
                y={H - 28}
                textAnchor="middle"
                fill="#334155"
                fontSize={8}
                fontWeight={700}
                transform={`rotate(-32 ${cx} ${H - 28})`}
              >
                {b.label}
              </text>
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize={8}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                n={b.n}
                {outlierN > 0 ? ` · ${outlierN} out` : ""}
              </text>
            </g>
          );
        })}

        <text
          x={14}
          y={pad.top + innerH / 2}
          fill="#64748B"
          fontSize={9}
          fontWeight={700}
          transform={`rotate(-90 14 ${pad.top + innerH / 2})`}
        >
          Angle (°)
        </text>
      </svg>
    </div>
  );
};
