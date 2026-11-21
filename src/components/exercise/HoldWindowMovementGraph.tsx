import React, { useMemo } from "react";
import { HoldWindowErrorSeries } from "../../utils/directionalWeightShiftExercise";

interface HoldWindowMovementGraphProps {
  series: HoldWindowErrorSeries;
}

/**
 * Line graph: COP miss distance (mm) vs hold-window time in seconds.
 * X = seconds since first border hit (holdRelMs / 1000). Ticks at 0, 1, 2, 3…
 * Green band = final continuous successful hold.
 */
export const HoldWindowMovementGraph: React.FC<HoldWindowMovementGraphProps> = ({ series }) => {
  const chart = useMemo(() => {
    const samples = series.samples;
    if (samples.length === 0) return null;

    const W = 640;
    const H = 220;
    const pad = { top: 18, right: 16, bottom: 36, left: 48 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const t0Sync = samples[0]?.syncTimestamp;

    /** Seconds since first border hit — plot in real time, not frame index. */
    const xSec = (s: (typeof samples)[0]): number => {
      if (typeof s.holdRelMs === "number" && Number.isFinite(s.holdRelMs)) {
        return Math.max(0, s.holdRelMs / 1000);
      }
      if (
        typeof s.syncTimestamp === "number" &&
        Number.isFinite(s.syncTimestamp) &&
        typeof t0Sync === "number" &&
        Number.isFinite(t0Sync)
      ) {
        return Math.max(0, (s.syncTimestamp - t0Sync) / 1000);
      }
      // Last resort: assume ~50 Hz if only frame index exists
      return Math.max(0, (s.frameIndex - 1) * 0.05);
    };

    const xs = samples.map(xSec);
    const minX = 0;
    const maxX = Math.max(1, ...xs);
    // Pad to next whole second so the last tick is visible
    const xAxisMax = Math.max(1, Math.ceil(maxX - 1e-9));
    const xSpan = Math.max(1e-6, xAxisMax - minX);

    const errMax = Math.max(1, ...samples.map((s) => s.errorMm));
    const yMax = errMax * 1.08;

    const xOf = (v: number) => pad.left + ((v - minX) / xSpan) * innerW;
    const yOf = (v: number) => pad.top + innerH - (v / yMax) * innerH;

    const errorLine = samples
      .map((s) => `${xOf(xSec(s)).toFixed(1)},${yOf(s.errorMm).toFixed(1)}`)
      .join(" ");

    let holdBand: { x: number; width: number } | null = null;
    if (
      series.finalHoldStartFrameIndex != null &&
      series.finalHoldEndFrameIndex != null
    ) {
      const holdSamples = samples.filter(
        (s) =>
          s.frameIndex >= series.finalHoldStartFrameIndex! &&
          s.frameIndex <= series.finalHoldEndFrameIndex!
      );
      if (holdSamples.length > 0) {
        const x0 = xOf(xSec(holdSamples[0]));
        const x1 = xOf(xSec(holdSamples[holdSamples.length - 1]));
        holdBand = { x: x0, width: Math.max(2, x1 - x0) };
      }
    }

    // Integer second ticks: 0, 1, 2, 3, …
    const xTicks: number[] = [];
    for (let s = 0; s <= xAxisMax; s++) xTicks.push(s);
    // If the span is long, thin ticks so labels don’t collide
    const tickStep = xAxisMax > 12 ? Math.ceil(xAxisMax / 10) : 1;
    const xTicksShown = xTicks.filter((s) => s % tickStep === 0);

    const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((v) =>
      parseFloat(v.toFixed(1))
    );

    const last = samples[samples.length - 1];

    return {
      W,
      H,
      pad,
      innerW,
      innerH,
      yMax,
      xOf,
      yOf,
      errorLine,
      holdBand,
      xTicks: xTicksShown,
      yTicks,
      minX,
      maxX: xAxisMax,
      lastX: xSec(last),
      lastY: last.errorMm,
      pointCount: samples.length,
      durationSec: parseFloat(maxX.toFixed(2)),
    };
  }, [series]);

  if (!chart || series.samples.length < 2) {
    return (
      <div style={{ fontSize: "0.75rem", color: "#94A3B8", padding: "8px 0" }}>
        Not enough samples to plot movement yet.
      </div>
    );
  }

  const holdLabel =
    series.finalHoldStartFrameIndex != null && series.finalHoldEndFrameIndex != null
      ? `Green zone = successful ${series.requiredHoldDurationSeconds}s hold`
      : `Green zone = successful ${series.requiredHoldDurationSeconds}s hold`;

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px 16px",
          marginBottom: 8,
          fontSize: "0.6875rem",
          color: "#64748B",
        }}
      >
        <span style={{ fontWeight: 800, color: "#0F766E" }}>
          Miss vs time (0→{chart.maxX}s · {chart.durationSec}s recorded · {chart.pointCount} points)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 14, height: 3, background: "#0D9488", borderRadius: 2 }} />
          Distance from target center (mm)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 14,
              height: 10,
              background: "rgba(16, 185, 129, 0.28)",
              border: "1px solid #10B981",
              borderRadius: 2,
            }}
          />
          {holdLabel}
        </span>
      </div>
      <div style={{ fontSize: "0.6875rem", color: "#64748B", marginBottom: 8, lineHeight: 1.4 }}>
        X-axis is seconds since first border hit (t = 0). Points are placed by real elapsed time,
        not frame number. Higher = farther from the target. Green band = final continuous hold.
      </div>

      <svg
        viewBox={`0 0 ${chart.W} ${chart.H}`}
        width="100%"
        style={{
          display: "block",
          background: "#F8FAFC",
          borderRadius: 10,
          border: "1px solid #E2E8F0",
        }}
        role="img"
        aria-label={`Hold-window movement graph for target ${series.stepNumber}`}
      >
        {chart.holdBand && (
          <rect
            x={chart.holdBand.x}
            y={chart.pad.top}
            width={chart.holdBand.width}
            height={chart.innerH}
            fill="rgba(16, 185, 129, 0.22)"
            stroke="#10B981"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}

        {chart.yTicks.map((v) => (
          <text
            key={`y-${v}`}
            x={chart.pad.left - 6}
            y={chart.yOf(v) + 3}
            textAnchor="end"
            fill="#64748B"
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {v.toFixed(0)}
          </text>
        ))}
        {chart.xTicks.map((sec) => (
          <text
            key={`x-${sec}`}
            x={chart.xOf(sec)}
            y={chart.pad.top + chart.innerH + 14}
            textAnchor="middle"
            fill="#64748B"
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {sec}
          </text>
        ))}

        <line
          x1={chart.pad.left}
          y1={chart.pad.top + chart.innerH}
          x2={chart.pad.left + chart.innerW}
          y2={chart.pad.top + chart.innerH}
          stroke="#94A3B8"
          strokeWidth={1.2}
        />
        <line
          x1={chart.pad.left}
          y1={chart.pad.top}
          x2={chart.pad.left}
          y2={chart.pad.top + chart.innerH}
          stroke="#94A3B8"
          strokeWidth={1.2}
        />

        <text
          x={12}
          y={chart.pad.top + chart.innerH / 2}
          fill="#64748B"
          fontSize={9}
          fontWeight={700}
          transform={`rotate(-90 12 ${chart.pad.top + chart.innerH / 2})`}
        >
          Miss (mm)
        </text>
        <text
          x={chart.pad.left + chart.innerW / 2}
          y={chart.H - 8}
          textAnchor="middle"
          fill="#64748B"
          fontSize={9}
          fontWeight={700}
        >
          Time (seconds)
        </text>

        <polyline
          points={chart.errorLine}
          fill="none"
          stroke="#0D9488"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {series.samples.length > 0 && (
          <circle
            cx={chart.xOf(chart.lastX)}
            cy={chart.yOf(chart.lastY)}
            r={3.5}
            fill="#0D9488"
            stroke="#FFFFFF"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
};
