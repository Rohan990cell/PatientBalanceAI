import React, { useState, useMemo, useCallback } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
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
  const [isResultFullScreen, setIsResultFullScreen] = useState(false);
  const { status } = useBalanceBoard();
  const { isCameraActive } = useVision();

  // Default patient profile for rehabilitation
  const activePatient: PatientProfile = useMemo(() => ({
    id: "pat-001",
    medicalRecordNumber: "MRN-2026-0841",
    fullName: "Rohan",
    age: 58,
    gender: "Female",
    heightCm: 165,
    baselineWeightKg: 64.2,
    conditionDiagnosis: "Vestibular Neuritis / Balance Rehabilitation",
    rehabilitationGoal: "Romberg Equilibrium & Unassisted Stance",
    assignedDoctor: "Dr. Rachel Sullivan, MD",
    lastSessionDate: "2026-09-26",
  }), []);

  const handleToggleMode = useCallback((newMode: ApplicationMode) => {
    setMode(newMode);
    if (newMode === "doctor") {
      setCurrentTab("doctor-dashboard");
    } else {
      setCurrentTab("home");
    }
  }, []);

  const goToExercises = useCallback(() => {
    setIsResultFullScreen(false);
    setCurrentTab("exercises");
  }, []);
  const goToSettings = useCallback(() => {
    setIsResultFullScreen(false);
    setCurrentTab("settings");
  }, []);
  const goToDevices = useCallback(() => {
    setIsResultFullScreen(false);
    setCurrentTab("devices");
  }, []);
  const goToBalance = useCallback(() => {
    setIsResultFullScreen(false);
    setCurrentTab("balance");
  }, []);
  const goToHome = useCallback(() => {
    setIsResultFullScreen(false);
    setCurrentTab("home");
  }, []);

  const handleSelectTab = useCallback((tab: NavigationTab) => {
    setIsResultFullScreen(false);
    setCurrentTab(tab);
  }, []);

  const renderActivePage = () => {
    switch (currentTab) {
      case "home":
        return (
          <DashboardPage
            patient={activePatient}
            boardConnected={status.isConnected}
            onNavigateToDevices={goToDevices}
            onNavigateToExercises={goToExercises}
            onNavigateToProfile={() => setCurrentTab("profile")}
            onNavigateToBalance={goToBalance}
            onNavigateToReports={() => setCurrentTab("reports")}
            onNavigateToSettings={goToSettings}
          />
        );
      case "balance":
      case "doctor-balance":
        return <BodyBalancePage patient={activePatient} />;
      case "vision":
      case "doctor-vision":
        return <VisionPage />;
      case "exercises":
        return (
          <ExercisesPage
            patient={activePatient}
            onBack={goToHome}
            onResultFullScreenChange={setIsResultFullScreen}
            onNavigateToDashboard={goToHome}
          />
        );
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
          <DashboardPage
            patient={activePatient}
            boardConnected={status.isConnected}
            onNavigateToDevices={goToDevices}
            onNavigateToExercises={goToExercises}
            onNavigateToProfile={() => setCurrentTab("profile")}
            onNavigateToBalance={goToBalance}
            onNavigateToReports={() => setCurrentTab("reports")}
            onNavigateToSettings={goToSettings}
          />
        );
    }
  };

  const shouldHideSidebar = isResultFullScreen && currentTab === "exercises";

  return (
    <AppShell
      currentTab={currentTab}
      onSelectTab={handleSelectTab}
      mode={mode}
      onToggleMode={handleToggleMode}
      boardConnected={status.isConnected}
      webcamActive={isCameraActive}
      hideSidebar={shouldHideSidebar}
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
