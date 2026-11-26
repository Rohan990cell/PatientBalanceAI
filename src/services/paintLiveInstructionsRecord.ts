export type LiveInstructionsRecordState = {
  phase: string;
  stepTag: string;
  title: string;
  subtitle: string;
  guidance: string;
  showGoodBadge: boolean;
  isWithinTargetZone: boolean;
  isBoardWaiting: boolean;
  holdProgress: number;
  holdLabel: string;
  holdTimeText: string;
};

/**
 * Cheap live paint of the instruction card for session MP4.
 * Updates every encode frame so guidance / hold timer stay in sync (no html2canvas lag).
 */
export function paintLiveInstructionsRecord(
  canvas: HTMLCanvasElement,
  state: LiveInstructionsRecordState
): void {
  const parent = canvas.parentElement;
  if (!parent) return;
  const w = Math.max(2, Math.round(parent.clientWidth));
  const h = Math.max(2, Math.round(parent.clientHeight));
  if (w < 4 || h < 4) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const inZone = state.isWithinTargetZone;
  const good = state.showGoodBadge;
  const bg = good ? "#ECFDF5" : inZone ? "#F0FDFA" : "#FFFFFF";
  const border = good ? "#059669" : inZone ? "#0D9488" : "#E2E8F0";

  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 12);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let y = 14;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Step tag
  ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#0D9488";
  ctx.fillText(state.stepTag.toUpperCase(), w / 2, y);
  y += 18;

  // Title
  ctx.font = "800 17px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = good ? "#059669" : "#0F172A";
  wrapFillText(ctx, state.title.toUpperCase(), w / 2, y, w - 28, 18);
  y += 22;

  // Subtitle
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#64748B";
  y = wrapFillText(ctx, state.subtitle, w / 2, y, w - 32, 14) + 10;

  // Guidance / GOOD
  if (good) {
    const label = "✓  GOOD";
    ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    roundRect(ctx, w / 2 - tw / 2 - 12, y - 10, tw + 24, 22, 11);
    ctx.fillStyle = "#059669";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(label, w / 2, y + 1);
    y += 26;
  } else {
    ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = inZone
      ? "#0D9488"
      : state.isBoardWaiting
        ? "#94A3B8"
        : "#D97706";
    ctx.fillText(state.guidance, w / 2, y);
    y += 20;
  }

  // Hold row
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#64748B";
  ctx.textAlign = "left";
  ctx.fillText(state.holdLabel, 18, y);
  ctx.textAlign = "right";
  ctx.fillStyle = "#0D9488";
  ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(state.holdTimeText, w - 18, y);
  y += 12;

  // Progress bar
  const barX = 18;
  const barW = w - 36;
  const barH = 6;
  roundRect(ctx, barX, y, barW, barH, 3);
  ctx.fillStyle = "#E2E8F0";
  ctx.fill();
  const pct = Math.max(0, Math.min(100, state.holdProgress)) / 100;
  if (pct > 0.001) {
    roundRect(ctx, barX, y, Math.max(4, barW * pct), barH, 3);
    ctx.fillStyle = good || pct >= 1 ? "#059669" : "#0D9488";
    ctx.fill();
  }
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let yy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = words[i]!;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, cx, yy);
    yy += lineH;
  }
  return yy;
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
