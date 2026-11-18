import React, { useState } from "react";
import { FileText, Download, Calendar, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { PdfReportService } from "../services/pdfReportService";
import { BalanceSession } from "../types/session";

export const ReportsPage: React.FC = () => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{ id: string; success: boolean; message: string } | null>(null);

  const reports = [
    {
      id: "rep-01",
      title: "Weekly Balance Progress Report",
      date: "September 26, 2026",
      summary: "3 sessions completed. Improved eyes-closed Romberg balance by 12%.",
      doctorNotes: "Steadiness has improved significantly during unipedal stance.",
      sessionData: {
        avgWeight: 64.2,
        leftPct: 49.5,
        rightPct: 50.5,
        antPct: 51.0,
        postPct: 49.0,
      },
    },
    {
      id: "rep-02",
      title: "Initial Physical Intake & Baseline",
      date: "September 18, 2026",
      summary: "Initial Romberg assessment and baseline weight establishment.",
      doctorNotes: "Baseline weight 64.2 kg established on Wii Balance Board.",
      sessionData: {
        avgWeight: 64.5,
        leftPct: 48.2,
        rightPct: 51.8,
        antPct: 52.4,
        postPct: 47.6,
      },
    },
  ];

  const handleDownloadPdf = async (report: typeof reports[0]) => {
    setDownloadingId(report.id);
    setDownloadStatus(null);

    try {
      // Build a representative BalanceSession from report data
      const samplePoints = Array.from({ length: 60 }, (_, i) => ({
        timestamp: new Date(Date.now() - (60 - i) * 1000).toISOString(),
        elapsedMs: i * 1000,
        frontLeft: 16.0 + Math.sin(i * 0.1) * 0.4,
        frontRight: 16.2 + Math.cos(i * 0.1) * 0.4,
        backLeft: 16.0 - Math.sin(i * 0.1) * 0.4,
        backRight: 16.0 - Math.cos(i * 0.1) * 0.4,
        totalWeight: report.sessionData.avgWeight,
        leftWeight: report.sessionData.avgWeight * (report.sessionData.leftPct / 100),
        rightWeight: report.sessionData.avgWeight * (report.sessionData.rightPct / 100),
        leftPercent: report.sessionData.leftPct,
        rightPercent: report.sessionData.rightPct,
        anteriorWeight: report.sessionData.avgWeight * (report.sessionData.antPct / 100),
        posteriorWeight: report.sessionData.avgWeight * (report.sessionData.postPct / 100),
        anteriorPercent: report.sessionData.antPct,
        posteriorPercent: report.sessionData.postPct,
        copX: (report.sessionData.rightPct - report.sessionData.leftPct) / 100,
        copY: (report.sessionData.antPct - report.sessionData.postPct) / 100,
      }));

      const session: BalanceSession = {
        schemaVersion: 1,
        sessionId: report.id,
        patientId: "pat-001",
        patientName: "Rohan",
        startTime: new Date("2026-09-26T10:00:00Z").toISOString(),
        endTime: new Date("2026-09-26T10:01:00Z").toISOString(),
        durationMs: 60000,
        dataSource: "wii_balance_board",
        boardModel: "RVL-WBC-01",
        measurementCount: samplePoints.length,
        samplingRate: 1,
        quality: {
          validSamples: samplePoints.length,
          invalidSamples: 0,
          dataGaps: 0,
          samplingRate: 1,
        },
        summary: {
          durationMs: 60000,
          durationFormatted: "01:00",
          measurementCount: samplePoints.length,
          averageWeightKg: report.sessionData.avgWeight,
          averageLeftPercent: report.sessionData.leftPct,
          averageRightPercent: report.sessionData.rightPct,
          averageAnteriorPercent: report.sessionData.antPct,
          averagePosteriorPercent: report.sessionData.postPct,
          copSamples: samplePoints.length,
          minCopX: -0.05,
          maxCopX: 0.05,
          minCopY: -0.05,
          maxCopY: 0.05,
        },
        measurements: samplePoints,
      };

      await PdfReportService.generateAndSaveReport(session);
      setDownloadStatus({
        id: report.id,
        success: true,
        message: `Report "${report.title}" downloaded successfully.`,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setDownloadStatus({
        id: report.id,
        success: false,
        message: `Failed to export PDF: ${errorMsg}`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "8px 0 40px 0",
      }}
    >
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)" }}>
          Session Reports
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "4px" }}>
          View and download summaries of your rehabilitation balance sessions.
        </p>
      </div>

      {/* Global Status Message */}
      {downloadStatus && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            background: downloadStatus.success ? "#ECFDF5" : "#FEF2F2",
            border: `1px solid ${downloadStatus.success ? "#A7F3D0" : "#FECACA"}`,
            color: downloadStatus.success ? "#065F46" : "#991B1B",
            fontSize: "0.8125rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {downloadStatus.success ? (
            <CheckCircle2 size={16} color="#059669" />
          ) : (
            <AlertCircle size={16} color="#DC2626" />
          )}
          <span>{downloadStatus.message}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {reports.map((r) => {
          const isDownloading = downloadingId === r.id;
          return (
            <div
              key={r.id}
              className="medical-card"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "var(--bg-subtle-mint)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--teal-primary)",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={22} />
                </div>

                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-main)" }}>
                    {r.title}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    <Calendar size={13} />
                    <span>{r.date}</span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "8px" }}>
                    {r.summary}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleDownloadPdf(r)}
                disabled={isDownloading}
                className="btn-secondary"
                style={{
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  opacity: isDownloading ? 0.7 : 1,
                  cursor: isDownloading ? "wait" : "pointer",
                }}
              >
                {isDownloading ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
