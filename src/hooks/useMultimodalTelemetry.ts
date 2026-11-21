/**
 * useMultimodalTelemetry Hook
 * Phase 5: Multimodal Integration (Wii Balance Board + Camera Pose + SMPL + COP)
 *
 * Soft-sync strategy:
 * - Board acquires ~100 Hz in Rust; React holds latest sample (~30 Hz UI throttle).
 * - Camera / MediaPipe targets 30 FPS (RealSense RGB locked).
 * - Fusion tick runs at MULTIMODAL_FUSION_FPS (30 Hz): each tick pairs the latest
 *   board sample with the latest pose + 2D angles (no fabricated COP interpolation).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useBalanceBoard } from "../context/HardwareContext";
import { useVision } from "../context/VisionContext";
import { useCameraToSMPLPose } from "./useCameraToSMPLPose";
import {
  MultimodalTelemetryState,
  MultimodalTelemetryMode,
  MultimodalDataSource,
  determineMultimodalMode,
  DEVELOPMENT_SIMULATION_LABEL,
  MULTIMODAL_FUSION_FPS,
  MULTIMODAL_FUSION_INTERVAL_MS,
} from "../types/multimodal";
import { calculatePose2DAngles } from "../utils/pose2dAngles";

export function useMultimodalTelemetry(): MultimodalTelemetryState {
  const { status, reading, isSimulated } = useBalanceBoard();
  const { visionState, isCameraActive } = useVision();
  const cameraSMPL = useCameraToSMPLPose();

  // Keep latest sensor snapshots in refs so the 30 Hz fusion tick never stalls
  const latestRef = useRef({
    status,
    reading,
    isSimulated,
    visionState,
    isCameraActive,
    cameraSMPL,
  });
  latestRef.current = { status, reading, isSimulated, visionState, isCameraActive, cameraSMPL };

  const [fusionTick, setFusionTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFusionTick((t) => t + 1);
    }, MULTIMODAL_FUSION_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return useMemo<MultimodalTelemetryState>(() => {
    const {
      status: st,
      reading: rd,
      isSimulated: sim,
      visionState: vs,
      isCameraActive: camOn,
      cameraSMPL: smpl,
    } = latestRef.current;

    const fusedAtMs = Date.now();

    // 1. Hardware Stream (Wii Balance Board) — latest sample only
    const boardConnected = st.isConnected;
    const hasReading = rd !== null;
    const isSimulatedActive = sim && !boardConnected && hasReading;

    let dataSource: MultimodalDataSource = "NONE";
    if (boardConnected && hasReading) {
      dataSource = "REAL_HARDWARE";
    } else if (isSimulatedActive) {
      dataSource = "SIMULATION";
    }

    const hardwareTelemetry = {
      boardConnected,
      sensorDataAvailable: hasReading,
      isSimulated: isSimulatedActive,
      dataSource,
      totalWeight: hasReading ? rd.totalWeight : null,
      leftWeight: hasReading ? rd.leftWeight : null,
      rightWeight: hasReading ? rd.rightWeight : null,
      anteriorWeight: hasReading ? rd.anteriorWeight : null,
      posteriorWeight: hasReading ? rd.posteriorWeight : null,
      leftPercent: hasReading ? rd.leftPercent : null,
      rightPercent: hasReading ? rd.rightPercent : null,
      anteriorPercent: hasReading ? rd.anteriorPercent : null,
      posteriorPercent: hasReading ? rd.posteriorPercent : null,
      copX: hasReading ? rd.copX : null,
      copY: hasReading ? rd.copY : null,
      copOffset: hasReading ? { x: rd.copX, y: rd.copY } : null,
      timestamp: hasReading ? rd.timestamp : null,
    };

    // 2. Vision Stream (MediaPipe Camera & Pose) + 2D angles
    const isPoseValid = camOn && vs.hasPose && smpl.isPoseValid;
    // Prefer the camera frame's own wall-clock stamp (same domain as board HID)
    const visionTimestamp = camOn
      ? typeof vs.frameTimestampMs === "number" && Number.isFinite(vs.frameTimestampMs)
        ? vs.frameTimestampMs
        : fusedAtMs
      : null;
    const pose2dAngles =
      camOn && vs.pose
        ? calculatePose2DAngles(vs.pose, visionTimestamp ?? fusedAtMs)
        : null;

    const visionTelemetry = {
      cameraConnected: camOn,
      cameraStatus: vs.cameraStatus,
      poseAvailable: isPoseValid,
      poseConfidence: isPoseValid ? smpl.confidence : null,
      landmarks: camOn ? vs.pose : null,
      smplPose: smpl.pose,
      isSMPLPoseActive: isPoseValid,
      fps: vs.fps,
      timestamp: visionTimestamp,
      pose2dAngles,
    };

    // 3. Multimodal Mode Determination
    const mode: MultimodalTelemetryMode = determineMultimodalMode(hasReading, isPoseValid);

    // 4. Soft sync: pair latest board sample with latest camera frame on shared wall clock
    const isSynchronized = hasReading && isPoseValid;
    let timeSkewMs: number | null = null;
    if (
      typeof hardwareTelemetry.timestamp === "number" &&
      typeof visionTelemetry.timestamp === "number"
    ) {
      timeSkewMs = Math.abs(hardwareTelemetry.timestamp - visionTelemetry.timestamp);
    }

    const simulationWarning = isSimulatedActive ? DEVELOPMENT_SIMULATION_LABEL : null;

    return {
      mode,
      hardware: hardwareTelemetry,
      vision: visionTelemetry,
      synchronization: {
        isSynchronized,
        timeSkewMs,
        strategy:
          `Shared wall-clock soft sync @ ${MULTIMODAL_FUSION_FPS} Hz: board HID timestamp + camera frameTimestampMs paired each tick (no fabricated COP). Skew = |board − camera|.`,
        fusionFps: MULTIMODAL_FUSION_FPS,
        fusedAtMs,
      },
      simulationWarning,
    };
    // fusionTick forces recompute on the 30 Hz cadence even if React deps are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fusionTick, status.isConnected, reading, isSimulated, isCameraActive, visionState, cameraSMPL]);
}
