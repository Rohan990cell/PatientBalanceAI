import React from "react";
import { FileText, Download, Calendar } from "lucide-react";

export const ReportsPage: React.FC = () => {
  const reports = [
    {
      id: "rep-01",
      title: "Weekly Balance Progress Report",
      date: "September 26, 2026",
      summary: "3 sessions completed. Improved eyes-closed Romberg balance by 12%.",
      doctorNotes: "Steadiness has improved significantly during unipedal stance.",
    },
    {
      id: "rep-02",
      title: "Initial Physical Intake & Baseline",
      date: "September 18, 2026",
      summary: "Initial Romberg assessment and baseline weight establishment.",
      doctorNotes: "Baseline weight 64.2 kg established on Wii Balance Board.",
    },
  ];

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

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {reports.map((r) => (
          <div
            key={r.id}
            className="medical-card"
            style={{
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
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

              <div>
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

            <button className="btn-secondary" style={{ whiteSpace: "nowrap" }}>
              <Download size={15} />
              <span>Download PDF</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
