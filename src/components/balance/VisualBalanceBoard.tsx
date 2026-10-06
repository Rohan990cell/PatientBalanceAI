import React, { useEffect, useRef, useState } from "react";
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
  const targetCopX = hasLiveReading && reading ? reading.copX : 0.0;
  const targetCopY = hasLiveReading && reading ? reading.copY : 0.0;

  // Visual smoothed position in percentage [0% - 100%]
  const [visualPos, setVisualPos] = useState<{ xPercent: number; yPercent: number }>({
    xPercent: 50.0,
    yPercent: 50.0,
  });

  const animFrameRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ xPercent: number; yPercent: number }>({
    xPercent: 50.0,
    yPercent: 50.0,
  });

  // Calculate target screen percentage from centralized mapping:
  // xPercent = 50 + (clampedCopX * 50)
  // yPercent = 50 - (clampedCopY * 50)
  const targetBoardCoords = mapCopToBoard(targetCopX, targetCopY);

  useEffect(() => {
    if (!hasLiveReading) {
      // Disconnected: smoothly return to center placeholder
      currentPosRef.current = { xPercent: 50.0, yPercent: 50.0 };
      setVisualPos({ xPercent: 50.0, yPercent: 50.0 });
      return;
    }

    const targetX = targetBoardCoords.xPercent;
    const targetY = targetBoardCoords.yPercent;

    const smoothStep = () => {
      const alpha = 0.22;
      const cur = currentPosRef.current;
      const dx = targetX - cur.xPercent;
      const dy = targetY - cur.yPercent;

      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        cur.xPercent += dx * alpha;
        cur.yPercent += dy * alpha;
        setVisualPos({ xPercent: cur.xPercent, yPercent: cur.yPercent });
        animFrameRef.current = requestAnimationFrame(smoothStep);
      } else {
        cur.xPercent = targetX;
        cur.yPercent = targetY;
        setVisualPos({ xPercent: targetX, yPercent: targetY });
      }
    };

    animFrameRef.current = requestAnimationFrame(smoothStep);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [hasLiveReading, targetBoardCoords.xPercent, targetBoardCoords.yPercent]);

  // Ball styling based on connection / simulation status
  const getBallColor = () => {
    if (isSimulated) return "#F59E0B"; // Amber for Dev Simulation
    if (hasLiveReading) return "var(--teal-primary, #0D9488)"; // Medical Teal for Live Data
    return "#94A3B8"; // Slate for Disconnected Placeholder
  };

  const ballColor = getBallColor();

  // Numerical display direction descriptors (TASK 5)
  const getDirectionText = (x: number, y: number) => {
    const xDir = x > 0.05 ? "RIGHT (+X)" : x < -0.05 ? "LEFT (-X)" : "CENTER";
    const yDir = y > 0.05 ? "FRONT (+Y)" : y < -0.05 ? "BACK (-Y)" : "CENTER";
    return { xDir, yDir };
  };

  const { xDir, yDir } = reading
    ? getDirectionText(reading.copX, reading.copY)
    : { xDir: "CENTER", yDir: "CENTER" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: "560px",
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
          fontSize: "0.75rem",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--teal-primary, #0D9488)",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>FRONT / ANTERIOR</span>
          <span
            style={{
              background: "var(--teal-surface, #F0FDFA)",
              color: "var(--teal-primary, #0D9488)",
              padding: "1px 6px",
              borderRadius: "4px",
              fontSize: "0.6875rem",
              fontWeight: 800,
              border: "1px solid var(--border-teal, #99F6E4)",
            }}
          >
            +Y
          </span>
        </div>
        <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>↑</span>
      </div>

      {/* ============================================================== */}
      {/* 2. MIDDLE ROW: LEFT (-X) | FORCE PLATE | RIGHT (+X)            */}
      {/* ============================================================== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          gap: "12px",
        }}
      >
        {/* LEFT (-X) Directional Label */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "58px",
            fontSize: "0.6875rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted, #64748B)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span>LEFT</span>
            <span
              style={{
                background: "#F1F5F9",
                color: "var(--text-secondary, #475569)",
                padding: "1px 5px",
                borderRadius: "4px",
                fontSize: "0.625rem",
                fontWeight: 800,
                border: "1px solid var(--border-light, #CBD5E1)",
              }}
            >
              -X
            </span>
          </div>
          <span style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "4px" }}>←</span>
        </div>

        {/* Visual Wii Balance Board Chassis */}
        <div
          style={{
            flex: 1,
            aspectRatio: "446 / 238", // Physical board proportions (446mm X x 238mm Y)
            position: "relative",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
            borderRadius: "28px",
            border: "2px solid #CBD5E1",
            boxShadow:
              "0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04), inset 0 2px 4px rgba(255, 255, 255, 0.8)",
            padding: "16px",
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          {/* Side grips matching physical RVL-WBC-01 */}
          <div
            style={{
              position: "absolute",
              left: "4px",
              top: "20%",
              bottom: "20%",
              width: "4px",
              borderRadius: "4px",
              background: "#E2E8F0",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "4px",
              top: "20%",
              bottom: "20%",
              width: "4px",
              borderRadius: "4px",
              background: "#E2E8F0",
            }}
          />

          {/* Inner standing surface perimeter */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: "20px",
              border: "1px solid #E2E8F0",
              background: "#FAFCFC",
            }}
          >
            {/* Center Crosshair Lines */}
            {/* Horizontal centerline (Y = 0) */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "6%",
                right: "6%",
                height: "1px",
                borderTop: "1px dashed #CBD5E1",
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
                borderLeft: "1px dashed #CBD5E1",
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
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                border: "1.5px solid rgba(13, 148, 136, 0.35)",
                background: "rgba(13, 148, 136, 0.04)",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            />

            {/* Four Corner Sensor Indicators (FL, FR, BL, BR) */}
            {/* Front-Left (FL: -X, +Y) */}
            <div
              style={{
                position: "absolute",
                top: "8px",
                left: "10px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E2E8F0)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--text-secondary, #475569)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <span>FL</span>
              {hasLiveReading && reading && (
                <span style={{ color: "var(--teal-primary, #0D9488)", marginLeft: "4px" }}>
                  {reading.frontLeft.toFixed(1)}k
                </span>
              )}
            </div>

            {/* Front-Right (FR: +X, +Y) */}
            <div
              style={{
                position: "absolute",
                top: "8px",
                right: "10px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E2E8F0)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--text-secondary, #475569)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <span>FR</span>
              {hasLiveReading && reading && (
                <span style={{ color: "var(--teal-primary, #0D9488)", marginLeft: "4px" }}>
                  {reading.frontRight.toFixed(1)}k
                </span>
              )}
            </div>

            {/* Back-Left (BL: -X, -Y) */}
            <div
              style={{
                position: "absolute",
                bottom: "8px",
                left: "10px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E2E8F0)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--text-secondary, #475569)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <span>BL</span>
              {hasLiveReading && reading && (
                <span style={{ color: "var(--teal-primary, #0D9488)", marginLeft: "4px" }}>
                  {reading.backLeft.toFixed(1)}k
                </span>
              )}
            </div>

            {/* Back-Right (BR: +X, -Y) */}
            <div
              style={{
                position: "absolute",
                bottom: "8px",
                right: "10px",
                padding: "3px 8px",
                borderRadius: "6px",
                background: "#FFFFFF",
                border: "1px solid var(--border-light, #E2E8F0)",
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "var(--text-secondary, #475569)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <span>BR</span>
              {hasLiveReading && reading && (
                <span style={{ color: "var(--teal-primary, #0D9488)", marginLeft: "4px" }}>
                  {reading.backRight.toFixed(1)}k
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
                borderRadius: "10px",
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: hasLiveReading ? (isSimulated ? "#F59E0B" : "#0EA5E9") : "#CBD5E1",
                  boxShadow: hasLiveReading ? `0 0 6px ${isSimulated ? "#F59E0B" : "#0EA5E9"}` : "none",
                }}
              />
              <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                Wii
              </span>
            </div>

            {/* ======================================================== */}
            {/* CENTER OF PRESSURE (COP) BALL                            */}
            {/* ======================================================== */}
            <div
              style={{
                position: "absolute",
                left: `${visualPos.xPercent}%`,
                top: `${visualPos.yPercent}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              {/* Outer soft aura/pulse ring */}
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: hasLiveReading
                    ? isSimulated
                      ? "rgba(245, 158, 11, 0.2)"
                      : "rgba(13, 148, 136, 0.2)"
                    : "rgba(148, 163, 184, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: hasLiveReading ? `0 0 12px ${ballColor}` : "none",
                  border: !hasLiveReading ? "1px dashed #94A3B8" : "none",
                }}
              >
                {/* Core COP Ball */}
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: ballColor,
                    border: "2px solid #FFFFFF",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
                  }}
                />
              </div>

              {/* Floating coordinate tooltip above ball (TASK 5 & TASK 6) */}
              {hasLiveReading && reading && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "34px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    background: isSimulated ? "rgba(180, 83, 9, 0.92)" : "rgba(15, 23, 42, 0.88)",
                    backdropFilter: "blur(4px)",
                    color: "#FFFFFF",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isSimulated && (
                    <span
                      style={{
                        background: "#F59E0B",
                        color: "#FFFFFF",
                        fontSize: "0.5625rem",
                        fontWeight: 800,
                        padding: "1px 5px",
                        borderRadius: "3px",
                        letterSpacing: "0.04em",
                      }}
                    >
                      SIM
                    </span>
                  )}
                  <span>
                    COP X: {reading.copX >= 0 ? "+" : ""}{reading.copX.toFixed(2)} → {xDir}
                  </span>
                  <span style={{ opacity: 0.5 }}>·</span>
                  <span>
                    COP Y: {reading.copY >= 0 ? "+" : ""}{reading.copY.toFixed(2)} → {yDir}
                  </span>
                </div>
              )}

              {/* Placeholder label when disconnected */}
              {!hasLiveReading && (
                <div
                  style={{
                    position: "absolute",
                    top: "34px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    background: "#F1F5F9",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-light)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.625rem",
                    fontWeight: 600,
                  }}
                >
                  Neutral Center (No Live Data)
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
            width: "58px",
            fontSize: "0.6875rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted, #64748B)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span>RIGHT</span>
            <span
              style={{
                background: "#F1F5F9",
                color: "var(--text-secondary, #475569)",
                padding: "1px 5px",
                borderRadius: "4px",
                fontSize: "0.625rem",
                fontWeight: 800,
                border: "1px solid var(--border-light, #CBD5E1)",
              }}
            >
              +X
            </span>
          </div>
          <span style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "4px" }}>→</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. BOTTOM: BACK / POSTERIOR (-Y) AXIS LABEL                    */}
      {/* ============================================================== */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          fontSize: "0.75rem",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--teal-primary, #0D9488)",
          marginTop: "10px",
        }}
      >
        <span style={{ fontSize: "1.25rem", lineHeight: 1 }}>↓</span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>BACK / POSTERIOR</span>
          <span
            style={{
              background: "var(--teal-surface, #F0FDFA)",
              color: "var(--teal-primary, #0D9488)",
              padding: "1px 6px",
              borderRadius: "4px",
              fontSize: "0.6875rem",
              fontWeight: 800,
              border: "1px solid var(--border-teal, #99F6E4)",
            }}
          >
            -Y
          </span>
        </div>
      </div>
    </div>
  );
};
