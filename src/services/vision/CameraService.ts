import { CameraStatusType } from "../../types/vision";

export interface CameraErrorResult {
  status: CameraStatusType;
  message: string;
}

/**
 * Detect whether a device label corresponds to the Intel RealSense RGB camera.
 * Requirement 5: Detect Intel RealSense RGB camera by its actual device label.
 * Known device labels:
 * - "Intel(R) RealSense(TM) Depth Camera 455f RGB"
 * - "Intel(R) RealSense(TM) Depth Camera 455 RGB"
 * - Any label containing "RealSense" (or "455") and "RGB"
 */
export function isRealSenseRgbLabel(label?: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  const hasBrand = l.includes("realsense") || l.includes("455") || l.includes("d455");
  const hasRgb = l.includes("rgb");
  const isDepthOnly = l.includes("depth") && !l.includes("rgb");
  return (hasBrand && hasRgb && !isDepthOnly) || label.includes("455f RGB");
}

/**
 * Detect whether a device label corresponds to the Intel RealSense Depth stream.
 * Requirement 16 & 17: Do not connect to RealSense Depth stream yet; Phase 5 is RGB only.
 */
export function isRealSenseDepthLabel(label?: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  const hasBrand = l.includes("realsense") || l.includes("455") || l.includes("d455");
  const hasDepth = l.includes("depth");
  const hasRgb = l.includes("rgb");
  return hasBrand && hasDepth && !hasRgb;
}

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isRunning = false;
  private currentDeviceId: string | null = null;
  private currentDeviceLabel: string | null = null;

  constructor() {
    // Listen for hardware plug/unplug events to refresh devices
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", () => {
        console.log("[CameraService] Hardware devicechange event detected on navigator.mediaDevices");
      });
    }
  }

  /**
   * Enumerate available video input devices (webcams)
   * Requirement 2: Use navigator.mediaDevices.enumerateDevices()
   * Requirement 3: Log the complete video input device list during development
   * Requirement 16: Exclude Depth-only stream from RGB camera selection
   */
  public async getAvailableCameras(requestPermissionIfNeeded = false): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      console.warn("[CameraService] navigator.mediaDevices.enumerateDevices is not supported in this environment.");
      return [];
    }

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter((d) => d.kind === "videoinput");

      // Requirement 3: Log complete video input device list during development
      console.log(`[CameraService] Complete video input device list (${videoDevices.length} devices detected):`);
      videoDevices.forEach((d, index) => {
        const isRgb = isRealSenseRgbLabel(d.label);
        const isDepth = isRealSenseDepthLabel(d.label);
        console.log(
          `  [CameraService Device #${index}] label="${d.label}" | deviceId="${d.deviceId}" | groupId="${d.groupId}"` +
          `${isRgb ? " [REAL_SENSE_RGB_DETECTED]" : ""}${isDepth ? " [REAL_SENSE_DEPTH_DETECTED]" : ""}`
        );
      });

      // If devices have empty labels (browser privacy restriction before initial getUserMedia),
      // and permission was explicitly requested, acquire and immediately release a temporary stream to unlock labels.
      if (requestPermissionIfNeeded && videoDevices.length > 0 && videoDevices.every((d) => !d.label)) {
        try {
          console.log("[CameraService] Device labels are masked. Requesting permissions via temporary getUserMedia to unlock actual labels...");
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          tempStream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          videoDevices = devices.filter((d) => d.kind === "videoinput");
          console.log(`[CameraService] Device list re-enumerated with unlocked labels (${videoDevices.length} devices):`);
          videoDevices.forEach((d, index) => {
            console.log(`  [CameraService Device #${index}] label="${d.label}" | deviceId="${d.deviceId}"`);
          });
        } catch (permErr) {
          console.warn("[CameraService] Could not unlock device labels via temporary stream:", permErr);
        }
      }

      // Requirement 16 & 17: Exclude RealSense Depth-only stream from standard RGB camera listing
      const rgbVideoDevices = videoDevices.filter((d) => !isRealSenseDepthLabel(d.label));

      return rgbVideoDevices;
    } catch (err) {
      console.warn("[CameraService] Failed to enumerate devices:", err);
      return [];
    }
  }

  /**
   * Request webcam access and attach stream to an HTMLVideoElement.
   * Requirement 7: When RealSense RGB (or any specific camera) is selected, call getUserMedia with:
   *   { video: { deviceId: { exact: selectedDeviceId } } }
   * Requirement 8: Stop previous MediaStream before switching cameras.
   */
  public async startCamera(
    videoElement: HTMLVideoElement,
    deviceId?: string
  ): Promise<{ success: boolean; error?: CameraErrorResult }> {
    // If already running with this video element and same device, return success
    if (
      this.isRunning &&
      this.stream &&
      this.videoElement === videoElement &&
      (!deviceId || this.currentDeviceId === deviceId)
    ) {
      return { success: true };
    }

    // Requirement 8: Stop the previous MediaStream tracks before opening a new stream
    this.stopCameraTracks();

    // Check mediaDevices support
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return {
        success: false,
        error: {
          status: "unavailable",
          message: "Webcam API is not supported by this browser environment.",
        },
      };
    }

    try {
      // Requirement 7: When deviceId is provided, use { video: { deviceId: { exact: selectedDeviceId } } }
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: "user" };

      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: false, // Medical privacy: do NOT request microphone access
      };

      console.log("[CameraService] Calling getUserMedia with constraints:", JSON.stringify(constraints));

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: unknown) {
        const e = err as { name?: string };
        // Fallback: If exact deviceId constraint triggered OverconstrainedError, retry with ideal constraint
        if (e.name === "OverconstrainedError" && deviceId) {
          console.warn("[CameraService] OverconstrainedError with exact deviceId. Retrying with ideal deviceId constraint...");
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { ideal: deviceId } },
            audio: false,
          });
        } else {
          throw err;
        }
      }

      this.stream = stream;
      this.videoElement = videoElement;

      // Extract active track metadata (label and deviceId)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        this.currentDeviceId = settings.deviceId || deviceId || null;
        this.currentDeviceLabel = videoTrack.label || null;
        console.log(
          `[CameraService] Stream connected successfully: label="${videoTrack.label}", deviceId="${this.currentDeviceId}", resolution=${settings.width}x${settings.height}, fps=${settings.frameRate}`
        );
      }

      // Attach stream to video element
      videoElement.srcObject = stream;
      videoElement.setAttribute("playsinline", "true");
      videoElement.muted = true;

      // Wait for video metadata to load so dimensions are available (safeguard 3s timeout)
      await new Promise<void>((resolve) => {
        if (videoElement.readyState >= 2) {
          resolve();
        } else {
          let done = false;
          const onLoaded = () => {
            if (!done) {
              done = true;
              videoElement.removeEventListener("loadedmetadata", onLoaded);
              resolve();
            }
          };
          videoElement.addEventListener("loadedmetadata", onLoaded);
          setTimeout(() => {
            if (!done) {
              done = true;
              videoElement.removeEventListener("loadedmetadata", onLoaded);
              resolve();
            }
          }, 3000);
        }
      });

      await videoElement.play();
      this.isRunning = true;

      return { success: true };
    } catch (err: unknown) {
      this.stopCameraTracks();

      const error = err as { name?: string; message?: string };
      console.warn("[CameraService] Failed to access camera:", error);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError" ||
        error.name === "SecurityError"
      ) {
        return {
          success: false,
          error: {
            status: "permission-denied",
            message: "Camera access is required for movement tracking.",
          },
        };
      }

      if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        return {
          success: false,
          error: {
            status: "unavailable",
            message: "Selected camera device was not found.",
          },
        };
      }

      if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        return {
          success: false,
          error: {
            status: "error",
            message: "Camera is currently in use by another application.",
          },
        };
      }

      return {
        success: false,
        error: {
          status: "error",
          message: error.message || "Failed to initialize camera stream.",
        },
      };
    }
  }

  /**
   * Switch to a different camera device without tearing down video element.
   * Requirement 8: Stop previous MediaStream before switching.
   * Requirement 9: Make camera switching reliable without requiring page refresh.
   */
  public async switchCamera(
    videoElement: HTMLVideoElement,
    deviceId: string
  ): Promise<{ success: boolean; error?: CameraErrorResult }> {
    console.log(`[CameraService] Switching camera to deviceId: ${deviceId}`);
    // Explicitly release previous stream tracks first (Requirement 8)
    this.stopCameraTracks();
    return await this.startCamera(videoElement, deviceId);
  }

  /**
   * Stop previous media tracks and detach video element srcObject.
   * Requirement 8: Stop previous MediaStream before switching cameras.
   */
  public stopCameraTracks(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn("[CameraService] Error stopping track:", e);
        }
      });
      this.stream = null;
    }

    if (this.videoElement) {
      try {
        this.videoElement.srcObject = null;
      } catch (e) {
        console.warn("[CameraService] Error clearing video srcObject:", e);
      }
    }

    this.isRunning = false;
  }

  /**
   * Stop camera tracks and release camera hardware completely
   */
  public stopCamera(): void {
    this.stopCameraTracks();
    this.videoElement = null;
    this.currentDeviceId = null;
    this.currentDeviceLabel = null;
  }

  /**
   * Check if camera is currently streaming
   */
  public isActive(): boolean {
    return this.isRunning && this.stream !== null && this.stream.active;
  }

  /**
   * Get current MediaStream
   */
  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Get active video track
   */
  public getVideoTrack(): MediaStreamTrack | null {
    return this.stream ? this.stream.getVideoTracks()[0] || null : null;
  }

  /**
   * Get active video element
   */
  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Get current camera device ID
   */
  public getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }

  /**
   * Get current camera device label
   */
  public getCurrentDeviceLabel(): string | null {
    return this.currentDeviceLabel;
  }

  /**
   * Format current video resolution as string (e.g., "1280 x 720")
   * Requirement 15: Resolution diagnostic
   */
  public getResolutionString(): string {
    const track = this.getVideoTrack();
    if (track) {
      const settings = track.getSettings();
      if (settings.width && settings.height) {
        return `${settings.width} x ${settings.height}`;
      }
    }
    if (this.videoElement && this.videoElement.videoWidth && this.videoElement.videoHeight) {
      return `${this.videoElement.videoWidth} x ${this.videoElement.videoHeight}`;
    }
    return "--";
  }
}
