import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { VisionState, INITIAL_VISION_STATE, CameraDeviceInfo } from "../types/vision";
import { visionEngine } from "../services/vision/VisionEngine";

interface VisionContextType {
  visionState: VisionState;
  startCamera: (videoEl?: HTMLVideoElement | null, canvasEl?: HTMLCanvasElement | null, deviceId?: string) => Promise<boolean>;
  stopCamera: () => void;
  switchCamera: (deviceId: string) => Promise<boolean>;
  enumerateCameras: (requestPermission?: boolean) => Promise<CameraDeviceInfo[]>;
  toggleMirrored: () => void;
  isMirrored: boolean;
  setEarThreshold: (threshold: number) => void;
  resetBlinkCount: () => void;
  toggleSkeletonOverlay: () => void;
  showSkeleton: boolean;
  isCameraActive: boolean;
  getMediaStream: () => MediaStream | null;
  setDisplayCanvas: (canvasEl: HTMLCanvasElement | null) => void;
}

const VisionContext = createContext<VisionContextType | undefined>(undefined);

export const VisionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visionState, setVisionState] = useState<VisionState>(INITIAL_VISION_STATE);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const persistentVideoRef = React.useRef<HTMLVideoElement>(null);
  const persistentCanvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Subscribe to VisionEngine state changes
    visionEngine.onStateUpdate((newState) => {
      setVisionState(newState);
      setIsMirrored(newState.isMirrored);
    });

    // Enumerate cameras on startup
    visionEngine.enumerateCameras().catch(() => {});

    // Cleanup on unmount of provider
    return () => {
      visionEngine.stop();
    };
  }, []);

  const startCamera = useCallback(
    async (
      videoEl?: HTMLVideoElement | null,
      canvasEl?: HTMLCanvasElement | null,
      deviceId?: string
    ): Promise<boolean> => {
      const v = videoEl || persistentVideoRef.current;
      const c = canvasEl || persistentCanvasRef.current;
      return await visionEngine.start(v, c, deviceId);
    },
    []
  );

  const stopCamera = useCallback(() => {
    visionEngine.stop();
  }, []);

  const switchCamera = useCallback(async (deviceId: string): Promise<boolean> => {
    return await visionEngine.switchCamera(deviceId);
  }, []);

  const enumerateCameras = useCallback(async (requestPermission?: boolean): Promise<CameraDeviceInfo[]> => {
    return await visionEngine.enumerateCameras(requestPermission);
  }, []);

  const toggleMirrored = useCallback(() => {
    setIsMirrored((prev) => {
      const next = !prev;
      visionEngine.setMirrored(next);
      return next;
    });
  }, []);

  const setEarThreshold = useCallback((threshold: number) => {
    visionEngine.setEarThreshold(threshold);
  }, []);

  const resetBlinkCount = useCallback(() => {
    visionEngine.resetBlinkCounter();
  }, []);

  const toggleSkeletonOverlay = useCallback(() => {
    setShowSkeleton((prev) => {
      const next = !prev;
      visionEngine.showSkeletonOverlay = next;
      return next;
    });
  }, []);

  const getMediaStream = useCallback(() => {
    return visionEngine.getMediaStream();
  }, []);

  const setDisplayCanvas = useCallback((canvasEl: HTMLCanvasElement | null) => {
    visionEngine.setDisplayCanvas(canvasEl);
  }, []);

  const isCameraActive = visionState.cameraStatus === "connected";

  return (
    <VisionContext.Provider
      value={{
        visionState,
        startCamera,
        stopCamera,
        switchCamera,
        enumerateCameras,
        toggleMirrored,
        isMirrored,
        setEarThreshold,
        resetBlinkCount,
        toggleSkeletonOverlay,
        showSkeleton,
        isCameraActive,
        getMediaStream,
        setDisplayCanvas,
      }}
    >
      {/* Persistent Offscreen Video & Canvas Elements: Keeps Camera Session Alive Across Navigation */}
      <video
        ref={persistentVideoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: 640,
          height: 480,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -9999,
        }}
      />
      <canvas
        ref={persistentCanvasRef}
        width={640}
        height={480}
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: 640,
          height: 480,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -9999,
        }}
      />
      {children}
    </VisionContext.Provider>
  );
};

export const useVision = (): VisionContextType => {
  const context = useContext(VisionContext);
  if (!context) {
    throw new Error("useVision must be used within a VisionProvider");
  }
  return context;
};
