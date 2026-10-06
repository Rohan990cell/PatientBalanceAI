import React, { useState } from "react";
import { CheckCircle2, AlertCircle, FileCheck, Save, Clock, Scale, Compass, Activity, Database, FileText } from "lucide-react";
import { BalanceSession } from "../../types/session";
import { PdfReportService } from "../../services/pdfReportService";

interface SessionSummaryCardProps {
  session: BalanceSession;
  isSaving: boolean;
  savedFilePath: string | null;
  saveError: string | null;
  isVerified: boolean;
  onSave: () => void;
  onReset: () => void;
}

export const SessionSummaryCard: React.FC<SessionSummaryCardProps> = ({
  session,
  isSaving,
  savedFilePath,
  saveError,
  isVerified,
  onSave,
  onReset,
}) => {
  const { summary, quality, dataSource, boardModel, sessionId } = session;
  const isSimulated = dataSource === "simulation";

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfResult, setPdfResult] = useState<{ filename: string; filePath: string } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const res = await PdfReportService.generateAndSaveReport(session);
      setPdfResult({ filename: res.filename, filePath: res.filePath });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div
      className="medical-card"
      style={{
        padding: "24px",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        border: "1px solid var(--border-mint)",
      }}
    >
      {/* 1. Header Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid var(--border-light)",
          paddingBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "#DCFCE7",
              border: "1px solid #BBF7D0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#166534",
            }}
          >
            <CheckCircle2 size={24} />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
                Session Complete
              </h2>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: isSimulated ? "#FEF3C7" : "#E0F2FE",
                  border: `1px solid ${isSimulated ? "#FCD34D" : "#BAE6FD"}`,
                  color: isSimulated ? "#92400E" : "#0369A1",
                }}
              >
                {isSimulated ? "DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA" : `Hardware: ${boardModel}`}
              </span>
            </div>

            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Session ID: <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{sessionId}</code>
            </p>
          </div>
        </div>

        {/* Action Buttons: Save Session, Generate PDF, and New Session */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={onSave}
            disabled={isSaving || isVerified}
            className="btn-primary"
            style={{
              padding: "10px 18px",
              fontSize: "0.875rem",
              background: isVerified ? "#16A34A" : "var(--teal-primary)",
            }}
          >
            {isVerified ? <FileCheck size={16} /> : <Save size={16} />}
            <span>
              {isSaving
                ? "Writing to Disk..."
                : isVerified
                ? "Saved & Verified"
                : "Save Session"}
            </span>
          </button>

          <button
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
            className="btn-primary"
            style={{
              padding: "10px 18px",
              fontSize: "0.875rem",
              background: "#0284C7",
              borderColor: "#0284C7",
            }}
          >
            <FileText size={16} />
            <span>{isGeneratingPdf ? "Generating PDF..." : "Generate PDF Report"}</span>
          </button>

          <button
            onClick={onReset}
            className="btn-secondary"
            style={{
              padding: "10px 16px",
              fontSize: "0.875rem",
            }}
          >
            Start New Session
          </button>
        </div>
      </div>

      {/* Save Success / Error Notice */}
      {savedFilePath && isVerified && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#F0FDF4",
            border: "1px solid #BBF7D0",
            color: "#166534",
            fontSize: "0.8125rem",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <FileCheck size={18} />
            <span>Session saved and verified successfully!</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "#15803D", wordBreak: "break-all" }}>
            File: {savedFilePath}
          </span>
        </div>
      )}

      {saveError && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={18} />
          <span>Error saving session: {saveError}</span>
        </div>
      )}

      {/* PDF Generation Success Notice */}
      {pdfResult && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#F0F9FF",
            border: "1px solid #BAE6FD",
            color: "#0369A1",
            fontSize: "0.8125rem",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <FileText size={18} />
            <span>Doctor PDF Balance Assessment Report Generated!</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "#0284C7", wordBreak: "break-all" }}>
            File: {pdfResult.filename} {pdfResult.filePath !== pdfResult.filename ? `(${pdfResult.filePath})` : ""}
          </span>
        </div>
      )}

      {/* PDF Generation Error Notice */}
      {pdfError && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={18} />
          <span>Error generating PDF report: {pdfError}</span>
        </div>
      )}

      {/* 2. Key Scientific Measurement Summary Grid */}
      <div>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "12px" }}>
          Clinical Measurement Summary
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
          }}
        >
          {/* Duration */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Clock size={14} />
              <span>Duration</span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {summary.durationFormatted}
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Active recording time</span>
          </div>

          {/* Measurements Count */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Activity size={14} />
              <span>Measurements</span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {summary.measurementCount.toLocaleString()}
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Total valid packets</span>
          </div>

          {/* Average Weight */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Scale size={14} />
              <span>Average Weight</span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              {summary.averageWeightKg} <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>kg</span>
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Load cells combined</span>
          </div>

          {/* Average Left / Right Split */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Compass size={14} />
              <span>Average Left / Right</span>
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              <span style={{ color: "var(--teal-primary)" }}>L: {summary.averageLeftPercent}%</span>
              {" / "}
              <span style={{ color: "#0284C7" }}>R: {summary.averageRightPercent}%</span>
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Bilateral distribution</span>
          </div>

          {/* Average Anterior / Posterior Split */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Compass size={14} />
              <span>Average Ant / Post</span>
            </div>
            <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px" }}>
              <span style={{ color: "#059669" }}>Ant: {summary.averageAnteriorPercent}%</span>
              {" / "}
              <span style={{ color: "var(--text-muted)" }}>Post: {summary.averagePosteriorPercent}%</span>
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Anteroposterior balance</span>
          </div>

          {/* COP Samples */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem" }}>
              <Compass size={14} />
              <span>COP Samples</span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {summary.copSamples.toLocaleString()}
            </div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>X: [{summary.minCopX}, {summary.maxCopX}]</span>
          </div>
        </div>
      </div>

      {/* 3. Data Quality Breakdown Card (Section 12) */}
      <div
        style={{
          borderRadius: "12px",
          background: "#F8FAFC",
          border: "1px solid var(--border-light)",
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={16} color="var(--text-muted)" />
            <h4 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
              Data Quality Summary
            </h4>
          </div>

          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "6px",
              background: quality.invalidSamples === 0 ? "#DCFCE7" : "#FEF3C7",
              color: quality.invalidSamples === 0 ? "#166534" : "#92400E",
            }}
          >
            {quality.invalidSamples === 0 ? "100% Valid Stream" : `${quality.invalidSamples} Anomalies Filtered`}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            fontSize: "0.8125rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Valid samples:</span>
            <div style={{ fontWeight: 700, color: "#166534", fontSize: "0.9375rem" }}>
              {quality.validSamples.toLocaleString()}
            </div>
          </div>

          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Invalid samples:</span>
            <div style={{ fontWeight: 700, color: quality.invalidSamples === 0 ? "var(--text-muted)" : "#DC2626", fontSize: "0.9375rem" }}>
              {quality.invalidSamples}
            </div>
          </div>

          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Data gaps:</span>
            <div style={{ fontWeight: 700, color: quality.dataGaps === 0 ? "var(--text-muted)" : "#D97706", fontSize: "0.9375rem" }}>
              {quality.dataGaps}
            </div>
          </div>

          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Sampling rate:</span>
            <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.9375rem" }}>
              ~{quality.samplingRate} Hz
            </div>
          </div>

          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Data Source:</span>
            <div style={{ fontWeight: 700, color: isSimulated ? "#D97706" : "var(--teal-primary)", fontSize: "0.8125rem" }}>
              {isSimulated ? "Simulation" : "Wii Balance Board"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
