import React from "react";
import { Crosshair, AlertCircle } from "lucide-react";

interface CopRadarProps {
  copX?: number | null;
  copY?: number | null;
  copXMm?: number | null;
  copYMm?: number | null;
  isConnected?: boolean;
  isLoaded?: boolean;
}

export const CopRadarPlaceholder: React.FC<CopRadarProps> = ({
  copX = null,
  copY = null,
  copXMm = null,
  copYMm = null,
  isConnected = false,
  isLoaded = false,
}) => {
  const hasCoordinates =
    isConnected &&
    isLoaded &&
    copX !== null &&
    copY !== null &&
    Number.isFinite(copX) &&
    Number.isFinite(copY);

  // Compute mm if not provided directly
  const xMm =
    copXMm !== null && copXMm !== undefined && Number.isFinite(copXMm)
      ? copXMm
      : copX !== null && Number.isFinite(copX)
      ? copX * 223.0
      : null;

  const yMm =
    copYMm !== null && copYMm !== undefined && Number.isFinite(copYMm)
      ? copYMm
      : copY !== null && Number.isFinite(copY)
      ? copY * 119.0
      : null;

  // Clamped pixel offsets for visual rendering in the 280x240 box
  const pixelX = hasCoordinates && copX !== null ? Math.max(-100, Math.min(100, copX * 90)) : 0;
  const pixelY = hasCoordinates && copY !== null ? Math.max(-80, Math.min(80, -copY * 70)) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        padding: "6px 0",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "340px",
          height: "240px",
          borderRadius: "16px",
          background: "radial-gradient(circle at center, #FFFFFF 0%, #F8FAF9 100%)",
          border: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Concentric Calibration Rings */}
        <div
          style={{
            position: "absolute",
            width: "220px",
            height: "170px",
            borderRadius: "50%",
            border: "1px dashed #CBD5E1",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "150px",
            height: "115px",
            borderRadius: "50%",
            border: "1px solid #99F6E4",
            background: "rgba(204, 251, 241, 0.25)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "80px",
            height: "65px",
            borderRadius: "50%",
            border: "1px solid var(--teal-primary)",
            background: "rgba(13, 148, 136, 0.08)",
          }}
        />

        {/* Crosshair Axes */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "1px",
            background: "#E2E8F0",
          }}
        />
        <div
          style={{
            position: "absolute",
            height: "100%",
            width: "1px",
            background: "#E2E8F0",
          }}
        />

        {/* Anatomical Direction Labels */}
        <span
          style={{
            position: "absolute",
            top: "8px",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          ANTERIOR / FORWARD (+Y)
        </span>
        <span
          style={{
            position: "absolute",
            bottom: "8px",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          POSTERIOR / BACKWARD (-Y)
        </span>
        <span
          style={{
            position: "absolute",
            left: "8px",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          LEFT (-X)
        </span>
        <span
          style={{
            position: "absolute",
            right: "8px",
            fontSize: "0.6875rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
          }}
        >
          RIGHT (+X)
        </span>

        {/* Live COP Target Marker or Standby Indicator */}
        {hasCoordinates ? (
          <div
            style={{
              position: "absolute",
              transform: `translate(${pixelX}px, ${pixelY}px)`,
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              backgroundColor: "var(--teal-primary)",
              border: "2px solid #FFFFFF",
              boxShadow: "0 2px 8px rgba(13, 148, 136, 0.4)",
              transition: "transform 0.05s linear",
              zIndex: 3,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              zIndex: 2,
            }}
          >
            <Crosshair size={24} color="#94A3B8" />
            <span
              style={{
                fontSize: "0.6875rem",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                background: "#F1F5F9",
                padding: "2px 8px",
                borderRadius: "6px",
                border: "1px solid #E2E8F0",
                fontWeight: 600,
              }}
            >
              Standby (0.00, 0.00) mm
            </span>
          </div>
        )}

        {/* Floating Live Coordinates readout if active */}
        {hasCoordinates && xMm !== null && yMm !== null && (
          <div
            style={{
              position: "absolute",
              bottom: "26px",
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid var(--border-mint)",
              padding: "2px 8px",
              borderRadius: "6px",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--teal-primary)",
              boxShadow: "var(--shadow-card)",
              zIndex: 4,
            }}
          >
            ({xMm >= 0 ? "+" : ""}{xMm.toFixed(1)}, {yMm >= 0 ? "+" : ""}{yMm.toFixed(1)}) mm
          </div>
        )}
      </div>

      {/* Explanatory telemetry footer */}
      <div
        style={{
          marginTop: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        <AlertCircle size={13} color="var(--teal-primary)" />
        <span>
          {hasCoordinates
            ? "Live 100Hz force plate telemetry: Real-time Center of Pressure displacement."
            : isConnected
            ? "Force plate connected. Step on the board to stream ground reaction coordinates."
            : "Hardware standby: Real-time COP coordinates stream during active exercises."}
        </span>
      </div>
    </div>
  );
};
