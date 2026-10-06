import React, { useEffect, useRef } from "react";
import { Sliders, AlertTriangle, RotateCcw, Play, Pause } from "lucide-react";

interface DevSimulationControlsProps {
  isSimulated: boolean;
  onToggleSimulated: (enabled: boolean) => void;
  copX: number;
  copY: number;
  totalWeight: number;
  onChangeCopX: (val: number) => void;
  onChangeCopY: (val: number) => void;
  onChangeTotalWeight: (val: number) => void;
}

export const DevSimulationControls: React.FC<DevSimulationControlsProps> = ({
  isSimulated,
  onToggleSimulated,
  copX,
  copY,
  totalWeight,
  onChangeCopX,
  onChangeCopY,
  onChangeTotalWeight,
}) => {
  const [swayActive, setSwayActive] = React.useState(false);
  const swayAngleRef = useRef(0);
  const swayTimerRef = useRef<number | null>(null);

  // Dynamic Gentle Sway Animation for Testing
  useEffect(() => {
    if (!isSimulated || !swayActive) {
      if (swayTimerRef.current) cancelAnimationFrame(swayTimerRef.current);
      return;
    }

    const stepSway = () => {
      swayAngleRef.current += 0.03;
      // Elliptical postural sway pattern (amplitude 0.45 X, 0.35 Y)
      const newX = parseFloat((Math.sin(swayAngleRef.current) * 0.45).toFixed(2));
      const newY = parseFloat((Math.cos(swayAngleRef.current * 0.7) * 0.35).toFixed(2));

      onChangeCopX(newX);
      onChangeCopY(newY);

      swayTimerRef.current = requestAnimationFrame(stepSway);
    };

    swayTimerRef.current = requestAnimationFrame(stepSway);

    return () => {
      if (swayTimerRef.current) cancelAnimationFrame(swayTimerRef.current);
    };
  }, [isSimulated, swayActive, onChangeCopX, onChangeCopY]);

  // Set Preset Coordinates
  const setPreset = (x: number, y: number) => {
    setSwayActive(false);
    onChangeCopX(x);
    onChangeCopY(y);
  };

  const handleReset = () => {
    setSwayActive(false);
    onChangeCopX(0.0);
    onChangeCopY(0.0);
    onChangeTotalWeight(70.0);
  };

  return (
    <div
      style={{
        borderRadius: "14px",
        background: isSimulated ? "#FFFBEB" : "#F8FAFC",
        border: `1px solid ${isSimulated ? "#FCD34D" : "var(--border-light)"}`,
        padding: "18px 22px",
        transition: "all var(--transition-fast)",
      }}
    >
      {/* Simulation Mode Header & Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: isSimulated ? "#FEF3C7" : "#EDF2F7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isSimulated ? "#D97706" : "var(--text-muted)",
            }}
          >
            <Sliders size={18} />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                Development Simulation Mode
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: isSimulated ? "#F59E0B" : "#E2E8F0",
                  color: isSimulated ? "#FFFFFF" : "var(--text-muted)",
                }}
              >
                {isSimulated ? "ACTIVE" : "OFF"}
              </span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Controls for testing COP Ball movements and balance data when physical board is unavailable.
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={() => {
            const next = !isSimulated;
            onToggleSimulated(next);
            if (!next) setSwayActive(false);
          }}
          className={isSimulated ? "btn-secondary" : "btn-primary"}
          style={{ fontSize: "0.8125rem", padding: "6px 14px", height: "auto" }}
        >
          <span>{isSimulated ? "Disable Simulation" : "Enable Dev Simulation"}</span>
        </button>
      </div>

      {/* Prominent Safety Warning Banner when Active */}
      {isSimulated && (
        <div
          style={{
            marginTop: "14px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            fontSize: "0.75rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>DEVELOPMENT SIMULATION ACTIVE — NOT REAL SENSOR DATA (For Testing Only)</span>
        </div>
      )}

      {/* Interactive Controls (Visible when Simulation is Enabled) */}
      {isSimulated && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
          {/* Preset Buttons Grid */}
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
              Quick Target Presets
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                onClick={() => setPreset(0.0, 0.0)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                🎯 Center (0, 0)
              </button>
              <button
                onClick={() => setPreset(-1.0, 0.0)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ⬅️ Left (-1, 0)
              </button>
              <button
                onClick={() => setPreset(1.0, 0.0)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ➡️ Right (+1, 0)
              </button>
              <button
                onClick={() => setPreset(0.0, 1.0)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ⬆️ Front (0, +1)
              </button>
              <button
                onClick={() => setPreset(0.0, -1.0)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ⬇️ Back (0, -1)
              </button>
              <button
                onClick={() => setPreset(0.5, 0.5)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ↗️ Front-Right (+0.5, +0.5)
              </button>
              <button
                onClick={() => setPreset(-0.5, -0.5)}
                className="btn-secondary"
                style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              >
                ↙️ Back-Left (-0.5, -0.5)
              </button>
              <button
                onClick={() => setSwayActive(!swayActive)}
                className="btn-secondary"
                style={{
                  padding: "5px 12px",
                  fontSize: "0.75rem",
                  background: swayActive ? "#FEF3C7" : undefined,
                  borderColor: swayActive ? "#F59E0B" : undefined,
                  color: swayActive ? "#92400E" : undefined,
                }}
              >
                {swayActive ? <Pause size={12} /> : <Play size={12} />}
                <span>{swayActive ? "Stop Sway Loop" : "Gentle Sway Loop"}</span>
              </button>
              <button
                onClick={handleReset}
                className="btn-ghost"
                style={{ padding: "5px 10px", fontSize: "0.75rem", marginLeft: "auto" }}
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Coordinate Sliders */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {/* COP X Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                <span>COP X (Lateral: -1 Left to +1 Right)</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
                  {copX >= 0 ? "+" : ""}{copX.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.02"
                value={copX}
                onChange={(e) => {
                  setSwayActive(false);
                  onChangeCopX(parseFloat(e.target.value));
                }}
                style={{
                  width: "100%",
                  accentColor: "var(--teal-primary)",
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              />
            </div>

            {/* COP Y Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                <span>COP Y (A/P: -1 Back to +1 Front)</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
                  {copY >= 0 ? "+" : ""}{copY.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.02"
                value={copY}
                onChange={(e) => {
                  setSwayActive(false);
                  onChangeCopY(parseFloat(e.target.value));
                }}
                style={{
                  width: "100%",
                  accentColor: "var(--teal-primary)",
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              />
            </div>

            {/* Total Weight Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                <span>Total Weight</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-main)" }}>
                  {totalWeight.toFixed(1)} kg
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                step="0.5"
                value={totalWeight}
                onChange={(e) => onChangeTotalWeight(parseFloat(e.target.value))}
                style={{
                  width: "100%",
                  accentColor: "var(--teal-primary)",
                  cursor: "pointer",
                  marginTop: "6px",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
