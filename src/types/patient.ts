export interface PatientProfile {
  id: string;
  medicalRecordNumber: string;
  fullName: string;
  age: number;
  gender: "Female" | "Male" | "Other";
  heightCm: number;
  baselineWeightKg: number;
  conditionDiagnosis: string;
  rehabilitationGoal: string;
  assignedDoctor: string;
  lastSessionDate: string | null;
}

export interface RecentSessionSummary {
  id: string;
  date: string;
  protocolName: string;
  durationSeconds: number;
  balanceScore: number | null;
  status: "Completed" | "Partial" | "Pending";
  notes: string;
}
