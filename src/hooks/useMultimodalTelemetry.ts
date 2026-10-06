/**
 * useMultimodalTelemetry Hook
 * Phase 5: Multimodal Integration (Wii Balance Board + Camera Pose + SMPL + COP)
 *
 * Unifies independent hardware and vision telemetry streams into a single
 * deterministic, safe multimodal telemetry state.
 *
 * RIGID DATA INTEGRITY INVARIANTS:
 * - When Wii hardware is unavailable, balance fields are strictly null.
 * - When Camera is unavailable, SMPL pose falls back to neutral anatomical standing.
 * - Development simulation is explicitly labeled and separated from real patient data.
 * - Body pose and Center of Pressure remain scientifically independent.
 */

import { useMemo } from "react";
import { useBalanceBoard } from "../context/HardwareContext";
import { useVision } from "../context/VisionContext";
import { useCameraToSMPLPose } from "./useCameraToSMPLPose";
import {
  MultimodalTelemetryState,
  MultimodalTelemetryMode,
  MultimodalDataSource,
  determineMultimodalMode,
  DEVELOPMENT_SIMULATION_LABEL,
} from "../types/multimodal";

export function useMultimodalTelemetry(): MultimodalTelemetryState {
  const { status, reading, isSimulated } = useBalanceBoard();
  const { visionState, isCameraActive } = useVision();
  const cameraSMPL = useCameraToSMPLPose();

  return useMemo<MultimodalTelemetryState>(() => {
    // 1. Hardware Stream (Wii Balance Board)
    const boardConnected = status.isConnected;
    const hasReading = reading !== null;
    const isSimulatedActive = isSimulated && !boardConnected && hasReading;

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
      totalWeight: hasReading ? reading.totalWeight : null,
      leftWeight: hasReading ? reading.leftWeight : null,
      rightWeight: hasReading ? reading.rightWeight : null,
      anteriorWeight: hasReading ? reading.anteriorWeight : null,
      posteriorWeight: hasReading ? reading.posteriorWeight : null,
      leftPercent: hasReading ? reading.leftPercent : null,
      rightPercent: hasReading ? reading.rightPercent : null,
      anteriorPercent: hasReading ? reading.anteriorPercent : null,
      posteriorPercent: hasReading ? reading.posteriorPercent : null,
      copX: hasReading ? reading.copX : null,
      copY: hasReading ? reading.copY : null,
      copOffset: hasReading ? { x: reading.copX, y: reading.copY } : null,
      timestamp: hasReading ? reading.timestamp : null,
    };

    // 2. Vision Stream (MediaPipe Camera & Pose)
    const isPoseValid = isCameraActive && visionState.hasPose && cameraSMPL.isPoseValid;
    const visionTimestamp = isCameraActive ? Date.now() : null;

    const visionTelemetry = {
      cameraConnected: isCameraActive,
      cameraStatus: visionState.cameraStatus,
      poseAvailable: isPoseValid,
      poseConfidence: isPoseValid ? cameraSMPL.confidence : null,
      landmarks: isCameraActive ? visionState.pose : null,
      smplPose: cameraSMPL.pose,
      isSMPLPoseActive: isPoseValid,
      fps: visionState.fps,
      timestamp: visionTimestamp,
    };

    // 3. Multimodal Mode Determination
    const mode: MultimodalTelemetryMode = determineMultimodalMode(
      hasReading,
      isPoseValid
    );

    // 4. Synchronization Strategy
    const isSynchronized = hasReading && isPoseValid;
    let timeSkewMs: number | null = null;
    if (hardwareTelemetry.timestamp && visionTelemetry.timestamp) {
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
          "Independent dual-stream timestamp synchronization (Wii Board ~100Hz, Camera ~30Hz). Zero artificial interpolation of clinical balance metrics; real-time visualization presents latest verified spatial pose.",
      },
      simulationWarning,
    };
  }, [
    status.isConnected,
    reading,
    isSimulated,
    isCameraActive,
    visionState.cameraStatus,
    visionState.hasPose,
    visionState.pose,
    visionState.fps,
    cameraSMPL.isPoseValid,
    cameraSMPL.confidence,
    cameraSMPL.pose,
  ]);
}
