import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { HoldWindowErrorSeries } from "../utils/directionalWeightShiftExercise";
import { TransitAngleBoxPlot, computePairedBoxCenters } from "../utils/pose2dAngles";

export interface LandscapeVisualReportInput {
  boardElement: HTMLElement;
  patientName: string;
  sessionId: string;
  sessionDate: string;
  holdSeries: HoldWindowErrorSeries[];
  transitBoxPlots: TransitAngleBoxPlot[];
}

/** Capture the on-screen COP board as a PNG data URL. */
export async function captureBoardPng(boardElement: HTMLElement): Promise<string> {
  const canvas = await html2canvas(boardElement, {
    backgroundColor: "#FFFFFF",
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL("image/png");
}

/**
 * High-res chart canvases (downscaled into smaller PDF slots without blur).
 * Fonts are oversized so labels stay readable after shrink-to-fit.
 */
const CHART_W = 1440;
const CHART_H = 780;
const PAIRS_PER_PAGE = 3;

const INK = "#000000";

function xSec(s: HoldWindowErrorSeries["samples"][0], t0: number | undefined): number {
  if (typeof s.holdRelMs === "number" && Number.isFinite(s.holdRelMs)) {
    return Math.max(0, s.holdRelMs / 1000);
  }
  if (
    typeof s.syncTimestamp === "number" &&
    Number.isFinite(s.syncTimestamp) &&
    typeof t0 === "number"
  ) {
    return Math.max(0, (s.syncTimestamp - t0) / 1000);
  }
  return Math.max(0, (s.frameIndex - 1) * 0.05);
}

/** Draw hold-window miss-vs-time line chart onto a canvas. */
export function drawHoldLineChartCanvas(
  series: HoldWindowErrorSeries,
  width = CHART_W,
  height = CHART_H
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Extra left room so "mm" axis title never overlaps Y tick numbers
  const pad = { top: 64, right: 32, bottom: 88, left: 132 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const samples = series.samples;
  if (samples.length < 2) {
    ctx.fillStyle = INK;
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("Not enough samples", pad.left, pad.top + 28);
    return canvas;
  }

  const t0 = samples[0]?.syncTimestamp;
  const xs = samples.map((s) => xSec(s, t0));
  const xMax = Math.max(1, Math.ceil(Math.max(...xs) - 1e-9));
  const yMax = Math.max(1, ...samples.map((s) => s.errorMm)) * 1.08;
  const xOf = (v: number) => pad.left + (v / xMax) * innerW;
  const yOf = (v: number) => pad.top + innerH - (v / yMax) * innerH;

  // Axes — black
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + innerH);
  ctx.lineTo(pad.left + innerW, pad.top + innerH);
  ctx.stroke();

  // Title
  ctx.fillStyle = INK;
  ctx.font = "bold 36px sans-serif";
  ctx.fillText(
    `Line · Target ${
      series.stepNumber === 0 ? 6 : Math.max(0, series.stepNumber - 1)
    } → ${series.stepNumber}  (${series.shortLabel})`,
    pad.left,
    34
  );

  // Green hold band
  if (
    series.finalHoldStartFrameIndex != null &&
    series.finalHoldEndFrameIndex != null
  ) {
    const holdSamples = samples.filter(
      (s) =>
        s.frameIndex >= series.finalHoldStartFrameIndex! &&
        s.frameIndex <= series.finalHoldEndFrameIndex!
    );
    if (holdSamples.length > 0) {
      const x0 = xOf(xSec(holdSamples[0], t0));
      const x1 = xOf(xSec(holdSamples[holdSamples.length - 1], t0));
      ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
      ctx.fillRect(x0, pad.top, Math.max(2, x1 - x0), innerH);
    }
  }

  // Line
  ctx.strokeStyle = "#0D9488";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = xOf(xSec(s, t0));
    const y = yOf(s.errorMm);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // End point
  const last = samples[samples.length - 1];
  ctx.fillStyle = "#0D9488";
  ctx.beginPath();
  ctx.arc(xOf(xSec(last, t0)), yOf(last.errorMm), 8, 0, Math.PI * 2);
  ctx.fill();

  // X ticks — black, large (readable after PDF downscale)
  ctx.fillStyle = INK;
  ctx.font = "bold 38px ui-monospace, monospace";
  const step = xMax > 12 ? Math.ceil(xMax / 10) : 1;
  for (let s = 0; s <= xMax; s += step) {
    const x = xOf(s);
    ctx.fillText(String(s), x - 10, pad.top + innerH + 40);
  }
  ctx.font = "bold 32px sans-serif";
  ctx.fillText("Time (s)", pad.left + innerW / 2 - 56, height - 14);

  // Y ticks (right-aligned next to axis) + axis title further left
  ctx.font = "bold 38px ui-monospace, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const v = (yMax * i) / 4;
    const y = yOf(v);
    ctx.fillText(v.toFixed(0), pad.left - 16, y + 10);
  }
  ctx.save();
  ctx.translate(30, pad.top + innerH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("mm", 0, 0);
  ctx.restore();
  ctx.textAlign = "start";

  return canvas;
}

/** Draw transit angle box-plot onto a canvas. */
export function drawTransitBoxPlotCanvas(
  plot: TransitAngleBoxPlot,
  width = CHART_W,
  height = CHART_H,
  options: { showXAxisLabels?: boolean } = {}
): HTMLCanvasElement {
  const showXAxisLabels = options.showXAxisLabels !== false;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);

  // Extra bottom room only when drawing Trunk / Shoulder / … labels
  const pad = {
    top: 52,
    right: 24,
    bottom: showXAxisLabels ? 220 : 36,
    left: 150,
  };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const boxes = plot.boxes;
  if (!boxes.length) {
    ctx.fillStyle = INK;
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("No angle samples", pad.left, pad.top + 28);
    return canvas;
  }

  const allVals = boxes.flatMap((b) => [
    b.minDeg,
    b.maxDeg,
    b.whiskerLowDeg ?? b.minDeg,
    b.whiskerHighDeg ?? b.maxDeg,
    ...(b.outliersDeg ?? []),
  ]);
  // Domain always includes 0° (mandatory tick)
  const yMin = Math.min(0, ...(allVals.length ? allVals : [0])) - 2;
  const yMax = Math.max(0, ...(allVals.length ? allVals : [0])) + 3;
  const ySpan = Math.max(1, yMax - yMin);
  const yOf = (v: number) => pad.top + innerH - ((v - yMin) / ySpan) * innerH;
  const centers = computePairedBoxCenters(boxes.length, pad.left, innerW);
  // Typical L–R distance within a pair — used to size the box width
  const pairSpanPx =
    centers.length >= 3 ? Math.abs(centers[2]! - centers[1]!) : innerW / Math.max(1, boxes.length);

  ctx.fillStyle = INK;
  ctx.font = "bold 36px sans-serif";
  const deltaTag = plot.relativeToT0 ? ` · Δ T${plot.toStep}−T0` : "";
  ctx.fillText(
    `Box · Target ${plot.fromStep} → ${plot.toStep}  (${plot.toLabel})${deltaTag}`,
    pad.left,
    34
  );

  // Axes — black
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + innerH);
  ctx.lineTo(pad.left + innerW, pad.top + innerH);
  ctx.stroke();

  const regionColor = (r: string) =>
    r === "upper" ? "#0284C7" : r === "lower" ? "#059669" : "#D97706";

  boxes.forEach((b, i) => {
    const cx = centers[i] ?? pad.left + innerW / 2;
    const boxW = Math.min(42, Math.max(20, pairSpanPx * 0.85));
    const color = regionColor(b.region);
    const wLow = b.whiskerLowDeg ?? b.minDeg;
    const wHigh = b.whiskerHighDeg ?? b.maxDeg;
    const outliers = b.outliersDeg ?? [];

    // Whisker
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, yOf(wHigh));
    ctx.lineTo(cx, yOf(wLow));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - boxW * 0.35, yOf(wHigh));
    ctx.lineTo(cx + boxW * 0.35, yOf(wHigh));
    ctx.moveTo(cx - boxW * 0.35, yOf(wLow));
    ctx.lineTo(cx + boxW * 0.35, yOf(wLow));
    ctx.stroke();

    // IQR box
    const top = Math.min(yOf(b.q1Deg), yOf(b.q3Deg));
    const h = Math.max(2, Math.abs(yOf(b.q1Deg) - yOf(b.q3Deg)));
    ctx.fillStyle = color + "33";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.fillRect(cx - boxW / 2, top, boxW, h);
    ctx.strokeRect(cx - boxW / 2, top, boxW, h);

    // Median
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - boxW / 2, yOf(b.medianDeg));
    ctx.lineTo(cx + boxW / 2, yOf(b.medianDeg));
    ctx.stroke();

    // Outliers
    outliers.forEach((v, oi) => {
      const jitter = ((oi % 3) - 1) * 3;
      ctx.fillStyle = "#FEE2E2";
      ctx.strokeStyle = "#DC2626";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + jitter, yOf(v), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    if (showXAxisLabels) {
      // Labels — fully vertical; start just under axis, grow into bottom pad
      ctx.save();
      ctx.translate(cx, pad.top + innerH + 18);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = INK;
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, 0, 0);
      ctx.restore();
    }
  });

  // Y ticks (always keep 0°; drop neighbors that would overlap after rounding)
  const yTicksRaw = Array.from(
    new Set([
      ...[0, 1, 2, 3, 4].map((i) => parseFloat((yMin + (ySpan * i) / 4).toFixed(0))),
      0,
    ])
  ).sort((a, b) => a - b);
  const minTickGap = Math.max(2, ySpan / 10);
  const yTicks: number[] = [];
  for (const v of yTicksRaw) {
    if (v === 0) {
      yTicks.push(0);
      continue;
    }
    // Skip ticks too close to 0° or to the previous kept tick
    if (Math.abs(v - 0) < minTickGap) continue;
    const prev = yTicks[yTicks.length - 1];
    if (prev !== undefined && Math.abs(v - prev) < minTickGap) continue;
    yTicks.push(v);
  }
  if (!yTicks.includes(0)) yTicks.push(0);
  yTicks.sort((a, b) => a - b);
  ctx.fillStyle = INK;
  ctx.font = "bold 38px ui-monospace, monospace";
  ctx.textAlign = "right";
  for (const v of yTicks) {
    ctx.fillText(`${v.toFixed(0)}°`, pad.left - 16, yOf(v) + 10);
  }
  ctx.save();
  ctx.translate(32, pad.top + innerH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(plot.relativeToT0 ? "Δ Angle (° vs T0)" : "Angle (°)", 0, 0);
  ctx.restore();
  ctx.textAlign = "start";

  return canvas;
}

function canvasToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/**
 * Landscape PDF:
 *  Page 1 — COP board PNG
 *  Following pages — 3 rows × (line | box) = 3 target pairs per page
 *  High-res canvases (1440px) keep charts sharp when scaled down; large black labels.
 */
export async function generateLandscapeVisualReport(
  input: LandscapeVisualReportInput
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4", // 297 × 210
  });
  const pageW = 297;
  const pageH = 210;
  const margin = 8;

  // ---- Page 1: Board ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("PatientBalanceAI · Visual Session Report", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `${input.patientName}  ·  ${input.sessionDate}  ·  ${input.sessionId}`,
    margin,
    19
  );

  const boardPng = await captureBoardPng(input.boardElement);
  const boardMaxW = pageW - margin * 2;
  const boardMaxH = pageH - 30;
  const imgProps = doc.getImageProperties(boardPng);
  const imgAspect = imgProps.width / imgProps.height;
  let drawW = boardMaxW;
  let drawH = drawW / imgAspect;
  if (drawH > boardMaxH) {
    drawH = boardMaxH;
    drawW = drawH * imgAspect;
  }
  const boardX = margin + (boardMaxW - drawW) / 2;
  doc.addImage(boardPng, "PNG", boardX, 24, drawW, drawH);

  // Pair hold series (by stepNumber) with transit box plots (by toStep)
  const pairs: Array<{
    label: string;
    series: HoldWindowErrorSeries | null;
    box: TransitAngleBoxPlot | null;
  }> = [];

  const boxByTo = new Map(input.transitBoxPlots.map((p) => [p.toStep, p]));
  const seriesByStep = new Map(input.holdSeries.map((s) => [s.stepNumber, s]));

  const steps = new Set<number>([
    ...input.holdSeries.map((s) => s.stepNumber),
    ...input.transitBoxPlots.map((p) => p.toStep),
  ]);
  // Session order: 1…6 then Target 0 (center return) last — never treat 0 as first
  const orderedSteps = [...steps].sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });

  for (const step of orderedSteps) {
    const series = seriesByStep.get(step) ?? null;
    const box = boxByTo.get(step) ?? null;
    if (!series && !box) continue;
    const from =
      box?.fromStep ??
      (step === 0 ? 6 : Math.max(0, step - 1));
    pairs.push({
      label: `Target ${from} → ${step}`,
      series,
      box,
    });
  }

  /** Fit image into a slot without stretching (letterbox / center). */
  const placeImageContain = (
    dataUrl: string,
    slotX: number,
    slotY: number,
    slotW: number,
    slotH: number
  ) => {
    const props = doc.getImageProperties(dataUrl);
    const aspect = props.width / Math.max(1, props.height);
    let w = slotW;
    let h = w / aspect;
    if (h > slotH) {
      h = slotH;
      w = h * aspect;
    }
    const x = slotX + (slotW - w) / 2;
    const y = slotY + (slotH - h) / 2;
    doc.addImage(dataUrl, "PNG", x, y, w, h);
  };

  const placeEmpty = (x: number, y: number, w: number, h: number, msg: string) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(msg, x + 6, y + 14);
  };

  // 3 transit pairs per page: 3 rows × (line | box) — no page header titles
  const gapX = 3;
  const gapY = 2.5;
  const topPad = 4;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin - topPad - 2;
  const cellW = (usableW - gapX) / 2;
  const cellH = (usableH - gapY * (PAIRS_PER_PAGE - 1)) / PAIRS_PER_PAGE;

  for (let i = 0; i < pairs.length; i += PAIRS_PER_PAGE) {
    doc.addPage("a4", "landscape");
    const chunk = pairs.slice(i, i + PAIRS_PER_PAGE);

    // X-axis names (Trunk / Shoulder / …) only on the last box plot of this page
    let lastBoxRow = -1;
    chunk.forEach((pair, rowIdx) => {
      if (pair.box) lastBoxRow = rowIdx;
    });

    chunk.forEach((pair, rowIdx) => {
      const rowY = topPad + rowIdx * (cellH + gapY);
      const leftX = margin;
      const rightX = margin + cellW + gapX;

      if (pair.series) {
        const lineCanvas = drawHoldLineChartCanvas(pair.series, CHART_W, CHART_H);
        placeImageContain(canvasToPng(lineCanvas), leftX, rowY, cellW, cellH);
      } else {
        placeEmpty(leftX, rowY, cellW, cellH, "No line chart");
      }

      if (pair.box) {
        const boxCanvas = drawTransitBoxPlotCanvas(pair.box, CHART_W, CHART_H, {
          showXAxisLabels: rowIdx === lastBoxRow,
        });
        placeImageContain(canvasToPng(boxCanvas), rightX, rowY, cellW, cellH);
      } else {
        placeEmpty(rightX, rowY, cellW, cellH, "No box plot");
      }
    });
  }

  // Page numbers — black
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Page ${p} / ${total}  ·  Landscape visual report`, pageW - margin, pageH - 3, {
      align: "right",
    });
  }

  return doc;
}
