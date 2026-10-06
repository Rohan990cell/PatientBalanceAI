import React from "react";
import { Activity, Target, Scale, ArrowUpRight } from "lucide-react";
import { Card } from "../components/common/Card";
import { CopRadarPlaceholder } from "../components/dashboard/CopRadarPlaceholder";
import { WeightDistributionBar } from "../components/dashboard/WeightDistributionBar";

export const ProgressPage: React.FC = () => {
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      {/* Overview Card */}
      <div
        className="medical-card-mint"
        style={{
          padding: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--teal-primary)", textTransform: "uppercase" }}>
            Patient Progress Summary
          </span>
          <h2 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)", marginTop: "2px" }}>
            Steadiness & Balance Trajectory
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Detailed Center of Pressure and sway stability measurements across recent sessions.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#FFFFFF",
            padding: "8px 16px",
            borderRadius: "12px",
            border: "1px solid var(--border-mint)",
            color: "var(--green-primary)",
            fontWeight: 700,
            fontSize: "0.9375rem",
          }}
        >
          <ArrowUpRight size={18} />
          <span>+14% Steady Gain</span>
        </div>
      </div>

      {/* 2 Column Technical Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Center of Pressure Analysis */}
        <Card
          title="Center of Pressure (CoP)"
          subtitle="Instantaneous sway displacement from center"
          icon={<Target size={18} />}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <CopRadarPlaceholder isConnected={false} copX={null} copY={null} />
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginTop: "16px",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ padding: "10px", background: "var(--bg-app)", borderRadius: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>CoP X (Lateral): </span>
                <strong style={{ color: "var(--text-main)" }}>0.0 mm</strong>
              </div>
              <div style={{ padding: "10px", background: "var(--bg-app)", borderRadius: "8px" }}>
                <span style={{ color: "var(--text-muted)" }}>CoP Y (A-P): </span>
                <strong style={{ color: "var(--text-main)" }}>0.0 mm</strong>
              </div>
            </div>
          </div>
        </Card>

        {/* Four Load Cell Distribution */}
        <Card
          title="Weight Distribution"
          subtitle="Real-time balance split between sensors"
          icon={<Scale size={18} />}
        >
          <div style={{ padding: "8px 0" }}>
            <WeightDistributionBar
              leftPercent={null}
              rightPercent={null}
              frontPercent={null}
              backPercent={null}
            />

            <div
              style={{
                marginTop: "20px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ padding: "12px", background: "var(--bg-app)", borderRadius: "10px" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Top-Left (TL)</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>-- kg</div>
              </div>
              <div style={{ padding: "12px", background: "var(--bg-app)", borderRadius: "10px" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Top-Right (TR)</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>-- kg</div>
              </div>
              <div style={{ padding: "12px", background: "var(--bg-app)", borderRadius: "10px" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Bottom-Left (BL)</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>-- kg</div>
              </div>
              <div style={{ padding: "12px", background: "var(--bg-app)", borderRadius: "10px" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Bottom-Right (BR)</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>-- kg</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Stability Metrics Table */}
      <Card
        title="Stability & Kinematics Baseline"
        subtitle="Quantitative metrics computed by the balance processing engine"
        icon={<Activity size={18} />}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          <div style={{ padding: "16px", borderRadius: "12px", background: "var(--bg-app)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
              STABILITY INDEX (SI)
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              -- <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-muted)" }}>mm</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Normal target: &lt; 5.0 mm
            </div>
          </div>

          <div style={{ padding: "16px", borderRadius: "12px", background: "var(--bg-app)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
              SWAY VELOCITY
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              -- <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-muted)" }}>mm/s</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Lower velocity = higher control
            </div>
          </div>

          <div style={{ padding: "16px", borderRadius: "12px", background: "var(--bg-app)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
              DPSI SCORE
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              --
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Wikstrom composite stability
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
