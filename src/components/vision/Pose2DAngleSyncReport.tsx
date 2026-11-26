import React, { useMemo } from "react";
import {
  Pose2DAngleSessionReport,
  Pose2DAngleMetricKey,
  CenterStanceSnapshot,
  TransitAngleBoxPlot,
  computePose2DAngleSummaries,
} from "../../utils/pose2dAngles";
import { SummaryAngleSpeedometer } from "./AngleSpeedometer";
import { CenterStanceVectorPanel } from "./CenterStanceVectorPanel";
import { TransitAngleBoxPlotPanel } from "./TransitAngleBoxPlotPanel";

interface Pose2DAngleSyncReportProps {
  report?: Pose2DAngleSessionReport | null;
  centerStance?: CenterStanceSnapshot | null;
  transitBoxPlots?: TransitAngleBoxPlot[] | null;
  /** When false, transit box plots are omitted (parent can render them elsewhere). */
  showTransitBoxPlots?: boolean;
  isSaving?: boolean;
  savedJsonPath?: string | null;
  saveError?: string | null;
  onSaveAgain?: () => void | Promise<void>;
}

function metricSide(key: Pose2DAngleMetricKey): "LEFT" | "RIGHT" | "TRUNK" {
  if (key === "trunkSwayDeg") return "TRUNK";
  if (key.startsWith("left")) return "LEFT";
  return "RIGHT";
}

function jointLabel(key: Pose2DAngleMetricKey): string {
  if (key === "trunkSwayDeg") return "Trunk Sway";
  if (key.includes("Shoulder")) return "Shoulder";
  if (key.includes("Elbow")) return "Elbow";
  if (key.includes("Wrist")) return "Wrist";
  if (key.includes("Hip")) return "Hip";
  if (key.includes("Knee")) return "Knee";
  if (key.includes("Ankle")) return "Ankle";
  return key;
}

/**
 * Post-session board-synced angle report (light / white theme):
 * 1) Center-stance person image + angle vectors + mid-hip coords
 * 2) Speedometers with min / median / max sticks
 */
export const Pose2DAngleSyncReport: React.FC<Pose2DAngleSyncReportProps> = ({
  report = null,
  centerStance = null,
  transitBoxPlots = null,
  showTransitBoxPlots = true,
  isSaving = false,
  savedJsonPath = null,
  saveError = null,
  onSaveAgain,
}) => {
  const summaries = useMemo(
    () => (report && report.snapshots.length > 0 ? computePose2DAngleSummaries(report) : []),
    [report]
  );

  const hasSnapshots = Boolean(report && report.snapshots.length > 0);
  const hasTransitPlots = Boolean(transitBoxPlots && transitBoxPlots.length > 0);
  if (!hasSnapshots && !centerStance && !(showTransitBoxPlots && hasTransitPlots)) {
    return (
      <div
        className="medical-card"
        style={{
          padding: "20px",
          background: "#FFFBEB",
          border: "1px solid #FDE68A",
          color: "#92400E",
          fontSize: "0.875rem",
          fontWeight: 600,
        }}
      >
        No board-synced 2D angle snapshots were captured. Keep the camera on with a
        full-body pose while completing each balance-board target.
      </div>
    );
  }

  const left = summaries.filter((s) => metricSide(s.key) === "LEFT");
  const right = summaries.filter((s) => metricSide(s.key) === "RIGHT");
  const trunk = summaries.filter((s) => metricSide(s.key) === "TRUNK");

  return (
    <div
      className="medical-card"
      style={{
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#0F766E",
          }}
        >
          Board-Synced 2D Angle Report
        </div>
        <h3
          style={{
            margin: "6px 0 4px",
            fontSize: "1.2rem",
            fontWeight: 900,
            color: "#0F172A",
          }}
        >
          Center stance image · angle vectors · speedometers
        </h3>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "#64748B", lineHeight: 1.5 }}>
          Person image is frozen at the end of the 3s center hold. Shoulder uses elevation from
          hanging (0° ≈ arm at side). Elbow / wrist / hip / knee / ankle use flexion from
          extension: φ = 180° − θ (0° = straight). Trunk sway: 0° = upright. Speedometers show
          min / median / max across completed targets
          {hasSnapshots
            ? ` (${report!.syncedTargetCount}/${report!.snapshots.length} synced).`
            : "."}
        </p>
        {hasSnapshots && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px 16px",
              marginTop: 10,
              fontSize: "0.6875rem",
              fontWeight: 800,
              color: "#475569",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 3, background: "#0284C7", borderRadius: 2 }} />
              Min stick
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 3, background: "#0F172A", borderRadius: 2 }} />
              Median stick
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 3, background: "#D97706", borderRadius: 2 }} />
              Max stick
            </span>
          </div>
        )}
      </div>

      {centerStance && <CenterStanceVectorPanel snapshot={centerStance} />}

      {(isSaving || savedJsonPath || saveError || onSaveAgain) && hasSnapshots && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            fontSize: "0.75rem",
            color: "#64748B",
          }}
        >
          {isSaving && <span>Saving angle report…</span>}
          {savedJsonPath && !isSaving && (
            <span style={{ color: "#047857", fontWeight: 600 }}>Saved: {savedJsonPath}</span>
          )}
          {saveError && <span style={{ color: "#DC2626" }}>Save error: {saveError}</span>}
          {onSaveAgain && (
            <button
              type="button"
              onClick={() => void onSaveAgain()}
              disabled={isSaving}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #99F6E4",
                background: "#F0FDFA",
                color: "#0F766E",
                fontWeight: 800,
                fontSize: "0.6875rem",
                cursor: isSaving ? "default" : "pointer",
              }}
            >
              Save again
            </button>
          )}
        </div>
      )}

      {hasSnapshots && (
        <>
          <div>
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#0284C7",
                marginBottom: 10,
              }}
            >
              Left side
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                gap: "12px",
                width: "100%",
              }}
            >
              {left.map((s) => (
                <SummaryAngleSpeedometer
                  key={s.key}
                  label={jointLabel(s.key)}
                  side="LEFT"
                  size={220}
                  fillWidth
                  scaleHint={s.key.includes("Shoulder") ? "0° = arm at side" : "0° = straight"}
                  summary={{
                    minDeg: s.minDeg,
                    medianDeg: s.medianDeg,
                    maxDeg: s.maxDeg,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#059669",
                marginBottom: 10,
              }}
            >
              Right side
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                gap: "12px",
                width: "100%",
              }}
            >
              {right.map((s) => (
                <SummaryAngleSpeedometer
                  key={s.key}
                  label={jointLabel(s.key)}
                  side="RIGHT"
                  size={220}
                  fillWidth
                  scaleHint={s.key.includes("Shoulder") ? "0° = arm at side" : "0° = straight"}
                  summary={{
                    minDeg: s.minDeg,
                    medianDeg: s.medianDeg,
                    maxDeg: s.maxDeg,
                  }}
                />
              ))}
            </div>
          </div>

          {trunk.map((s) => (
            <div key={s.key}>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#D97706",
                  marginBottom: 10,
                }}
              >
                Trunk
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                {/* Same width as one joint card in the 6-col row */}
                <div style={{ width: "calc((100% - 60px) / 6)", minWidth: 140 }}>
                  <SummaryAngleSpeedometer
                    label="Trunk Sway"
                    side="TRUNK"
                    minDeg={-45}
                    maxDeg={45}
                    size={220}
                    fillWidth
                    summary={{
                      minDeg: s.minDeg,
                      medianDeg: s.medianDeg,
                      maxDeg: s.maxDeg,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Leave→hit transit box plots (upper joints then lower) */}
      {showTransitBoxPlots && (hasTransitPlots || hasSnapshots) && (
        <TransitAngleBoxPlotPanel plots={transitBoxPlots ?? []} />
      )}
    </div>
  );
};
