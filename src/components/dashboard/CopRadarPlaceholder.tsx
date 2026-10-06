import React from "react";
import { Crosshair, AlertCircle } from "lucide-react";

interface CopRadarProps {
  copX?: number | null;
  copY?: number | null;
  isConnected?: boolean;
}

export const CopRadarPlaceholder: React.FC<CopRadarProps> = ({
  copX = null,
  copY = null,
  isConnected = false,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "280px",
          height: "230px",
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
            width: "190px",
            height: "160px",
            borderRadius: "50%",
            border: "1px dashed #CBD5E1",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "130px",
            height: "110px",
            borderRadius: "50%",
            border: "1px solid #99F6E4",
            background: "rgba(204, 251, 241, 0.2)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "70px",
            height: "60px",
            borderRadius: "50%",
            border: "1px solid var(--teal-primary)",
            background: "rgba(13, 148, 136, 0.05)",
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
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          FRONT / ANTERIOR (+Y)
        </span>
        <span
          style={{
            position: "absolute",
            bottom: "8px",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          BACK / POSTERIOR (-Y)
        </span>
        <span
          style={{
            position: "absolute",
            left: "8px",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          LEFT (-X)
        </span>
        <span
          style={{
            position: "absolute",
            right: "8px",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          RIGHT (+X)
        </span>

        {/* Center Target Point */}
        {isConnected && copX !== null && copY !== null ? (
          <div
            style={{
              position: "absolute",
              transform: `translate(${copX * 70}px, ${-copY * 50}px)`,
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: "var(--teal-primary)",
              border: "2px solid #FFFFFF",
              boxShadow: "0 2px 6px rgba(13, 148, 136, 0.4)",
              transition: "transform 0.1s linear",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
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
              }}
            >
              (0.00, 0.00) mm
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <AlertCircle size={13} color="var(--teal-primary)" />
        <span>Hardware standby: Center of Pressure coordinates map in real-time during exercise.</span>
      </div>
    </div>
  );
};
