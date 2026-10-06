import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import {
  BalanceState,
  ExerciseDefinition,
  ExerciseEngineState,
  ExerciseId,
  INITIAL_EXERCISE_STATE,
  SensorAvailability,
  SessionTelemetryMode,
} from "../types/exercise";
import { exerciseEngine } from "../services/exercise/ExerciseEngine";
import {
  EXERCISE_LIBRARY,
  evaluateSensorReadiness,
  SensorReadinessReport,
} from "../services/exercise/exerciseLibrary";
import { useVision } from "./VisionContext";
import { useBalanceBoard } from "./HardwareContext";

interface ExerciseContextType {
  engineState: ExerciseEngineState;
  library: ExerciseDefinition[];
  sensorAvailability: SensorAvailability;
  sensorReadiness: SensorReadinessReport | null;
  telemetryMode: SessionTelemetryMode;
  selectExercise: (exerciseId: ExerciseId) => void;
  startCountdown: (patientId?: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  returnToLibrary: () => void;
  evaluateReadiness: (exercise: ExerciseDefinition) => SensorReadinessReport;
}

const ExerciseContext = createContext<ExerciseContextType | null>(null);

export const ExerciseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [engineState, setEngineState] = useState<ExerciseEngineState>(INITIAL_EXERCISE_STATE);
  const { visionState, isCameraActive } = useVision();
  const { status: hardwareStatus, reading: hardwareReading, isSimulated } = useBalanceBoard();

  useEffect(() => {
    // Subscribe to ExerciseEngine state changes
    const unsubscribe = exerciseEngine.onStateUpdate((newState) => {
      setEngineState(newState);
    });

    return () => {
      unsubscribe();
      exerciseEngine.cancel();
    };
  }, []);

  // Real sensor availability snapshot
  const sensorAvailability: SensorAvailability = useMemo(
    () => ({
      webcam: isCameraActive,
      balanceBoard: hardwareStatus.isConnected || isSimulated,
      isSimulated,
    }),
    [isCameraActive, hardwareStatus.isConnected, isSimulated]
  );

  // Live session telemetry mode
  const telemetryMode: SessionTelemetryMode = useMemo(() => {
    const hasBoard = hardwareStatus.isConnected || isSimulated;
    if (isCameraActive && hasBoard) return "FULL_MULTIMODAL";
    if (isCameraActive && !hasBoard) return "VISION_ONLY";
    if (!isCameraActive && hasBoard) return "BALANCE_ONLY";
    return "UNASSISTED";
  }, [isCameraActive, hardwareStatus.isConnected, isSimulated]);

  // Map hardware context into pure BalanceState abstraction (without fabricating measurements)
  const balanceState: BalanceState = useMemo(() => {
    const isAvailable = hardwareStatus.isConnected || isSimulated;
    if (!isAvailable || !hardwareReading) {
      return {
        isConnected: false,
        isSimulated: false,
        totalWeight: null,
        distribution: null,
        cop: null,
      };
    }

    return {
      isConnected: true,
      isSimulated: isSimulated && !hardwareStatus.isConnected,
      totalWeight: hardwareReading.totalWeight,
      distribution: {
        left: hardwareReading.leftPercent,
        right: hardwareReading.rightPercent,
        front: hardwareReading.frontPercent ?? hardwareReading.anteriorPercent,
        back: hardwareReading.backPercent ?? hardwareReading.posteriorPercent,
      },
      cop: {
        x: hardwareReading.copX,
        y: hardwareReading.copY,
      },
    };
  }, [hardwareStatus.isConnected, isSimulated, hardwareReading]);

  // Feed continuous sensory inputs to ExerciseEngine
  useEffect(() => {
    exerciseEngine.updateSensoryInputs(visionState, balanceState);
  }, [visionState, balanceState]);

  const selectExercise = useCallback((exerciseId: ExerciseId) => {
    exerciseEngine.selectExercise(exerciseId);
  }, []);

  const startCountdown = useCallback((patientId?: string) => {
    exerciseEngine.startCountdown(patientId);
  }, []);

  const pause = useCallback(() => {
    exerciseEngine.pause();
  }, []);

  const resume = useCallback(() => {
    exerciseEngine.resume();
  }, []);

  const cancel = useCallback(() => {
    exerciseEngine.cancel();
  }, []);

  const returnToLibrary = useCallback(() => {
    exerciseEngine.returnToLibrary();
  }, []);

  const evaluateReadiness = useCallback(
    (exercise: ExerciseDefinition): SensorReadinessReport => {
      return evaluateSensorReadiness(exercise, sensorAvailability);
    },
    [sensorAvailability]
  );

  const sensorReadiness = useMemo(() => {
    if (!engineState.currentExercise) return null;
    return evaluateSensorReadiness(engineState.currentExercise, sensorAvailability);
  }, [engineState.currentExercise, sensorAvailability]);

  return (
    <ExerciseContext.Provider
      value={{
        engineState,
        library: EXERCISE_LIBRARY,
        sensorAvailability,
        sensorReadiness,
        telemetryMode,
        selectExercise,
        startCountdown,
        pause,
        resume,
        cancel,
        returnToLibrary,
        evaluateReadiness,
      }}
    >
      {children}
    </ExerciseContext.Provider>
  );
};

export const useExercise = (): ExerciseContextType => {
  const context = useContext(ExerciseContext);
  if (!context) {
    throw new Error("useExercise must be used within an ExerciseProvider");
  }
  return context;
};
