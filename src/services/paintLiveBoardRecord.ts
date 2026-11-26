import { mapCopToBoard } from "../utils/copMapping";
import {
  DirectionalTarget,
  targetCircleRadiiPercent,
  WII_BOARD_DIMENSIONS,
} from "../utils/directionalWeightShiftExercise";
import type { BalloonBurstParticle } from "../components/exercise/DirectionalTargetBalloon";

export type LiveBoardRecordState = {
  phase: string;
  currentTargetIndex: number;
  holdProgress: number;
  centerHoldProgress: number;
  isWithinTargetZone: boolean;
  poppingTargetId: string | null;
  particles: BalloonBurstParticle[];
  targets: DirectionalTarget[];
  centerGate: DirectionalTarget | null;
  ball: { xPercent: number; yPercent: number };
  trail: Array<{ xPercent: number; yPercent: number }>;
  reward: {
    xPercent: number;
    yPercent: number;
    pathScore: number;
    missScore: number;
    color: string;
  } | null;
  showCop: boolean;
  pathColorForStep: (step: number) => string;
};

/** Extra canvas bleed so step numbers / labels / inflate aren't clipped. */
export const RECORD_BOARD_BLEED_PX = 48;
/** Matches live chassis CSS padding. */
const CHASSIS_PAD = 14;

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
 * Cheap full-fidelity board paint for session MP4 — chassis outline, balloons, COP.
 * Canvas is larger than the chassis (bleed) so edge numbers/labels are not cut off.
 */
export function paintLiveBoardRecord(
  canvas: HTMLCanvasElement,
  state: LiveBoardRecordState
): void {
  const parent = canvas.parentElement;
  if (!parent) return;
  // Parent is the chassis; canvas CSS is oversized by BLEED on each side
  const chassisW = parent.clientWidth;
  const chassisH = parent.clientHeight;
  if (chassisW < 4 || chassisH < 4) return;

  const bleed = RECORD_BOARD_BLEED_PX;
  const cssW = Math.round(chassisW + bleed * 2);
  const cssH = Math.round(chassisH + bleed * 2);
  if (canvas.width !== cssW) canvas.width = cssW;
  if (canvas.height !== cssH) canvas.height = cssH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, cssW, cssH);

  const ox = bleed;
  const oy = bleed;

  // Outer chassis (white + slate border) — was missing in recording
  roundRect(ctx, ox + 1, oy + 1, chassisW - 2, chassisH - 2, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Soft inset shadow hint
  roundRect(ctx, ox + 3, oy + 3, chassisW - 6, chassisH - 6, 26);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner surface (matches live board playfield)
  const sx = ox + CHASSIS_PAD;
  const sy = oy + CHASSIS_PAD;
  const sw = chassisW - CHASSIS_PAD * 2;
  const sh = chassisH - CHASSIS_PAD * 2;
  roundRect(ctx, sx, sy, sw, sh, 20);
  ctx.fillStyle = "#FAFCFC";
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.stroke();

  const px = (xPct: number) => sx + (xPct / 100) * sw;
  const py = (yPct: number) => sy + (yPct / 100) * sh;

  // Crosshair
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + sw * 0.06, sy + sh * 0.5);
  ctx.lineTo(sx + sw * 0.94, sy + sh * 0.5);
  ctx.moveTo(sx + sw * 0.5, sy + sh * 0.06);
  ctx.lineTo(sx + sw * 0.5, sy + sh * 0.94);
  ctx.stroke();
  ctx.setLineDash([]);

  // Origin
  ctx.fillStyle = "#0F172A";
  ctx.beginPath();
  ctx.arc(sx + sw * 0.5, sy + sh * 0.5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("(0,0)", sx + sw * 0.5 + 6, sy + sh * 0.5 - 6);

  const { phase, currentTargetIndex } = state;
  const list: DirectionalTarget[] = [];
  if (phase === "CENTER_HOLD" && state.centerGate) {
    list.push(state.centerGate);
  } else {
    state.targets.forEach((t, idx) => {
      const isCurrent = idx === currentTargetIndex;
      const isCompleted = idx < currentTargetIndex;
      if (phase === "ACTIVE" || phase === "PAUSED") {
        if (isCurrent || isCompleted) list.push(t);
      }
    });
  }

  for (const t of list) {
    const idx = state.targets.findIndex((x) => x.id === t.id);
    const isCenter = t.id === state.centerGate?.id;
    const isCurrent = isCenter
      ? phase === "CENTER_HOLD"
      : phase !== "CENTER_HOLD" && idx === currentTargetIndex;
    const isCompleted = !isCenter && idx >= 0 && idx < currentTargetIndex;
    const isPopping = state.poppingTargetId === t.id;
    const color = state.pathColorForStep(t.stepNumber);
    const coords = mapCopToBoard(t.x, t.y);
    const tolMm =
      t.toleranceMm ??
      (t.tolerance || 0.16) * WII_BOARD_DIMENSIONS.halfDistanceXMm;
    const { rx, ry } = targetCircleRadiiPercent(tolMm);
    const cx = px(coords.xPercent);
    const cy = py(coords.yPercent);
    const rw = (rx / 100) * sw;
    const rh = (ry / 100) * sh;
    const inside = isCurrent && state.isWithinTargetZone;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fillStyle = inside ? "rgba(5,150,105,0.08)" : isCurrent ? `${color}14` : "transparent";
    ctx.fill();
    ctx.setLineDash(isCompleted || inside ? [] : [5, 4]);
    ctx.strokeStyle = inside
      ? "rgba(5,150,105,0.55)"
      : isCurrent
        ? `${color}99`
        : isCompleted
          ? "rgba(5,150,105,0.4)"
          : "#CBD5E1";
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    const progressPct = phase === "CENTER_HOLD" ? state.centerHoldProgress : state.holdProgress;
    const inflate =
      isCurrent && inside ? Math.max(0, Math.min(1, progressPct / 100)) : 0;
    // Match live DirectionalTargetBalloon:
    // CSS scale() is applied to the zone box (radius = zoneR); the SVG balloon
    // art only fills ~78% of that box — without this, recording looked zoomed-in.
    const restScale = 0.62;
    const svgBodyFill = 0.78;
    const cssScale = isPopping
      ? restScale * 4.1
      : isCompleted
        ? restScale * 0.7
        : restScale * (1 + inflate * 3);
    const zoneR = Math.min(rw, rh);
    const balloonR = zoneR * cssScale * svgBodyFill;

    const fill = isCompleted || inside ? "#059669" : color;
    const fillLight = isCompleted || inside ? "#6EE7B7" : shade(color, 55);
    const fillDark = isCompleted || inside ? "#047857" : shade(color, -45);

    if (!isPopping || balloonR > 2) {
      const grad = ctx.createRadialGradient(
        cx - balloonR * 0.25,
        cy - balloonR * 0.3,
        balloonR * 0.1,
        cx,
        cy,
        balloonR
      );
      grad.addColorStop(0, fillLight);
      grad.addColorStop(0.55, fill);
      grad.addColorStop(1, fillDark);
      ctx.beginPath();
      ctx.arc(cx, cy, balloonR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, balloonR * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fillDark;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, balloonR * 0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fillDark;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - balloonR * 0.38);
      ctx.lineTo(cx, cy - balloonR * 0.18);
      ctx.moveTo(cx, cy + balloonR * 0.18);
      ctx.lineTo(cx, cy + balloonR * 0.38);
      ctx.moveTo(cx - balloonR * 0.38, cy);
      ctx.lineTo(cx - balloonR * 0.18, cy);
      ctx.moveTo(cx + balloonR * 0.18, cy);
      ctx.lineTo(cx + balloonR * 0.38, cy);
      ctx.stroke();
    }

    if (isPopping) {
      for (const p of state.particles) {
        ctx.beginPath();
        ctx.arc(cx + p.dx, cy + p.dy, p.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }

    // Step number on head — drawn in bleed so it isn't cut
    const nx = cx;
    const ny = cy - rh - 14;
    ctx.beginPath();
    ctx.arc(nx, ny, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(t.stepNumber), nx, ny + 0.5);

    const label = isCompleted
      ? `✓ ${t.shortLabel}`
      : isCurrent
        ? `${t.shortLabel} (${t.requiredHoldDurationSeconds}s)`
        : t.shortLabel;
    ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    const ly = cy + rh + 18;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = isCompleted || inside ? "#A7F3D0" : `${color}55`;
    ctx.lineWidth = 1;
    roundRect(ctx, cx - tw / 2 - 6, ly - 9, tw + 12, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isCompleted || inside ? "#059669" : color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, ly);
  }

  const trail = state.trail;
  if (trail.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(px(trail[0].xPercent), py(trail[0].yPercent));
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(px(trail[i].xPercent), py(trail[i].yPercent));
    }
    ctx.strokeStyle = "rgba(13, 148, 136, 0.45)";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (state.showCop) {
    const bx = px(state.ball.xPercent);
    const by = py(state.ball.yPercent);
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = state.isWithinTargetZone ? "#059669" : "#0D9488";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COP", bx, by);
  }

  if (state.reward) {
    const rx = px(state.reward.xPercent);
    const ry = py(state.reward.yPercent) - 40;
    drawScoreChip(ctx, rx - 36, ry, `+${state.reward.pathScore}`, "PATH", state.reward.color);
    drawScoreChip(ctx, rx + 36, ry, `+${state.reward.missScore}`, "MISS", "#0F766E");
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawScoreChip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  value: string,
  label: string,
  color: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  roundRect(ctx, -28, -22, 56, 44, 10);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 15px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(value, 0, -6);
  ctx.font = "bold 8px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(label, 0, 12);
  ctx.restore();
}
