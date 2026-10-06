import { useEffect, useRef, useState, useCallback } from "react";
import { BalanceBoardReading } from "../types/hardware";
import {
  TimeSeriesPoint,
  DEFAULT_GRAPH_WINDOW_MS,
  MAX_TIME_SERIES_POINTS,
  GRAPH_SAMPLE_INTERVAL_MS,
} from "../types/balanceTimeSeries";

interface UseBalanceTimeSeriesOptions {
  reading: BalanceBoardReading | null;
  isActive: boolean;
  isSimulated?: boolean;
  windowDurationMs?: number;
  maxPoints?: number;
}

export function useBalanceTimeSeries({
  reading,
  isActive,
  isSimulated = false,
  windowDurationMs = DEFAULT_GRAPH_WINDOW_MS,
  maxPoints = MAX_TIME_SERIES_POINTS,
}: UseBalanceTimeSeriesOptions) {
  const [points, setPoints] = useState<TimeSeriesPoint[]>([]);
  const lastSampleTimeRef = useRef<number>(0);
  const bufferRef = useRef<TimeSeriesPoint[]>([]);

  // Clear or reset history
  const clearHistory = useCallback(() => {
    bufferRef.current = [];
    setPoints([]);
  }, []);

  useEffect(() => {
    // If neither connected nor simulated, clear time series
    if (!isActive) {
      if (bufferRef.current.length > 0) {
        bufferRef.current = [];
        setPoints([]);
      }
      return;
    }

    if (!reading) return;

    const now = Date.now();

    // Downsample for rendering to GRAPH_SAMPLE_INTERVAL_MS (20 Hz = 50ms)
    // to prevent CPU thrashing while maintaining high-fidelity 60 FPS plotting
    if (now - lastSampleTimeRef.current < GRAPH_SAMPLE_INTERVAL_MS) {
      return;
    }
    lastSampleTimeRef.current = now;

    // Validate and sanitize data
    const safeCopX = isNaN(reading.copX) ? 0 : Math.max(-1.0, Math.min(1.0, reading.copX));
    const safeCopY = isNaN(reading.copY) ? 0 : Math.max(-1.0, Math.min(1.0, reading.copY));
    const safeLeftPct = isNaN(reading.leftPercent) ? 50 : Math.max(0, Math.min(100, reading.leftPercent));
    const safeRightPct = isNaN(reading.rightPercent) ? 50 : Math.max(0, Math.min(100, reading.rightPercent));
    const safeAntPct = isNaN(reading.anteriorPercent) ? 50 : Math.max(0, Math.min(100, reading.anteriorPercent));
    const safePostPct = isNaN(reading.posteriorPercent) ? 50 : Math.max(0, Math.min(100, reading.posteriorPercent));
    const safeWeight = isNaN(reading.totalWeight) ? 0 : Math.max(0, reading.totalWeight);

    const newPoint: TimeSeriesPoint = {
      timestamp: now,
      copX: safeCopX,
      copY: safeCopY,
      leftPercent: safeLeftPct,
      rightPercent: safeRightPct,
      anteriorPercent: safeAntPct,
      posteriorPercent: safePostPct,
      totalWeight: safeWeight,
      isSimulated,
    };

    const cutoff = now - windowDurationMs;
    const currentBuf = bufferRef.current;

    // Fast in-place filtering of expired points older than windowDurationMs
    let startIndex = 0;
    while (startIndex < currentBuf.length && currentBuf[startIndex].timestamp < cutoff) {
      startIndex++;
    }

    const updated = startIndex > 0 ? currentBuf.slice(startIndex) : [...currentBuf];
    updated.push(newPoint);

    // Enforce maxPoints cap
    if (updated.length > maxPoints) {
      updated.splice(0, updated.length - maxPoints);
    }

    bufferRef.current = updated;
    setPoints(updated);
  }, [reading, isActive, isSimulated, windowDurationMs, maxPoints]);

  return {
    points,
    clearHistory,
    windowDurationMs,
  };
}
