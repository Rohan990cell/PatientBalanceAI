import React from "react";
import { BarChart3, Activity } from "lucide-react";
import { Card } from "../components/common/Card";

export const AnalyticsPage: React.FC = () => {
  const metrics = [
    {
      title: "Stability Index (SI)",
      formula: "RMS radial distance from window mean: √[Σ((x - x̄)² + (y - ȳ)²)/N]",
      description: "Quantifies the spatial dispersion of the Center of Pressure. Lower values denote superior balance control.",
      unit: "Millimeters (mm)",
      expectedRange: "2.5 - 8.0 mm",
    },
    {
      title: "Dynamic Postural Stability Index (DPSI)",
      formula: "DPSI = √[(Σx² + Σy² + ΣΔz²)/N] (Wikstrom et al. 2005)",
      description: "Multi-axis stability index combining mediolateral, anteroposterior, and vertical ground reaction force fluctuations.",
      unit: "Composite Unitless",
      expectedRange: "0.28 - 0.45",
    },
    {
      title: "95% Confidence Bivariate Ellipse Area",
      formula: "Area = 2π * F(0.95) * √[λ₁ * λ₂] from 2x2 covariance eigenvalues",
      description: "Encloses 95% of all CoP trajectory points over the sliding 5-second analysis window.",
      unit: "mm²",
      expectedRange: "150 - 450 mm²",
    },
    {
      title: "Mean Resultant Sway Velocity",
      formula: "v̄ = Σ √(Δx² + Δy²) / Δt",
      description: "Average speed of the Center of Pressure displacement across planar axes. Sensitive marker of neuromuscular fatigue.",
      unit: "mm / second",
      expectedRange: "8.0 - 22.0 mm/s",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1300px", margin: "0 auto" }}>
      {/* Banner */}
      <div
        className="glass-panel"
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%)",
          border: "1px solid rgba(6, 182, 212, 0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "rgba(6, 182, 212, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-cyan)",
            }}
          >
            <BarChart3 size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Biomechanical Sway & Kinematics Engine
              </h3>
              <span className="status-pill standby" style={{ fontSize: "0.6875rem" }}>
                Modular Scaffold
              </span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Mathematical formulation adheres to biomechanical standards from the reference toolkit (Wikstrom et al. & Chi-Square Ellipse). DSP engine integration scheduled for Phase 3.
            </p>
          </div>
        </div>

        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--accent-cyan)",
            fontWeight: 600,
            border: "1px solid rgba(6, 182, 212, 0.3)",
            padding: "6px 12px",
            borderRadius: "8px",
          }}
        >
          Phase 3 Target
        </span>
      </div>

      {/* Metric Telemetry Specs Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {metrics.map((item, idx) => (
          <Card
            key={idx}
            title={item.title}
            subtitle={item.expectedRange ? `Clinical Reference Norm: ${item.expectedRange}` : undefined}
            icon={<Activity size={18} />}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--accent-cyan)",
                }}
              >
                {item.formula}
              </div>

              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>
                {item.description}
              </p>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <span>Measurement Unit:</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.unit}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
