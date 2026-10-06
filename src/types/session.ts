export type SessionState = "IDLE" | "RECORDING" | "PAUSED" | "COMPLETED";

export type SessionDataSource = "wii_balance_board" | "simulation";

export interface RecordedMeasurementPoint {
  timestamp: string; // ISO 8601 string, e.g. "2026-09-30T12:30:15.245Z"
  elapsedMs: number; // Session-relative active elapsed time in milliseconds
  frontLeft: number;
  frontRight: number;
  backLeft: number;
  backRight: number;
  totalWeight: number;
  leftWeight: number;
  rightWeight: number;
  leftPercent: number;
  rightPercent: number;
  anteriorWeight: number;
  posteriorWeight: number;
  anteriorPercent: number;
  posteriorPercent: number;
  copX: number;
  copY: number;
}

export interface SessionDataQuality {
  validSamples: number;
  invalidSamples: number;
  dataGaps: number;
  samplingRate: number; // Hz (e.g. 100 Hz or calculated from validSamples / activeSeconds)
}

export interface SessionSummaryStats {
  durationMs: number;
  durationFormatted: string; // "MM:SS"
  measurementCount: number;
  averageWeightKg: number;
  averageLeftPercent: number;
  averageRightPercent: number;
  averageAnteriorPercent: number;
  averagePosteriorPercent: number;
  copSamples: number;
  minCopX: number;
  maxCopX: number;
  minCopY: number;
  maxCopY: number;
}

export interface BalanceSession {
  schemaVersion: 1;
  sessionId: string; // Unique, e.g. "session-20260930-184512-abc"
  patientId: string;
  patientName?: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationMs: number;
  dataSource: SessionDataSource;
  boardModel: string; // "RVL-WBC-01"
  measurementCount: number;
  samplingRate: number;
  quality: SessionDataQuality;
  summary: SessionSummaryStats;
  measurements: RecordedMeasurementPoint[];
}

export interface SavedSessionSummary {
  sessionId: string;
  patientId: string;
  patientName?: string;
  startTime: string;
  durationMs: number;
  durationFormatted: string;
  measurementCount: number;
  dataSource: SessionDataSource;
  filePath: string;
}
