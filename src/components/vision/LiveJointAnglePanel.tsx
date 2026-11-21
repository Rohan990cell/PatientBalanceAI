import React from "react";
import { AngleSpeedometer } from "./AngleSpeedometer";
import {
  JOINT_ANGLE_KEYS,
  Pose2DAngles,
  getSideJointDeg,
  JointAngleKey,
} from "../../utils/pose2dAngles";

const JOINT_LABELS: Record<JointAngleKey, string> = {
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist: "Wrist",
  hip: "Hip",
  knee: "Knee",
  ankle: "Ankle",
};

interface LiveJointAnglePanelProps {
  angles: Pose2DAngles;
  hasPose: boolean;
}

function trunkSwaySubtitle(deg: number | null): string {
  if (deg === null || Number.isNaN(deg)) return "Mid-hip → mid-shoulder vs vertical";
  if (Math.abs(deg) < 3) return "Upright · mid-hip → mid-shoulder";
  return deg > 0
    ? "Sway +X (image right) · mid-hip → mid-shoulder"
    : "Sway −X (image left) · mid-hip → mid-shoulder";
}

/**
 * Live left/right 2D joint-angle speedometers + trunk sway (camera-plane only).
 */
export const LiveJointAnglePanel: React.FC<LiveJointAnglePanelProps> = ({
  angles,
  hasPose,
}) => {
  return (
    <div
      className="medical-card"
      style={{
        padding: "16px",
        background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#E2E8F0",
            }}
          >
            Live 2D Joint Angles
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#94A3B8", marginTop: "4px" }}>
            Shoulder: 0° = arm at side · Elbow/knee/…: 0° = straight (φ = 180° − θ) · Trunk: 0° = upright
          </div>
        </div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#94A3B8" }}>
          {hasPose
            ? `Tracking · conf ${angles.confidence != null ? (angles.confidence * 100).toFixed(0) : "--"}%`
            : "Awaiting full-body pose"}
        </div>
      </div>

      {/* Trunk sway — single bipolar speedometer only */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "14px 12px",
          borderRadius: "12px",
          background: "rgba(251, 191, 36, 0.08)",
          border: "1px solid rgba(251, 191, 36, 0.28)",
        }}
      >
        <AngleSpeedometer
          label="Trunk Sway (2D)"
          side="TRUNK"
          valueDeg={angles.trunkSwayDeg}
          minDeg={-45}
          maxDeg={45}
          size={220}
          subtitle={trunkSwaySubtitle(angles.trunkSwayDeg)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "18px",
        }}
      >
        {JOINT_ANGLE_KEYS.map((joint) => (
          <div
            key={joint}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "16px",
              padding: "16px 12px",
              borderRadius: "12px",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
            }}
          >
            <AngleSpeedometer
              label={JOINT_LABELS[joint]}
              side="LEFT"
              valueDeg={getSideJointDeg(angles, "left", joint)}
              size={168}
              scaleHint={
                joint === "shoulder"
                  ? "0° = arm at side · higher = raised"
                  : "0° = straight · higher = more bent"
              }
            />
            <AngleSpeedometer
              label={JOINT_LABELS[joint]}
              side="RIGHT"
              valueDeg={getSideJointDeg(angles, "right", joint)}
              size={168}
              scaleHint={
                joint === "shoulder"
                  ? "0° = arm at side · higher = raised"
                  : "0° = straight · higher = more bent"
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
};
