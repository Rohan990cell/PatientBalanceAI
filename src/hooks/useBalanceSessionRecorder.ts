import { useState, useRef, useEffect, useCallback } from "react";
import { BalanceBoardReading } from "../types/hardware";
import {
  BalanceSession,
  RecordedMeasurementPoint,
  SessionState,
  SessionSummaryStats,
  SessionDataQuality,
  SessionDataSource,
} from "../types/session";
import { SessionStorageService } from "../services/sessionStorage";

interface UseBalanceSessionRecorderProps {
  reading: BalanceBoardReading | null;
  isConnected: boolean;
  isSimulated: boolean;
  patientId: string;
  patientName?: string;
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const useBalanceSessionRecorder = ({
  reading,
  isConnected,
  isSimulated,
  patientId,
  patientName,
}: UseBalanceSessionRecorderProps) => {
  const [state, setState] = useState<SessionState>("IDLE");
  const [durationFormatted, setDurationFormatted] = useState("00:00");
  const [activeElapsedMs, setActiveElapsedMs] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // Completed session & persistence state
  const [completedSession, setCompletedSession] = useState<BalanceSession | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  // High-frequency measurement buffer stored in refs to prevent unnecessary React re-renders
  const measurementsRef = useRef<RecordedMeasurementPoint[]>([]);
  const startTimeRef = useRef<Date | null>(null);
  const activeElapsedMsRef = useRef<number>(0);
  const lastTickTimestampRef = useRef<number | null>(null);
  const lastSampleTimestampRef = useRef<number | null>(null);
  const validCountRef = useRef<number>(0);
  const invalidCountRef = useRef<number>(0);
  const dataGapsRef = useRef<number>(0);
  const dataSourceRef = useRef<SessionDataSource>("simulation");

  // Keep latest refs to avoid stale closures in listeners/intervals
  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;

  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const isSimulatedRef = useRef(isSimulated);
  isSimulatedRef.current = isSimulated;

  // Active Timer Ticker (Runs at 10 Hz when RECORDING)
  useEffect(() => {
    if (state !== "RECORDING") {
      lastTickTimestampRef.current = null;
      return;
    }

    lastTickTimestampRef.current = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      if (lastTickTimestampRef.current !== null) {
        const delta = now - lastTickTimestampRef.current;
        activeElapsedMsRef.current += delta;
      }
      lastTickTimestampRef.current = now;

      const currentMs = activeElapsedMsRef.current;
      setActiveElapsedMs(currentMs);
      setDurationFormatted(formatDurationMs(currentMs));
      setSampleCount(validCountRef.current);
    }, 100);

    return () => clearInterval(interval);
  }, [state]);

  // Ingest reading stream during active recording
  useEffect(() => {
    if (stateRef.current !== "RECORDING") return;

    // Safety check: Board disconnection during live session
    if (!isSimulatedRef.current && !isConnectedRef.current) {
      setDisconnectError("Balance Board disconnected during session. Recording stopped safely.");
      stopSession();
      return;
    }

    if (!reading) {
      invalidCountRef.current += 1;
      return;
    }

    // Validate sensor scientific data
    const isValid =
      Number.isFinite(reading.totalWeight) &&
      reading.totalWeight > 0.1 &&
      Number.isFinite(reading.copX) &&
      Number.isFinite(reading.copY) &&
      Number.isFinite(reading.leftPercent) &&
      Number.isFinite(reading.rightPercent) &&
      Number.isFinite(reading.anteriorPercent) &&
      Number.isFinite(reading.posteriorPercent) &&
      Number.isFinite(reading.frontLeft) &&
      Number.isFinite(reading.frontRight) &&
      Number.isFinite(reading.backLeft) &&
      Number.isFinite(reading.backRight);

    if (!isValid) {
      invalidCountRef.current += 1;
      return;
    }

    const now = Date.now();
    // Detect data gap if more than 350ms elapsed between sensor samples
    if (lastSampleTimestampRef.current && now - lastSampleTimestampRef.current > 350) {
      dataGapsRef.current += 1;
    }
    lastSampleTimestampRef.current = now;

    const point: RecordedMeasurementPoint = {
      timestamp: new Date().toISOString(),
      elapsedMs: Math.round(activeElapsedMsRef.current),
      frontLeft: reading.frontLeft,
      frontRight: reading.frontRight,
      backLeft: reading.backLeft,
      backRight: reading.backRight,
      totalWeight: reading.totalWeight,
      leftWeight: reading.leftWeight,
      rightWeight: reading.rightWeight,
      leftPercent: reading.leftPercent,
      rightPercent: reading.rightPercent,
      anteriorWeight: reading.anteriorWeight,
      posteriorWeight: reading.posteriorWeight,
      anteriorPercent: reading.anteriorPercent,
      posteriorPercent: reading.posteriorPercent,
      copX: reading.copX,
      copY: reading.copY,
    };

    measurementsRef.current.push(point);
    validCountRef.current += 1;
  }, [reading]);

  // Start Session
  const startSession = useCallback(() => {
    if (!isSimulated && !isConnected) {
      throw new Error("Cannot start session: Wii Balance Board is not connected and simulation is disabled.");
    }

    if (!patientId || patientId.trim() === "") {
      throw new Error("Select a patient before starting a session.");
    }

    // Reset all internal buffers
    measurementsRef.current = [];
    startTimeRef.current = new Date();
    activeElapsedMsRef.current = 0;
    validCountRef.current = 0;
    invalidCountRef.current = 0;
    dataGapsRef.current = 0;
    lastSampleTimestampRef.current = null;
    dataSourceRef.current = isSimulated ? "simulation" : "wii_balance_board";

    setDisconnectError(null);
    setCompletedSession(null);
    setSavedFilePath(null);
    setSaveError(null);
    setIsVerified(false);
    setActiveElapsedMs(0);
    setDurationFormatted("00:00");
    setSampleCount(0);

    setState("RECORDING");
  }, [isConnected, isSimulated, patientId]);

  // Pause Session
  const pauseSession = useCallback(() => {
    if (stateRef.current !== "RECORDING") return;

    // Accumulate time up to this pause instant
    if (lastTickTimestampRef.current !== null) {
      activeElapsedMsRef.current += performance.now() - lastTickTimestampRef.current;
      lastTickTimestampRef.current = null;
    }

    setState("PAUSED");
  }, []);

  // Resume Session
  const resumeSession = useCallback(() => {
    if (stateRef.current !== "PAUSED") return;

    if (!isSimulatedRef.current && !isConnectedRef.current) {
      setDisconnectError("Cannot resume: Balance Board is disconnected.");
      return;
    }

    lastTickTimestampRef.current = performance.now();
    lastSampleTimestampRef.current = null; // Prevent false gap detection across pause
    setState("RECORDING");
  }, []);

  // Stop Session
  const stopSession = useCallback(() => {
    if (stateRef.current !== "RECORDING" && stateRef.current !== "PAUSED") return;

    // Finalize active duration
    if (stateRef.current === "RECORDING" && lastTickTimestampRef.current !== null) {
      activeElapsedMsRef.current += performance.now() - lastTickTimestampRef.current;
      lastTickTimestampRef.current = null;
    }

    const durationMs = Math.round(activeElapsedMsRef.current);
    const measurements = measurementsRef.current;
    const count = measurements.length;

    // Calculate Summary Statistics
    let sumWeight = 0;
    let sumLeft = 0;
    let sumRight = 0;
    let sumAnt = 0;
    let sumPost = 0;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    if (count > 0) {
      minX = measurements[0].copX;
      maxX = measurements[0].copX;
      minY = measurements[0].copY;
      maxY = measurements[0].copY;

      for (let i = 0; i < count; i++) {
        const m = measurements[i];
        sumWeight += m.totalWeight;
        sumLeft += m.leftPercent;
        sumRight += m.rightPercent;
        sumAnt += m.anteriorPercent;
        sumPost += m.posteriorPercent;

        if (m.copX < minX) minX = m.copX;
        if (m.copX > maxX) maxX = m.copX;
        if (m.copY < minY) minY = m.copY;
        if (m.copY > maxY) maxY = m.copY;
      }
    }

    const durationSec = durationMs / 1000;
    const samplingRate = durationSec > 0 ? parseFloat((count / durationSec).toFixed(1)) : 0;

    const summary: SessionSummaryStats = {
      durationMs,
      durationFormatted: formatDurationMs(durationMs),
      measurementCount: count,
      averageWeightKg: count > 0 ? parseFloat((sumWeight / count).toFixed(2)) : 0,
      averageLeftPercent: count > 0 ? parseFloat((sumLeft / count).toFixed(1)) : 50,
      averageRightPercent: count > 0 ? parseFloat((sumRight / count).toFixed(1)) : 50,
      averageAnteriorPercent: count > 0 ? parseFloat((sumAnt / count).toFixed(1)) : 50,
      averagePosteriorPercent: count > 0 ? parseFloat((sumPost / count).toFixed(1)) : 50,
      copSamples: count,
      minCopX: parseFloat(minX.toFixed(3)),
      maxCopX: parseFloat(maxX.toFixed(3)),
      minCopY: parseFloat(minY.toFixed(3)),
      maxCopY: parseFloat(maxY.toFixed(3)),
    };

    const quality: SessionDataQuality = {
      validSamples: validCountRef.current,
      invalidSamples: invalidCountRef.current,
      dataGaps: dataGapsRef.current,
      samplingRate,
    };

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randStr = Math.random().toString(36).substring(2, 7);
    const sessionId = `session-${dateStr}-${randStr}`;

    const session: BalanceSession = {
      schemaVersion: 1,
      sessionId,
      patientId,
      patientName,
      startTime: startTimeRef.current?.toISOString() ?? new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      dataSource: dataSourceRef.current,
      boardModel: "RVL-WBC-01",
      measurementCount: count,
      samplingRate,
      quality,
      summary,
      measurements,
    };

    setCompletedSession(session);
    setSampleCount(count);
    setDurationFormatted(formatDurationMs(durationMs));
    setState("COMPLETED");
  }, [patientId, patientName]);

  // Save Session
  const saveSession = useCallback(async () => {
    if (!completedSession) {
      throw new Error("No completed session available to save.");
    }

    setIsSaving(true);
    setSaveError(null);
    setIsVerified(false);

    try {
      // 1. Write session to persistent storage
      const filePath = await SessionStorageService.saveSession(completedSession);
      setSavedFilePath(filePath);

      // 2. Immediate load verification check (Section 15 & 16)
      const verified = await SessionStorageService.loadSession(completedSession.sessionId);
      if (verified && verified.sessionId === completedSession.sessionId && verified.measurementCount === completedSession.measurementCount) {
        setIsVerified(true);
      } else {
        throw new Error("Verification check failed: Saved session could not be verified on disk.");
      }

      return filePath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [completedSession]);

  // Discard / Reset
  const resetSession = useCallback(() => {
    measurementsRef.current = [];
    activeElapsedMsRef.current = 0;
    validCountRef.current = 0;
    invalidCountRef.current = 0;
    dataGapsRef.current = 0;
    startTimeRef.current = null;
    lastTickTimestampRef.current = null;
    lastSampleTimestampRef.current = null;

    setCompletedSession(null);
    setSavedFilePath(null);
    setSaveError(null);
    setIsVerified(false);
    setDisconnectError(null);
    setDurationFormatted("00:00");
    setActiveElapsedMs(0);
    setSampleCount(0);
    setState("IDLE");
  }, []);

  return {
    state,
    durationFormatted,
    activeElapsedMs,
    sampleCount,
    disconnectError,
    completedSession,
    isSaving,
    savedFilePath,
    saveError,
    isVerified,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    saveSession,
    resetSession,
  };
};
