import React from "react";
import {
  Home,
  Dumbbell,
  TrendingUp,
  FileText,
  User,
  Settings,
  LayoutDashboard,
  Users,
  Activity,
  BarChart2,
  Stethoscope,
  Heart,
  Cpu,
  Camera,
  Compass,
} from "lucide-react";
import { NavigationTab, ApplicationMode } from "../../types/navigation";

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  mode: ApplicationMode;
  onToggleMode: (mode: ApplicationMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mode,
  onToggleMode,
}) => {
  // Patient Navigation Items
  const patientNavItems = [
    {
      id: "home" as NavigationTab,
      label: "Home",
      icon: <Home size={19} />,
    },
    {
      id: "balance" as NavigationTab,
      label: "Body & Balance",
      icon: <Compass size={19} />,
    },
    {
      id: "vision" as NavigationTab,
      label: "Vision",
      icon: <Camera size={19} />,
    },
    {
      id: "exercises" as NavigationTab,
      label: "Exercises",
      icon: <Dumbbell size={19} />,
    },
    {
      id: "progress" as NavigationTab,
      label: "My Progress",
      icon: <TrendingUp size={19} />,
    },
    {
      id: "reports" as NavigationTab,
      label: "Reports",
      icon: <FileText size={19} />,
    },
    {
      id: "profile" as NavigationTab,
      label: "Profile",
      icon: <User size={19} />,
    },
    {
      id: "devices" as NavigationTab,
      label: "Hardware Status",
      icon: <Cpu size={19} />,
    },
    {
      id: "settings" as NavigationTab,
      label: "Settings",
      icon: <Settings size={19} />,
    },
  ];

  // Doctor Navigation Items
  const doctorNavItems = [
    {
      id: "doctor-dashboard" as NavigationTab,
      label: "Dashboard",
      icon: <LayoutDashboard size={19} />,
    },
    {
      id: "doctor-balance" as NavigationTab,
      label: "Body & Balance",
      icon: <Compass size={19} />,
    },
    {
      id: "doctor-vision" as NavigationTab,
      label: "Vision Tracking",
      icon: <Camera size={19} />,
    },
    {
      id: "doctor-patients" as NavigationTab,
      label: "Patients",
      icon: <Users size={19} />,
    },
    {
      id: "doctor-sessions" as NavigationTab,
      label: "Sessions",
      icon: <Activity size={19} />,
    },
    {
      id: "doctor-analytics" as NavigationTab,
      label: "Analytics",
      icon: <BarChart2 size={19} />,
    },
    {
      id: "doctor-reports" as NavigationTab,
      label: "Reports",
      icon: <FileText size={19} />,
    },
    {
      id: "doctor-devices" as NavigationTab,
      label: "Hardware Status",
      icon: <Cpu size={19} />,
    },
    {
      id: "doctor-settings" as NavigationTab,
      label: "Settings",
      icon: <Settings size={19} />,
    },
  ];

  const activeItems = mode === "patient" ? patientNavItems : doctorNavItems;

  return (
    <aside
      style={{
        width: "250px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRight: "1px solid var(--border-light)",
        background: "var(--bg-sidebar)",
        padding: "20px 16px",
        flexShrink: 0,
      }}
    >
      <div>
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "4px 8px 18px 8px",
            borderBottom: "1px solid var(--border-light)",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "var(--bg-subtle-mint)",
              border: "1px solid var(--border-mint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--teal-primary)",
            }}
          >
            <Heart size={20} fill="#0D9488" fillOpacity={0.2} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "1.0625rem",
                fontWeight: 800,
                color: "var(--text-main)",
                letterSpacing: "-0.02em",
              }}
            >
              PatientBalance<span style={{ color: "var(--teal-primary)" }}>AI</span>
            </h1>
            <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
              Balance & Rehabilitation
            </p>
          </div>
        </div>

        {/* Friendly Mode Switcher */}
        <div style={{ marginTop: "16px", marginBottom: "18px" }}>
          <div
            style={{
              display: "flex",
              background: "#F1F5F9",
              borderRadius: "10px",
              padding: "3px",
            }}
          >
            <button
              onClick={() => onToggleMode("patient")}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background: mode === "patient" ? "#FFFFFF" : "transparent",
                color: mode === "patient" ? "var(--teal-primary)" : "var(--text-muted)",
                boxShadow: mode === "patient" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Patient
            </button>
            <button
              onClick={() => onToggleMode("doctor")}
              style={{
                flex: 1,
                padding: "6px 0",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background: mode === "doctor" ? "#FFFFFF" : "transparent",
                color: mode === "doctor" ? "var(--purple-doctor)" : "var(--text-muted)",
                boxShadow: mode === "doctor" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Doctor
            </button>
          </div>
        </div>

        {/* Navigation Item Links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {activeItems.map((item) => {
            const isActive = currentTab === item.id;
            const activeColor = mode === "patient" ? "var(--teal-primary)" : "var(--purple-doctor)";
            const activeBg = mode === "patient" ? "var(--bg-subtle-mint)" : "var(--purple-light)";

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  background: isActive ? activeBg : "transparent",
                  color: isActive ? activeColor : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "0.875rem",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                <span style={{ color: isActive ? activeColor : "var(--text-muted)" }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Calm Patient Support Footer */}
      <div
        style={{
          padding: "12px 14px",
          background: "var(--bg-subtle-mint)",
          borderRadius: "12px",
          border: "1px solid var(--border-mint)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Stethoscope size={15} color="var(--teal-primary)" />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-main)" }}>
            Clinical Assistance
          </span>
        </div>
        <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
          Take your time and follow the guided instructions at your own pace.
        </p>
      </div>
    </aside>
  );
};
