import { jsPDF } from "jspdf";
import { BalanceSession, RecordedMeasurementPoint } from "../types/session";
import {
  DirectionalWeightShiftSessionSummary,
  DirectionalTargetAssessment,
  HoldWindowErrorSeries,
} from "../utils/directionalWeightShiftExercise";
import { LegRaiseSessionSummary } from "../utils/multimodalLegRaiseExercise";
import {
  Pose2DAngleSessionReport,
  POSE_2D_ANGLE_METRIC_KEYS,
  POSE_2D_ANGLE_METRIC_LABELS,
  formatAngleDeg,
  formatDeltaDeg,
} from "../utils/pose2dAngles";

export interface PdfGenerationResult {
  filename: string;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  uint8Array: Uint8Array;
}

/**
 * Professional Doctor PDF Balance Assessment Report Generator.
 * Generates vector-quality, multi-page clinical reports from an existing BalanceSession.
 */
export class PdfReportGenerator {
  public static generateReport(session: BalanceSession): jsPDF {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4", // 210 x 297 mm
    });

    const isSimulated = session.dataSource === "simulation";
    const totalPages = 4;

    // Derive load-cell and weight statistics if not pre-computed
    const sensorStats = this.computeSensorStats(session.measurements);
    const weightStats = this.computeWeightStats(session.measurements, session.summary.averageWeightKg);
    const copStats = this.computeCopStats(session.measurements, session.summary);

    // =========================================================================
    // PAGE 1: Header, Session Summary, Data Quality, Load Split
    // =========================================================================
    this.renderHeader(doc, 1, isSimulated);
    let y = 32;

    // Simulation Warning Banner or Hardware Badge
    if (isSimulated) {
      doc.setFillColor(254, 243, 199); // #FEF3C7
      doc.setDrawColor(245, 158, 11);  // #F59E0B
      doc.setLineWidth(0.6);
      doc.roundedRect(16, y, 178, 14, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(180, 83, 9); // #B45309
      doc.text("DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA", 22, y + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14);
      doc.text("This report was generated from simulated data and must not be used for clinical diagnostic purposes.", 22, y + 10.5);
      y += 18;
    } else {
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.4);
      doc.roundedRect(16, y, 178, 9, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(13, 148, 136);
      doc.text("DATA SOURCE: NINTENDO WII BALANCE BOARD (MODEL RVL-WBC-01) — LIVE HARDWARE", 20, y + 6);
      y += 13;
    }

    // Patient & Session Identification Grid
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(16, y, 178, 30, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PATIENT INFORMATION", 20, y + 6);
    doc.text("SESSION METADATA", 108, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);

    // Left Col: Patient Info
    doc.text(`Patient Name: ${session.patientName || "Unspecified"}`, 20, y + 12);
    doc.text(`Patient ID: ${session.patientId}`, 20, y + 17);
    doc.text(`Date of Session: ${new Date(session.startTime).toLocaleDateString()}`, 20, y + 22);
    doc.text(`Start Time: ${new Date(session.startTime).toLocaleTimeString()}`, 20, y + 27);

    // Right Col: Session Metadata
    doc.text(`Session ID: ${session.sessionId}`, 108, y + 12);
    doc.text(`Active Duration: ${session.summary.durationFormatted} (${(session.durationMs / 1000).toFixed(1)}s)`, 108, y + 17);
    doc.text(`Hardware Model: ${session.boardModel}`, 108, y + 22);
    doc.text(`Data Source: ${isSimulated ? "Simulation" : "Wii Balance Board"}`, 108, y + 27);

    y += 35;

    // Section 1: Session Summary
    this.renderSectionHeader(doc, "1. SESSION SUMMARY", y);
    y += 7;

    const summaryRows = [
      ["Duration", session.summary.durationFormatted, "Average Total Weight", `${session.summary.averageWeightKg.toFixed(2)} kg`],
      ["Valid Measurements", session.quality.validSamples.toLocaleString(), "Average Left Loading", `${session.summary.averageLeftPercent.toFixed(1)} %`],
      ["Invalid Measurements", session.quality.invalidSamples.toString(), "Average Right Loading", `${session.summary.averageRightPercent.toFixed(1)} %`],
      ["Data Transmission Gaps", session.quality.dataGaps.toString(), "Average Anterior Loading", `${session.summary.averageAnteriorPercent.toFixed(1)} %`],
      ["Nominal Sampling Rate", `${session.quality.samplingRate} Hz`, "Average Posterior Loading", `${session.summary.averagePosteriorPercent.toFixed(1)} %`],
    ];

    y = this.renderTwoColumnTable(doc, summaryRows, y);
    y += 6;

    // Section 2: Weight Distribution & Stability
    this.renderSectionHeader(doc, "2. WEIGHT DISTRIBUTION & BODY MASS STABILITY", y);
    y += 7;

    const weightRows = [
      ["Average Weight", `${session.summary.averageWeightKg.toFixed(2)} kg`, "Bilateral Symmetry (L/R)", `${session.summary.averageLeftPercent.toFixed(1)}% / ${session.summary.averageRightPercent.toFixed(1)}%`],
      ["Minimum Weight", `${weightStats.minWeight.toFixed(2)} kg`, "Anteroposterior Balance (Ant/Post)", `${session.summary.averageAnteriorPercent.toFixed(1)}% / ${session.summary.averagePosteriorPercent.toFixed(1)}%`],
      ["Maximum Weight", `${weightStats.maxWeight.toFixed(2)} kg`, "Weight Excursion Range", `${weightStats.weightRange.toFixed(2)} kg`],
    ];

    y = this.renderTwoColumnTable(doc, weightRows, y);
    y += 6;

    // Section 3: Data Quality Assurance
    this.renderSectionHeader(doc, "3. DATA QUALITY ASSURANCE", y);
    y += 7;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(16, y, 178, 22, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Signal Integrity Status:", 20, y + 6);
    doc.setFont("helvetica", "normal");
    const integrityText = session.quality.invalidSamples === 0
      ? "100% Valid Packet Stream — No sensor dropouts or numerical anomalies detected."
      : `Filtered ${session.quality.invalidSamples} anomalous packets. Scientific measurements preserved.`;
    doc.text(integrityText, 62, y + 6);

    doc.setFont("helvetica", "bold");
    doc.text("Transmission Continuity:", 20, y + 12);
    doc.setFont("helvetica", "normal");
    const gapText = session.quality.dataGaps === 0
      ? "Continuous high-frequency stream with zero transmission dropouts."
      : `${session.quality.dataGaps} intermittent transmission latency intervals (>350ms) observed.`;
    doc.text(gapText, 62, y + 12);

    doc.setFont("helvetica", "bold");
    doc.text("Effective Frequency:", 20, y + 18);
    doc.setFont("helvetica", "normal");
    doc.text(`Sampling cadence operating at approximately ${session.quality.samplingRate} Hz throughout session.`, 62, y + 18);

    this.renderFooter(doc, 1, totalPages, session);

    // =========================================================================
    // PAGE 2: Center of Pressure (COP) Analysis & 2D Trajectory Plot
    // =========================================================================
    doc.addPage();
    this.renderHeader(doc, 2, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "4. CENTER OF PRESSURE (COP) DISPERSION & TRAJECTORY", y);
    y += 7;

    // COP Statistical Metrics Box
    const copRows = [
      ["Lateral COP X Range", `[${copStats.minCopX.toFixed(3)}, ${copStats.maxCopX.toFixed(3)}]`, "Mean COP X (Lateral Bias)", `${copStats.meanCopX >= 0 ? "+" : ""}${copStats.meanCopX.toFixed(3)}`],
      ["Anteroposterior COP Y Range", `[${copStats.minCopY.toFixed(3)}, ${copStats.maxCopY.toFixed(3)}]`, "Mean COP Y (A/P Bias)", `${copStats.meanCopY >= 0 ? "+" : ""}${copStats.meanCopY.toFixed(3)}`],
      ["Total COP Coordinate Samples", session.summary.copSamples.toLocaleString(), "Coordinate Bounds", "Normalized [-1.0 to +1.0]"],
    ];

    y = this.renderTwoColumnTable(doc, copRows, y);
    y += 10;

    // 2D Trajectory Plot (Centered Box, 110mm x 110mm)
    const boxSize = 110;
    const boxX = (210 - boxSize) / 2;
    const boxY = y;

    this.render2dCopTrajectory(doc, session.measurements, boxX, boxY, boxSize);
    y += boxSize + 16;

    // Trajectory Legend
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("2D Trajectory Interpretation Guide:", 16, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("• The green marker indicates the patient's initial stance (START) at elapsed time 00:00.", 16, y + 5);
    doc.text("• The red marker indicates the final recorded position (END) when the session stopped.", 16, y + 9);
    doc.text("• The central dashed circle represents the 10% equilibrium balance zone around absolute neutral (0, 0).", 16, y + 13);

    this.renderFooter(doc, 2, totalPages, session);

    // =========================================================================
    // PAGE 3: Time-Series Analysis (Three Clinical Vector Graphs)
    // =========================================================================
    doc.addPage();
    this.renderHeader(doc, 3, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "5. TIME-SERIES DYNAMICS & POSTURAL SWAY TRAJECTORIES", y);
    y += 6;

    const chartW = 178;
    const chartH = 44;
    const durationSec = session.durationMs / 1000;

    // Graph 1: COP X (Lateral)
    this.renderTimeSeriesGraph(
      doc,
      "Graph 1: Center of Pressure — Lateral Movement (COP X)",
      "Left (-X) ← Center (0.0) → Right (+X)",
      16,
      y,
      chartW,
      chartH,
      session.measurements,
      durationSec,
      "copX"
    );
    y += chartH + 14;

    // Graph 2: COP Y (Anteroposterior)
    this.renderTimeSeriesGraph(
      doc,
      "Graph 2: Center of Pressure — Anteroposterior Movement (COP Y)",
      "Front / Anterior (+Y) ↑ Center (0.0) ↓ Back / Posterior (-Y)",
      16,
      y,
      chartW,
      chartH,
      session.measurements,
      durationSec,
      "copY"
    );
    y += chartH + 14;

    // Graph 3: Weight Distribution (Bilateral Split)
    this.renderTimeSeriesGraph(
      doc,
      "Graph 3: Weight Distribution Over Time (Left % vs Right %)",
      "Y: 0% to 100% | Dashed Center: 50/50 Balanced Stance",
      16,
      y,
      chartW,
      chartH,
      session.measurements,
      durationSec,
      "weight"
    );

    this.renderFooter(doc, 3, totalPages, session);

    // =========================================================================
    // PAGE 4: Load-Cell Sensors, Descriptive Observations, Disclaimer
    // =========================================================================
    doc.addPage();
    this.renderHeader(doc, 4, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "6. FOUR-CHANNEL LOAD-CELL SENSOR BREAKDOWN", y);
    y += 7;

    // Load Cell Sensor Table
    this.renderLoadCellTable(doc, sensorStats, y);
    y += 36;

    // Section 7: Observed Session Characteristics (Descriptive Only)
    this.renderSectionHeader(doc, "7. OBSERVED SESSION CHARACTERISTICS (NON-DIAGNOSTIC)", y);
    y += 7;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(16, y, 178, 38, 2, 2, "FD");

    const obsPrefix = isSimulated ? "[Simulation Observation] " : "";
    const observations = this.generateDescriptiveObservations(session, weightStats, copStats, obsPrefix);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    let obsY = y + 7;
    observations.forEach((obs) => {
      doc.text(`• ${obs}`, 20, obsY);
      obsY += 6.5;
    });

    y += 44;

    // Section 8: Clinical / Research Review Notes Area
    this.renderSectionHeader(doc, "8. CLINICAL & REHABILITATION REVIEW NOTES", y);
    y += 7;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(16, y, 178, 28);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Clinician / Researcher observational notes & follow-up rehabilitation directives:", 20, y + 6);

    y += 34;

    // Signature Area
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Reviewing Clinician / Investigator: ____________________________________", 16, y);
    doc.text("Date: ________________________", 136, y);

    this.renderFooter(doc, 4, totalPages, session);

    return doc;
  }

  // =========================================================================
  // HELPER: Professional Header
  // =========================================================================
  private static renderHeader(doc: jsPDF, _pageNum: number, isSimulated: boolean) {
    doc.setFillColor(13, 148, 136); // Medical Teal Bar
    doc.rect(16, 12, 178, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("PatientBalanceAI", 16, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Neuro-Rehabilitation & Balance Analysis System", 16, 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(13, 148, 136);
    doc.text("BALANCE MEASUREMENT REPORT", 194, 18, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isSimulated ? "DEVELOPMENT SIMULATION" : "CLINICAL DATA ACQUISITION", 194, 22, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, 25, 194, 25);
  }

  // =========================================================================
  // HELPER: Section Header
  // =========================================================================
  private static renderSectionHeader(doc: jsPDF, title: string, y: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(13, 148, 136);
    doc.text(title, 16, y);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(16, y + 1.5, 194, y + 1.5);
  }

  // =========================================================================
  // HELPER: Footer & Official Disclaimer
  // =========================================================================
  private static renderFooter(doc: jsPDF, pageNum: number, totalPages: number, session: BalanceSession) {
    const y = 282;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, y, 194, y);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Notice: This report presents measurements and calculated parameters from the recorded balance session. " +
      "It is intended to support clinical or research review and does not constitute a medical diagnosis.",
      105,
      y + 4,
      { align: "center", maxWidth: 174 }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`PatientBalanceAI | Session ID: ${session.sessionId}`, 16, y + 10);
    doc.text(`Page ${pageNum} of ${totalPages}`, 194, y + 10, { align: "right" });
  }

  // =========================================================================
  // HELPER: Two-Column Key-Value Table
  // =========================================================================
  private static renderTwoColumnTable(doc: jsPDF, rows: string[][], startY: number): number {
    const rowH = 5.2;
    let y = startY;

    rows.forEach((row, idx) => {
      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.setFillColor(248, 250, 252);
        doc.rect(16, y - 3.8, 178, rowH, "F");
      }

      // Col 1 (Left key/val)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(row[0], 20, y);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(row[1], 75, y);

      // Col 2 (Right key/val)
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(row[2], 108, y);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(row[3], 175, y);

      y += rowH;
    });

    return y;
  }

  // =========================================================================
  // HELPER: 2D Center of Pressure Trajectory Plot
  // =========================================================================
  private static render2dCopTrajectory(
    doc: jsPDF,
    measurements: RecordedMeasurementPoint[],
    boxX: number,
    boxY: number,
    size: number
  ) {
    const half = size / 2;
    const centerX = boxX + half;
    const centerY = boxY + half;

    // Background force plate representation
    doc.setFillColor(250, 252, 251);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.roundedRect(boxX, boxY, size, size, 4, 4, "FD");

    // Coordinate Axes (Crosshairs)
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(boxX + 6, centerY, boxX + size - 6, centerY); // Horizontal X
    doc.line(centerX, boxY + 6, centerX, boxY + size - 6); // Vertical Y

    // Center Equilibrium Circle (Radius 10% of half-size)
    doc.setDrawColor(153, 246, 228); // light teal
    doc.setLineWidth(0.3);
    doc.circle(centerX, centerY, half * 0.15, "S");

    // Axis Labels
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);

    doc.text("FRONT / ANTERIOR (+1.0)", centerX, boxY + 5, { align: "center" });
    doc.text("BACK / POSTERIOR (-1.0)", centerX, boxY + size - 2, { align: "center" });
    doc.text("LEFT (-1.0)", boxX + 2, centerY + 1, { align: "left" });
    doc.text("RIGHT (+1.0)", boxX + size - 2, centerY + 1, { align: "right" });

    if (!measurements || measurements.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("No valid COP trajectory points recorded", centerX, centerY, { align: "center" });
      return;
    }

    // Downsample if over 1000 points to keep PDF vector rendering crisp and fast
    const stride = Math.max(1, Math.floor(measurements.length / 800));
    const renderPts: RecordedMeasurementPoint[] = [];
    for (let i = 0; i < measurements.length; i += stride) {
      renderPts.push(measurements[i]);
    }
    if (renderPts[renderPts.length - 1] !== measurements[measurements.length - 1]) {
      renderPts.push(measurements[measurements.length - 1]);
    }

    const scale = (half - 12); // Margin around plot edges

    // Draw Vector Path
    doc.setDrawColor(13, 148, 136); // #0D9488
    doc.setLineWidth(0.4);

    for (let i = 0; i < renderPts.length - 1; i++) {
      const p1 = renderPts[i];
      const p2 = renderPts[i + 1];

      // Coordinate mapping: +copX moves Right, +copY moves Front (Upward in Y)
      const x1 = centerX + p1.copX * scale;
      const y1 = centerY - p1.copY * scale;
      const x2 = centerX + p2.copX * scale;
      const y2 = centerY - p2.copY * scale;

      doc.line(x1, y1, x2, y2);
    }

    // START Point (Green dot & text)
    const first = measurements[0];
    const startX = centerX + first.copX * scale;
    const startY = centerY - first.copY * scale;

    doc.setFillColor(34, 197, 94); // Green
    doc.circle(startX, startY, 1.6, "F");
    doc.setDrawColor(255, 255, 255);
    doc.circle(startX, startY, 1.6, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(22, 101, 52);
    doc.text("START", startX + 2.5, startY + 1);

    // END Point (Red dot & text)
    const last = measurements[measurements.length - 1];
    const endX = centerX + last.copX * scale;
    const endY = centerY - last.copY * scale;

    doc.setFillColor(239, 68, 68); // Red
    doc.circle(endX, endY, 1.6, "F");
    doc.setDrawColor(255, 255, 255);
    doc.circle(endX, endY, 1.6, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(185, 28, 28);
    doc.text("END", endX + 2.5, endY + 1);
  }

  // =========================================================================
  // HELPER: Time-Series Graphs (COP X, COP Y, Weight)
  // =========================================================================
  private static renderTimeSeriesGraph(
    doc: jsPDF,
    title: string,
    axisGuide: string,
    x: number,
    y: number,
    w: number,
    h: number,
    measurements: RecordedMeasurementPoint[],
    durationSec: number,
    type: "copX" | "copY" | "weight"
  ) {
    // Title & Axis Guide
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(title, x, y - 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(axisGuide, x + w, y - 2, { align: "right" });

    // Chart Box
    const leftMargin = 20;
    const plotX = x + leftMargin;
    const plotY = y;
    const plotW = w - leftMargin;
    const plotH = h;

    doc.setFillColor(250, 252, 251);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(plotX, plotY, plotW, plotH, "FD");

    // Gridlines & Ticks
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);

    if (type === "copX" || type === "copY") {
      // Y Ticks: +1.0, 0.0, -1.0
      doc.text(type === "copX" ? "+1.0 RIGHT (+X)" : "+1.0 FRONT (+Y)", x + leftMargin - 2, plotY + 3, { align: "right" });
      doc.text("0.0 CENTER", x + leftMargin - 2, plotY + plotH / 2 + 1, { align: "right" });
      doc.text(type === "copX" ? "-1.0 LEFT (-X)" : "-1.0 BACK (-Y)", x + leftMargin - 2, plotY + plotH - 1, { align: "right" });

      // Midline (Center 0)
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(plotX, plotY + plotH / 2, plotX + plotW, plotY + plotH / 2);
    } else {
      // Weight Ticks: 100%, 50%, 0%
      doc.text("100%", x + leftMargin - 2, plotY + 3, { align: "right" });
      doc.text("50% BAL", x + leftMargin - 2, plotY + plotH / 2 + 1, { align: "right" });
      doc.text("0%", x + leftMargin - 2, plotY + plotH - 1, { align: "right" });

      // 50% Baseline
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(plotX, plotY + plotH / 2, plotX + plotW, plotY + plotH / 2);
    }

    // Time Ticks (X Axis)
    const timeStepSec = Math.max(5, Math.round(durationSec / 4));
    for (let t = 0; t <= durationSec; t += timeStepSec) {
      const frac = durationSec > 0 ? t / durationSec : 0;
      const tx = plotX + frac * plotW;
      doc.line(tx, plotY + plotH, tx, plotY + plotH + 1.5);
      doc.text(`${t}s`, tx, plotY + plotH + 4, { align: "center" });
    }

    if (!measurements || measurements.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("No measurements available", plotX + plotW / 2, plotY + plotH / 2, { align: "center" });
      return;
    }

    // Downsample points for vector PDF plotting (max 600 points)
    const stride = Math.max(1, Math.floor(measurements.length / 600));
    const pts: RecordedMeasurementPoint[] = [];
    for (let i = 0; i < measurements.length; i += stride) {
      pts.push(measurements[i]);
    }
    if (pts[pts.length - 1] !== measurements[measurements.length - 1]) {
      pts.push(measurements[measurements.length - 1]);
    }

    // Plot Paths
    if (type === "copX") {
      doc.setDrawColor(13, 148, 136); // Teal
      doc.setLineWidth(0.4);
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = plotX + (pts[i].elapsedMs / (durationSec * 1000)) * plotW;
        const y1 = plotY + ((1.0 - pts[i].copX) / 2.0) * plotH;
        const x2 = plotX + (pts[i + 1].elapsedMs / (durationSec * 1000)) * plotW;
        const y2 = plotY + ((1.0 - pts[i + 1].copX) / 2.0) * plotH;
        doc.line(x1, y1, x2, y2);
      }
    } else if (type === "copY") {
      doc.setDrawColor(5, 150, 105); // Green
      doc.setLineWidth(0.4);
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = plotX + (pts[i].elapsedMs / (durationSec * 1000)) * plotW;
        const y1 = plotY + ((1.0 - pts[i].copY) / 2.0) * plotH;
        const x2 = plotX + (pts[i + 1].elapsedMs / (durationSec * 1000)) * plotW;
        const y2 = plotY + ((1.0 - pts[i + 1].copY) / 2.0) * plotH;
        doc.line(x1, y1, x2, y2);
      }
    } else if (type === "weight") {
      // Left % Series (Teal)
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.4);
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = plotX + (pts[i].elapsedMs / (durationSec * 1000)) * plotW;
        const y1 = plotY + ((100.0 - pts[i].leftPercent) / 100.0) * plotH;
        const x2 = plotX + (pts[i + 1].elapsedMs / (durationSec * 1000)) * plotW;
        const y2 = plotY + ((100.0 - pts[i + 1].leftPercent) / 100.0) * plotH;
        doc.line(x1, y1, x2, y2);
      }

      // Right % Series (Sky Blue)
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.4);
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = plotX + (pts[i].elapsedMs / (durationSec * 1000)) * plotW;
        const y1 = plotY + ((100.0 - pts[i].rightPercent) / 100.0) * plotH;
        const x2 = plotX + (pts[i + 1].elapsedMs / (durationSec * 1000)) * plotW;
        const y2 = plotY + ((100.0 - pts[i + 1].rightPercent) / 100.0) * plotH;
        doc.line(x1, y1, x2, y2);
      }

      // Mini Legend for Weight
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(13, 148, 136);
      doc.text("● Left %", plotX + plotW - 25, plotY + 4);
      doc.setTextColor(2, 132, 199);
      doc.text("● Right %", plotX + plotW - 12, plotY + 4);
    }
  }

  // =========================================================================
  // HELPER: Four Load-Cell Sensor Breakdown Table
  // =========================================================================
  private static renderLoadCellTable(doc: jsPDF, stats: any, startY: number) {
    const headers = ["Channel", "Anatomical Position", "Mean Force", "Min Force", "Max Force", "Load Share"];
    const colX = [16, 42, 85, 115, 145, 172];

    doc.setFillColor(241, 245, 249);
    doc.rect(16, startY, 178, 6, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    headers.forEach((h, i) => doc.text(h, colX[i] + 2, startY + 4.2));

    const rows = [
      ["Front-Left (FL)", "Anterior-Left", `${stats.fl.mean.toFixed(2)} kg`, `${stats.fl.min.toFixed(2)} kg`, `${stats.fl.max.toFixed(2)} kg`, `${stats.fl.share.toFixed(1)}%`],
      ["Front-Right (FR)", "Anterior-Right", `${stats.fr.mean.toFixed(2)} kg`, `${stats.fr.min.toFixed(2)} kg`, `${stats.fr.max.toFixed(2)} kg`, `${stats.fr.share.toFixed(1)}%`],
      ["Back-Left (BL)", "Posterior-Left", `${stats.bl.mean.toFixed(2)} kg`, `${stats.bl.min.toFixed(2)} kg`, `${stats.bl.max.toFixed(2)} kg`, `${stats.bl.share.toFixed(1)}%`],
      ["Back-Right (BR)", "Posterior-Right", `${stats.br.mean.toFixed(2)} kg`, `${stats.br.min.toFixed(2)} kg`, `${stats.br.max.toFixed(2)} kg`, `${stats.br.share.toFixed(1)}%`],
    ];

    let y = startY + 6;
    rows.forEach((r, idx) => {
      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.setFillColor(250, 252, 251);
        doc.rect(16, y, 178, 5.5, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      r.forEach((val, i) => doc.text(val, colX[i] + 2, y + 4));

      y += 5.5;
    });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, y, 194, y);
  }

  // =========================================================================
  // COMPUTATIONS: Load-Cell, Weight, and COP Statistics
  // =========================================================================
  private static computeSensorStats(pts: RecordedMeasurementPoint[]) {
    if (!pts || pts.length === 0) {
      return {
        fl: { mean: 0, min: 0, max: 0, share: 25 },
        fr: { mean: 0, min: 0, max: 0, share: 25 },
        bl: { mean: 0, min: 0, max: 0, share: 25 },
        br: { mean: 0, min: 0, max: 0, share: 25 },
      };
    }

    let sumFL = 0, minFL = pts[0].frontLeft, maxFL = pts[0].frontLeft;
    let sumFR = 0, minFR = pts[0].frontRight, maxFR = pts[0].frontRight;
    let sumBL = 0, minBL = pts[0].backLeft, maxBL = pts[0].backLeft;
    let sumBR = 0, minBR = pts[0].backRight, maxBR = pts[0].backRight;

    pts.forEach((p) => {
      sumFL += p.frontLeft;
      sumFR += p.frontRight;
      sumBL += p.backLeft;
      sumBR += p.backRight;

      if (p.frontLeft < minFL) minFL = p.frontLeft;
      if (p.frontLeft > maxFL) maxFL = p.frontLeft;
      if (p.frontRight < minFR) minFR = p.frontRight;
      if (p.frontRight > maxFR) maxFR = p.frontRight;
      if (p.backLeft < minBL) minBL = p.backLeft;
      if (p.backLeft > maxBL) maxBL = p.backLeft;
      if (p.backRight < minBR) minBR = p.backRight;
      if (p.backRight > maxBR) maxBR = p.backRight;
    });

    const n = pts.length;
    const meanFL = sumFL / n;
    const meanFR = sumFR / n;
    const meanBL = sumBL / n;
    const meanBR = sumBR / n;
    const totalMean = meanFL + meanFR + meanBL + meanBR || 1;

    return {
      fl: { mean: meanFL, min: minFL, max: maxFL, share: (meanFL / totalMean) * 100 },
      fr: { mean: meanFR, min: minFR, max: maxFR, share: (meanFR / totalMean) * 100 },
      bl: { mean: meanBL, min: minBL, max: maxBL, share: (meanBL / totalMean) * 100 },
      br: { mean: meanBR, min: minBR, max: maxBR, share: (meanBR / totalMean) * 100 },
    };
  }

  private static computeWeightStats(pts: RecordedMeasurementPoint[], defaultWeight: number) {
    if (!pts || pts.length === 0) {
      return { minWeight: defaultWeight, maxWeight: defaultWeight, weightRange: 0 };
    }
    let minW = pts[0].totalWeight;
    let maxW = pts[0].totalWeight;

    pts.forEach((p) => {
      if (p.totalWeight < minW) minW = p.totalWeight;
      if (p.totalWeight > maxW) maxW = p.totalWeight;
    });

    return { minWeight: minW, maxWeight: maxW, weightRange: maxW - minW };
  }

  private static computeCopStats(pts: RecordedMeasurementPoint[], summary: any) {
    if (!pts || pts.length === 0) {
      return {
        minCopX: summary.minCopX ?? 0,
        maxCopX: summary.maxCopX ?? 0,
        minCopY: summary.minCopY ?? 0,
        maxCopY: summary.maxCopY ?? 0,
        meanCopX: 0,
        meanCopY: 0,
      };
    }

    let sumX = 0, sumY = 0;
    let minX = pts[0].copX, maxX = pts[0].copX;
    let minY = pts[0].copY, maxY = pts[0].copY;

    pts.forEach((p) => {
      sumX += p.copX;
      sumY += p.copY;
      if (p.copX < minX) minX = p.copX;
      if (p.copX > maxX) maxX = p.copX;
      if (p.copY < minY) minY = p.copY;
      if (p.copY > maxY) maxY = p.copY;
    });

    return {
      minCopX: minX,
      maxCopX: maxX,
      minCopY: minY,
      maxCopY: maxY,
      meanCopX: sumX / pts.length,
      meanCopY: sumY / pts.length,
    };
  }

  // =========================================================================
  // HELPER: Non-Diagnostic Purely Descriptive Observations
  // =========================================================================
  private static generateDescriptiveObservations(
    session: BalanceSession,
    weightStats: any,
    copStats: any,
    prefix: string
  ): string[] {
    const list: string[] = [];

    // Lateral Loading
    const left = session.summary.averageLeftPercent;
    const right = session.summary.averageRightPercent;
    if (Math.abs(left - right) < 3.0) {
      list.push(`${prefix}Bilateral weight distribution remained symmetric within 3% (Left: ${left.toFixed(1)}%, Right: ${right.toFixed(1)}%).`);
    } else if (left > right) {
      list.push(`${prefix}Left-side loading exceeded right-side loading during the recorded session (Left: ${left.toFixed(1)}%, Right: ${right.toFixed(1)}%).`);
    } else {
      list.push(`${prefix}Right-side loading exceeded left-side loading during the recorded session (Right: ${right.toFixed(1)}%, Left: ${left.toFixed(1)}%).`);
    }

    // Anteroposterior Loading
    const ant = session.summary.averageAnteriorPercent;
    const post = session.summary.averagePosteriorPercent;
    if (Math.abs(ant - post) < 3.0) {
      list.push(`${prefix}Anteroposterior weight distribution remained centered within neutral parameters (Anterior: ${ant.toFixed(1)}%, Posterior: ${post.toFixed(1)}%).`);
    } else if (ant > post) {
      list.push(`${prefix}Anterior loading was greater than posterior loading during the recorded session (Anterior: ${ant.toFixed(1)}%, Posterior: ${post.toFixed(1)}%).`);
    } else {
      list.push(`${prefix}Posterior loading was greater than anterior loading during the recorded session (Posterior: ${post.toFixed(1)}%, Anterior: ${ant.toFixed(1)}%).`);
    }

    // COP Excursion
    const xSpan = Math.abs(copStats.maxCopX - copStats.minCopX);
    const ySpan = Math.abs(copStats.maxCopY - copStats.minCopY);
    list.push(
      `${prefix}The recorded Center of Pressure trajectory had an excursion span of ${xSpan.toFixed(2)} on the lateral axis and ${ySpan.toFixed(2)} on the anteroposterior axis.`
    );

    // Total Weight Stability
    list.push(
      `${prefix}Total applied force stability remained within a range of ${weightStats.weightRange.toFixed(2)} kg (Min: ${weightStats.minWeight.toFixed(2)} kg, Max: ${weightStats.maxWeight.toFixed(2)} kg).`
    );

    return list;
  }

  // =========================================================================
  // DIRECTIONAL WEIGHT SHIFT ASSESSMENT REPORT (PHASE D)
  // =========================================================================
  public static generateDirectionalWeightShiftReport(
    summary: DirectionalWeightShiftSessionSummary,
    angleReport?: Pose2DAngleSessionReport | null
  ): jsPDF {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4", // 210 x 297 mm
    });

    const isSimulated = !summary.isRealHardware;
    const hasAngles = Boolean(angleReport && angleReport.snapshots.length > 0);
    const holdSeries = (summary.holdWindowErrorSeries ?? []).filter((s) => s.sampleCount > 0);
    const holdFrameRows = holdSeries.reduce((n, s) => n + s.sampleCount, 0);
    const holdPages = holdSeries.length > 0 ? 1 + Math.max(1, Math.ceil(holdFrameRows / 30)) : 0;
    // Pages 1–3 board report; + angles; + hold-window frame errors
    const totalPages =
      3 +
      (hasAngles ? 1 : 0) +
      (hasAngles && angleReport!.transitions.length > 0 ? 1 : 0) +
      holdPages;

    // =========================================================================
    // PAGE 1: Header, Protocol, 5-Direction Summary Table, Definitions
    // =========================================================================
    this.renderDirectionalHeader(doc, 1, isSimulated);
    let y = 32;

    // Sensor Badge / Simulation Banner
    if (isSimulated) {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.6);
      doc.roundedRect(16, y, 178, 12, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(180, 83, 9);
      doc.text("DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA", 22, y + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text("This report was generated without verified physical balance board telemetry and is non-diagnostic.", 22, y + 9.5);
      y += 16;
    } else {
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.4);
      doc.roundedRect(16, y, 178, 8.5, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(13, 148, 136);
      doc.text("DATA SOURCE: NINTENDO WII BALANCE BOARD (MODEL RVL-WBC-01) — REAL HARDWARE TELEMETRY", 20, y + 5.5);
      y += 12.5;
    }

    // Patient & Session Identification Grid
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(16, y, 178, 28, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PATIENT IDENTIFICATION", 20, y + 5.5);
    doc.text("EXERCISE SESSION METADATA", 108, y + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    // Left Col: Patient Info
    doc.text(`Patient Name: ${summary.patientName || "Unspecified"}`, 20, y + 11);
    doc.text(`Patient ID: ${summary.patientId}`, 20, y + 16);
    doc.text(`Session Date: ${summary.sessionDate}`, 20, y + 21);
    doc.text(`Start Time: ${new Date(summary.startTime).toLocaleTimeString()}`, 20, y + 26);

    // Right Col: Session Metadata
    doc.text(`Protocol: Directional Weight Shift (5 Targets)`, 108, y + 11);
    doc.text(`Active Duration: ${summary.totalDurationSeconds.toFixed(1)} seconds`, 108, y + 16);
    const completionPct = Math.round((summary.completedTargetsCount / summary.totalTargetsCount) * 100);
    doc.text(`Targets Completed: ${summary.completedTargetsCount} of ${summary.totalTargetsCount} (${completionPct}%)`, 108, y + 21);
    const syncEpoch = summary.multimodalSyncEpochMs;
    doc.text(
      syncEpoch
        ? `Shared Sync T0: ${new Date(syncEpoch).toLocaleTimeString()} (Target 1 start)`
        : `Hardware Model: ${summary.hardwareModel} | 4-Load-Cell Platform`,
      108,
      y + 26
    );

    y += 33;

    // Section 1: Protocol Description
    this.renderSectionHeader(doc, "1. EXERCISE PROTOCOL & TARGET SEQUENCE SPECIFICATION", y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      "The Directional Weight Shift exercise assesses voluntary Center of Pressure (COP) displacement across five sequential rehabilitation targets with configurable hold requirements:\n" +
      "1. SHIFT LEFT (Lateral -0.38) → 2. SHIFT RIGHT (Lateral +0.38) → 3. SHIFT FORWARD (Anterior +0.32) → 4. SHIFT BACKWARD (Posterior -0.32) → 5. RETURN TO CENTER (0.00, 0.00).\n" +
      "Target Completion Criterion: Patient must guide real COP into the target circle (r = 0.16) and maintain continuous hold for the required duration.\n" +
      "If the COP leaves the target boundary beyond tremor tolerance before reaching the target duration, the uninterrupted hold timer immediately resets to zero.",
      16,
      y + 1,
      { maxWidth: 178, lineHeightFactor: 1.35 }
    );
    y += 18;

    // Section 2: 5-Direction Summary Table
    this.renderSectionHeader(doc, "2. FIVE-DIRECTION ASSESSMENT MEASUREMENTS TABLE", y);
    y += 6;

    y = this.renderDirectionalSummaryTable(doc, summary.targets, summary, y);
    y += 7;

    // Section 3: Scientific Calculation Definitions & Measurement Units
    this.renderSectionHeader(doc, "3. SCIENTIFIC DEFINITIONS & MEASUREMENT UNITS", y);
    y += 6;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(16, y, 178, 28, 2, 2, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);

    const defs = [
      "• Required Hold (s): Prescribed duration of continuous balance required to complete each direction (configurable).",
      "• Actual Successful Hold (s): Measured continuous hold duration achieved by patient (>= required hold if completed).",
      "• Target Accuracy (%): (Valid sensor samples inside target boundary / Total valid samples during attempt) × 100.",
      "• Target Attempts: Total distinct entries into the acceptance circle required to achieve target completion.",
      "• Mean Distance (mm): Euclidean distance from COP to target center, calibrated using physical sensor spacing (446mm lateral × 238mm AP).",
      "• Non-Clinical Metric Notice: Measurements represent objective exercise-performance data. This does not constitute a clinical score.",
    ];

    let defY = y + 4.5;
    defs.forEach((d) => {
      doc.text(d, 19, defY);
      defY += 4.5;
    });

    this.renderDirectionalFooter(doc, 1, totalPages, summary);

    // =========================================================================
    // PAGE 2: Vector Charts — 2D Force Plate Trajectory & Comparison Charts
    // =========================================================================
    doc.addPage();
    this.renderDirectionalHeader(doc, 2, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "4. 2D CENTER OF PRESSURE TRAJECTORY & DIRECTIONAL TARGET ZONES", y);
    y += 6;

    // Render 2D Vector Trajectory on Wii Balance Board
    const plotW = 156;
    const plotH = 88;
    const plotX = (210 - plotW) / 2;
    this.render2dDirectionalTrajectory(doc, summary.targets, plotX, y, plotW, plotH);
    y += plotH + 12;

    // Section 5: Target-by-Target Performance Comparison Chart
    this.renderSectionHeader(doc, "5. TARGET-BY-TARGET PERFORMANCE & SYMMETRY COMPARISON", y);
    y += 6;

    this.renderDirectionalBarCharts(doc, summary.targets, 16, y, 178, 48);

    this.renderDirectionalFooter(doc, 2, totalPages, summary);

    // =========================================================================
    // PAGE 3: Timeline Dynamics, Sensor Quality, Observations & Disclaimer
    // =========================================================================
    doc.addPage();
    this.renderDirectionalHeader(doc, 3, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "6. COP DISTANCE TO TARGET TIMELINE DYNAMICS", y);
    y += 6;

    this.renderDistanceTimeline(doc, summary.targets, summary.totalDurationSeconds, 16, y, 178, 44);
    y += 50;

    // Section 7: Sensor Data Quality & Limitations
    this.renderSectionHeader(doc, "7. SENSOR DATA QUALITY, TELEMETRY CADENCE & LIMITATIONS", y);
    y += 6;

    const qualityRows = [
      ["Hardware Status", summary.isRealHardware ? "Live RVL-WBC-01 Hardware" : "Simulation Telemetry", "Valid Packet Count", summary.totalValidSamples.toLocaleString()],
      ["Transmission Continuity", summary.totalMissingDataDurationSeconds === 0 ? "Continuous (0.0s gap)" : `${summary.totalMissingDataDurationSeconds.toFixed(1)}s dropout duration`, "Invalid Packets Filtered", summary.totalInvalidSamples.toString()],
      ["Overall Stream Quality", summary.overallSensorQuality, "Physical Dimensions", "446 mm (X) × 238 mm (Y)"],
    ];
    y = this.renderTwoColumnTable(doc, qualityRows, y);
    y += 6;

    // Section 8: Objective Descriptive Observations (Non-Diagnostic)
    this.renderSectionHeader(doc, "8. OBJECTIVE PERFORMANCE OBSERVATIONS (NON-DIAGNOSTIC)", y);
    y += 6;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(16, y, 178, 32, 2, 2, "FD");

    const observations = this.generateDirectionalObservations(summary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);

    let obsY = y + 5.5;
    observations.forEach((obs) => {
      doc.text(`• ${obs}`, 20, obsY, { maxWidth: 170 });
      obsY += 5.5;
    });

    y += 38;

    // Section 9: Clinical & Rehabilitation Review Notes
    this.renderSectionHeader(doc, "9. CLINICAL / REHABILITATION REVIEW & VERIFICATION", y);
    y += 6;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(16, y, 178, 20);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Clinician / Physical Therapist rehabilitation progress notes:", 20, y + 5);

    y += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Reviewing Clinician / Investigator: ____________________________________", 16, y);
    doc.text("Date: ________________________", 136, y);

    this.renderDirectionalFooter(doc, 3, totalPages, summary);

    // =========================================================================
    // PAGE 4+: Board-synced 2D joint angles (absolute + consecutive changes)
    // =========================================================================
    if (hasAngles && angleReport) {
      this.appendPose2DAngleReportPages(doc, summary, angleReport, isSimulated, totalPages);
    }

    // =========================================================================
    // Hold-window per-frame errors (inside border only → hold complete)
    // =========================================================================
    if (holdSeries.length > 0) {
      this.appendHoldWindowErrorPages(doc, summary, holdSeries, isSimulated, totalPages);
    }

    return doc;
  }

  /**
   * Append PDF pages for per-frame target errors collected only while COP is
   * inside each target border during the successful continuous hold.
   * e = √((x₁ − xₜ)² + (y₁ − yₜ)²)
   */
  private static appendHoldWindowErrorPages(
    doc: jsPDF,
    summary: DirectionalWeightShiftSessionSummary,
    holdSeries: HoldWindowErrorSeries[],
    isSimulated: boolean,
    totalPages: number
  ): void {
    doc.addPage();
    let pageNum = doc.getNumberOfPages();
    this.renderDirectionalHeader(doc, pageNum, isSimulated);
    let y = 30;

    this.renderSectionHeader(doc, "12. PER-FRAME TARGET ERROR DURING HOLD (BORDER HIT → HOLD COMPLETE)", y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const syncEpochLabel = summary.multimodalSyncEpochMs
      ? new Date(summary.multimodalSyncEpochMs).toLocaleTimeString()
      : "--";
    doc.text(
      "Recording starts on the first border hit and continues through leave/re-enter until the continuous hold completes. " +
        "Per-frame error: e = sqrt((x1 - xt)^2 + (y1 - yt)^2). Approach travel before first border hit is excluded.\n" +
        "hold_t = ms since that target's first stored coordinate (graph X; same gate as COP store). " +
        `Session sync T0 = ${syncEpochLabel} (3s center hold end / Target 1). ` +
        "board_t / cam_t = ms since session T0; skew_ms = |board - camera|.",
      16,
      y,
      { maxWidth: 178, lineHeightFactor: 1.3 }
    );
    y += 14;

    // Summary table
    const sumHeaders = ["Target", "Frames", "Mean e (mm)", "RMS e (mm)", "Min e", "Max e"];
    const sumColW = [48, 20, 28, 28, 27, 27];
    const startX = 16;

    doc.setFillColor(240, 253, 250);
    doc.rect(startX, y, 178, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(15, 118, 110);
    let x = startX + 1;
    sumHeaders.forEach((h, i) => {
      doc.text(h, x, y + 4.5);
      x += sumColW[i];
    });
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    for (const s of holdSeries) {
      if (y > 270) {
        this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
        doc.addPage();
        pageNum = doc.getNumberOfPages();
        this.renderDirectionalHeader(doc, pageNum, isSimulated);
        y = 30;
      }
      const row = [
        `T${s.stepNumber} ${s.shortLabel}`,
        String(s.sampleCount),
        s.meanErrorMm !== null ? s.meanErrorMm.toFixed(2) : "--",
        s.rmsErrorMm !== null ? s.rmsErrorMm.toFixed(2) : "--",
        s.minErrorMm !== null ? s.minErrorMm.toFixed(2) : "--",
        s.maxErrorMm !== null ? s.maxErrorMm.toFixed(2) : "--",
      ];
      x = startX + 1;
      doc.setDrawColor(226, 232, 240);
      doc.line(startX, y + 6.2, startX + 178, y + 6.2);
      row.forEach((cell, i) => {
        doc.text(String(cell).slice(0, i === 0 ? 22 : 10), x, y + 4.5);
        x += sumColW[i];
      });
      y += 6.5;
    }

    this.renderDirectionalFooter(doc, pageNum, totalPages, summary);

    // Frame detail pages
    for (const series of holdSeries) {
      doc.addPage();
      pageNum = doc.getNumberOfPages();
      this.renderDirectionalHeader(doc, pageNum, isSimulated);
      y = 30;

      this.renderSectionHeader(
        doc,
        `12.${series.stepNumber} FRAME ERRORS — T${series.stepNumber} ${series.shortLabel}`,
        y
      );
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Target (x1,y1)=(${series.samples[0]?.targetX.toFixed(3) ?? "--"}, ${series.samples[0]?.targetY.toFixed(3) ?? "--"}) · ` +
          `${series.sampleCount} frames · hold ${series.requiredHoldDurationSeconds}s`,
        16,
        y
      );
      y += 7;

      const frameHeaders = ["#", "xt", "yt", "e_mm", "hold_t", "board_t", "cam_t", "skew"];
      const frameColW = [12, 22, 22, 22, 24, 26, 26, 24];

      const drawFrameHeader = () => {
        doc.setFillColor(240, 253, 250);
        doc.rect(startX, y, 178, 6.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(15, 118, 110);
        let hx = startX + 1;
        frameHeaders.forEach((h, i) => {
          doc.text(h, hx, y + 4.2);
          hx += frameColW[i];
        });
        y += 6.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(15, 23, 42);
      };

      drawFrameHeader();

      for (const f of series.samples) {
        if (y > 275) {
          this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
          doc.addPage();
          pageNum = doc.getNumberOfPages();
          this.renderDirectionalHeader(doc, pageNum, isSimulated);
          y = 30;
          drawFrameHeader();
        }
        const row = [
          String(f.frameIndex),
          f.copX.toFixed(3),
          f.copY.toFixed(3),
          f.errorMm.toFixed(2),
          f.holdRelMs !== null && f.holdRelMs !== undefined ? String(f.holdRelMs) : "--",
          f.boardRelMs !== null && f.boardRelMs !== undefined ? String(f.boardRelMs) : "--",
          f.visionRelMs !== null && f.visionRelMs !== undefined ? String(f.visionRelMs) : "--",
          f.timeSkewMs !== null ? String(f.timeSkewMs) : "--",
        ];
        let fx = startX + 1;
        doc.setDrawColor(241, 245, 249);
        doc.line(startX, y + 5.5, startX + 178, y + 5.5);
        row.forEach((cell, i) => {
          doc.text(cell, fx, y + 4);
          fx += frameColW[i];
        });
        y += 5.5;
      }

      this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
    }
  }

  /**
   * Append PDF pages for:
   *  1) Joint angles at each board-synced target
   *  2) Angle change between consecutive board targets
   */
  private static appendPose2DAngleReportPages(
    doc: jsPDF,
    summary: DirectionalWeightShiftSessionSummary,
    angleReport: Pose2DAngleSessionReport,
    isSimulated: boolean,
    totalPages: number
  ): void {
    // —— Absolute angles table ——
    doc.addPage();
    let pageNum = 4;
    this.renderDirectionalHeader(doc, pageNum, isSimulated);
    let y = 30;

    this.renderSectionHeader(doc, "10. BOARD-SYNCED 2D JOINT ANGLES AT EACH TARGET", y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `Snapshots taken at the same instant each board-target hold completes (COP inside target + patient load). ` +
        `Angles are 2D image-plane only. Synced targets: ${angleReport.syncedTargetCount}/${angleReport.snapshots.length}.`,
      16,
      y,
      { maxWidth: 178, lineHeightFactor: 1.3 }
    );
    y += 10;

    // Compact table: Target | key joints (abbreviated)
    const absHeaders = [
      "Target",
      "LSh",
      "RSh",
      "LEl",
      "REl",
      "LWr",
      "RWr",
      "LHp",
      "RHp",
      "LKn",
      "RKn",
      "LAn",
      "RAn",
      "Trnk",
    ];
    const colW = [28, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 12];
    const startX = 16;

    doc.setFillColor(240, 253, 250);
    doc.rect(startX, y, 178, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(15, 118, 110);
    let x = startX + 1;
    absHeaders.forEach((h, i) => {
      doc.text(h, x, y + 4.5);
      x += colW[i];
    });
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);

    for (const s of angleReport.snapshots) {
      if (y > 270) {
        this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
        doc.addPage();
        pageNum += 1;
        this.renderDirectionalHeader(doc, pageNum, isSimulated);
        y = 30;
      }
      const label = `T${s.stepNumber || s.targetIndex + 1} ${s.shortLabel}`;
      const vals = POSE_2D_ANGLE_METRIC_KEYS.map((k) => {
        const v = s.angles[k] as number | null;
        return formatAngleDeg(v).replace("°", "");
      });
      const row = [label, ...vals];
      x = startX + 1;
      doc.setDrawColor(226, 232, 240);
      doc.line(startX, y + 6.2, startX + 178, y + 6.2);
      row.forEach((cell, i) => {
        doc.text(String(cell).slice(0, i === 0 ? 14 : 5), x, y + 4.5);
        x += colW[i];
      });
      y += 6.5;
    }

    this.renderDirectionalFooter(doc, pageNum, totalPages, summary);

    // —— Consecutive changes ——
    if (angleReport.transitions.length === 0) return;

    doc.addPage();
    pageNum += 1;
    this.renderDirectionalHeader(doc, pageNum, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "11. 2D ANGLE CHANGE BETWEEN CONSECUTIVE BOARD TARGETS", y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      "Signed change from previous board target to next. Positive = increase; negative = decrease.",
      16,
      y,
      { maxWidth: 178, lineHeightFactor: 1.3 }
    );
    y += 10;

    const deltaHeaders = [
      "Transition",
      "ΔLSh",
      "ΔRSh",
      "ΔLEl",
      "ΔREl",
      "ΔLWr",
      "ΔRWr",
      "ΔLHp",
      "ΔRHp",
      "ΔLKn",
      "ΔRKn",
      "ΔLAn",
      "ΔRAn",
      "ΔTrk",
    ];
    const dColW = [32, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11];

    doc.setFillColor(255, 251, 235);
    doc.rect(startX, y, 178, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(146, 64, 14);
    x = startX + 1;
    deltaHeaders.forEach((h, i) => {
      doc.text(h, x, y + 4.5);
      x += dColW[i];
    });
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);

    for (const tr of angleReport.transitions) {
      if (y > 270) {
        this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
        doc.addPage();
        pageNum += 1;
        this.renderDirectionalHeader(doc, pageNum, isSimulated);
        y = 30;
      }
      const label = `T${tr.fromStep}→T${tr.toStep}`;
      const vals = POSE_2D_ANGLE_METRIC_KEYS.map((k) =>
        formatDeltaDeg(tr.deltas[k]).replace("°", "")
      );
      const row = [label, ...vals];
      x = startX + 1;
      doc.setDrawColor(226, 232, 240);
      doc.line(startX, y + 6.2, startX + 178, y + 6.2);
      row.forEach((cell, i) => {
        doc.text(String(cell).slice(0, i === 0 ? 16 : 5), x, y + 4.5);
        x += dColW[i];
      });
      // Sub-label with short names
      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${tr.fromLabel} → ${tr.toLabel}  (Δt ${(tr.dtMs / 1000).toFixed(1)}s)`, startX + 1, y + 9);
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      y += 11;
    }

    // Metric key legend
    if (y > 250) {
      this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
      doc.addPage();
      pageNum += 1;
      this.renderDirectionalHeader(doc, pageNum, isSimulated);
      y = 30;
    }
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(15, 118, 110);
    doc.text("Metric key:", 16, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      POSE_2D_ANGLE_METRIC_KEYS.map((k) => POSE_2D_ANGLE_METRIC_LABELS[k]).join(" · "),
      16,
      y,
      { maxWidth: 178 }
    );

    this.renderDirectionalFooter(doc, pageNum, totalPages, summary);
  }

  // =========================================================================
  // HELPER: Directional Header
  // =========================================================================
  private static renderDirectionalHeader(doc: jsPDF, _pageNum: number, isSimulated: boolean) {
    doc.setFillColor(13, 148, 136); // Medical Teal Accent Bar
    doc.rect(16, 12, 178, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("PatientBalanceAI", 16, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Neuro-Rehabilitation & Balance Analysis System", 16, 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(13, 148, 136);
    doc.text("DIRECTIONAL WEIGHT SHIFT REPORT", 194, 18, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isSimulated ? "DEVELOPMENT SIMULATION" : "WII BALANCE BOARD ASSESSMENT", 194, 22, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, 25, 194, 25);
  }

  // =========================================================================
  // HELPER: Directional Footer
  // =========================================================================
  private static renderDirectionalFooter(
    doc: jsPDF,
    pageNum: number,
    totalPages: number,
    summary: DirectionalWeightShiftSessionSummary
  ) {
    const y = 282;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, y, 194, y);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Notice: This report presents objective exercise-performance measurements from the Nintendo Wii Balance Board. " +
      "It is intended to support rehabilitation tracking and does not constitute a medical diagnosis or clinically validated balance score.",
      105,
      y + 4,
      { align: "center", maxWidth: 174 }
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`PatientBalanceAI | Directional Assessment | Session: ${summary.sessionId}`, 16, y + 10);
    doc.text(`Page ${pageNum} of ${totalPages}`, 194, y + 10, { align: "right" });
  }

  // =========================================================================
  // HELPER: 5-Direction Summary Table
  // =========================================================================
  private static renderDirectionalSummaryTable(
    doc: jsPDF,
    targets: DirectionalTargetAssessment[],
    summary: DirectionalWeightShiftSessionSummary,
    startY: number
  ): number {
    const startX = 16;
    const tableW = 178;
    const headerH = 7;
    const rowH = 6.2;
    let y = startY;

    // Header Background
    doc.setFillColor(13, 148, 136);
    doc.rect(startX, y, tableW, headerH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);

    // Columns
    doc.text("TARGET DIRECTION", startX + 3, y + 4.8);
    doc.text("STATUS", startX + 37, y + 4.8);
    doc.text("REQ HOLD", startX + 58, y + 4.8);
    doc.text("ACTUAL HOLD", startX + 75, y + 4.8);
    doc.text("ACCURACY", startX + 96, y + 4.8);
    doc.text("TIME IN / OUT", startX + 114, y + 4.8);
    doc.text("ATTEMPTS", startX + 138, y + 4.8);
    doc.text("MEAN DIST", startX + 156, y + 4.8);

    y += headerH;

    targets.forEach((t, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.rect(startX, y, tableW, rowH, "F");

      // Draw bottom cell border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(startX, y + rowH, startX + tableW, y + rowH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.0);
      doc.setTextColor(15, 23, 42);
      doc.text(`${t.stepNumber}. ${t.name}`, startX + 3, y + 4.4);

      // Status
      if (t.isCompleted) {
        doc.setTextColor(5, 150, 105);
        doc.text("COMPLETED", startX + 37, y + 4.4);
      } else {
        doc.setTextColor(217, 119, 6);
        doc.text("INCOMPLETE", startX + 37, y + 4.4);
      }

      // Required Hold
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(`${t.requiredHoldDurationSeconds}s`, startX + 58, y + 4.4);

      // Actual Successful Hold
      doc.setFont("helvetica", "bold");
      doc.setTextColor(t.isCompleted ? 5 : 217, t.isCompleted ? 150 : 119, t.isCompleted ? 105 : 6);
      doc.text(`${t.actualSuccessfulHoldDurationSeconds.toFixed(1)}s`, startX + 75, y + 4.4);

      // Accuracy
      doc.setFont("helvetica", "bold");
      doc.setTextColor(t.accuracyPercentage >= 70 ? 13 : 217, t.accuracyPercentage >= 70 ? 148 : 119, t.accuracyPercentage >= 70 ? 136 : 6);
      doc.text(`${t.accuracyPercentage.toFixed(1)}%`, startX + 96, y + 4.4);

      // In / Out
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(`${t.timeInsideSeconds.toFixed(1)}s / ${t.timeOutsideSeconds.toFixed(1)}s`, startX + 114, y + 4.4);

      // Attempts
      doc.text(`${t.attemptCount ?? t.enterCount}`, startX + 138, y + 4.4);

      // Mean Dist (mm)
      const meanDistStr = t.meanDistanceMm !== null ? `${t.meanDistanceMm.toFixed(1)} mm` : "N/A";
      doc.text(meanDistStr, startX + 156, y + 4.4);

      y += rowH;
    });

    // Session Totals Row
    doc.setFillColor(241, 245, 249);
    doc.rect(startX, y, tableW, rowH + 1, "F");
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(startX, y, tableW, rowH + 1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL / SUMMARY", startX + 3, y + 4.8);
    doc.text(`${summary.completedTargetsCount}/${summary.totalTargetsCount} Completed`, startX + 37, y + 4.8);
    doc.text(`${summary.allTargetsCompleted ? "All Met" : "Partial"}`, startX + 58, y + 4.8);
    doc.text(`Mean: ${summary.meanHoldTimeSeconds.toFixed(1)}s`, startX + 75, y + 4.8);
    doc.setTextColor(13, 148, 136);
    doc.text(`${summary.overallAccuracyPercentage.toFixed(1)}%`, startX + 96, y + 4.8);
    doc.setTextColor(15, 23, 42);
    doc.text(`${summary.totalTimeInsideSeconds.toFixed(1)}s / ${summary.totalTimeOutsideSeconds.toFixed(1)}s`, startX + 114, y + 4.8);
    const totalAttempts = targets.reduce((sum, t) => sum + (t.attemptCount ?? t.enterCount), 0);
    doc.text(`${totalAttempts}`, startX + 138, y + 4.8);
    const meanDistSummary = summary.meanCopDistanceMm !== null ? `${summary.meanCopDistanceMm.toFixed(1)} mm` : "-";
    doc.text(meanDistSummary, startX + 156, y + 4.8);

    y += rowH + 2;
    return y;
  }

  // =========================================================================
  // HELPER: 2D Force Plate Trajectory Plot
  // =========================================================================
  private static render2dDirectionalTrajectory(
    doc: jsPDF,
    targets: DirectionalTargetAssessment[],
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number
  ) {
    // Background chassis
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.6);
    doc.roundedRect(boxX, boxY, boxW, boxH, 8, 8, "FD");

    // Board Surface Perimeter
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX + 5, boxY + 5, boxW - 10, boxH - 10, 5, 5);

    const centerX = boxX + boxW / 2;
    const centerY = boxY + boxH / 2;
    const scaleX = (boxW - 24) / 2; // normalized 1.0 maps to edge
    const scaleY = (boxH - 20) / 2;

    // Crosshairs (Anteroposterior & Lateral axes)
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.4);
    doc.line(centerX, boxY + 5, centerX, boxY + boxH - 5);
    doc.line(boxX + 5, centerY, boxX + boxW - 5, centerY);

    // Axis Labels
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("FRONT / ANTERIOR (+Y)", centerX, boxY + 4, { align: "center" });
    doc.text("BACK / POSTERIOR (-Y)", centerX, boxY + boxH + 3.5, { align: "center" });
    doc.text("← LEFT (-X)", boxX - 1, centerY - 1, { align: "right" });
    doc.text("RIGHT (+X) →", boxX + boxW + 1, centerY - 1, { align: "left" });

    // Draw all 5 target tolerance zones with hold durations
    targets.forEach((t) => {
      const tx = centerX + t.targetX * scaleX;
      const ty = centerY - t.targetY * scaleY; // Invert Y: positive is UP
      const radiusX = t.tolerance * scaleX;

      // Fill circle lightly
      if (t.isCompleted) {
        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(5, 150, 105);
      } else {
        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(217, 119, 6);
      }
      doc.setLineWidth(0.6);
      doc.circle(tx, ty, radiusX, "FD");

      // Draw Center Target Crosshair
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.2);
      doc.line(tx - 1.5, ty, tx + 1.5, ty);
      doc.line(tx, ty - 1.5, tx, ty + 1.5);

      // Target Label: Step & Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(15, 23, 42);
      doc.text(`${t.stepNumber}. ${t.shortLabel}`, tx, ty - radiusX - 1.5, { align: "center" });

      // Target Hold Badge (e.g. "2.0s / 2.0s ✓" or "0.8s / 3.0s ✗")
      const holdAchieved = t.actualSuccessfulHoldDurationSeconds ?? t.longestContinuousHoldSeconds;
      const badgeText = `${holdAchieved.toFixed(1)}s / ${t.requiredHoldDurationSeconds}s ${t.isCompleted ? "[OK]" : "[FAIL]"}`;
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(t.isCompleted ? 5 : 217, t.isCompleted ? 150 : 119, t.isCompleted ? 105 : 6);
      doc.text(badgeText, tx, ty + radiusX + 3.2, { align: "center" });
    });

    // Draw COP Trajectory Path across recorded samples
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.35);

    let firstPoint: { x: number; y: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;

    targets.forEach((t) => {
      const samples = t.samples;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const px = centerX + s.copX * scaleX;
        const py = centerY - s.copY * scaleY;

        if (!firstPoint) firstPoint = { x: px, y: py };
        lastPoint = { x: px, y: py };

        if (i > 0) {
          const prev = samples[i - 1];
          const prevX = centerX + prev.copX * scaleX;
          const prevY = centerY - prev.copY * scaleY;
          doc.line(prevX, prevY, px, py);
        }
      }
    });

    // Start marker (Green) & End marker (Red)
    if (firstPoint !== null) {
      const fp: { x: number; y: number } = firstPoint;
      doc.setFillColor(16, 185, 129);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(fp.x, fp.y, 1.8, "FD");
    }
    if (lastPoint !== null) {
      const lp: { x: number; y: number } = lastPoint;
      doc.setFillColor(239, 68, 68);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.circle(lp.x, lp.y, 1.8, "FD");
    }

    // Legend below plot
    const legY = boxY + boxH + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);

    // Green marker legend
    doc.setFillColor(16, 185, 129);
    doc.circle(boxX + 12, legY, 1.5, "F");
    doc.text("Start Position", boxX + 15, legY + 1);

    // Red marker legend
    doc.setFillColor(239, 68, 68);
    doc.circle(boxX + 46, legY, 1.5, "F");
    doc.text("End Position", boxX + 49, legY + 1);

    // Path legend
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.6);
    doc.line(boxX + 78, legY, boxX + 86, legY);
    doc.text("Recorded COP Trajectory", boxX + 88, legY + 1);

    // Target circles legend
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.4);
    doc.circle(boxX + 128, legY, 1.8, "D");
    doc.text("Target Zones (Actual vs Required Hold)", boxX + 132, legY + 1);
  }

  // =========================================================================
  // HELPER: Target-by-Target Bar Charts (Accuracy & Hold Duration)
  // =========================================================================
  private static renderDirectionalBarCharts(
    doc: jsPDF,
    targets: DirectionalTargetAssessment[],
    startX: number,
    startY: number,
    totalW: number,
    chartH: number
  ) {
    const halfW = (totalW - 10) / 2;

    // -----------------------------------------------------------------------
    // Chart A: Target Accuracy (%)
    // -----------------------------------------------------------------------
    const chartAX = startX;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(chartAX, startY, halfW, chartH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Chart A: Target Accuracy (%)", chartAX + 4, startY + 5);

    const barAreaY = startY + 8;
    const barAreaH = chartH - 16;
    const slotW = (halfW - 14) / 5;

    // Draw 50% and 100% gridlines
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(chartAX + 10, barAreaY, chartAX + halfW - 4, barAreaY); // 100%
    doc.line(chartAX + 10, barAreaY + barAreaH / 2, chartAX + halfW - 4, barAreaY + barAreaH / 2); // 50%
    doc.line(chartAX + 10, barAreaY + barAreaH, chartAX + halfW - 4, barAreaY + barAreaH); // 0%

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text("100%", chartAX + 2, barAreaY + 1);
    doc.text("50%", chartAX + 3, barAreaY + barAreaH / 2 + 1);
    doc.text("0%", chartAX + 4, barAreaY + barAreaH + 1);

    targets.forEach((t, i) => {
      const bx = chartAX + 12 + i * slotW;
      const pct = Math.min(100, Math.max(0, t.accuracyPercentage));
      const bHeight = (pct / 100) * barAreaH;
      const by = barAreaY + barAreaH - bHeight;

      doc.setFillColor(pct >= 70 ? 13 : 217, pct >= 70 ? 148 : 119, pct >= 70 ? 136 : 6);
      doc.rect(bx, by, slotW * 0.65, bHeight, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${Math.round(pct)}%`, bx + (slotW * 0.65) / 2, by - 1, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(t.shortLabel, bx + (slotW * 0.65) / 2, barAreaY + barAreaH + 4, { align: "center" });
    });

    // -----------------------------------------------------------------------
    // Chart B: Longest Continuous Hold (s)
    // -----------------------------------------------------------------------
    const chartBX = startX + halfW + 10;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(chartBX, startY, halfW, chartH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Chart B: Continuous Hold Duration (s)", chartBX + 4, startY + 5);

    // Max scale: 3.0s (with target line at 2.0s)
    const maxHoldScale = 3.0;
    const reqHoldY = barAreaY + barAreaH - (2.0 / maxHoldScale) * barAreaH;

    // 2.0s Target Requirement Dashed Reference Line
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.3);
    doc.line(chartBX + 10, reqHoldY, chartBX + halfW - 4, reqHoldY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(5, 150, 105);
    doc.text("2.0s (Req)", chartBX + 1, reqHoldY + 1);

    targets.forEach((t, i) => {
      const bx = chartBX + 14 + i * slotW;
      const holdSec = Math.min(maxHoldScale, Math.max(0, t.longestContinuousHoldSeconds));
      const bHeight = (holdSec / maxHoldScale) * barAreaH;
      const by = barAreaY + barAreaH - bHeight;

      doc.setFillColor(holdSec >= 2.0 ? 5 : 245, holdSec >= 2.0 ? 150 : 158, holdSec >= 2.0 ? 105 : 11);
      doc.rect(bx, by, slotW * 0.65, bHeight, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${holdSec.toFixed(1)}s`, bx + (slotW * 0.65) / 2, by - 1, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(t.shortLabel, bx + (slotW * 0.65) / 2, barAreaY + barAreaH + 4, { align: "center" });
    });
  }

  // =========================================================================
  // HELPER: COP Distance Timeline Dynamics
  // =========================================================================
  private static renderDistanceTimeline(
    doc: jsPDF,
    targets: DirectionalTargetAssessment[],
    totalDuration: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);

    const safeDuration = Math.max(1, totalDuration);
    const maxDistNorm = 0.60; // Max scale for distance
    const innerX = x + 14;
    const innerW = w - 18;
    const innerY = y + 6;
    const innerH = h - 14;

    // Gridlines & Tolerance Threshold
    const toleranceY = innerY + innerH - (0.16 / maxDistNorm) * innerH;

    // Shaded region below tolerance line (Inside Target Zone)
    doc.setFillColor(240, 253, 250);
    doc.rect(innerX, toleranceY, innerW, innerY + innerH - toleranceY, "F");

    // Dashed Tolerance Threshold line
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.35);
    doc.line(innerX, toleranceY, innerX + innerW, toleranceY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(13, 148, 136);
    doc.text("Tolerance Boundary (r = 0.16, ~35.7 mm)", innerX + 2, toleranceY - 1);

    // Axes
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(innerX, innerY, innerX, innerY + innerH);
    doc.line(innerX, innerY + innerH, innerX + innerW, innerY + innerH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text("0.60", x + 3, innerY + 2);
    doc.text("0.30", x + 3, innerY + innerH / 2 + 1);
    doc.text("0.00", x + 3, innerY + innerH + 1);
    doc.text("0s", innerX, innerY + innerH + 4);
    doc.text(`${(safeDuration / 2).toFixed(0)}s`, innerX + innerW / 2, innerY + innerH + 4, { align: "center" });
    doc.text(`${safeDuration.toFixed(0)}s`, innerX + innerW, innerY + innerH + 4, { align: "right" });

    // Plot recorded samples
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.35);

    let prevPx: number | null = null;
    let prevPy: number | null = null;
    let globalSampleIndex = 0;

    targets.forEach((t) => {
      t.samples.forEach((s) => {
        const timeRatio = Math.min(1.0, Math.max(0, (s.timestamp - targets[0]?.samples[0]?.timestamp || globalSampleIndex * 50) / (safeDuration * 1000)));
        const distRatio = Math.min(1.0, Math.max(0, s.distanceNorm / maxDistNorm));

        const px = innerX + timeRatio * innerW;
        const py = innerY + innerH - distRatio * innerH;

        if (prevPx !== null && prevPy !== null) {
          doc.line(prevPx, prevPy, px, py);
        }

        prevPx = px;
        prevPy = py;
        globalSampleIndex++;
      });
    });
  }

  // =========================================================================
  // HELPER: Generate Objective Directional Observations
  // =========================================================================
  private static generateDirectionalObservations(
    summary: DirectionalWeightShiftSessionSummary
  ): string[] {
    const list: string[] = [];
    const prefix = !summary.isRealHardware ? "[Simulation Observation] " : "";

    // 1. Completion Rate
    list.push(
      `${prefix}Target Completion Rate: Patient achieved ${summary.completedTargetsCount} of ${summary.totalTargetsCount} targets ` +
      `(${Math.round((summary.completedTargetsCount / summary.totalTargetsCount) * 100)}%) with overall target accuracy of ${summary.overallAccuracyPercentage.toFixed(1)}%.`
    );

    // 2. Lateral Weight Shifting Symmetry (Target 1 Left vs Target 2 Right)
    const leftTarget = summary.targets.find((t) => t.name === "SHIFT LEFT");
    const rightTarget = summary.targets.find((t) => t.name === "SHIFT RIGHT");
    if (leftTarget && rightTarget) {
      const leftHold = leftTarget.longestContinuousHoldSeconds;
      const rightHold = rightTarget.longestContinuousHoldSeconds;
      const leftDist = leftTarget.meanDistanceMm !== null ? `${leftTarget.meanDistanceMm.toFixed(1)} mm` : "N/A";
      const rightDist = rightTarget.meanDistanceMm !== null ? `${rightTarget.meanDistanceMm.toFixed(1)} mm` : "N/A";

      list.push(
        `${prefix}Lateral Weight Shift: Left target hold was ${leftHold.toFixed(1)}s (accuracy: ${leftTarget.accuracyPercentage.toFixed(1)}%, mean dist: ${leftDist}) ` +
        `versus Right target hold of ${rightHold.toFixed(1)}s (accuracy: ${rightTarget.accuracyPercentage.toFixed(1)}%, mean dist: ${rightDist}).`
      );
    }

    // 3. Anteroposterior Control (Target 3 Forward vs Target 4 Backward)
    const fwdTarget = summary.targets.find((t) => t.name === "SHIFT FORWARD");
    const backTarget = summary.targets.find((t) => t.name === "SHIFT BACKWARD");
    if (fwdTarget && backTarget) {
      const fwdHold = fwdTarget.longestContinuousHoldSeconds;
      const backHold = backTarget.longestContinuousHoldSeconds;
      list.push(
        `${prefix}Anteroposterior Control: Forward displacement maintained continuous hold for ${fwdHold.toFixed(1)}s ` +
        `while Posterior/Backward displacement maintained hold for ${backHold.toFixed(1)}s.`
      );
    }

    // 4. Center Equilibrium & COP Sway Variability
    const centerTarget = summary.targets.find((t) => t.name === "RETURN TO CENTER");
    if (centerTarget) {
      const centerVar = centerTarget.copSdMm !== null ? `${centerTarget.copSdMm.toFixed(1)} mm` : "N/A";
      list.push(
        `${prefix}Equilibrium Recovery: Return to Center achieved continuous hold of ${centerTarget.longestContinuousHoldSeconds.toFixed(1)}s ` +
        `with postural sway variability of ${centerVar}.`
      );
    }

    // 5. Data Stream Continuity
    if (summary.totalMissingDataDurationSeconds === 0) {
      list.push(
        `${prefix}Sensor Data Continuity: 100% continuous data acquisition throughout exercise with zero transmission gaps.`
      );
    } else {
      list.push(
        `${prefix}Sensor Data Quality: Observed ${summary.totalMissingDataDurationSeconds.toFixed(1)}s of telemetry latency or missing data during exercise.`
      );
    }

    return list;
  }

  // =========================================================================
  // PHASE E: MULTIMODAL LEG RAISE & BALANCE REHABILITATION PDF REPORT
  // =========================================================================

  public static generateMultimodalLegRaiseReport(summary: LegRaiseSessionSummary): jsPDF {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4", // 210 x 297 mm
    });

    const isSimulated = !summary.isRealHardware;
    const totalPages = 3;

    // =========================================================================
    // PAGE 1: Header, Protocol, Comparison Table, Executive Summary
    // =========================================================================
    this.renderMultimodalHeader(doc, 1, isSimulated);
    let y = 32;

    // Sensor Badge / Simulation Banner
    if (isSimulated) {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.6);
      doc.roundedRect(16, y, 178, 12, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(180, 83, 9);
      doc.text("DEVELOPMENT SIMULATION — NOT REAL PATIENT MEASUREMENTS", 22, y + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text("Generated with simulated sensory feeds. Camera and Wii Balance Board were simulated; non-diagnostic.", 22, y + 9.5);
      y += 16;
    } else {
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.4);
      doc.roundedRect(16, y, 178, 8.5, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(13, 148, 136);
      doc.text("DATA SOURCE: DUAL HARDWARE — NINTENDO WII BALANCE BOARD + INTEL REALSENSE / MEDIAPIPE POSE", 20, y + 5.5);
      y += 12.5;
    }

    // Patient & Session Identification Grid
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(16, y, 178, 28, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PATIENT IDENTIFICATION", 20, y + 5.5);
    doc.text("MULTIMODAL REHABILITATION METADATA", 108, y + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    // Left Col: Patient Info
    doc.text(`Patient Name: ${summary.patientName || "Jane Doe"}`, 20, y + 11);
    doc.text(`Patient ID: ${summary.patientId}`, 20, y + 16);
    doc.text(`Session Date: ${summary.sessionDate}`, 20, y + 21);
    doc.text(`Start Time: ${new Date(summary.startTime).toLocaleTimeString()}`, 20, y + 26);

    // Right Col: Session Metadata
    doc.text(`Protocol: Multimodal Leg Raise & Balance`, 108, y + 11);
    doc.text(`Repetitions Completed: ${summary.completedRepetitions} of 2 Reps (${summary.completedRepetitions === 2 ? "100%" : summary.completedRepetitions === 1 ? "50%" : "0%"})`, 108, y + 16);
    doc.text(`Total Dual Hold Time: ${summary.totalDualConfirmedHoldSeconds.toFixed(2)}s | Elapsed: ${summary.totalElapsedSeconds.toFixed(1)}s`, 108, y + 21);
    doc.text(`Hardware: ${summary.hardwareModel} | Camera: ${summary.cameraSource}`, 108, y + 26);

    y += 33;

    // Section 1: Protocol Description
    this.renderSectionHeader(doc, "1. MULTIMODAL PROTOCOL & DUAL-DEVICE VERIFICATION SPECIFICATION", y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      "The Multimodal Leg Raise & Balance Rehabilitation Exercise enforces strict simultaneous multi-sensor validation:\n" +
      "1. Camera / MediaPipe 2D Pose tracking confirms anatomical foot clearance from the standing baseline without relying on raw 2D pixel coordinates.\n" +
      "2. Nintendo Wii Balance Board 4-sensor load telemetry confirms corresponding contralateral support-side load transfer and lateral COP displacement.\n" +
      "Strict Rule: Neither camera-only nor balance-board-only can complete a repetition. Both devices must confirm the movement concurrently within a <250ms synchronization window.\n" +
      "Sequence: Patient must complete the full LEFT leg sequence (lift -> hold -> foot return -> 1.5s stable bipedal standing) before commencing the RIGHT leg sequence.",
      16,
      y + 1,
      { maxWidth: 178, lineHeightFactor: 1.35 }
    );
    y += 22;

    // Section 2: Executive Assessment Summary Cards
    this.renderSectionHeader(doc, "2. EXECUTIVE ASSESSMENT SUMMARY", y);
    y += 6;

    const cardW = 56;
    const cardH = 20;

    // Card A: Left Leg Hold
    doc.setFillColor(summary.leftLeg.repetitionCompleted ? 240 : 254, summary.leftLeg.repetitionCompleted ? 253 : 243, summary.leftLeg.repetitionCompleted ? 250 : 199);
    doc.setDrawColor(summary.leftLeg.repetitionCompleted ? 13 : 245, summary.leftLeg.repetitionCompleted ? 148 : 158, summary.leftLeg.repetitionCompleted ? 136 : 11);
    doc.roundedRect(16, y, cardW, cardH, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("LEFT LEG HOLD", 20, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(summary.leftLeg.repetitionCompleted ? 13 : 180, summary.leftLeg.repetitionCompleted ? 148 : 83, summary.leftLeg.repetitionCompleted ? 136 : 9);
    doc.text(`${summary.leftLeg.actualHoldSeconds.toFixed(1)}s / ${summary.leftLeg.requiredHoldSeconds.toFixed(1)}s`, 20, y + 12);
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(summary.leftLeg.repetitionCompleted ? "Dual-Verified Complete ✓" : "Repetition Incomplete", 20, y + 17);

    // Card B: Right Leg Hold
    const cardBX = 16 + cardW + 5;
    doc.setFillColor(summary.rightLeg.repetitionCompleted ? 240 : 254, summary.rightLeg.repetitionCompleted ? 253 : 243, summary.rightLeg.repetitionCompleted ? 250 : 199);
    doc.setDrawColor(summary.rightLeg.repetitionCompleted ? 13 : 245, summary.rightLeg.repetitionCompleted ? 148 : 158, summary.rightLeg.repetitionCompleted ? 136 : 11);
    doc.roundedRect(cardBX, y, cardW, cardH, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("RIGHT LEG HOLD", cardBX + 4, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(summary.rightLeg.repetitionCompleted ? 13 : 180, summary.rightLeg.repetitionCompleted ? 148 : 83, summary.rightLeg.repetitionCompleted ? 136 : 9);
    doc.text(`${summary.rightLeg.actualHoldSeconds.toFixed(1)}s / ${summary.rightLeg.requiredHoldSeconds.toFixed(1)}s`, cardBX + 4, y + 12);
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(summary.rightLeg.repetitionCompleted ? "Dual-Verified Complete ✓" : "Repetition Incomplete", cardBX + 4, y + 17);

    // Card C: Sensor Provenance & Continuity
    const cardCX = cardBX + cardW + 5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardCX, y, cardW, cardH, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("SENSOR CADENCE", cardCX + 4, y + 5);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${summary.totalValidMeasurementSeconds.toFixed(1)}s Valid`, cardCX + 4, y + 12);
    doc.setFontSize(6.5);
    doc.setTextColor(summary.totalMissingDataSeconds === 0 ? 5 : 217, summary.totalMissingDataSeconds === 0 ? 150 : 119, summary.totalMissingDataSeconds === 0 ? 105 : 6);
    doc.text(summary.totalMissingDataSeconds === 0 ? "100% Continuous (0s gap)" : `${summary.totalMissingDataSeconds.toFixed(1)}s Dropout Filtered`, cardCX + 4, y + 17);

    y += cardH + 8;

    // Section 3: Comparison Table (Section 14.E)
    this.renderSectionHeader(doc, "3. COMPARISON TABLE: LEFT-LEG VS RIGHT-LEG EXERCISE METRICS", y);
    y += 6;

    y = this.renderMultimodalComparisonTable(doc, summary, y);

    this.renderMultimodalFooter(doc, 1, totalPages, summary);

    // =========================================================================
    // PAGE 2: Vector Charts - Wii Balance Board & 2D COP Trajectory
    // =========================================================================
    doc.addPage();
    this.renderMultimodalHeader(doc, 2, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "4. 2D CENTER OF PRESSURE (COP) TRAJECTORY & FORCE PLATE ANALYSIS", y);
    y += 6;

    // Render 2D Vector Trajectory on Wii Balance Board
    const plotW = 156;
    const plotH = 92;
    const plotX = (210 - plotW) / 2;
    this.render2dMultimodalTrajectory(doc, summary, plotX, y, plotW, plotH);
    y += plotH + 12;

    // Section 5: Bilateral Force-Plate & Load Distribution Analysis Table
    this.renderSectionHeader(doc, "5. BILATERAL FORCE-PLATE MEASUREMENTS & WEIGHT DISTRIBUTION", y);
    y += 6;

    const forceRows = [
      ["Baseline Standing Load Split", `Left: ${summary.baseline.leftPercent.toFixed(1)}% | Right: ${summary.baseline.rightPercent.toFixed(1)}%`, "Total Calibrated Load", `${summary.baseline.totalWeight.toFixed(1)} kg`],
      ["Left Lift: Support Load (Right)", `Peak: ${summary.leftLeg.peakSupportLoadPctDuringLift.toFixed(1)}% | Mean: ${summary.leftLeg.meanSupportLoadPctDuringLift.toFixed(1)}%`, "Rightward Transfer Δ", `+${summary.leftLeg.supportTransferDeltaPct.toFixed(1)}%`],
      ["Right Lift: Support Load (Left)", `Peak: ${summary.rightLeg.peakSupportLoadPctDuringLift.toFixed(1)}% | Mean: ${summary.rightLeg.meanSupportLoadPctDuringLift.toFixed(1)}%`, "Leftward Transfer Δ", `+${summary.rightLeg.supportTransferDeltaPct.toFixed(1)}%`],
      ["Left Lift COP Displacement", `Mean: ${summary.leftLeg.meanCopDisplacementMm.toFixed(1)} mm | Path: ${summary.leftLeg.copPathLengthMm.toFixed(1)} mm`, "Left Radial Sway RMS", `${summary.leftLeg.copVariabilityRmsMm.toFixed(1)} mm`],
      ["Right Lift COP Displacement", `Mean: ${summary.rightLeg.meanCopDisplacementMm.toFixed(1)} mm | Path: ${summary.rightLeg.copPathLengthMm.toFixed(1)} mm`, "Right Radial Sway RMS", `${summary.rightLeg.copVariabilityRmsMm.toFixed(1)} mm`],
    ];
    y = this.renderTwoColumnTable(doc, forceRows, y);

    this.renderMultimodalFooter(doc, 2, totalPages, summary);

    // =========================================================================
    // PAGE 3: Temporal Kinematics, Data Quality, Observations & Disclaimer
    // =========================================================================
    doc.addPage();
    this.renderMultimodalHeader(doc, 3, isSimulated);
    y = 30;

    this.renderSectionHeader(doc, "6. LEG MOVEMENT & TEMPORAL KINEMATICS ANALYSIS", y);
    y += 6;

    const kinRows = [
      ["Left Lift Initiation Duration", `${summary.leftLeg.liftInitiationDurationSeconds.toFixed(2)}s`, "Right Lift Initiation Duration", `${summary.rightLeg.liftInitiationDurationSeconds.toFixed(2)}s`],
      ["Left Time to Establish Lift", `${summary.leftLeg.timeToEstablishLiftSeconds.toFixed(2)}s`, "Right Time to Establish Lift", `${summary.rightLeg.timeToEstablishLiftSeconds.toFixed(2)}s`],
      ["Left Foot Return Duration", `${summary.leftLeg.returnDurationSeconds.toFixed(2)}s`, "Right Foot Return Duration", `${summary.rightLeg.returnDurationSeconds.toFixed(2)}s`],
      ["Left Recovery to Stable Stance", `${summary.leftLeg.recoveryDurationSeconds.toFixed(2)}s`, "Right Recovery to Stable Stance", `${summary.rightLeg.recoveryDurationSeconds.toFixed(2)}s`],
      ["Left Camera Tracking Confidence", `${Math.round(summary.leftLeg.meanCameraConfidence * 100)}% Visibility`, "Right Camera Tracking Confidence", `${Math.round(summary.rightLeg.meanCameraConfidence * 100)}% Visibility`],
      ["Left Interrupted Attempts", `${summary.leftLeg.interruptedAttempts} logged`, "Right Interrupted Attempts", `${summary.rightLeg.interruptedAttempts} logged`],
    ];
    y = this.renderTwoColumnTable(doc, kinRows, y);
    y += 8;

    // Section 7: Telemetry Cadence, Sensor Data Quality & Limitations
    this.renderSectionHeader(doc, "7. TELEMETRY CADENCE, SENSOR QUALITY & CLINICAL LIMITATIONS", y);
    y += 6;

    const qualityRows = [
      ["Hardware Status", summary.isRealHardware ? "Live Nintendo RVL-WBC-01 Hardware" : "Development Simulation Telemetry", "Sensor Temporal Synchronization", summary.syncQuality],
      ["Camera Stream Quality", summary.overallTrackingQuality, "Filtered Camera Outliers", `${summary.totalInvalidCameraObservations} frames filtered`],
      ["Wii Board Stream Quality", summary.overallBoardQuality, "Filtered Board Outliers", `${summary.totalInvalidBoardObservations} packets filtered`],
      ["Supported-Standing Mode", summary.supportedStandingMode ? "ACTIVE (External Hand Support Used)" : "Standard Bipedal Stance (Unassisted)", "Safety Pauses / Disconnections", `${summary.safetyPausesCount} pauses / ${summary.disconnectionsCount} disconnects`],
    ];
    y = this.renderTwoColumnTable(doc, qualityRows, y);
    y += 8;

    // Section 8: Objective Performance Observations (Non-Diagnostic)
    this.renderSectionHeader(doc, "8. OBJECTIVE PERFORMANCE OBSERVATIONS (NON-DIAGNOSTIC)", y);
    y += 6;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(16, y, 178, 30, 2, 2, "FD");

    const observations = this.generateMultimodalObservations(summary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);

    let obsY = y + 5;
    observations.forEach((obs) => {
      doc.text(`• ${obs}`, 20, obsY, { maxWidth: 170 });
      obsY += 5.5;
    });

    y += 36;

    // Section 9: Clinical & Rehabilitation Review Notes
    this.renderSectionHeader(doc, "9. CLINICAL / REHABILITATION REVIEW & VERIFICATION", y);
    y += 6;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(16, y, 178, 20);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Clinician / Physical Therapist rehabilitation progress notes:", 20, y + 5);

    y += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Reviewing Clinician / Investigator: ____________________________________", 16, y);
    doc.text("Date: ________________________", 136, y);

    this.renderMultimodalFooter(doc, 3, totalPages, summary);

    return doc;
  }

  // =========================================================================
  // HELPER: Multimodal Header
  // =========================================================================
  private static renderMultimodalHeader(doc: jsPDF, _pageNum: number, isSimulated: boolean) {
    doc.setFillColor(13, 148, 136); // Medical Teal Accent Bar
    doc.rect(16, 12, 178, 1.2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("PATIENTBALANCEAI • MULTIMODAL REHABILITATION ASSESSMENT REPORT", 16, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Multimodal Leg Raise & Balance Rehabilitation Engine • Dual Sensor Synchronization", 16, 22.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    if (isSimulated) {
      doc.setTextColor(217, 119, 6);
      doc.text("SIMULATION MODE", 194, 18, { align: "right" });
    } else {
      doc.setTextColor(13, 148, 136);
      doc.text("CLINICAL HARDWARE SESSION", 194, 18, { align: "right" });
    }
  }

  // =========================================================================
  // HELPER: Multimodal Footer
  // =========================================================================
  private static renderMultimodalFooter(
    doc: jsPDF,
    pageNum: number,
    totalPages: number,
    summary: LegRaiseSessionSummary
  ) {
    const y = 286;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, y, 194, y);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "CONFIDENTIAL MEDICAL REHABILITATION BIOFEEDBACK • NOT AN INDEPENDENT DIAGNOSTIC INSTRUMENT",
      16,
      y + 4
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${pageNum} of ${totalPages} | Session: ${summary.sessionId}`, 194, y + 4, { align: "right" });
  }

  // =========================================================================
  // HELPER: Multimodal Comparison Table (Section 14.E)
  // =========================================================================
  private static renderMultimodalComparisonTable(
    doc: jsPDF,
    summary: LegRaiseSessionSummary,
    startY: number
  ): number {
    let y = startY;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(16, y, 178, 6.5, "F");
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(16, y, 178, 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Metric", 20, y + 4.5);
    doc.text("LEFT-leg exercise", 85, y + 4.5);
    doc.text("RIGHT-leg exercise", 145, y + 4.5);
    y += 6.5;

    // Table Rows matching prompt section 14.E
    const rows = [
      ["Required hold", `${summary.leftLeg.requiredHoldSeconds.toFixed(1)} seconds`, `${summary.rightLeg.requiredHoldSeconds.toFixed(1)} seconds`],
      ["Actual successful hold", `${summary.leftLeg.actualHoldSeconds.toFixed(1)} seconds`, `${summary.rightLeg.actualHoldSeconds.toFixed(1)} seconds`],
      ["Leg lift confirmed (Camera)", summary.leftLeg.cameraLiftConfirmed ? "Confirmed (Anatomical Left ✓)" : "Not Confirmed", summary.rightLeg.cameraLiftConfirmed ? "Confirmed (Anatomical Right ✓)" : "Not Confirmed"],
      ["Board confirmation (Load transfer)", summary.leftLeg.boardTransferConfirmed ? "Confirmed (Rightward Transfer ✓)" : "Not Confirmed", summary.rightLeg.boardTransferConfirmed ? "Confirmed (Leftward Transfer ✓)" : "Not Confirmed"],
      ["Load transfer (Support side Δ)", `+${summary.leftLeg.supportTransferDeltaPct.toFixed(1)}% (Peak: ${summary.leftLeg.peakSupportLoadPctDuringLift.toFixed(1)}%)`, `+${summary.rightLeg.supportTransferDeltaPct.toFixed(1)}% (Peak: ${summary.rightLeg.peakSupportLoadPctDuringLift.toFixed(1)}%)`],
      ["COP variability (RMS dispersion)", `${summary.leftLeg.copVariabilityRmsMm.toFixed(1)} mm`, `${summary.rightLeg.copVariabilityRmsMm.toFixed(1)} mm`],
      ["Time to recover stability", `${summary.leftLeg.recoveryDurationSeconds.toFixed(1)} seconds`, `${summary.rightLeg.recoveryDurationSeconds.toFixed(1)} seconds`],
      ["Camera tracking quality", `${Math.round(summary.leftLeg.meanCameraConfidence * 100)}% Visibility`, `${Math.round(summary.rightLeg.meanCameraConfidence * 100)}% Visibility`],
      ["Repetition completed", summary.leftLeg.repetitionCompleted ? "COMPLETED (Dual-Verified ✓)" : "INCOMPLETE", summary.rightLeg.repetitionCompleted ? "COMPLETED (Dual-Verified ✓)" : "INCOMPLETE"],
    ];

    rows.forEach((r, idx) => {
      const rowH = 6;
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(16, y, 178, rowH, "F");
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(16, y + rowH, 194, y + rowH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(r[0], 20, y + 4.2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(r[1], 85, y + 4.2);
      doc.text(r[2], 145, y + 4.2);

      y += rowH;
    });

    return y + 4;
  }

  // =========================================================================
  // HELPER: 2D Force Plate Trajectory Plot with Left vs Right Paths
  // =========================================================================
  private static render2dMultimodalTrajectory(
    doc: jsPDF,
    summary: LegRaiseSessionSummary,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number
  ) {
    // 1. Chassis Background (446 mm × 238 mm aspect ratio)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.6);
    doc.roundedRect(boxX, boxY, boxW, boxH, 8, 8, "FD");

    // Board Surface Perimeter
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX + 5, boxY + 5, boxW - 10, boxH - 10, 5, 5);

    const centerX = boxX + boxW / 2;
    const centerY = boxY + boxH / 2;
    const scaleX = (boxW - 24) / 2; // normalized 1.0 maps to edge
    const scaleY = (boxH - 20) / 2;

    // Crosshairs
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.4);
    doc.line(centerX, boxY + 5, centerX, boxY + boxH - 5);
    doc.line(boxX + 5, centerY, boxX + boxW - 5, centerY);

    // Axis Labels
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("FRONT / ANTERIOR (+Y)", centerX, boxY + 4, { align: "center" });
    doc.text("BACK / POSTERIOR (-Y)", centerX, boxY + boxH + 3.5, { align: "center" });
    doc.text("← LEFT (-X)", boxX - 1, centerY - 1, { align: "right" });
    doc.text("RIGHT (+X) →", boxX + boxW + 1, centerY - 1, { align: "left" });

    // 4 Corner Load Sensor Badges
    const cornerPadding = 7;
    const flX = boxX + cornerPadding;
    const flY = boxY + cornerPadding;
    const frX = boxX + boxW - cornerPadding;
    const frY = boxY + cornerPadding;
    const rlX = boxX + cornerPadding;
    const rlY = boxY + boxH - cornerPadding;
    const rrX = boxX + boxW - cornerPadding;
    const rrY = boxY + boxH - cornerPadding;

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.circle(flX, flY, 3, "FD");
    doc.circle(frX, frY, 3, "FD");
    doc.circle(rlX, rlY, 3, "FD");
    doc.circle(rrX, rrY, 3, "FD");

    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text("FL", flX, flY + 1.2, { align: "center" });
    doc.text("FR", frX, frY + 1.2, { align: "center" });
    doc.text("RL", rlX, rlY + 1.2, { align: "center" });
    doc.text("RR", rrX, rrY + 1.2, { align: "center" });

    // 2. Baseline COP Position Marker
    const basePtX = centerX + summary.baseline.copX * scaleX;
    const basePtY = centerY - summary.baseline.copY * scaleY;

    doc.setFillColor(240, 253, 250);
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.6);
    doc.circle(basePtX, basePtY, 4, "FD");
    doc.setLineWidth(0.3);
    doc.line(basePtX - 2.5, basePtY, basePtX + 2.5, basePtY);
    doc.line(basePtX, basePtY - 2.5, basePtX, basePtY + 2.5);

    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(13, 148, 136);
    doc.text("Baseline COP", basePtX, basePtY - 5, { align: "center" });

    // 3. Render LEFT Leg Raise COP Trajectory (Cyan/Blue #0284C7)
    if (summary.leftLeg.copTrajectory && summary.leftLeg.copTrajectory.length > 1) {
      doc.setDrawColor(2, 132, 199); // #0284C7
      doc.setLineWidth(0.6);
      const pts = summary.leftLeg.copTrajectory;
      for (let i = 1; i < pts.length; i++) {
        const x1 = centerX + pts[i - 1].x * scaleX;
        const y1 = centerY - pts[i - 1].y * scaleY;
        const x2 = centerX + pts[i].x * scaleX;
        const y2 = centerY - pts[i].y * scaleY;
        doc.line(x1, y1, x2, y2);
      }
    }

    // 4. Render RIGHT Leg Raise COP Trajectory (Emerald/Green #059669)
    if (summary.rightLeg.copTrajectory && summary.rightLeg.copTrajectory.length > 1) {
      doc.setDrawColor(5, 150, 105); // #059669
      doc.setLineWidth(0.6);
      const pts = summary.rightLeg.copTrajectory;
      for (let i = 1; i < pts.length; i++) {
        const x1 = centerX + pts[i - 1].x * scaleX;
        const y1 = centerY - pts[i - 1].y * scaleY;
        const x2 = centerX + pts[i].x * scaleX;
        const y2 = centerY - pts[i].y * scaleY;
        doc.line(x1, y1, x2, y2);
      }
    }

    // 5. Render Interrupted Attempt Segments (Amber dashed #D97706)
    const interruptedSets = [
      ...(summary.leftLeg.interruptedTrajectories || []),
      ...(summary.rightLeg.interruptedTrajectories || []),
    ];
    interruptedSets.forEach((segment) => {
      if (segment.length > 1) {
        doc.setDrawColor(217, 119, 6);
        doc.setLineWidth(0.3);
        for (let i = 1; i < segment.length; i++) {
          const x1 = centerX + segment[i - 1].x * scaleX;
          const y1 = centerY - segment[i - 1].y * scaleY;
          const x2 = centerX + segment[i].x * scaleX;
          const y2 = centerY - segment[i].y * scaleY;
          doc.line(x1, y1, x2, y2);
        }
      }
    });

    // 6. Legend Box
    const legBoxY = boxY + boxH - 12;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX + 6, legBoxY, boxW - 12, 8, 1, 1, "FD");

    // Legend item 1: Baseline
    doc.setFillColor(13, 148, 136);
    doc.circle(boxX + 10, legBoxY + 4, 1.5, "F");
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text("Baseline COP", boxX + 13, legBoxY + 5);

    // Legend item 2: Left Leg Trajectory
    doc.setFillColor(2, 132, 199);
    doc.rect(boxX + 38, legBoxY + 3.2, 5, 1.5, "F");
    doc.text("Left Leg Lift (Right Shift)", boxX + 45, legBoxY + 5);

    // Legend item 3: Right Leg Trajectory
    doc.setFillColor(5, 150, 105);
    doc.rect(boxX + 85, legBoxY + 3.2, 5, 1.5, "F");
    doc.text("Right Leg Lift (Left Shift)", boxX + 92, legBoxY + 5);

    // Legend item 4: Interrupted attempts
    doc.setFillColor(217, 119, 6);
    doc.rect(boxX + 132, legBoxY + 3.2, 5, 1.5, "F");
    doc.text("Interrupted Attempts", boxX + 139, legBoxY + 5);
  }

  // =========================================================================
  // HELPER: Multimodal Observations
  // =========================================================================
  private static generateMultimodalObservations(summary: LegRaiseSessionSummary): string[] {
    const list: string[] = [];
    const prefix = summary.isRealHardware ? "" : "[SIMULATION] ";

    // 1. Completion & Multimodal Validation
    if (summary.completedRepetitions === 2) {
      list.push(
        `${prefix}Dual-Device Completion: Both Left and Right leg raise protocols successfully completed with full dual-device camera elevation and balance board support confirmation.`
      );
    } else if (summary.completedRepetitions === 1) {
      list.push(
        `${prefix}Partial Completion: 1 of 2 leg raise repetitions completed. Further rehabilitation recommended for incomplete side.`
      );
    } else {
      list.push(
        `${prefix}Incomplete Protocol: Dual confirmation was not achieved for both legs. Review sensor positioning or patient stance.`
      );
    }

    // 2. Weight Transfer Asymmetry
    const leftTransfer = summary.leftLeg.supportTransferDeltaPct;
    const rightTransfer = summary.rightLeg.supportTransferDeltaPct;
    const asymmetryPct = Math.abs(leftTransfer - rightTransfer);
    list.push(
      `${prefix}Contralateral Weight Transfer: Left lift produced a +${leftTransfer.toFixed(1)}% rightward support shift, while Right lift produced a +${rightTransfer.toFixed(1)}% leftward shift (Asymmetry: ${asymmetryPct.toFixed(1)}%).`
    );

    // 3. Postural Sway & COP Variability
    const leftRms = summary.leftLeg.copVariabilityRmsMm;
    const rightRms = summary.rightLeg.copVariabilityRmsMm;
    list.push(
      `${prefix}Single-Leg COP Stability: Uninterrupted radial COP sway dispersion was ${leftRms.toFixed(1)} mm during Left leg lift and ${rightRms.toFixed(1)} mm during Right leg lift.`
    );

    // 4. Data Quality & Synchronization
    if (summary.totalMissingDataSeconds === 0) {
      list.push(
        `${prefix}Sensor Data Cadence: 100% continuous telemetry acquisition with zero packet dropouts and synchronized temporal alignment (<250ms).`
      );
    } else {
      list.push(
        `${prefix}Data Quality: Observed ${summary.totalMissingDataSeconds.toFixed(1)}s of data latency or temporary sensor dropout during assessment.`
      );
    }

    return list;
  }
}


