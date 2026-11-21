import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
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

  // Development Simulation State (Single Source of Truth)
  const [isSimulated, setIsSimulated] = useState(false);
  const [simCopX, setSimCopX] = useState(0.0);
  const [simCopY, setSimCopY] = useState(0.0);
  const [simTotalWeight, setSimTotalWeight] = useState(70.0);
  const [simReading, setSimReading] = useState<BalanceBoardReading | null>(null);

  // Throttle hardware reading updates to ~30fps to avoid flooding React with state updates
  const lastReadingUpdateRef = useRef(0);
  const pendingReadingRef = useRef<BalanceBoardReading | null>(null);
  const readingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const READING_UI_MS = 33;

  // Deterministic simulation update stream
  useEffect(() => {
    // If not simulated or physical board is live, clear simulated stream
    if (!isSimulated || status.isConnected) {
      setSimReading(null);
      return;
    }

    const safeX = Number.isFinite(simCopX) ? Math.max(-1.0, Math.min(1.0, simCopX)) : 0.0;
    const safeY = Number.isFinite(simCopY) ? Math.max(-1.0, Math.min(1.0, simCopY)) : 0.0;
    const safeWeight = Number.isFinite(simTotalWeight) ? Math.max(0.0, simTotalWeight) : 70.0;

    setSimReading(generateSimulatedMeasurement(safeX, safeY, safeWeight));
  }, [isSimulated, status.isConnected, simCopX, simCopY, simTotalWeight]);

  // Scientific data integrity:
  // 1. Live hardware reading takes strict priority when connected.
  // 2. Simulation reading is active ONLY when simulation is explicitly enabled AND hardware is not connected.
  // 3. When disconnected with simulation off, reading is strictly null (no fake 70kg / 50/50 balance).
  const reading = useMemo<BalanceBoardReading | null>(() => {
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
    let isMounted = true;
    let unlistenData: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    const hasTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    setIsTauri(hasTauri);

    if (!hasTauri) {
      setStatus((s) => ({
        ...s,
        message: "Running in web browser mode. Launch desktop shell (`npm run tauri dev`) for physical Bluetooth/HID hardware connection.",
      }));
      return;
    }

    const setupListeners = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");

        // Initial hardware status check
        const initialStatus = await invoke<BoardStatus>("get_balance_board_status");
        if (isMounted && initialStatus && typeof initialStatus === "object") {
          setStatus(initialStatus);
          if (!initialStatus.isConnected) {
            setRawReading(null);
          }
        }

        // Listen for hardware status updates
        const uStatus = await listen<BoardStatus>("balance-board-status", (event) => {
          if (!isMounted) return;
          if (event && event.payload && typeof event.payload === "object") {
            setStatus(event.payload);
            if (!event.payload.isConnected) {
              setRawReading(null);
            }
          }
        });
        if (isMounted) {
          unlistenStatus = uStatus;
        } else {
          uStatus();
        }

        // Listen for high-throughput live reading events
        const uData = await listen<BalanceBoardReading>("balance-board-data", (event) => {
          if (!isMounted) return;
          if (event && event.payload && typeof event.payload === "object") {
            const p = event.payload;
            // Defensive validation of incoming payload
            if (
              typeof p.totalWeight === "number" &&
              Number.isFinite(p.totalWeight) &&
              typeof p.copX === "number" &&
              Number.isFinite(p.copX) &&
              typeof p.copY === "number" &&
              Number.isFinite(p.copY)
            ) {
              // Throttle React state to ~30fps. Always keep the latest sample for the deferred flush
              // (do not use rAF — that was flushing every frame and defeating the throttle).
              pendingReadingRef.current = p;
              const now = Date.now();
              const elapsed = now - lastReadingUpdateRef.current;
              if (elapsed >= READING_UI_MS) {
                lastReadingUpdateRef.current = now;
                setRawReading(p);
                pendingReadingRef.current = null;
                if (readingFlushTimerRef.current) {
                  clearTimeout(readingFlushTimerRef.current);
                  readingFlushTimerRef.current = null;
                }
              } else if (!readingFlushTimerRef.current) {
                readingFlushTimerRef.current = setTimeout(() => {
                  readingFlushTimerRef.current = null;
                  const pending = pendingReadingRef.current;
                  if (pending && isMounted) {
                    lastReadingUpdateRef.current = Date.now();
                    setRawReading(pending);
                    pendingReadingRef.current = null;
                  }
                }, Math.max(0, READING_UI_MS - elapsed));
              }
            }
          }
        });
        if (isMounted) {
          unlistenData = uData;
        } else {
          uData();
        }
      } catch (err) {
        console.error("Failed to setup Tauri hardware listeners:", err);
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (readingFlushTimerRef.current) {
        clearTimeout(readingFlushTimerRef.current);
        readingFlushTimerRef.current = null;
      }
      if (unlistenData) {
        try {
          unlistenData();
        } catch {
          // ignore
        }
      }
      if (unlistenStatus) {
        try {
          unlistenStatus();
        } catch {
          // ignore
        }
      }
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
    if (!isTauri) {
      setRawReading(null);
      setStatus((s) => ({
        ...s,
        isConnected: false,
        isScanning: false,
        message: "Disconnected.",
      }));
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("disconnect_balance_board");
      setRawReading(null);
      setStatus((s) => ({
        ...s,
        isConnected: false,
        isScanning: false,
        message: "Disconnected. Press SYNC on your board to reconnect.",
      }));
    } catch (err) {
      console.error("Disconnect failed:", err);
      setRawReading(null);
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
