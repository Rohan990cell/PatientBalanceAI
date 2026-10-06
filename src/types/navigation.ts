export type PatientTab = 
  | "home"
  | "balance"
  | "vision"
  | "exercises"
  | "progress"
  | "reports"
  | "profile"
  | "devices"
  | "settings";

export type DoctorTab = 
  | "doctor-dashboard"
  | "doctor-balance"
  | "doctor-vision"
  | "doctor-patients"
  | "doctor-sessions"
  | "doctor-analytics"
  | "doctor-reports"
  | "doctor-devices"
  | "doctor-settings";

export type NavigationTab = PatientTab | DoctorTab;

export type ApplicationMode = "patient" | "doctor";

export interface NavItemConfig {
  id: NavigationTab;
  label: string;
  badge?: string;
}
