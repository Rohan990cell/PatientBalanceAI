import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { BalanceBoardReading, BoardStatus } from "../types/hardware";
import { generateSimulatedMeasurement } from "../utils/copMapping";

interface HardwareContextType {
  status: BoardStatus;
  reading: BalanceBoardReading | null;
  scanAndConnect: () => Promise<void>;
  directHidConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  tare: () => Promise<void>;
  isTauri: boolean;
  isSimulated: boolean;
  setIsSimulated: (sim: boolean) => void;
  simCopX: number;
  setSimCopX: (x: number) => void;
  simCopY: number;
  setSimCopY: (y: number) => void;
  simTotalWeight: number;
  setSimTotalWeight: (w: number) => void;
  isBoardActive: boolean;
}

const defaultStatus: BoardStatus = {
  isConnected: false,
  isScanning: false,
  deviceName: null,
  macAddress: null,
  message: "Press the red SYNC button on your board to connect.",
  error: null,
};

const HardwareContext = createContext<HardwareContextType | null>(null);

export const HardwareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<BoardStatus>(defaultStatus);
  const [rawReading, setRawReading] = useState<BalanceBoardReading | null>(null);
  const [isTauri, setIsTauri] = useState(false);

  // Development Simulation State
  const [isSimulated, setIsSimulated] = useState(false);
  const [simCopX, setSimCopX] = useState(0.0);
  const [simCopY, setSimCopY] = useState(0.0);
  const [simTotalWeight, setSimTotalWeight] = useState(70.0);
  const [simReading, setSimReading] = useState<BalanceBoardReading | null>(null);

  // Simulation loop: 20Hz updates with physiological micro-sway
  useEffect(() => {
    if (!isSimulated || status.isConnected) {
      setSimReading(null);
      return;
    }

    // Initial immediate reading
    setSimReading(generateSimulatedMeasurement(simCopX, simCopY, simTotalWeight));

    const interval = setInterval(() => {
      const t = Date.now();
      const naturalSwayX = simCopX + Math.sin(t / 800) * 0.03;
      const naturalSwayY = simCopY + Math.cos(t / 950) * 0.02;
      const m = generateSimulatedMeasurement(naturalSwayX, naturalSwayY, simTotalWeight);
      setSimReading(m);
    }, 50);

    return () => clearInterval(interval);
  }, [isSimulated, status.isConnected, simCopX, simCopY, simTotalWeight]);

  // Real hardware reading takes strict priority; simulation reading active only when simulation enabled
  const reading = useMemo(() => {
    if (status.isConnected) {
      return rawReading;
    }
    if (isSimulated) {
      return simReading;
    }
    return null;
  }, [status.isConnected, rawReading, isSimulated, simReading]);

  const isBoardActive = status.isConnected || isSimulated;

  useEffect(() => {
    const hasTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    setIsTauri(hasTauri);

    if (!hasTauri) {
      setStatus((s) => ({
        ...s,
        message: "Running in web browser mode. Launch desktop shell (`npm run tauri dev`) for physical Bluetooth/HID hardware connection.",
      }));
      return;
    }

    let unlistenData: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");

        // Initial status check
        const initialStatus = await invoke<BoardStatus>("get_balance_board_status");
        if (initialStatus) {
          setStatus(initialStatus);
        }

        // Listen for hardware status updates
        unlistenStatus = await listen<BoardStatus>("balance-board-status", (event) => {
          setStatus(event.payload);
          if (!event.payload.isConnected) {
            setRawReading(null);
          }
        });

        // Listen for high-throughput live reading events
        let lastLog = 0;
        unlistenData = await listen<BalanceBoardReading>("balance-board-data", (event) => {
          setRawReading(event.payload);
          const now = Date.now();
          if (now - lastLog > 500) {
            lastLog = now;
            console.log("[HardwareContext DIAGNOSTIC LIVE DATA]", {
              totalWeight: `${event.payload.totalWeight.toFixed(2)} kg`,
              calibratedKg: {
                FL: event.payload.frontLeft.toFixed(2),
                FR: event.payload.frontRight.toFixed(2),
                BL: event.payload.backLeft.toFixed(2),
                BR: event.payload.backRight.toFixed(2),
              },
              rawADC: {
                FL: event.payload.rawFrontLeft,
                FR: event.payload.rawFrontRight,
                BL: event.payload.rawBackLeft,
                BR: event.payload.rawBackRight,
              },
              directionalPct: {
                left: `${event.payload.leftPercent.toFixed(1)}%`,
                right: `${event.payload.rightPercent.toFixed(1)}%`,
                anterior: `${event.payload.anteriorPercent.toFixed(1)}%`,
                posterior: `${event.payload.posteriorPercent.toFixed(1)}%`,
              },
              cop: {
                x: event.payload.copX.toFixed(3),
                y: event.payload.copY.toFixed(3),
                xMm: event.payload.copXMm.toFixed(1),
                yMm: event.payload.copYMm.toFixed(1),
              },
            });
          }
        });
      } catch (err) {
        console.error("Failed to setup Tauri hardware listeners:", err);
      }
    };

    setupListeners();

    return () => {
      if (unlistenData) unlistenData();
      if (unlistenStatus) unlistenStatus();
    };
  }, []);

  const scanAndConnect = useCallback(async () => {
    if (!isTauri) {
      setStatus((s) => ({
        ...s,
        error: "Physical hardware communication requires the Tauri desktop environment (`npm run tauri dev`).",
      }));
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setStatus((s) => ({
        ...s,
        isScanning: true,
        error: null,
        message: "Scanning for Nintendo RVL-WBC-01... Press red SYNC button.",
      }));
      await invoke("scan_and_connect_balance_board");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus((s) => ({
        ...s,
        isScanning: false,
        error: msg,
        message: "Bluetooth scan or pairing failed. Please press red SYNC and retry.",
      }));
    }
  }, [isTauri]);

  const directHidConnect = useCallback(async () => {
    if (!isTauri) {
      setStatus((s) => ({
        ...s,
        error: "Physical hardware communication requires the Tauri desktop environment (`npm run tauri dev`).",
      }));
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setStatus((s) => ({
        ...s,
        isScanning: true,
        error: null,
        message: "Connecting via direct HID...",
      }));
      await invoke("direct_hid_connect");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus((s) => ({
        ...s,
        isScanning: false,
        error: msg,
        message: "Direct HID connection failed. Ensure board is paired in Windows and awake.",
      }));
    }
  }, [isTauri]);

  const disconnect = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("disconnect_balance_board");
      setRawReading(null);
    } catch (err) {
      console.error("Disconnect failed:", err);
    }
  }, [isTauri]);

  const tare = useCallback(async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tare_balance_board");
    } catch (err) {
      console.error("Tare failed:", err);
    }
  }, [isTauri]);

  return (
    <HardwareContext.Provider
      value={{
        status,
        reading,
        scanAndConnect,
        directHidConnect,
        disconnect,
        tare,
        isTauri,
        isSimulated,
        setIsSimulated,
        simCopX,
        setSimCopX,
        simCopY,
        setSimCopY,
        simTotalWeight,
        setSimTotalWeight,
        isBoardActive,
      }}
    >
      {children}
    </HardwareContext.Provider>
  );
};

export const useBalanceBoard = (): HardwareContextType => {
  const context = useContext(HardwareContext);
  if (!context) {
    throw new Error("useBalanceBoard must be used within a HardwareProvider");
  }
  return context;
};
