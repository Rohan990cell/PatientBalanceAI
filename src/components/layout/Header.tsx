import React from "react";
import { Bluetooth, User, Camera } from "lucide-react";
import { NavigationTab, ApplicationMode } from "../../types/navigation";
import { StatusBadge } from "../common/StatusBadge";

interface HeaderProps {
  currentTab: NavigationTab;
  mode: ApplicationMode;
  boardConnected: boolean;
  webcamActive?: boolean;
  onNavigateToDevices: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  mode,
  boardConnected,
  webcamActive = false,
  onNavigateToDevices,
}) => {
  const getHeaderTitle = (tab: NavigationTab) => {
    switch (tab) {
      case "home":
        return "Patient Dashboard";
      case "balance":
      case "doctor-balance":
        return "Body Measurement & Balance";
      case "vision":
      case "doctor-vision":
        return "Vision & Movement Tracking";
      case "exercises":
        return "Daily Exercises";
      case "progress":
        return "My Progress & Balance Trends";
      case "reports":
        return "Session Reports";
      case "profile":
        return "Patient Profile";
      case "doctor-dashboard":
        return "Clinical Overview";
      case "doctor-patients":
        return "Patient Roster";
      case "doctor-sessions":
        return "All Recorded Sessions";
      case "doctor-analytics":
        return "Clinical Biomechanics Analytics";
      case "doctor-reports":
        return "Clinical Reports Export";
      case "devices":
      case "doctor-devices":
        return "Hardware Status & Sensors";
      case "settings":
      case "doctor-settings":
        return "Settings & Preferences";
      default:
        return "PatientBalanceAI";
    }
  };

  return (
    <header
      style={{
        height: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        borderBottom: "1px solid var(--border-light)",
        background: "#FFFFFF",
        flexShrink: 0,
      }}
    >
      <div>
        <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-main)" }}>
          {getHeaderTitle(currentTab)}
        </h2>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Device Status Pill */}
        <button
          onClick={onNavigateToDevices}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "10px",
            background: "#F8FAFC",
            border: "1px solid var(--border-light)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Wii Balance Board status"
        >
          <Bluetooth size={15} color={boardConnected ? "var(--green-primary)" : "var(--text-muted)"} />
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Wii Board:
          </span>
          <StatusBadge
            status={boardConnected ? "connected" : "disconnected"}
            label={boardConnected ? "Connected" : "Not Connected"}
          />
        </button>

        {/* Webcam Status Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            borderRadius: "10px",
            background: "#F8FAFC",
            border: "1px solid var(--border-light)",
          }}
          title="Webcam status"
        >
          <Camera size={15} color={webcamActive ? "var(--green-primary)" : "var(--text-muted)"} />
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Webcam:
          </span>
          <StatusBadge
            status={webcamActive ? "connected" : "disconnected"}
            label={webcamActive ? "Ready" : "Off"}
          />
        </div>

        {/* Patient Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 12px",
            borderRadius: "10px",
            background: mode === "patient" ? "var(--bg-subtle-mint)" : "var(--purple-light)",
            border: `1px solid ${mode === "patient" ? "var(--border-mint)" : "#E9D5FF"}`,
          }}
        >
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: mode === "patient" ? "var(--teal-primary)" : "var(--purple-doctor)",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <User size={13} />
          </div>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-main)" }}>
            {mode === "patient" ? "Eleanor Vance" : "Dr. Rachel Sullivan"}
          </span>
        </div>
      </div>
    </header>
  );
};
