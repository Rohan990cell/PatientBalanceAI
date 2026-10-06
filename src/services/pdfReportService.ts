import { BalanceSession } from "../types/session";
import { PdfReportGenerator } from "./pdfReportGenerator";

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
}
