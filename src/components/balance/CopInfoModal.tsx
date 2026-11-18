import React, { useEffect, useRef } from "react";
import { X, Info, AlertTriangle } from "lucide-react";

interface CopInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CopInfoModal: React.FC<CopInfoModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key and manage accessibility focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus on close button
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cop-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 9999,
        animation: "modalFadeIn 150ms ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderRadius: "16px",
          border: "1px solid var(--border-light, #E2E8F0)",
          boxShadow: "0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)",
          width: "100%",
          maxWidth: "580px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "modalPopIn 180ms ease-out",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-light, #E2E8F0)",
            backgroundColor: "var(--bg-surface, #FFFFFF)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "var(--teal-surface, #F0FDFA)",
                border: "1px solid var(--border-teal, #99F6E4)",
                color: "var(--teal-primary, #0D9488)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Info size={20} strokeWidth={2.4} />
            </div>
            <div>
              <h2
                id="cop-modal-title"
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--text-main, #0F172A)",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                How Center of Pressure (COP) Works
              </h2>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted, #64748B)",
                  margin: "2px 0 0 0",
                }}
              >
                Patient & clinical balance guide
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "transparent",
              border: "1px solid var(--border-light, #E2E8F0)",
              borderRadius: "8px",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted, #64748B)",
              cursor: "pointer",
              transition: "all var(--transition-fast, 150ms ease)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover, #F1F5F9)";
              e.currentTarget.style.color = "var(--text-main, #0F172A)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted, #64748B)";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            fontSize: "0.875rem",
            color: "var(--text-secondary, #334155)",
            lineHeight: 1.55,
          }}
        >
          {/* Section 1: What is COP? */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-app, #F8FAF9)",
              border: "1px solid var(--border-light, #E2E8F0)",
            }}
          >
            <h3
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--teal-primary-hover, #0F766E)",
                marginBottom: "6px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              1. What is COP?
            </h3>
            <p style={{ margin: 0 }}>
              The <strong>Center of Pressure (COP)</strong> is the estimated point on the balance board where the combined vertical force from the person&apos;s feet acts. The <strong>COP ball</strong> shows this point in real time as balance shifts.
            </p>
          </div>

          {/* Section 2: How is COP calculated? */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-app, #F8FAF9)",
              border: "1px solid var(--border-light, #E2E8F0)",
            }}
          >
            <h3
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--teal-primary-hover, #0F766E)",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              2. How is COP calculated?
            </h3>
            <p style={{ margin: "0 0 8px 0" }}>
              The Wii Balance Board has <strong>four load sensors</strong>:
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  background: "var(--bg-surface, #FFFFFF)",
                  border: "1px solid var(--border-light, #E2E8F0)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "0.8125rem",
                }}
              >
                <strong style={{ color: "var(--text-main, #0F172A)" }}>FL:</strong> Front Left
              </div>
              <div
                style={{
                  background: "var(--bg-surface, #FFFFFF)",
                  border: "1px solid var(--border-light, #E2E8F0)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "0.8125rem",
                }}
              >
                <strong style={{ color: "var(--text-main, #0F172A)" }}>FR:</strong> Front Right
              </div>
              <div
                style={{
                  background: "var(--bg-surface, #FFFFFF)",
                  border: "1px solid var(--border-light, #E2E8F0)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "0.8125rem",
                }}
              >
                <strong style={{ color: "var(--text-main, #0F172A)" }}>BL:</strong> Back Left
              </div>
              <div
                style={{
                  background: "var(--bg-surface, #FFFFFF)",
                  border: "1px solid var(--border-light, #E2E8F0)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "0.8125rem",
                }}
              >
                <strong style={{ color: "var(--text-main, #0F172A)" }}>BR:</strong> Back Right
              </div>
            </div>
            <p style={{ margin: "0 0 8px 0" }}>
              When valid calibrated readings are available, the application combines the four sensor readings to estimate total load and its location on the board.
            </p>
            <div
              style={{
                background: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-light, #E2E8F0)",
                borderRadius: "8px",
                padding: "8px 12px",
                marginBottom: "8px",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ marginBottom: "4px" }}>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>COP X:</strong> negative = <strong>Left (-X)</strong>; positive = <strong>Right (+X)</strong>.
              </div>
              <div>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>COP Y:</strong> negative = <strong>Back (-Y)</strong>; positive = <strong>Front (+Y)</strong>.
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted, #64748B)", fontStyle: "italic" }}>
              Note: The calculation depends on valid sensor readings, correct sensor positions, and calibration. The system does not assume unverified millimetre-level accuracy.
            </p>
          </div>

          {/* Section 3: How to read the COP ball */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-app, #F8FAF9)",
              border: "1px solid var(--border-light, #E2E8F0)",
            }}
          >
            <h3
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--teal-primary-hover, #0F766E)",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              3. How to read the COP ball
            </h3>
            <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <li>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>Near the centre:</strong> Weight distribution is relatively centred and balanced.
              </li>
              <li>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>Moving left or right:</strong> The estimated pressure location shifts laterally.
              </li>
              <li>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>Moving forward or backward:</strong> The estimated pressure location shifts in that direction (toes vs. heels).
              </li>
              <li>
                <strong style={{ color: "var(--text-main, #0F172A)" }}>The dotted circle:</strong> Represents the displayed target or reference zone, if enabled; it is a reference guide, not a universal clinical safety boundary.
              </li>
            </ul>
          </div>

          {/* Section 4: Real data versus simulation */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-app, #F8FAF9)",
              border: "1px solid var(--border-light, #E2E8F0)",
            }}
          >
            <h3
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--teal-primary-hover, #0F766E)",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              4. Real data versus simulation
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span
                  style={{
                    backgroundColor: "var(--teal-light, #CCFBF1)",
                    color: "var(--teal-primary-hover, #0F766E)",
                    border: "1px solid var(--border-teal, #99F6E4)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    marginTop: "2px",
                  }}
                >
                  LIVE
                </span>
                <span>Readings from the connected balance board, when valid.</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span
                  style={{
                    backgroundColor: "var(--amber-light, #FEF3C7)",
                    color: "var(--amber-soft, #D97706)",
                    border: "1px solid #FDE68A",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    marginTop: "2px",
                  }}
                >
                  SIMULATION
                </span>
                <span>Generated test data for preview and development—not patient measurements.</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span
                  style={{
                    backgroundColor: "#F1F5F9",
                    color: "var(--text-muted, #64748B)",
                    border: "1px solid var(--border-light, #E2E8F0)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                    marginTop: "2px",
                  }}
                >
                  DISCONNECTED
                </span>
                <span>Valid live readings are unavailable (hardware offline or waiting for data).</span>
              </div>
            </div>
          </div>

          {/* Section 5: Important note */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "12px",
              backgroundColor: "var(--bg-subtle-mint, #F0FDF4)",
              border: "1px solid var(--border-mint, #D1FAE5)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <AlertTriangle
              size={20}
              color="var(--teal-primary, #0D9488)"
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <div>
              <h3
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  color: "var(--text-main, #0F172A)",
                  marginBottom: "4px",
                }}
              >
                5. Important note
              </h3>
              <p style={{ margin: "0 0 6px 0", fontSize: "0.8125rem" }}>
                COP describes the <strong>location of the combined force</strong>, not the exact anatomical position of the person&apos;s body or feet.
              </p>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted, #64748B)" }}>
                This visualization is for balance monitoring and research, not a standalone medical diagnosis.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-light, #E2E8F0)",
            backgroundColor: "var(--bg-app, #F8FAF9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: "var(--teal-primary, #0D9488)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 20px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--shadow-button)",
              transition: "all var(--transition-fast, 150ms ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--teal-primary-hover, #0F766E)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--teal-primary, #0D9488)";
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
