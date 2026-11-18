import React, { useMemo } from "react";
import { BalanceBoardReading } from "../../types/hardware";
import { mapCopToBoard } from "../../utils/copMapping";

interface VisualBalanceBoardProps {
  reading: BalanceBoardReading | null;
  isConnected: boolean;
  isSimulated?: boolean;
}

export const VisualBalanceBoard: React.FC<VisualBalanceBoardProps> = ({
  reading,
  isConnected,
  isSimulated = false,
}) => {
  const hasLiveReading = Boolean(reading && (isConnected || isSimulated));

  // Scientific coordinates (standardized: +X=Right, -X=Left, +Y=Front, -Y=Back)
  const targetCopX = hasLiveReading && reading && typeof reading.copX === "number" && Number.isFinite(reading.copX) ? reading.copX : 0.0;
  const targetCopY = hasLiveReading && reading && typeof reading.copY === "number" && Number.isFinite(reading.copY) ? reading.copY : 0.0;

  // Calculate target screen percentage from centralized mapping:
  // xPercent = 50 + (clampedCopX * 50)
  // yPercent = 50 - (clampedCopY * 50)
  // Clamp visual display position so COP ball is strictly contained within the board display area
  const displayPos = useMemo(() => {
    if (!hasLiveReading) {
      return { xPercent: 50.0, yPercent: 50.0 };
    }
    const coords = mapCopToBoard(targetCopX, targetCopY);
    return {
      xPercent: Math.max(5.0, Math.min(95.0, coords.xPercent)),
      yPercent: Math.max(8.0, Math.min(92.0, coords.yPercent)),
    };
  }, [hasLiveReading, targetCopX, targetCopY]);

  // Direction descriptors for high-contrast numerical readout
  const getDirectionText = (x: number, y: number) => {
    const safeX = typeof x === "number" && Number.isFinite(x) ? x : 0.0;
    const safeY = typeof y === "number" && Number.isFinite(y) ? y : 0.0;
    const xDir = safeX > 0.05 ? "RIGHT (+X)" : safeX < -0.05 ? "LEFT (-X)" : "CENTER";
    const yDir = safeY > 0.05 ? "FRONT (+Y)" : safeY < -0.05 ? "BACK (-Y)" : "CENTER";
    return { xDir, yDir };
  };

  const { xDir, yDir } = reading && typeof reading.copX === "number" && typeof reading.copY === "number"
    ? getDirectionText(reading.copX, reading.copY)
    : { xDir: "CENTER", yDir: "CENTER" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
      }}
    >
      {/* ============================================================== */}
      {/* 1. TOP: FRONT / ANTERIOR (+Y) AXIS LABEL                       */}
      {/* ============================================================== */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          fontSize: "0.8125rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#0F766E",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>FRONT / ANTERIOR</span>
          <span
            style={{
              background: "#CCFBF1",
              color: "#0F766E",
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 800,
              border: "1.5px solid #5EEAD4",
            }}
          >
            +Y
          </span>
        </div>
        <span style={{ fontSize: "1.25rem", lineHeight: 1, fontWeight: 800 }}>↑</span>
      </div>

      {/* ============================================================== */}
      {/* 2. MIDDLE ROW: LEFT (-X) | FORCE PLATE | RIGHT (+X)            */}
      {/* ============================================================== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          gap: "10px",
        }}
      >
        {/* LEFT (-X) Directional Label */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "54px",
            flexShrink: 0,
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#0F172A",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
            <span>LEFT</span>
            <span
              style={{
                background: "#F1F5F9",
                color: "#0F172A",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.6875rem",
                fontWeight: 800,
                border: "1.5px solid #94A3B8",
              }}
            >
              -X
            </span>
          </div>
          <span style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "4px", fontWeight: 800 }}>←</span>
        </div>

        {/* Visual Wii Balance Board Chassis (High Visibility & Realistic Silver/Grey Platform) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            aspectRatio: "446 / 240", // Standardized physical balance board proportions
            position: "relative",
            background: "linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 45%, #94A3B8 100%)",
            borderRadius: "26px",
            border: "2.5px solid #64748B", // Highly visible border contrasting against card
            boxShadow:
              "0 12px 28px -4px rgba(15, 23, 42, 0.14), 0 4px 10px -2px rgba(15, 23, 42, 0.08), inset 0 2px 3px rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(100, 116, 139, 0.35)",
            padding: "8px",
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          {/* Side grips matching physical Wii Balance Board (Model: RVL-WBC-01) */}
          <div
            style={{
              position: "absolute",
              left: "2px",
              top: "24%",
              bottom: "24%",
              width: "4px",
              borderRadius: "3px",
              background: "#475569",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "2px",
              top: "24%",
              bottom: "24%",
              width: "4px",
              borderRadius: "3px",
              background: "#475569",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
            }}
          />

          {/* Realistic Light Grey / Silver Standing Platform Surface */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: "18px",
              border: "1.5px solid #94A3B8",
              background: "linear-gradient(180deg, #F8FAFC 0%, #EEF2F6 45%, #E2E8F0 100%)",
              boxShadow: "inset 0 2px 6px rgba(15, 23, 42, 0.07)",
              overflow: "hidden",
            }}
          >
            {/* Subtle center vertical split dividing left and right foot standing zones */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "10%",
                bottom: "10%",
                width: "1px",
                borderLeft: "1.5px dashed rgba(148, 163, 184, 0.45)",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />

            {/* Horizontal centerline (Y = 0) */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "4%",
                right: "4%",
                height: "1px",
                borderTop: "1.5px dashed #94A3B8",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            />

            {/* Vertical centerline (X = 0) */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "6%",
                bottom: "6%",
                width: "1px",
                borderLeft: "1.5px dashed #94A3B8",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            />

            {/* Target Equilibrium Center Ring */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                border: "2px solid rgba(15, 118, 110, 0.55)",
                background: "rgba(15, 118, 110, 0.07)",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3,
              }}
            >
              {/* Equilibrium center point */}
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#0F766E",
                }}
              />
            </div>

            {/* Four Corner Sensor Indicators (FL, FR, BL, BR) */}
            {/* Front-Left (FL: -X, +Y) */}
            <div
              style={{
                position: "absolute",
                top: "6px",
                left: "8px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.95)",
                border: "1.5px solid #CBD5E1",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                zIndex: 6,
              }}
            >
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#475569" }}>
                FL
              </span>
              {hasLiveReading && reading && typeof reading.frontLeft === "number" && Number.isFinite(reading.frontLeft) ? (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#0F766E",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {reading.frontLeft.toFixed(1)} kg
                </span>
              ) : (
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#94A3B8" }}>
                  --
                </span>
              )}
            </div>

            {/* Front-Right (FR: +X, +Y) */}
            <div
              style={{
                position: "absolute",
                top: "6px",
                right: "8px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.95)",
                border: "1.5px solid #CBD5E1",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                zIndex: 6,
              }}
            >
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#475569" }}>
                FR
              </span>
              {hasLiveReading && reading && typeof reading.frontRight === "number" && Number.isFinite(reading.frontRight) ? (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#0F766E",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {reading.frontRight.toFixed(1)} kg
                </span>
              ) : (
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#94A3B8" }}>
                  --
                </span>
              )}
            </div>

            {/* Back-Left (BL: -X, -Y) */}
            <div
              style={{
                position: "absolute",
                bottom: "6px",
                left: "8px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.95)",
                border: "1.5px solid #CBD5E1",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                zIndex: 6,
              }}
            >
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#475569" }}>
                BL
              </span>
              {hasLiveReading && reading && typeof reading.backLeft === "number" && Number.isFinite(reading.backLeft) ? (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#0F766E",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {reading.backLeft.toFixed(1)} kg
                </span>
              ) : (
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#94A3B8" }}>
                  --
                </span>
              )}
            </div>

            {/* Back-Right (BR: +X, -Y) */}
            <div
              style={{
                position: "absolute",
                bottom: "6px",
                right: "8px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.95)",
                border: "1.5px solid #CBD5E1",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                zIndex: 6,
              }}
            >
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#475569" }}>
                BR
              </span>
              {hasLiveReading && reading && typeof reading.backRight === "number" && Number.isFinite(reading.backRight) ? (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#0F766E",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {reading.backRight.toFixed(1)} kg
                </span>
              ) : (
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#94A3B8" }}>
                  --
                </span>
              )}
            </div>

            {/* Power Button & Blue LED Indicator (Front Center) */}
            <div
              style={{
                position: "absolute",
                top: "6px",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                borderRadius: "8px",
                background: "#FFFFFF",
                border: "1.5px solid #CBD5E1",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
                zIndex: 6,
              }}
            >
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: hasLiveReading
                    ? isSimulated
                      ? "#F59E0B"
                      : "#0284C7"
                    : "#94A3B8",
                  boxShadow: hasLiveReading
                    ? `0 0 6px ${isSimulated ? "#F59E0B" : "#0EA5E9"}`
                    : "none",
                }}
              />
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  color: "#334155",
                  letterSpacing: "0.04em",
                }}
              >
                Wii
              </span>
            </div>

            {/* ======================================================== */}
            {/* CENTER OF PRESSURE (COP) BALL                            */}
            {/* ======================================================== */}
            <div
              style={{
                position: "absolute",
                left: `${displayPos.xPercent}%`,
                top: `${displayPos.yPercent}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 20, // Rendered safely above board surface and corner badges
                transition: hasLiveReading
                  ? "left 70ms cubic-bezier(0.2, 0.8, 0.4, 1), top 70ms cubic-bezier(0.2, 0.8, 0.4, 1)"
                  : "none",
              }}
            >
              {hasLiveReading ? (
                /* LIVE OR SIMULATED ACTIVE ORANGE COP BALL */
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Subtle radiant orange aura */}
                  <div
                    style={{
                      position: "absolute",
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: "rgba(249, 115, 22, 0.22)",
                      boxShadow: "0 0 14px rgba(249, 115, 22, 0.5)",
                    }}
                  />
                  {/* Highly visible Orange COP Ball with contrasting white outline & shadow */}
                  <div
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 35% 35%, #FB923C 0%, #EA580C 65%, #C2410C 100%)",
                      border: "3px solid #FFFFFF",
                      boxShadow:
                        "0 0 0 1px rgba(154, 52, 18, 0.55), 0 3px 8px rgba(0, 0, 0, 0.35)",
                    }}
                  />
                </div>
              ) : (
                /* CLEAR UNAVAILABLE / DISCONNECTED STATE (NO FAKE MOVEMENT) */
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Dashed offline perimeter */}
                  <div
                    style={{
                      position: "absolute",
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      border: "1.5px dashed #94A3B8",
                      background: "rgba(148, 163, 184, 0.12)",
                    }}
                  />
                  {/* Muted neutral center dot */}
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: "#94A3B8",
                      border: "2.5px solid #FFFFFF",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.15)",
                    }}
                  />
                  {/* Disconnected state badge */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "24px",
                      whiteSpace: "nowrap",
                      background: "#334155",
                      color: "#F8FAFC",
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    DISCONNECTED
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT (+X) Directional Label */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "54px",
            flexShrink: 0,
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#0F172A",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
            <span>RIGHT</span>
            <span
              style={{
                background: "#F1F5F9",
                color: "#0F172A",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.6875rem",
                fontWeight: 800,
                border: "1.5px solid #94A3B8",
              }}
            >
              +X
            </span>
          </div>
          <span style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "4px", fontWeight: 800 }}>→</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. COP INFORMATION READOUT (TEAL PANEL & ORANGE SIM BADGE)     */}
      {/* ============================================================== */}
      <div
        style={{
          marginTop: "14px",
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "10px 14px",
          padding: "8px 20px",
          borderRadius: "10px",
          backgroundColor: "#0F766E", // Preserved teal COP panel
          color: "#FFFFFF",
          border: "1.5px solid #115E59",
          boxShadow: "0 4px 14px rgba(15, 118, 110, 0.25)",
          fontSize: "13.5px",
          fontWeight: 600,
          letterSpacing: "0.01em",
          boxSizing: "border-box",
          maxWidth: "100%",
          textAlign: "center",
        }}
      >
        {isSimulated && (
          <span
            style={{
              backgroundColor: "#F59E0B",
              color: "#0F172A",
              fontSize: "11px",
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: "4px",
              letterSpacing: "0.05em",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
            }}
          >
            SIM
          </span>
        )}

        {hasLiveReading && reading && typeof reading.copX === "number" && Number.isFinite(reading.copX) && typeof reading.copY === "number" && Number.isFinite(reading.copY) ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.9)" }}>COP X:</span>
              <span
                style={{
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {reading.copX >= 0 ? "+" : ""}{reading.copX.toFixed(2)}
              </span>
              <span style={{ color: "rgba(255, 255, 255, 0.85)", fontSize: "12.5px" }}>
                → {xDir}
              </span>
            </div>

            <span
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontWeight: 400,
                fontSize: "14px",
                userSelect: "none",
              }}
            >
              |
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "rgba(255, 255, 255, 0.9)" }}>COP Y:</span>
              <span
                style={{
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {reading.copY >= 0 ? "+" : ""}{reading.copY.toFixed(2)}
              </span>
              <span style={{ color: "rgba(255, 255, 255, 0.85)", fontSize: "12.5px" }}>
                → {yDir}
              </span>
            </div>
          </>
        ) : (
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#E6FFFA" }}>
            Neutral Center — Waiting for Balance Board Telemetry
          </span>
        )}
      </div>

      {/* ============================================================== */}
      {/* 4. BOTTOM: BACK / POSTERIOR (-Y) AXIS LABEL                    */}
      {/* ============================================================== */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          fontSize: "0.8125rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#0F766E",
          marginTop: "10px",
        }}
      >
        <span style={{ fontSize: "1.25rem", lineHeight: 1, fontWeight: 800 }}>↓</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>BACK / POSTERIOR</span>
          <span
            style={{
              background: "#CCFBF1",
              color: "#0F766E",
              padding: "2px 7px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 800,
              border: "1.5px solid #5EEAD4",
            }}
          >
            -Y
          </span>
        </div>
      </div>
    </div>
  );
};
