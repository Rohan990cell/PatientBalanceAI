import { BalanceSession } from "../types/session";
import { PatientProfile } from "../types/patient";
import {
  DirectionalWeightShiftSessionSummary,
  HoldWindowErrorSeries,
} from "../utils/directionalWeightShiftExercise";
import { LegRaiseSessionSummary } from "../utils/multimodalLegRaiseExercise";
import { GameSessionSummary } from "../utils/targetAchievingGame";
import { Pose2DAngleSessionReport, TransitAngleBoxPlot } from "../utils/pose2dAngles";
import { PdfReportGenerator } from "./pdfReportGenerator";
import { Pose2DAngleReportService } from "./pose2dAngleReportService";
import { generateLandscapeVisualReport } from "./directionalVisualReport";

export interface GeneratePdfResult {
  filename: string;
  filePath: string;
  success: boolean;
}

export class PdfReportService {
  private static isTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }

  /**
   * Generates, saves to disk via Tauri (or browser download fallback),
   * and returns the resulting report details.
   */
  public static async generateAndSaveReport(session: BalanceSession): Promise<GeneratePdfResult> {
    if (!session || !session.sessionId) {
      throw new Error("Invalid session provided for PDF generation.");
    }

    const filename = `PatientBalanceAI_BalanceReport_${session.sessionId}.pdf`;
    const doc = PdfReportGenerator.generateReport(session);

    let filePath = filename;

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const arrayBuffer = doc.output("arraybuffer");
        const uint8Array = new Uint8Array(arrayBuffer);

        // Native write to reports/ folder
        const savedPath = await invoke<string>("save_pdf_report", {
          filename,
          pdfBytes: Array.from(uint8Array),
        });

        filePath = savedPath;
      } catch (err) {
        console.warn("Tauri save_pdf_report native write failed, falling back to browser download:", err);
      }
    }

    // Always trigger direct download/save in client
    try {
      doc.save(filename);
    } catch (saveErr) {
      console.warn("doc.save fallback warning:", saveErr);
    }

    return {
      filename,
      filePath,
      success: true,
    };
  }

  /**
   * Generates, saves to disk via Tauri (or browser download fallback),
   * and returns the resulting Directional Weight Shift report details.
   */
  public static async generateAndSaveDirectionalReport(
    summary: DirectionalWeightShiftSessionSummary,
    angleReport?: Pose2DAngleSessionReport | null
  ): Promise<GeneratePdfResult & { angleJsonPath?: string }> {
    if (!summary || !summary.sessionId) {
      throw new Error("Invalid directional session summary provided for PDF generation.");
    }

    const filename = `PatientBalanceAI_DirectionalReport_${summary.sessionId}.pdf`;
    // PDF includes board report + board-synced 2D angle tables (absolute + changes)
    const doc = PdfReportGenerator.generateDirectionalWeightShiftReport(summary, angleReport);

    let filePath = filename;

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const arrayBuffer = doc.output("arraybuffer");
        const uint8Array = new Uint8Array(arrayBuffer);

        const savedPath = await invoke<string>("save_pdf_report", {
          filename,
          pdfBytes: Array.from(uint8Array),
        });

        filePath = savedPath;
      } catch (err) {
        console.warn("Tauri save_pdf_report native write failed, falling back to browser download:", err);
      }
    }

    try {
      doc.save(filename);
    } catch (saveErr) {
      console.warn("doc.save fallback warning:", saveErr);
    }

    // Also persist JSON + CSV for both angle tables locally alongside the PDF
    let angleJsonPath: string | undefined;
    if (angleReport && angleReport.snapshots.length > 0) {
      try {
        const saved = await Pose2DAngleReportService.saveLocally(angleReport, {
          sessionId: summary.sessionId,
          patientId: summary.patientId,
          patientName: summary.patientName,
          sessionDate: summary.sessionDate,
          isRealHardware: summary.isRealHardware,
        });
        angleJsonPath = saved.jsonPath;
      } catch (err) {
        console.warn("Pose2D angle report local save failed during PDF download:", err);
      }
    }

    return {
      filename,
      filePath,
      success: true,
      angleJsonPath,
    };
  }

  /**
   * Landscape visual report: board PNG page + paired line chart | box plot pages.
   */
  public static async generateAndSaveLandscapeVisualReport(params: {
    boardElement: HTMLElement;
    summary: DirectionalWeightShiftSessionSummary;
    holdSeries: HoldWindowErrorSeries[];
    transitBoxPlots: TransitAngleBoxPlot[];
  }): Promise<GeneratePdfResult> {
    const { boardElement, summary, holdSeries, transitBoxPlots } = params;
    if (!summary?.sessionId) {
      throw new Error("Invalid session for landscape visual report.");
    }

    const filename = `PatientBalanceAI_VisualReport_${summary.sessionId}.pdf`;
    const doc = await generateLandscapeVisualReport({
      boardElement,
      patientName: summary.patientName,
      sessionId: summary.sessionId,
      sessionDate: summary.sessionDate,
      holdSeries,
      transitBoxPlots,
    });

    let filePath = filename;
    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const arrayBuffer = doc.output("arraybuffer");
        const uint8Array = new Uint8Array(arrayBuffer);
        const savedPath = await invoke<string>("save_pdf_report", {
          filename,
          pdfBytes: Array.from(uint8Array),
        });
        filePath = savedPath;
      } catch (err) {
        console.warn("Tauri save landscape visual report failed, using browser download:", err);
      }
    }

    try {
      doc.save(filename);
    } catch (saveErr) {
      console.warn("doc.save landscape visual warning:", saveErr);
    }

    return { filename, filePath, success: true };
  }

  /**
   * Generates, saves to disk via Tauri (or browser download fallback),
   * and returns the resulting Multimodal Leg Raise & Balance report details.
   */
  public static async generateAndSaveMultimodalLegRaiseReport(
    summary: LegRaiseSessionSummary
  ): Promise<GeneratePdfResult> {
    if (!summary || !summary.sessionId) {
      throw new Error("Invalid leg raise session summary provided for PDF generation.");
    }

    const filename = `PatientBalanceAI_MultimodalLegRaiseReport_${summary.sessionId}.pdf`;
    const doc = PdfReportGenerator.generateMultimodalLegRaiseReport(summary);

    let filePath = filename;

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const arrayBuffer = doc.output("arraybuffer");
        const uint8Array = new Uint8Array(arrayBuffer);

        const savedPath = await invoke<string>("save_pdf_report", {
          filename,
          pdfBytes: Array.from(uint8Array),
        });

        filePath = savedPath;
      } catch (err) {
        console.warn("Tauri save_pdf_report native write failed, falling back to browser download:", err);
      }
    }

    try {
      doc.save(filename);
    } catch (saveErr) {
      console.warn("doc.save fallback warning:", saveErr);
    }

    return {
      filename,
      filePath,
      success: true,
    };
  }

  /**
   * Generates, saves to disk via Tauri (or browser download fallback),
   * and returns the resulting Target Achieving Game report details.
   */
  public static async generateAndSaveTargetAchievingReport(
    summary: GameSessionSummary,
    patient?: PatientProfile,
    sessionDate?: Date,
    isRealHardware?: boolean
  ): Promise<GeneratePdfResult> {
    if (!summary) {
      throw new Error("Invalid target achieving game session summary provided for PDF generation.");
    }

    const sessionId = summary.sessionId || `game_${Date.now()}`;
    const filename = `PatientBalanceAI_TargetAchievingReport_${sessionId}.pdf`;
    const doc = PdfReportGenerator.generateTargetAchievingGameReport(summary, patient, sessionDate, isRealHardware);

    let filePath = filename;

    if (this.isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const arrayBuffer = doc.output("arraybuffer");
        const uint8Array = new Uint8Array(arrayBuffer);

        const savedPath = await invoke<string>("save_pdf_report", {
          filename,
          pdfBytes: Array.from(uint8Array),
        });

        filePath = savedPath;
      } catch (err) {
        console.warn("Tauri save_pdf_report native write failed, falling back to browser download:", err);
      }
    }

    try {
      doc.save(filename);
    } catch (saveErr) {
      console.warn("doc.save fallback warning:", saveErr);
    }

    return {
      filename,
      filePath,
      success: true,
    };
  }
}
