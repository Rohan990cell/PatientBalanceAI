import React, { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ExercisesPage } from "./pages/ExercisesPage";
import { VisionPage } from "./pages/VisionPage";
import { ProgressPage } from "./pages/ProgressPage";
import { ReportsPage } from "./pages/ReportsPage";
import { PatientProfilePage } from "./pages/PatientProfilePage";
import { DoctorDashboardPage } from "./pages/DoctorDashboardPage";
import { DevicesPage } from "./pages/DevicesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BodyBalancePage } from "./pages/BodyBalancePage";
import { NavigationTab, ApplicationMode } from "./types/navigation";
import { PatientProfile } from "./types/patient";
import { HardwareProvider, useBalanceBoard } from "./context/HardwareContext";
import { VisionProvider, useVision } from "./context/VisionContext";
import { ExerciseProvider } from "./context/ExerciseContext";

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("home");
  const [mode, setMode] = useState<ApplicationMode>("patient");
  const { status, reading } = useBalanceBoard();
  const { isCameraActive } = useVision();

  // Default patient profile for rehabilitation
  const activePatient: PatientProfile = {
    id: "pat-001",
    medicalRecordNumber: "MRN-2026-0841",
    fullName: "Eleanor Vance",
    age: 58,
    gender: "Female",
    heightCm: 165,
    baselineWeightKg: 64.2,
    conditionDiagnosis: "Vestibular Neuritis / Balance Rehabilitation",
    rehabilitationGoal: "Romberg Equilibrium & Unassisted Stance",
    assignedDoctor: "Dr. Rachel Sullivan, MD",
    lastSessionDate: "2026-09-26",
  };

  const handleToggleMode = (newMode: ApplicationMode) => {
    setMode(newMode);
    if (newMode === "doctor") {
      setCurrentTab("doctor-dashboard");
    } else {
      setCurrentTab("home");
    }
  };

  const renderActivePage = () => {
    switch (currentTab) {
      case "home":
        return (
          <HomePage
            patient={activePatient}
            boardConnected={status.isConnected}
            liveWeight={reading?.totalWeight}
            onStartSession={() => setCurrentTab("exercises")}
            onNavigateToExercises={() => setCurrentTab("exercises")}
            onNavigateToSettings={() => setCurrentTab("settings")}
            onNavigateToDevices={() => setCurrentTab("devices")}
            onNavigateToBalance={() => setCurrentTab("balance")}
          />
        );
      case "balance":
      case "doctor-balance":
        return <BodyBalancePage patient={activePatient} />;
      case "vision":
      case "doctor-vision":
        return <VisionPage />;
      case "exercises":
        return <ExercisesPage patient={activePatient} onBack={() => setCurrentTab("home")} />;
      case "progress":
      case "doctor-analytics":
        return <ProgressPage />;
      case "reports":
      case "doctor-reports":
      case "doctor-sessions":
        return <ReportsPage />;
      case "profile":
      case "doctor-patients":
        return <PatientProfilePage patient={activePatient} />;
      case "doctor-dashboard":
        return <DoctorDashboardPage />;
      case "devices":
      case "doctor-devices":
        return <DevicesPage />;
      case "settings":
      case "doctor-settings":
        return <SettingsPage />;
      default:
        return (
          <HomePage
            patient={activePatient}
            boardConnected={status.isConnected}
            liveWeight={reading?.totalWeight}
            onStartSession={() => setCurrentTab("exercises")}
            onNavigateToExercises={() => setCurrentTab("exercises")}
            onNavigateToSettings={() => setCurrentTab("settings")}
            onNavigateToDevices={() => setCurrentTab("devices")}
          />
        );
    }
  };

  return (
    <AppShell
      currentTab={currentTab}
      onSelectTab={(tab) => setCurrentTab(tab)}
      mode={mode}
      onToggleMode={handleToggleMode}
      boardConnected={status.isConnected}
      webcamActive={isCameraActive}
    >
      {renderActivePage()}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <HardwareProvider>
      <VisionProvider>
        <ExerciseProvider>
          <AppContent />
        </ExerciseProvider>
      </VisionProvider>
    </HardwareProvider>
  );
};

export default App;
