import React from "react";

export interface BalloonBurstParticle {
  id: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
}

interface DirectionalTargetBalloonProps {
  /** Unique id for gradient defs */
  id: string;
  /** Label in balloon center (step number) */
  label: string | number;
  /** Main balloon color */
  color: string;
  /** 0–1 inflate amount (0 = resting, 1 = about to pop) */
  inflate: number;
  /** Currently the active target */
  isCurrent: boolean;
  /** COP is inside the zone */
  isInside: boolean;
  /** Target already completed earlier */
  isCompleted: boolean;
  /** Playing blast animation */
  isPopping: boolean;
  /** Burst particles during pop */
  particles?: BalloonBurstParticle[];
}

function shade(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Balloon that fills the tolerance zone. Inflates while COP is inside;
 * pops on achieve. Bright center crosshair so the person always sees the aim point.
 */
export const DirectionalTargetBalloon: React.FC<DirectionalTargetBalloonProps> = ({
  id,
  label,
  color,
  inflate,
  isCurrent,
  isInside,
  isCompleted,
  isPopping,
  particles = [],
}) => {
  const colorLight = shade(color, 55);
  const colorDark = shade(color, -45);
  const fillColor = isCompleted ? "#059669" : isInside ? "#059669" : color;
  const fillLight = isCompleted || isInside ? "#6EE7B7" : colorLight;
  const fillDark = isCompleted || isInside ? "#047857" : colorDark;

  // Balloon tracks the dashed circle: rest ≈ 62% of zone; inflate grows from that
  // base so a smaller circle → proportionally smaller balloon.
  const restScale = 0.62;
  const inflate01 = Math.max(0, Math.min(1, inflate));
  const scale = isPopping
    ? restScale * 4.1
    : isCompleted
      ? restScale * 0.7
      : restScale * (1 + inflate01 * 3);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      {/* Soft zone ring — exact tolerance footprint (circle size driver) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: isCurrent
            ? isInside
              ? "2.5px solid rgba(5, 150, 105, 0.55)"
              : `2px dashed ${color}99`
            : isCompleted
              ? "2px solid rgba(5, 150, 105, 0.4)"
              : "1.5px dashed #CBD5E1",
          background: isInside
            ? "rgba(5, 150, 105, 0.08)"
            : isCurrent
              ? `${color}12`
              : "transparent",
          boxSizing: "border-box",
        }}
      />

      {/* Burst particles */}
      {isPopping &&
        particles.map((p) => (
          <div
            key={p.id}
            style={
              {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: p.size,
                height: p.size,
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
                borderRadius: "50%",
                background: p.color,
                boxShadow: `0 0 6px ${p.color}`,
                "--p-dx": `${p.dx}px`,
                "--p-dy": `${p.dy}px`,
                animation: "dirBalloonBurst 0.55s ease-out forwards",
                zIndex: 8,
              } as React.CSSProperties
            }
          />
        ))}

      {/* Balloon body — % of zone so it shrinks/grows with circle size */}
      <div
        className={isPopping ? "dir-balloon-popping" : undefined}
        style={{
          width: "100%",
          height: "100%",
          transform: isPopping ? undefined : `scale(${scale})`,
          transformOrigin: "center center",
          transition: isPopping
            ? "none"
            : "transform 120ms cubic-bezier(0.2, 0.9, 0.3, 1)",
          opacity: isPopping ? undefined : isCompleted ? 0.55 : 1,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 48 56"
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: "block",
            overflow: "visible",
            filter: `drop-shadow(0 3px 8px ${fillColor}55)`,
          }}
        >
          <defs>
            <radialGradient id={`dir-balloon-grad-${id}`} cx="35%" cy="28%" r="65%">
              <stop offset="0%" stopColor={fillLight} />
              <stop offset="55%" stopColor={fillColor} />
              <stop offset="100%" stopColor={fillDark} />
            </radialGradient>
          </defs>

          {/* String */}
          <path
            d="M 24 46 Q 20 50, 25 54 T 23 58"
            fill="none"
            stroke={fillDark}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity={isCompleted ? 0.4 : 0.85}
          />
          {/* Knot */}
          <polygon points="24,42 20,47 28,47" fill={fillDark} />
          {/* Body */}
          <path
            d="M 24 3
               C 11 3, 3 13, 3 24
               C 3 34, 13 41, 21 43
               L 27 43
               C 35 41, 45 34, 45 24
               C 45 13, 37 3, 24 3 Z"
            fill={`url(#dir-balloon-grad-${id})`}
            stroke="#FFFFFF"
            strokeWidth="1.4"
          />
          {/* Gloss */}
          <ellipse
            cx="15"
            cy="14"
            rx="3.5"
            ry="7"
            transform="rotate(-28 15 14)"
            fill="#FFFFFF"
            opacity="0.5"
          />
          {/* Center aim crosshair — always visible */}
          <circle cx="24" cy="24" r="5.5" fill="#FFFFFF" opacity="0.92" />
          <circle cx="24" cy="24" r="2.4" fill={fillDark} />
          <line x1="24" y1="16" x2="24" y2="20" stroke={fillDark} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="24" y1="28" x2="24" y2="32" stroke={fillDark} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="16" y1="24" x2="20" y2="24" stroke={fillDark} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="28" y1="24" x2="32" y2="24" stroke={fillDark} strokeWidth="1.4" strokeLinecap="round" />
          {/* Step number above center */}
          <text
            x="24"
            y="11"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FFFFFF"
            fontSize="9"
            fontWeight="900"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
          >
            {label}
          </text>
        </svg>
      </div>

      {isCompleted && !isPopping && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#059669",
            color: "#FFFFFF",
            fontSize: "0.7rem",
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid #FFFFFF",
            zIndex: 6,
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
};
