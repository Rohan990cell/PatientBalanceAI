import React from "react";
import { Bluetooth, Play, Clock, ChevronRight } from "lucide-react";
import { StatusBadge } from "../components/common/StatusBadge";
import { PatientProfile } from "../types/patient";

interface HomePageProps {
  patient: PatientProfile;
  boardConnected: boolean;
  liveWeight?: number;
  onStartSession: () => void;
  onNavigateToExercises: () => void;
  onNavigateToSettings: () => void;
  onNavigateToDevices?: () => void;
  onNavigateToBalance?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  patient,
  boardConnected,
  liveWeight,
  onStartSession,
  onNavigateToExercises,
  onNavigateToSettings,
  onNavigateToDevices,
  onNavigateToBalance,
}) => {
  // Friendly greeting based on hour of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const patientFirstName = patient.fullName.split(" ")[0] || patient.fullName;

  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "28px",
        padding: "12px 0 40px 0",
      }}
    >
      {/* 1. Welcoming Header */}
      <div>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "var(--text-main)",
            letterSpacing: "-0.02em",
          }}
        >
          {getGreeting()}, {patientFirstName}
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "var(--text-muted)",
            marginTop: "6px",
          }}
        >
          Let's complete your balance session today.
        </p>
      </div>

      {/* 2. Simple Device Status Card */}
      <div
        className="medical-card"
        style={{
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: boardConnected ? "var(--bg-subtle-mint)" : "#FFFFFF",
          borderColor: boardConnected ? "var(--border-mint)" : "var(--border-light)",
          cursor: onNavigateToDevices ? "pointer" : "default",
        }}
        onClick={onNavigateToDevices}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: boardConnected ? "var(--green-light)" : "#F1F5F9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: boardConnected ? "var(--green-primary)" : "var(--text-muted)",
            }}
          >
            <Bluetooth size={20} />
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-main)" }}>
              Wii Balance Board
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
              {boardConnected
                ? "Physical force plate connected & ready"
                : "Press the red SYNC button on your board to connect"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <StatusBadge
            status={boardConnected ? "connected" : "disconnected"}
            label={boardConnected ? "Connected" : "Not Connected"}
          />
          {!boardConnected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigateToDevices) onNavigateToDevices();
                else onNavigateToSettings();
              }}
              className="btn-ghost"
              style={{ fontSize: "0.8125rem", padding: "6px 10px" }}
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* 3. The 3 Most Important Metrics (Weight, Balance, Session) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
        }}
      >
        {/* Metric 1: Weight */}
        <div
          className="medical-card"
          style={{
            padding: "20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Weight
          </div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: boardConnected && liveWeight && liveWeight > 1.0 ? "var(--teal-primary)" : "var(--text-light)",
              margin: "6px 0 2px 0",
              fontFamily: "var(--font-sans)",
            }}
          >
            {boardConnected && liveWeight && liveWeight > 1.0 ? liveWeight.toFixed(1) : "--"}
            <span style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: "4px" }}>
              kg
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {boardConnected && liveWeight && liveWeight > 1.0 ? "Live reading" : "Step on board to measure"}
          </div>
        </div>

        {/* Metric 2: Balance */}
        <div
          className="medical-card"
          style={{
            padding: "20px",
            textAlign: "center",
            cursor: onNavigateToBalance ? "pointer" : "default",
          }}
          onClick={onNavigateToBalance}
          title={onNavigateToBalance ? "View Real-Time Body Measurement & Balance" : undefined}
        >
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Balance Score
          </div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: "var(--text-light)",
              margin: "6px 0 2px 0",
            }}
          >
            -- <span style={{ fontSize: "1rem", fontWeight: 500, color: "var(--text-muted)" }}>/ 100</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Calculated after session
          </div>
        </div>

        {/* Metric 3: Session Status */}
        <div
          className="medical-card"
          style={{
            padding: "20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            Session
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
              margin: "12px 0 6px 0",
            }}
          >
            Not Started
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Ready when you are
          </div>
        </div>
      </div>

      {/* 4. Large Friendly Primary Start Button */}
      <div style={{ textAlign: "center" }}>
        <button
          onClick={onStartSession}
          className="btn-primary btn-large"
          style={{
            width: "100%",
            maxWidth: "420px",
            margin: "0 auto",
            fontSize: "1.125rem",
            padding: "16px 28px",
            borderRadius: "14px",
          }}
        >
          <Play size={20} fill="#FFFFFF" />
          <span>Start Session</span>
        </button>
      </div>

      {/* 5. Today's Exercise Section */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-main)" }}>
            Today's Exercises
          </h2>
          <button
            onClick={onNavigateToExercises}
            className="btn-ghost"
            style={{ fontSize: "0.8125rem", color: "var(--teal-primary)", fontWeight: 600 }}
          >
            <span>View All</span>
            <ChevronRight size={15} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Exercise Card 1 */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
            onClick={onStartSession}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--bg-subtle-mint)",
                  border: "1px solid var(--border-mint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                  fontWeight: 700,
                }}
              >
                1
              </div>

              <div>
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Romberg Balance Test
                </h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Quiet standing with eyes open, then eyes closed.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <Clock size={13} />
                2 mins
              </span>
              <span className="btn-ghost" style={{ padding: "6px 10px", color: "var(--teal-primary)" }}>
                <ChevronRight size={18} />
              </span>
            </div>
          </div>

          {/* Exercise Card 2 */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
            onClick={onStartSession}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "#F8FAFC",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  fontWeight: 700,
                }}
              >
                2
              </div>

              <div>
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Weight Shifting Practice
                </h3>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Gentle left and right balance adjustments.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <Clock size={13} />
                1 min
              </span>
              <span className="btn-ghost" style={{ padding: "6px 10px", color: "var(--teal-primary)" }}>
                <ChevronRight size={18} />
              </span>
            </div>
          </div>

          {/* Exercise Card 3 (Wednesday Demo 1 - Board Only) */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              background: "linear-gradient(135deg, #F0FDFA 0%, #FFFFFF 100%)",
              border: "1px solid var(--border-mint)",
            }}
            onClick={onStartSession}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--bg-subtle-mint)",
                  border: "1px solid var(--border-mint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                  fontWeight: 700,
                }}
              >
                3
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                    Weight Shift — COP Target
                  </h3>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "var(--teal-primary)",
                      background: "rgba(13, 148, 136, 0.1)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    BOARD ONLY
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  Shift body weight to guide Center of Pressure toward displayed targets.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <Clock size={13} />
                1 min
              </span>
              <span className="btn-ghost" style={{ padding: "6px 10px", color: "var(--teal-primary)" }}>
                <ChevronRight size={18} />
              </span>
            </div>
          </div>

          {/* Exercise Card 4 (Wednesday Demo 2 - Multimodal Posture + Balance) */}
          <div
            className="medical-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              background: "linear-gradient(135deg, #F8FAFC 0%, #F0FDFA 100%)",
              border: "1px solid var(--border-mint)",
            }}
            onClick={onStartSession}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "var(--bg-subtle-mint)",
                  border: "1px solid var(--border-mint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--teal-primary)",
                  fontWeight: 700,
                }}
              >
                4
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                    Posture + Balance Exercise
                  </h3>
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: "var(--teal-primary)",
                      background: "rgba(13, 148, 136, 0.1)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    MULTIMODAL
                  </span>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  RealSense 2D skeleton pose + Wii Balance Board center of pressure.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                <Clock size={13} />
                1 min
              </span>
              <span className="btn-ghost" style={{ padding: "6px 10px", color: "var(--teal-primary)" }}>
                <ChevronRight size={18} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
