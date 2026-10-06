import { jsPDF } from "jspdf";
import { BalanceSession, RecordedMeasurementPoint } from "../types/session";

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
}
