import React, { useMemo } from "react";
import { TimeSeriesPoint } from "../../types/balanceTimeSeries";

export type GraphType = "copX" | "copY" | "weight";

interface RealtimeBalanceGraphProps {
  type: GraphType;
  points: TimeSeriesPoint[];
  isConnected: boolean;
  isSimulated?: boolean;
  windowDurationMs?: number;
  height?: number;
}

export const RealtimeBalanceGraph: React.FC<RealtimeBalanceGraphProps> = ({
  type,
  points,
  isConnected,
  isSimulated = false,
  windowDurationMs = 30_000,
  height = 165,
}) => {
  // Scientific Real Hardware Rule: Data is active only when connected (or dev simulation is explicitly on)
  const hasData = (isConnected || isSimulated) && points.length > 0;
  const latestPoint = points.length > 0 ? points[points.length - 1] : null;

  // Chart Dimensions & Grid Margins
  // For copX, the horizontal axis is COP X (-X / Left to +X / Right), Y axis is Time (NOW to -30s)
  // For copY, the vertical axis is COP Y (+Y / Front to -Y / Back), X axis is Time (-30s to NOW)
  // For weight, the vertical axis is % (0 to 100), X axis is Time (-30s to NOW)
  const width = 380;
  const leftMargin = type === "copX" ? 52 : 74;
  const rightMargin = 16;
  const topMargin = 16;
  const bottomMargin = 26;
  const plotWidth = width - leftMargin - rightMargin;
  const plotHeight = height - topMargin - bottomMargin;

  // Configuration by Graph Type adhering to scientific standard:
  // +X = RIGHT, -X = LEFT
  // +Y = FRONT / ANTERIOR, -Y = BACK / POSTERIOR
  const config = useMemo(() => {
    switch (type) {
      case "copX":
        return {
          title: "COP X — Lateral Movement",
          subtitle: "Left (-X) ← Center → Right (+X)",
          unit: "[-1.0 to +1.0]",
          primaryColor: "var(--teal-primary, #0D9488)",
          accentColor: "#14B8A6",
          gradientId: "grad-cop-x",
          baselineLabel: "Center (X = 0)",
          axisSummary: "Left (-X) ← Center → Right (+X)",
        };

      case "copY":
        return {
          title: "COP Y — Anteroposterior Movement",
          subtitle: "Front / Anterior (+Y) ↑ Center ↓ Back / Posterior (-Y)",
          unit: "[-1.0 to +1.0]",
          primaryColor: "#059669", // Biomechanical Green
          accentColor: "#10B981",
          gradientId: "grad-cop-y",
          baselineLabel: "Center (Y = 0)",
          axisSummary: "Front (+Y) ↑ Center ↓ Back (-Y)",
        };

      case "weight":
        return {
          title: "Weight Distribution",
          subtitle: "Left vs Right load distribution",
          unit: "Percentage (%)",
          primaryColor: "var(--teal-primary, #0D9488)", // Left %
          secondaryColor: "#0284C7", // Right % (Sky Blue)
          gradientId: "grad-weight-dist",
          baselineLabel: "50/50 Balanced Stance",
          axisSummary: "50/50 Baseline",
        };
    }
  }, [type]);

  const now = hasData && latestPoint ? latestPoint.timestamp : Date.now();

  // --------------------------------------------------------------------------
  // PATH & AREA GENERATION
  // --------------------------------------------------------------------------
  const { pathPrimary, pathSecondary, areaPrimary, latestMarker } = useMemo(() => {
    if (!hasData || points.length === 0) {
      return { pathPrimary: "", pathSecondary: "", areaPrimary: "", latestMarker: null };
    }

    let dPrimary = "";
    let dSecondary = "";
    let dArea = "";

    const pts = points;

    if (type === "copX") {
      // TASK 1: Keep COP X as the lateral axis:
      // -X / LEFT  ←──────── CENTER ────────→ RIGHT / +X
      // Horizontal coordinate X = COP X:
      // -1.0 (Left) -> leftMargin
      //  0.0 (Center) -> leftMargin + plotWidth * 0.5
      // +1.0 (Right) -> leftMargin + plotWidth
      // Vertical coordinate Y = Time:
      // NOW (0ms elapsed) -> topMargin
      // -30s (windowDurationMs elapsed) -> topMargin + plotHeight
      const getX = (val: number) => {
        const clamped = Math.max(-1.0, Math.min(1.0, isNaN(val) ? 0 : val));
        return leftMargin + ((clamped + 1.0) / 2.0) * plotWidth;
      };

      const getY = (t: number) => {
        const elapsed = Math.max(0, now - t);
        const progress = Math.max(0.0, Math.min(1.0, elapsed / windowDurationMs));
        return topMargin + progress * plotHeight;
      };

      const baseLineX = leftMargin + plotWidth * 0.5;

      pts.forEach((p, idx) => {
        const x = getX(p.copX);
        const y = getY(p.timestamp);

        if (idx === 0) {
          dPrimary += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          dArea += `M ${baseLineX.toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          dPrimary += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
          dArea += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      });

      if (pts.length > 0) {
        const lastY = getY(pts[pts.length - 1].timestamp);
        dArea += ` L ${baseLineX.toFixed(1)} ${lastY.toFixed(1)} Z`;
      }

      const marker = latestPoint
        ? { kind: "single" as const, x: getX(latestPoint.copX), y: getY(latestPoint.timestamp) }
        : null;

      return { pathPrimary: dPrimary, pathSecondary: "", areaPrimary: dArea, latestMarker: marker };
    } else if (type === "copY") {
      // TASK 2: Change COP Y visualization to represent vertical anterior-posterior movement:
      // +Y = FRONT / ANTERIOR (topMargin)
      //  0 = CENTER (topMargin + plotHeight * 0.5)
      // -Y = BACK / POSTERIOR (topMargin + plotHeight)
      // Horizontal coordinate X = Time:
      // -30s -> leftMargin
      // NOW  -> leftMargin + plotWidth
      const getX = (t: number) => {
        const elapsed = Math.max(0, now - t);
        const progress = Math.max(0.0, Math.min(1.0, 1.0 - elapsed / windowDurationMs));
        return leftMargin + progress * plotWidth;
      };

      const getY = (val: number) => {
        const clamped = Math.max(-1.0, Math.min(1.0, isNaN(val) ? 0 : val));
        return topMargin + ((1.0 - clamped) / 2.0) * plotHeight;
      };

      const baseLineY = topMargin + plotHeight * 0.5;

      pts.forEach((p, idx) => {
        const x = getX(p.timestamp);
        const y = getY(p.copY);

        if (idx === 0) {
          dPrimary += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          dArea += `M ${x.toFixed(1)} ${baseLineY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          dPrimary += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
          dArea += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      });

      if (pts.length > 0) {
        const lastX = getX(pts[pts.length - 1].timestamp);
        dArea += ` L ${lastX.toFixed(1)} ${baseLineY.toFixed(1)} Z`;
      }

      const marker = latestPoint
        ? { kind: "single" as const, x: getX(latestPoint.timestamp), y: getY(latestPoint.copY) }
        : null;

      return { pathPrimary: dPrimary, pathSecondary: "", areaPrimary: dArea, latestMarker: marker };
    } else {
      // Weight Distribution (0% to 100% load split)
      const getX = (t: number) => {
        const elapsed = Math.max(0, now - t);
        const progress = Math.max(0.0, Math.min(1.0, 1.0 - elapsed / windowDurationMs));
        return leftMargin + progress * plotWidth;
      };

      const getY = (val: number) => {
        const clamped = Math.max(0, Math.min(100, isNaN(val) ? 50 : val));
        return topMargin + ((100.0 - clamped) / 100.0) * plotHeight;
      };

      pts.forEach((p, idx) => {
        const x = getX(p.timestamp);
        const yLeft = getY(p.leftPercent);
        const yRight = getY(p.rightPercent);

        if (idx === 0) {
          dPrimary += `M ${x.toFixed(1)} ${yLeft.toFixed(1)}`;
          dSecondary += `M ${x.toFixed(1)} ${yRight.toFixed(1)}`;
        } else {
          dPrimary += ` L ${x.toFixed(1)} ${yLeft.toFixed(1)}`;
          dSecondary += ` L ${x.toFixed(1)} ${yRight.toFixed(1)}`;
        }
      });

      const marker = latestPoint
        ? {
            kind: "dual" as const,
            x: getX(latestPoint.timestamp),
            yLeft: getY(latestPoint.leftPercent),
            yRight: getY(latestPoint.rightPercent),
          }
        : null;

      return { pathPrimary: dPrimary, pathSecondary: dSecondary, areaPrimary: "", latestMarker: marker };
    }
  }, [hasData, points, type, now, windowDurationMs, plotWidth, plotHeight, topMargin, leftMargin, latestPoint]);

  // --------------------------------------------------------------------------
  // LIVE NUMERICAL VALUE & DIRECTION INDICATOR
  // --------------------------------------------------------------------------
  const renderCurrentValue = () => {
    if (!hasData || !latestPoint) {
      return <span style={{ color: "var(--text-light)", fontWeight: 700, fontSize: "0.8125rem" }}>--</span>;
    }

    if (type === "copX") {
      const x = latestPoint.copX;
      const dir = x > 0.05 ? "RIGHT (+X)" : x < -0.05 ? "LEFT (-X)" : "CENTER (0)";
      return (
        <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.8125rem" }}>
          {x >= 0 ? "+" : ""}{x.toFixed(2)}
          <span style={{ fontSize: "0.6875rem", color: config.primaryColor, marginLeft: "4px", fontWeight: 700 }}>
            ({dir})
          </span>
        </span>
      );
    }

    if (type === "copY") {
      const y = latestPoint.copY;
      const dir = y > 0.05 ? "FRONT (+Y)" : y < -0.05 ? "BACK (-Y)" : "CENTER (0)";
      return (
        <span style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.8125rem" }}>
          {y >= 0 ? "+" : ""}{y.toFixed(2)}
          <span style={{ fontSize: "0.6875rem", color: config.primaryColor, marginLeft: "4px", fontWeight: 700 }}>
            ({dir})
          </span>
        </span>
      );
    }

    if (type === "weight") {
      return (
        <div style={{ display: "flex", gap: "8px", alignItems: "baseline", fontSize: "0.8125rem", fontWeight: 700 }}>
          <span style={{ color: config.primaryColor }}>
            L: {latestPoint.leftPercent.toFixed(1)}%
          </span>
          <span style={{ color: config.secondaryColor }}>
            R: {latestPoint.rightPercent.toFixed(1)}%
          </span>
        </div>
      );
    }
  };

  return (
    <div
      className="medical-card"
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "10px",
        background: "var(--bg-surface)",
        borderRadius: "16px",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* 1. Aligned Card Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minHeight: "42px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "var(--text-main)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={config.title}
          >
            {config.title}
          </h3>
          {isSimulated && (
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "4px",
                background: "#FEF3C7",
                border: "1px solid #FCD34D",
                color: "#92400E",
                letterSpacing: "0.02em",
                flexShrink: 0,
              }}
            >
              SIM
            </span>
          )}
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", lineHeight: 1.3, fontWeight: 600 }}>
          {config.subtitle}
        </p>
      </div>

      {/* 2. Visual Graph Area */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id={config.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.primaryColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={config.primaryColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Plot Background Area */}
          <rect
            x={leftMargin}
            y={topMargin}
            width={plotWidth}
            height={plotHeight}
            fill="#FAFCFB"
            rx="6"
            stroke="var(--border-light, #E2E8F0)"
            strokeWidth="0.5"
          />

          {/* ------------------------------------------------------------- */}
          {/* GRID & TICKS: COP X (LATERAL)                                 */}
          {/* ------------------------------------------------------------- */}
          {type === "copX" && (
            <>
              {/* Vertical Gridlines & Lateral Labels: -X / Left ← Center → Right / +X */}
              {[
                { frac: 0.0, label: "Left (-X)", isBaseline: false },
                { frac: 0.25, label: "-0.5", isBaseline: false },
                { frac: 0.5, label: "Center (0)", isBaseline: true },
                { frac: 0.75, label: "+0.5", isBaseline: false },
                { frac: 1.0, label: "Right (+X)", isBaseline: false },
              ].map((tick, idx) => {
                const x = leftMargin + tick.frac * plotWidth;
                return (
                  <g key={`x-tick-${idx}`}>
                    <line
                      x1={x}
                      y1={topMargin}
                      x2={x}
                      y2={topMargin + plotHeight}
                      stroke={tick.isBaseline ? "#0D9488" : "#E2E8F0"}
                      strokeWidth={tick.isBaseline ? "1.5" : "1"}
                      strokeDasharray={tick.isBaseline ? "4 3" : undefined}
                    />
                    <text
                      x={x}
                      y={topMargin + plotHeight + 14}
                      textAnchor="middle"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight={tick.isBaseline ? "700" : "600"}
                      fill={tick.isBaseline ? "var(--teal-primary, #0D9488)" : "var(--text-muted)"}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}

              {/* Horizontal Time Gridlines & Elapsed Time Labels */}
              {[
                { frac: 0.0, label: "NOW" },
                { frac: 0.333, label: "-10s" },
                { frac: 0.666, label: "-20s" },
                { frac: 1.0, label: "-30s" },
              ].map((tick, idx) => {
                const y = topMargin + tick.frac * plotHeight;
                return (
                  <g key={`y-time-${idx}`}>
                    <line
                      x1={leftMargin}
                      y1={y}
                      x2={leftMargin + plotWidth}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={leftMargin - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight="600"
                      fill="#94A3B8"
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* GRID & TICKS: COP Y (ANTEROPOSTERIOR)                         */}
          {/* ------------------------------------------------------------- */}
          {type === "copY" && (
            <>
              {/* Horizontal Gridlines & Anteroposterior Labels: +Y Front ↑ Center ↓ Back -Y */}
              {[
                { frac: 0.0, label: "Front (+Y)", isBaseline: false },
                { frac: 0.25, label: "+0.5", isBaseline: false },
                { frac: 0.5, label: "Center (0)", isBaseline: true },
                { frac: 0.75, label: "-0.5", isBaseline: false },
                { frac: 1.0, label: "Back (-Y)", isBaseline: false },
              ].map((tick, idx) => {
                const y = topMargin + tick.frac * plotHeight;
                return (
                  <g key={`y-tick-${idx}`}>
                    <line
                      x1={leftMargin}
                      y1={y}
                      x2={leftMargin + plotWidth}
                      y2={y}
                      stroke={tick.isBaseline ? "#059669" : "#E2E8F0"}
                      strokeWidth={tick.isBaseline ? "1.5" : "1"}
                      strokeDasharray={tick.isBaseline ? "4 3" : undefined}
                    />
                    <text
                      x={leftMargin - 6}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight={tick.isBaseline ? "700" : "600"}
                      fill={tick.isBaseline ? "#059669" : "var(--text-muted)"}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}

              {/* Vertical Time Gridlines & Labels */}
              {[
                { frac: 0.0, label: "-30s" },
                { frac: 0.333, label: "-20s" },
                { frac: 0.666, label: "-10s" },
                { frac: 1.0, label: "NOW" },
              ].map((tick, idx) => {
                const x = leftMargin + tick.frac * plotWidth;
                return (
                  <g key={`x-time-${idx}`}>
                    <line
                      x1={x}
                      y1={topMargin}
                      x2={x}
                      y2={topMargin + plotHeight}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={topMargin + plotHeight + 14}
                      textAnchor="middle"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight="600"
                      fill="#94A3B8"
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* GRID & TICKS: WEIGHT DISTRIBUTION (%)                        */}
          {/* ------------------------------------------------------------- */}
          {type === "weight" && (
            <>
              {[
                { frac: 0.0, label: "100%", isBaseline: false },
                { frac: 0.25, label: "75%", isBaseline: false },
                { frac: 0.5, label: "50% (BAL)", isBaseline: true },
                { frac: 0.75, label: "25%", isBaseline: false },
                { frac: 1.0, label: "0%", isBaseline: false },
              ].map((tick, idx) => {
                const y = topMargin + tick.frac * plotHeight;
                return (
                  <g key={`w-tick-${idx}`}>
                    <line
                      x1={leftMargin}
                      y1={y}
                      x2={leftMargin + plotWidth}
                      y2={y}
                      stroke={tick.isBaseline ? "#94A3B8" : "#E2E8F0"}
                      strokeWidth={tick.isBaseline ? "1.5" : "1"}
                      strokeDasharray={tick.isBaseline ? "4 3" : undefined}
                    />
                    <text
                      x={leftMargin - 6}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight={tick.isBaseline ? "700" : "500"}
                      fill={tick.isBaseline ? "var(--text-main)" : "var(--text-muted)"}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}

              {[
                { frac: 0.0, label: "-30s" },
                { frac: 0.333, label: "-20s" },
                { frac: 0.666, label: "-10s" },
                { frac: 1.0, label: "NOW" },
              ].map((tick, idx) => {
                const x = leftMargin + tick.frac * plotWidth;
                return (
                  <g key={`w-time-${idx}`}>
                    <line
                      x1={x}
                      y1={topMargin}
                      x2={x}
                      y2={topMargin + plotHeight}
                      stroke="#E2E8F0"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={x}
                      y={topMargin + plotHeight + 14}
                      textAnchor="middle"
                      fontSize="8"
                      fontFamily="var(--font-sans)"
                      fontWeight="600"
                      fill="#94A3B8"
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ACTIVE DATA TRACES                                            */}
          {/* ------------------------------------------------------------- */}
          {hasData && (
            <>
              {/* Optional Subtle Area Fill */}
              {areaPrimary && (
                <path d={areaPrimary} fill={`url(#${config.gradientId})`} />
              )}

              {/* Primary Line */}
              {pathPrimary && (
                <path
                  d={pathPrimary}
                  fill="none"
                  stroke={config.primaryColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Secondary Line (Right % for Weight Distribution) */}
              {type === "weight" && pathSecondary && (
                <path
                  d={pathSecondary}
                  fill="none"
                  stroke={config.secondaryColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Current Position Marker Dot at Latest Sample */}
              {latestMarker && (
                <g>
                  {latestMarker.kind === "dual" ? (
                    <>
                      <circle
                        cx={latestMarker.x}
                        cy={latestMarker.yLeft}
                        r="3.5"
                        fill={config.primaryColor}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx={latestMarker.x}
                        cy={latestMarker.yRight}
                        r="3.5"
                        fill={config.secondaryColor}
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                    </>
                  ) : (
                    <circle
                      cx={latestMarker.x}
                      cy={latestMarker.y}
                      r="4.5"
                      fill={config.primaryColor}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                  )}
                </g>
              )}
            </>
          )}

          {/* Disconnected / Empty State Message Overlay (TASK 4) */}
          {!hasData && (
            <g transform={`translate(${leftMargin + plotWidth / 2}, ${topMargin + plotHeight / 2})`}>
              <rect
                x="-85"
                y="-15"
                width="170"
                height="30"
                rx="6"
                fill="#F1F5F9"
                stroke="var(--border-light, #CBD5E1)"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--text-muted)"
                fontFamily="var(--font-sans)"
              >
                No live balance data
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 3. Aligned Card Footer (NOW readout & Axis Convention Guide) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border-light)",
          paddingTop: "8px",
          marginTop: "2px",
          minHeight: "26px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
            NOW:
          </span>
          {renderCurrentValue()}
        </div>

        {/* Legend for Weight Distribution or Axis Guide */}
        {type === "weight" ? (
          <div style={{ display: "flex", gap: "8px", fontSize: "0.6875rem", fontWeight: 600 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: config.primaryColor }} />
              <span style={{ color: "var(--text-secondary)" }}>Left</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: config.secondaryColor }} />
              <span style={{ color: "var(--text-secondary)" }}>Right</span>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {config.axisSummary}
          </span>
        )}
      </div>
    </div>
  );
};
