import React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { NavigationTab, ApplicationMode } from "../../types/navigation";

interface AppShellProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  mode: ApplicationMode;
  onToggleMode: (mode: ApplicationMode) => void;
  boardConnected: boolean;
  webcamActive: boolean;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onSelectTab,
  mode,
  onToggleMode,
  boardConnected,
  webcamActive,
  children,
}) => {
  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "var(--bg-app)",
      }}
    >
      {/* Primary Sidebar Rail */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={onSelectTab}
        mode={mode}
        onToggleMode={onToggleMode}
      />

      {/* Main App Workspace */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Header
          currentTab={currentTab}
          mode={mode}
          boardConnected={boardConnected}
          webcamActive={webcamActive}
          onNavigateToDevices={() => onSelectTab(mode === "doctor" ? "doctor-devices" : "devices")}
        />

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
