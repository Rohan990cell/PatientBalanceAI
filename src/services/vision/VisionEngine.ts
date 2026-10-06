import {
  FilesetResolver,
  PoseLandmarker,
  FaceLandmarker,
  PoseLandmarkerResult,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  VisionState,
  INITIAL_VISION_STATE,
  BodyPoseLandmarks,
  NormalizedLandmark,
  CameraDeviceInfo,
  ArmReachMetrics,
  SingleLegStanceMetrics,
  KneeFlexionMetrics,
  PostureLeanDirection,
} from "../../types/vision";
import { BlinkDetector } from "./BlinkDetector";
import { CameraService, isRealSenseRgbLabel } from "./CameraService";

/**
 * VisionEngine
 *
 * Central computer vision orchestrator for PatientBalanceAI.
 * Manages webcam streams, MediaPipe PoseLandmarker and FaceLandmarker models,
 * computes mathematical Eye Aspect Ratio (EAR), biomechanical angles (knee flexion,
 * shoulder tilt, single-leg stance, arm reach), and renders real-time canvas overlays.
 */
export class VisionEngine {
  private cameraService: CameraService;
  private blinkDetector: BlinkDetector;

  private poseLandmarker: PoseLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private isModelsLoaded = false;
  private isInitializingModels = false;

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private displayCanvasElement: HTMLCanvasElement | null = null;

  private animFrameId: number | null = null;
  private isProcessingLoopActive = false;
  private isProcessingFrame = false;
  private lastTimestamp = 0;

  // FPS calculation
  private frameCount = 0;
  private lastFpsUpdateTime = 0;
  private currentFps = 0;

  // Biomechanical state tracking
  private singleLegHoldStartTime: number | null = null;
  private lastLiftedLeg: "LEFT" | "RIGHT" | "NONE" = "NONE";

  // Overlay & Display configuration
  public showSkeletonOverlay = true;
  private isMirrored = true;

  // State callback
  private stateListener: ((state: VisionState) => void) | null = null;
  private currentState: VisionState = { ...INITIAL_VISION_STATE };

  constructor() {
    this.cameraService = new CameraService();
    this.blinkDetector = new BlinkDetector();
  }

  /**
   * Register a listener for real-time vision state updates
   */
  public onStateUpdate(listener: (state: VisionState) => void): void {
    this.stateListener = listener;
    listener(this.currentState);
  }

  /**
   * Internal helper to update and broadcast vision state
   */
  private updateState(partial: Partial<VisionState>): void {
    this.currentState = {
      ...this.currentState,
      ...partial,
    };
    if (this.stateListener) {
      this.stateListener(this.currentState);
    }
  }

  /**
   * Query available camera hardware devices
   * Requirement 2: Use navigator.mediaDevices.enumerateDevices()
   * Requirement 3: Log complete video input device list during development
   * Requirement 5: Detect Intel RealSense RGB camera by its actual device label
   */
  public async enumerateCameras(requestPermission = false): Promise<CameraDeviceInfo[]> {
    const rawDevices = await this.cameraService.getAvailableCameras(requestPermission);
    const mapped: CameraDeviceInfo[] = rawDevices.map((d, index) => {
      const isRealSense = isRealSenseRgbLabel(d.label);
      return {
        deviceId: d.deviceId,
        label: d.label || (isRealSense ? "Intel(R) RealSense(TM) Depth Camera 455f RGB" : `Camera ${index + 1}`),
        groupId: d.groupId,
        isRealSenseRgb: isRealSense,
      };
    });

    const realSenseDev = mapped.find((d) => d.isRealSenseRgb);
    const isRealSenseAvailable = !!realSenseDev;

    // Preserve valid selection, prioritize RealSense RGB if no previous user selection,
    // otherwise fallback to first available camera.
    let selectedId = this.currentState.selectedCameraId;
    if (selectedId && !mapped.some((c) => c.deviceId === selectedId)) {
      selectedId = null;
    }
    if (!selectedId) {
      selectedId = realSenseDev ? realSenseDev.deviceId : (mapped[0]?.deviceId ?? null);
    }

    const currentDev = mapped.find((c) => c.deviceId === selectedId);

    this.updateState({
      availableCameras: mapped,
      isRealSenseAvailable,
      selectedCameraId: selectedId,
      activeCameraLabel: this.cameraService.getCurrentDeviceLabel() || currentDev?.label || null,
      activeResolution: this.cameraService.getResolutionString(),
    });

    return mapped;
  }

  /**
   * Load MediaPipe Pose and Face Landmarker models.
   * Uses local assets first (offline capable), falls back to Google/jsdelivr CDN if needed.
   */
  public async initializeModels(): Promise<boolean> {
    if (this.isModelsLoaded) return true;
    if (this.isInitializingModels) return false;

    this.isInitializingModels = true;
    this.updateState({
      cameraStatus: "starting",
      modelLoadingMessage: "Initializing Computer Vision Engine...",
    });

    try {
      // 1. Resolve WASM files (try local public/wasm first, fallback to CDN)
      let visionFileset;
      try {
        visionFileset = await FilesetResolver.forVisionTasks("./wasm");
      } catch (e) {
        console.warn("Local WASM load fallback to CDN:", e);
        visionFileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
      }

      this.updateState({
        modelLoadingMessage: "Loading Pose Landmark & Biomechanical Model...",
      });

      // 2. Initialize Pose Landmarker
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath: "./models/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (poseErr) {
        console.warn("Local Pose model failed, falling back to Google CDN:", poseErr);
        this.poseLandmarker = await PoseLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }

      this.updateState({
        modelLoadingMessage: "Loading Face Mesh & Mathematical EAR Engine...",
      });

      // 3. Initialize Face Landmarker (with blendshapes for eye open/closed tracking)
      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath: "./models/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (faceErr) {
        console.warn("Local Face model failed, falling back to Google CDN:", faceErr);
        this.faceLandmarker = await FaceLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }

      this.isModelsLoaded = true;
      this.isInitializingModels = false;
      this.updateState({
        modelsLoaded: true,
        modelLoadingMessage: "Vision Engine ready",
      });

      return true;
    } catch (err: unknown) {
      this.isInitializingModels = false;
      const errorMsg = (err as Error)?.message || "Failed to load MediaPipe models.";
      console.error("VisionEngine: Model initialization error:", err);
      this.updateState({
        cameraStatus: "error",
        errorMessage: `Vision Model Error: ${errorMsg}`,
        modelLoadingMessage: "",
      });
      return false;
    }
  }

  /**
   * Start camera and computer vision processing
   * Requirement 7: When RealSense RGB is selected, call getUserMedia with selected deviceId:
   *   { video: { deviceId: { exact: selectedDeviceId } } }
   * Requirement 14: If RealSense RGB is unavailable through browser, do NOT silently substitute Lenovo Virtual Camera.
   *   Instead display: "Intel RealSense RGB camera is not available to the browser."
   */
  public async start(
    videoEl?: HTMLVideoElement | null,
    canvasEl?: HTMLCanvasElement | null,
    deviceId?: string
  ): Promise<boolean> {
    if (videoEl) this.videoElement = videoEl;
    if (canvasEl) this.canvasElement = canvasEl;

    if (!this.videoElement) {
      console.warn("[VisionEngine] start called without videoElement");
      return false;
    }

    // Determine target device
    const targetDeviceId = deviceId || this.currentState.selectedCameraId || undefined;
    const targetDev = this.currentState.availableCameras.find((c) => c.deviceId === targetDeviceId);
    const isTargetingRealSense =
      deviceId === "realsense-rgb" ||
      (targetDev ? targetDev.isRealSenseRgb : false);

    // Requirement 14: If RealSense RGB was requested but is not available in browser, do NOT silently substitute
    if (isTargetingRealSense && (!this.currentState.isRealSenseAvailable || !targetDeviceId)) {
      console.warn("[VisionEngine] RealSense RGB camera requested but unavailable to the browser.");
      this.updateState({
        cameraStatus: "unavailable",
        errorMessage: "Intel RealSense RGB camera is not available to the browser.",
        activeCameraLabel: "Intel(R) RealSense(TM) Depth Camera 455f RGB (Unavailable)",
        activeResolution: "--",
      });
      return false;
    }

    this.updateState({
      cameraStatus: "starting",
      errorMessage: null,
    });

    // 1. Start camera hardware stream with target deviceId (Requirement 7)
    const camResult = await this.cameraService.startCamera(this.videoElement, targetDeviceId);
    if (!camResult.success && camResult.error) {
      this.updateState({
        cameraStatus: camResult.error.status,
        errorMessage: camResult.error.message,
        activeResolution: "--",
      });
      return false;
    }

    // Refresh devices list now that camera permissions have been granted
    await this.enumerateCameras();

    // 2. Load models if not loaded yet
    if (!this.isModelsLoaded) {
      const modelsOk = await this.initializeModels();
      if (!modelsOk) {
        return false;
      }
    }

    // 3. Reset detectors & timers
    this.blinkDetector.reset();
    this.lastTimestamp = 0;
    this.frameCount = 0;
    this.lastFpsUpdateTime = performance.now();
    this.singleLegHoldStartTime = null;
    this.lastLiftedLeg = "NONE";

    const activeId = this.cameraService.getCurrentDeviceId() || targetDeviceId || null;
    const activeDev = this.currentState.availableCameras.find((c) => c.deviceId === activeId);
    const activeLabel = this.cameraService.getCurrentDeviceLabel() || activeDev?.label || "Connected Camera";
    const resStr = this.cameraService.getResolutionString();

    this.updateState({
      cameraStatus: "connected",
      errorMessage: null,
      selectedCameraId: activeId,
      activeCameraLabel: activeLabel,
      activeResolution: resStr,
    });

    // 4. Start requestAnimationFrame processing loop
    this.isProcessingLoopActive = true;
    this.startProcessingLoop();

    return true;
  }

  /**
   * Switch to a different camera device without requiring a page refresh.
   * Requirement 8: Stop previous MediaStream before switching.
   * Requirement 9: Make camera switching reliable without requiring page refresh.
   * Requirement 10: Preserve existing MediaPipe processing pipeline.
   * Requirement 14: If RealSense RGB is unavailable, do NOT silently fall back.
   */
  public async switchCamera(deviceId: string): Promise<boolean> {
    if (!this.videoElement || !this.canvasElement) {
      this.updateState({ selectedCameraId: deviceId });
      return true;
    }

    const targetDev = this.currentState.availableCameras.find((c) => c.deviceId === deviceId);
    const isTargetingRealSense = deviceId === "realsense-rgb" || (targetDev ? targetDev.isRealSenseRgb : false);

    // Requirement 14: If RealSense RGB is unavailable, do NOT substitute silently
    if (isTargetingRealSense && (!this.currentState.isRealSenseAvailable || !deviceId)) {
      this.updateState({
        cameraStatus: "unavailable",
        errorMessage: "Intel RealSense RGB camera is not available to the browser.",
        activeCameraLabel: "Intel(R) RealSense(TM) Depth Camera 455f RGB (Unavailable)",
        activeResolution: "--",
      });
      return false;
    }

    this.updateState({
      cameraStatus: "starting",
      errorMessage: null,
    });

    // Reset MediaPipe timestamp tracker so monotonic sequence starts fresh
    this.lastTimestamp = 0;

    const ok = await this.cameraService.switchCamera(this.videoElement, deviceId);
    if (!ok) {
      this.updateState({
        cameraStatus: "error",
        errorMessage: "Failed to switch camera stream.",
      });
      return false;
    }

    const activeLabel = this.cameraService.getCurrentDeviceLabel() || targetDev?.label || "Connected Camera";
    const resStr = this.cameraService.getResolutionString();

    this.updateState({
      cameraStatus: "connected",
      selectedCameraId: deviceId,
      activeCameraLabel: activeLabel,
      activeResolution: resStr,
      errorMessage: null,
    });

    return true;
  }

  /**
   * Configure camera horizontal mirroring
   */
  public setMirrored(mirrored: boolean): void {
    this.isMirrored = mirrored;
    this.updateState({ isMirrored: mirrored });
  }

  public getIsMirrored(): boolean {
    return this.isMirrored;
  }

  /**
   * Attach an active display canvas (e.g. from VisionPage or ExercisePage preview)
   */
  public setDisplayCanvas(canvasEl: HTMLCanvasElement | null): void {
    this.displayCanvasElement = canvasEl;
  }

  /**
   * Get active media stream from camera service
   */
  public getMediaStream(): MediaStream | null {
    return this.cameraService.getStream();
  }

  /**
   * Get active video element
   */
  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  /**
   * Configure EAR sensitivity threshold
   */
  public setEarThreshold(threshold: number): void {
    this.blinkDetector.setEarThreshold(threshold);
    this.updateState({
      face: {
        ...this.currentState.face,
        earThreshold: threshold,
      },
    });
  }

  /**
   * Stop camera and freeze vision processing
   */
  public stop(): void {
    this.isProcessingLoopActive = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.cameraService.stopCamera();
    this.blinkDetector.reset();
    this.singleLegHoldStartTime = null;
    this.lastLiftedLeg = "NONE";

    // Clear canvas overlays
    if (this.canvasElement) {
      const ctx = this.canvasElement.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      }
    }
    if (this.displayCanvasElement) {
      const ctx = this.displayCanvasElement.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, this.displayCanvasElement.width, this.displayCanvasElement.height);
      }
    }

    this.videoElement = null;
    this.canvasElement = null;
    this.displayCanvasElement = null;

    this.updateState({
      cameraStatus: "ready",
      errorMessage: null,
      fps: 0,
      activeResolution: "--",
      hasPose: false,
      pose: null,
      face: {
        hasFace: false,
        leftEyeState: "UNKNOWN",
        rightEyeState: "UNKNOWN",
        overallEyeState: "UNKNOWN",
        leftEAR: 0,
        rightEAR: 0,
        averageEAR: 0,
        earThreshold: this.blinkDetector.getEarThreshold(),
        leftEyeScore: 0,
        rightEyeScore: 0,
        faceDetectedCount: 0,
      },
      blink: {
        blinkCount: 0,
        lastBlinkTimestamp: null,
        isCurrentlyBlinking: false,
        lastBlinkDurationMs: null,
        blinkRatePerMinute: 0,
      },
    });
  }

  /**
   * Main requestAnimationFrame processing loop
   */
  private startProcessingLoop(): void {
    const loop = () => {
      if (!this.isProcessingLoopActive) return;

      this.processVideoFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Process a single video frame with MediaPipe Pose and Face landmarkers
   */
  private processVideoFrame(): void {
    if (this.isProcessingFrame) return; // Prevent async queue congestion
    if (!this.videoElement || this.videoElement.readyState < 2) return;
    if (!this.poseLandmarker || !this.faceLandmarker) return;

    this.isProcessingFrame = true;

    try {
      let now = performance.now();
      // Ensure strictly monotonically increasing timestamp for MediaPipe
      if (now <= this.lastTimestamp) {
        now = this.lastTimestamp + 1;
      }
      this.lastTimestamp = now;

      // 1. Calculate FPS
      this.frameCount++;
      if (now - this.lastFpsUpdateTime >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdateTime));
        this.frameCount = 0;
        this.lastFpsUpdateTime = now;
      }

      // 2. Run Pose Landmarker inference
      const poseResult: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(
        this.videoElement,
        now
      );

      // 3. Run Face Landmarker inference (with blendshapes and 468 mesh landmarks)
      const faceResult: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(
        this.videoElement,
        now
      );

      // 4. Normalize Pose Landmarks & Compute Biomechanics
      const normalizedPose = this.extractNormalizedPose(poseResult, now);

      // 5. Compute Mathematical EAR & Extract Eye Blendshapes
      const faceData = this.extractFaceAndEyeData(faceResult, now);

      // 6. Render Canvas Overlay with Medical Aesthetics
      if (this.canvasElement && this.videoElement) {
        this.renderCanvasOverlay(poseResult, faceResult, normalizedPose, faceData);
      }

      // 7. Update vision state
      const blinkState = this.blinkDetector.getState();
      const resStr = (this.currentState.activeResolution && this.currentState.activeResolution !== "--")
        ? this.currentState.activeResolution
        : this.cameraService.getResolutionString();

      this.updateState({
        fps: this.currentFps,
        activeResolution: resStr,
        hasPose: normalizedPose !== null,
        pose: normalizedPose,
        face: {
          hasFace: faceData.hasFace,
          leftEyeState: blinkState.leftState,
          rightEyeState: blinkState.rightState,
          overallEyeState: blinkState.overallState,
          leftEAR: faceData.leftEAR,
          rightEAR: faceData.rightEAR,
          averageEAR: faceData.averageEAR,
          earThreshold: this.blinkDetector.getEarThreshold(),
          leftEyeScore: faceData.leftEyeScore,
          rightEyeScore: faceData.rightEyeScore,
          faceDetectedCount: faceData.faceCount,
        },
        blink: blinkState.blink,
      });
    } catch (err) {
      console.warn("VisionEngine frame processing error:", err);
    } finally {
      this.isProcessingFrame = false;
    }
  }

  /**
   * Calculate 2D Euclidean distance between two landmarks
   */
  private dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Calculate 3-point joint angle in degrees (e.g. Hip -> Knee -> Ankle)
   * Joint b is the vertex of the angle.
   */
  private calculateJointAngle(
    a: NormalizedLandmark | null,
    b: NormalizedLandmark | null,
    c: NormalizedLandmark | null
  ): number {
    if (!a || !b || !c) return 180;
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;

    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 < 0.0001 || mag2 < 0.0001) return 180;

    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.round(Math.acos(cosTheta) * (180 / Math.PI));
  }

  /**
   * Extract decoupled, normalized pose landmarks with clinical biomechanical metrics
   */
  private extractNormalizedPose(
    result: PoseLandmarkerResult,
    now: number
  ): BodyPoseLandmarks | null {
    if (!result.landmarks || result.landmarks.length === 0) {
      this.singleLegHoldStartTime = null;
      this.lastLiftedLeg = "NONE";
      return null;
    }

    const lm = result.landmarks[0];
    if (!lm || lm.length < 33) return null;

    const toNorm = (idx: number): NormalizedLandmark | null => {
      const p = lm[idx];
      if (!p) return null;
      return {
        x: p.x,
        y: p.y,
        z: p.z,
        visibility: p.visibility ?? 1.0,
      };
    };

    const nose = toNorm(0);
    const leftShoulder = toNorm(11);
    const rightShoulder = toNorm(12);
    const leftElbow = toNorm(13);
    const rightElbow = toNorm(14);
    const leftWrist = toNorm(15);
    const rightWrist = toNorm(16);
    const leftHip = toNorm(23);
    const rightHip = toNorm(24);
    const leftKnee = toNorm(25);
    const rightKnee = toNorm(26);
    const leftAnkle = toNorm(27);
    const rightAnkle = toNorm(28);

    // 1. Coronal alignment: Shoulder tilt angle (normalized: 0° = horizontal neutral)
    // Left shoulder is on image right (larger x), right shoulder is on image left (smaller x)
    // Positive angle = lean right (right shoulder drops), Negative angle = lean left (left shoulder drops)
    let shoulderTiltDeg = 0;
    if (leftShoulder && rightShoulder) {
      const shoulderDx = Math.abs(leftShoulder.x - rightShoulder.x);
      const shoulderDy = rightShoulder.y - leftShoulder.y;
      shoulderTiltDeg = Math.round(Math.atan2(shoulderDy, Math.max(0.001, shoulderDx)) * (180 / Math.PI));
    }

    // 2. Pelvic alignment: Hip tilt angle (normalized: 0° = horizontal neutral)
    // Positive angle = lean right (right hip drops), Negative angle = lean left (left hip drops)
    let hipTiltDeg = 0;
    if (leftHip && rightHip) {
      const hipDx = Math.abs(leftHip.x - rightHip.x);
      const hipDy = rightHip.y - leftHip.y;
      hipTiltDeg = Math.round(Math.atan2(hipDy, Math.max(0.001, hipDx)) * (180 / Math.PI));
    }

    // 3. Head coronal tilt relative to shoulders (normalized: 0° = vertical upright)
    // Positive angle = tilt right, Negative angle = tilt left
    let headTiltDeg = 0;
    if (nose && leftShoulder && rightShoulder) {
      const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const headDx = midShoulderX - nose.x;
      const headDy = midShoulderY - nose.y; // Positive upward
      headTiltDeg = Math.round(Math.atan2(headDx, Math.max(0.001, headDy)) * (180 / Math.PI));
    }

    // 4. Sagittal anteroposterior tilt: Trunk Pitch (normalized: 0° = vertical upright)
    // In MediaPipe: negative z is closer to camera.
    // Positive angle = lean forward (shoulders closer to camera), Negative angle = lean backward
    let trunkPitchDeg = 0;
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const midShoulderZ = (leftShoulder.z + rightShoulder.z) / 2;
      const midHipY = (leftHip.y + rightHip.y) / 2;
      const midHipZ = (leftHip.z + rightHip.z) / 2;
      const torsoDy = midHipY - midShoulderY; // Positive (distance down torso)
      const torsoDz = midHipZ - midShoulderZ; // Positive when shoulders are anterior to hips
      trunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoDy)) * (180 / Math.PI));
    }

    // 5. Torso lateral offset from frame center
    let torsoLateralOffset = 0;
    if (leftShoulder && rightShoulder) {
      const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      torsoLateralOffset = Number((midShoulderX - 0.5).toFixed(3));
    }

    // 5. Arm reach metrics (Functional Reach Test validation)
    const shoulderBreadth =
      leftShoulder && rightShoulder ? this.dist2D(leftShoulder, rightShoulder) : 0.25;
    const leftReachDist =
      leftShoulder && leftWrist ? this.dist2D(leftShoulder, leftWrist) : 0;
    const rightReachDist =
      rightShoulder && rightWrist ? this.dist2D(rightShoulder, rightWrist) : 0;
    const maxReach = Math.max(leftReachDist, rightReachDist);
    const maxReachRatio = Number((maxReach / Math.max(0.1, shoulderBreadth)).toFixed(2));
    const isReachingForward =
      maxReachRatio > 1.35 ||
      (leftWrist && leftShoulder && leftWrist.y < leftShoulder.y + 0.05) ||
      (rightWrist && rightShoulder && rightWrist.y < rightShoulder.y + 0.05) ||
      false;

    const armReach: ArmReachMetrics = {
      leftReachDistance: Number(leftReachDist.toFixed(3)),
      rightReachDistance: Number(rightReachDist.toFixed(3)),
      maxReachRatio,
      isReachingForward,
    };

    // 6. Single-leg stance metrics (Unipedal Balance validation)
    let isSingleLeg = false;
    let liftedLeg: "LEFT" | "RIGHT" | "NONE" = "NONE";
    let elevationRatio = 0;

    if (leftAnkle && rightAnkle && (leftAnkle.visibility ?? 1) > 0.4 && (rightAnkle.visibility ?? 1) > 0.4) {
      // In normalized image coords, smaller y = higher position (further from ground)
      const ankleDeltaY = rightAnkle.y - leftAnkle.y;
      const torsoLength =
        leftShoulder && leftHip ? this.dist2D(leftShoulder, leftHip) : 0.35;

      // Threshold: > 4.5% vertical offset indicates foot lifted off ground
      if (ankleDeltaY > 0.045) {
        // Left ankle is significantly higher than right ankle -> Left leg is lifted
        isSingleLeg = true;
        liftedLeg = "LEFT";
        elevationRatio = Number((ankleDeltaY / torsoLength).toFixed(2));
      } else if (ankleDeltaY < -0.045) {
        // Right ankle is higher than left ankle -> Right leg is lifted
        isSingleLeg = true;
        liftedLeg = "RIGHT";
        elevationRatio = Number((-ankleDeltaY / torsoLength).toFixed(2));
      }
    }

    // Maintain single-leg hold duration timer
    let holdDurationSeconds = 0;
    if (isSingleLeg) {
      if (this.lastLiftedLeg !== liftedLeg || this.singleLegHoldStartTime === null) {
        this.singleLegHoldStartTime = now;
      }
      this.lastLiftedLeg = liftedLeg;
      holdDurationSeconds = Number(((now - this.singleLegHoldStartTime) / 1000).toFixed(1));
    } else {
      this.singleLegHoldStartTime = null;
      this.lastLiftedLeg = "NONE";
    }

    const singleLeg: SingleLegStanceMetrics = {
      isSingleLeg,
      liftedLeg,
      elevationRatio,
      holdDurationSeconds,
    };

    // 7. Knee flexion metrics (Squat / Crouch / Postural Bend)
    const leftKneeAngle = this.calculateJointAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = this.calculateJointAngle(rightHip, rightKnee, rightAnkle);
    const isSquatting = leftKneeAngle < 145 && rightKneeAngle < 145;

    const kneeFlexion: KneeFlexionMetrics = {
      leftKneeAngleDeg: leftKneeAngle,
      rightKneeAngleDeg: rightKneeAngle,
      isSquatting,
    };

    // 8. Overall Posture Lean Direction Classification
    let postureLean: PostureLeanDirection = "NEUTRAL";
    const absShoulderTilt = Math.abs(shoulderTiltDeg);
    const absPitch = Math.abs(trunkPitchDeg);

    if (absShoulderTilt >= 5 && absShoulderTilt >= absPitch) {
      postureLean = shoulderTiltDeg > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
    } else if (absPitch >= 6) {
      postureLean = trunkPitchDeg > 0 ? "LEAN_FORWARD" : "LEAN_BACKWARD";
    } else if (Math.abs(torsoLateralOffset) > 0.06) {
      postureLean = torsoLateralOffset > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
    } else {
      postureLean = "NEUTRAL";
    }

    return {
      nose,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
      leftWrist,
      rightWrist,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      allRawLandmarks: lm.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        visibility: p.visibility ?? 1.0,
      })),
      shoulderTiltDeg,
      hipTiltDeg,
      headTiltDeg,
      trunkPitchDeg,
      torsoLateralOffset,
      postureLean,
      isStandingFacingCamera:
        (leftShoulder?.visibility ?? 0) > 0.5 && (rightShoulder?.visibility ?? 0) > 0.5,
      armReach,
      singleLeg,
      kneeFlexion,
    };
  }

  /**
   * Compute Eye Aspect Ratio (EAR) using canonical 6-point eye landmarks:
   * EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
   */
  private computeCanonicalEAR(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
    p5: { x: number; y: number },
    p6: { x: number; y: number }
  ): number {
    const horizontal = this.dist2D(p1, p4);
    if (horizontal <= 0.0001) return 0;

    const vertical1 = this.dist2D(p2, p6);
    const vertical2 = this.dist2D(p3, p5);

    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    return Number(ear.toFixed(3));
  }

  /**
   * Extract mathematical EAR and blendshape data from face landmarks
   */
  private extractFaceAndEyeData(
    result: FaceLandmarkerResult,
    now: number
  ): {
    hasFace: boolean;
    leftEAR: number;
    rightEAR: number;
    averageEAR: number;
    leftEyeScore: number;
    rightEyeScore: number;
    faceCount: number;
  } {
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      // No face detected in frame
      this.blinkDetector.processFrame(null, null, null, null, now);
      return {
        hasFace: false,
        leftEAR: 0,
        rightEAR: 0,
        averageEAR: 0,
        leftEyeScore: 0,
        rightEyeScore: 0,
        faceCount: 0,
      };
    }

    const landmarks = result.faceLandmarks[0];

    // Canonical MediaPipe Face Mesh Eye Landmark Indices:
    // Left Eye: 33 (p1), 160 (p2), 158 (p3), 133 (p4), 153 (p5), 144 (p6)
    // Right Eye: 362 (p1), 385 (p2), 387 (p3), 263 (p4), 373 (p5), 380 (p6)
    let leftEAR = 0;
    let rightEAR = 0;

    if (
      landmarks[33] &&
      landmarks[160] &&
      landmarks[158] &&
      landmarks[133] &&
      landmarks[153] &&
      landmarks[144]
    ) {
      leftEAR = this.computeCanonicalEAR(
        landmarks[33],
        landmarks[160],
        landmarks[158],
        landmarks[133],
        landmarks[153],
        landmarks[144]
      );
    }

    if (
      landmarks[362] &&
      landmarks[385] &&
      landmarks[387] &&
      landmarks[263] &&
      landmarks[373] &&
      landmarks[380]
    ) {
      rightEAR = this.computeCanonicalEAR(
        landmarks[362],
        landmarks[385],
        landmarks[387],
        landmarks[263],
        landmarks[373],
        landmarks[380]
      );
    }

    const averageEAR = Number(((leftEAR + rightEAR) / 2).toFixed(3));

    // Also extract neural blendshape probabilities if present
    let leftBlinkScore = 0;
    let rightBlinkScore = 0;

    if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
      const blendshapes = result.faceBlendshapes[0].categories;
      for (const cat of blendshapes) {
        if (cat.categoryName === "eyeBlinkLeft") {
          leftBlinkScore = cat.score;
        } else if (cat.categoryName === "eyeBlinkRight") {
          rightBlinkScore = cat.score;
        }
      }
    }

    // Feed both EAR geometry and continuous closure scores into temporal blink detector
    this.blinkDetector.processFrame(leftBlinkScore, rightBlinkScore, leftEAR, rightEAR, now);

    return {
      hasFace: true,
      leftEAR,
      rightEAR,
      averageEAR,
      leftEyeScore: Number(leftBlinkScore.toFixed(3)),
      rightEyeScore: Number(rightBlinkScore.toFixed(3)),
      faceCount: result.faceLandmarks.length,
    };
  }

  /**
   * Draw medical aesthetic skeleton and landmark overlay on preview canvas
   */
  private renderCanvasOverlay(
    poseResult: PoseLandmarkerResult,
    faceResult: FaceLandmarkerResult,
    pose: BodyPoseLandmarks | null,
    face: { leftEAR: number; rightEAR: number; hasFace: boolean }
  ): void {
    if (this.canvasElement) {
      this.drawOverlayOnTarget(this.canvasElement, poseResult, faceResult, pose, face);
    }
    if (this.displayCanvasElement && this.displayCanvasElement !== this.canvasElement) {
      this.drawOverlayOnTarget(this.displayCanvasElement, poseResult, faceResult, pose, face);
    }
  }

  private drawOverlayOnTarget(
    canvas: HTMLCanvasElement,
    poseResult: PoseLandmarkerResult,
    faceResult: FaceLandmarkerResult,
    pose: BodyPoseLandmarks | null,
    face: { leftEAR: number; rightEAR: number; hasFace: boolean }
  ): void {
    const video = this.videoElement;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas buffer dimensions to video stream
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.showSkeletonOverlay) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Draw Body Pose Skeleton
    if (poseResult.landmarks && poseResult.landmarks.length > 0 && pose) {
      const lm = poseResult.landmarks[0];

      // Connections pairs: [fromIdx, toIdx]
      const connections: [number, number][] = [
        // Shoulders
        [11, 12],
        // Left arm
        [11, 13],
        [13, 15],
        // Right arm
        [12, 14],
        [14, 16],
        // Torso
        [11, 23],
        [12, 24],
        [23, 24],
        // Left leg
        [23, 25],
        [25, 27],
        // Right leg
        [24, 26],
        [26, 28],
      ];

      // Dynamic color coding based on posture alignment:
      // Teal if aligned, amber if coronal or sagittal tilt exceeds clinical thresholds
      const isImbalanced = pose.postureLean !== "NEUTRAL";
      const strokeColor = isImbalanced ? "rgba(245, 158, 11, 0.9)" : "rgba(13, 148, 136, 0.88)";

      // Draw connection lines
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = strokeColor;

      for (const [from, to] of connections) {
        const p1 = lm[from];
        const p2 = lm[to];
        if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
          ctx.beginPath();
          ctx.moveTo(p1.x * w, p1.y * h);
          ctx.lineTo(p2.x * w, p2.y * h);
          ctx.stroke();
        }
      }

      // Draw vertical coronal gravity midline from nose to mid-hip
      if (pose.nose && pose.leftHip && pose.rightHip) {
        const midHipX = ((pose.leftHip.x + pose.rightHip.x) / 2) * w;
        const midHipY = ((pose.leftHip.y + pose.rightHip.y) / 2) * h;
        const noseX = pose.nose.x * w;
        const noseY = pose.nose.y * h;

        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(noseX, noseY);
        ctx.lineTo(midHipX, midHipY);
        ctx.stroke();
        ctx.restore();
      }

      // Draw joints (circles with inner fill)
      const keyJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      for (const idx of keyJoints) {
        const p = lm[idx];
        if (p && (p.visibility ?? 1) > 0.4) {
          const cx = p.x * w;
          const cy = p.y * h;

          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.strokeStyle = isImbalanced ? "#D97706" : "#0D9488";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fillStyle = isImbalanced ? "#F59E0B" : "#14B8A6";
          ctx.fill();
        }
      }

      // Highlight single-leg stance: glowing badge around the lifted leg ankle
      if (pose.singleLeg.isSingleLeg) {
        const liftedAnkle =
          pose.singleLeg.liftedLeg === "LEFT" ? pose.leftAnkle : pose.rightAnkle;
        if (liftedAnkle) {
          const lx = liftedAnkle.x * w;
          const ly = liftedAnkle.y * h;

          ctx.save();
          ctx.beginPath();
          ctx.arc(lx, ly, 14, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(20, 184, 166, 0.9)";
          ctx.lineWidth = 3;
          ctx.stroke();

          // Text label
          ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
          ctx.fillStyle = "#14B8A6";
          const label = `Lifted (${pose.singleLeg.holdDurationSeconds}s)`;
          ctx.fillText(label, lx - 25, ly - 18);
          ctx.restore();
        }
      }

      // Knee angle display annotations
      if (pose.leftKnee && (pose.leftKnee.visibility ?? 1) > 0.5) {
        ctx.font = "600 10px monospace";
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillText(`${pose.kneeFlexion.leftKneeAngleDeg}°`, pose.leftKnee.x * w + 10, pose.leftKnee.y * h);
      }
      if (pose.rightKnee && (pose.rightKnee.visibility ?? 1) > 0.5) {
        ctx.font = "600 10px monospace";
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillText(`${pose.kneeFlexion.rightKneeAngleDeg}°`, pose.rightKnee.x * w - 35, pose.rightKnee.y * h);
      }
    }

    // 2. Draw Subtle Eye EAR Contours if Face Detected
    if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0 && face.hasFace) {
      const fl = faceResult.faceLandmarks[0];

      // Draw Left Eye 6-point contour: [33, 160, 158, 133, 153, 144]
      const leftEyeIndices = [33, 160, 158, 133, 153, 144];
      const rightEyeIndices = [362, 385, 387, 263, 373, 380];

      const drawEyeContour = (indices: number[], earVal: number) => {
        ctx.save();
        ctx.beginPath();
        const firstPt = fl[indices[0]];
        if (!firstPt) return;

        ctx.moveTo(firstPt.x * w, firstPt.y * h);
        for (let i = 1; i < indices.length; i++) {
          const pt = fl[indices[i]];
          if (pt) ctx.lineTo(pt.x * w, pt.y * h);
        }
        ctx.closePath();

        const isOpen = earVal >= this.blinkDetector.getEarThreshold();
        ctx.strokeStyle = isOpen ? "rgba(16, 185, 129, 0.9)" : "rgba(239, 68, 68, 0.9)";
        ctx.fillStyle = isOpen ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.3)";
        ctx.lineWidth = 1.8;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      drawEyeContour(leftEyeIndices, face.leftEAR);
      drawEyeContour(rightEyeIndices, face.rightEAR);
    }
  }

  /**
   * Reset blink counter manually
   */
  public resetBlinkCounter(): void {
    this.blinkDetector.reset();
    const blinkState = this.blinkDetector.getState();
    this.updateState({
      blink: blinkState.blink,
    });
  }

  /**
   * Clean up all MediaPipe resources and camera hardware
   */
  public dispose(): void {
    this.stop();
    if (this.poseLandmarker) {
      try {
        this.poseLandmarker.close();
      } catch {
        // Ignore close error
      }
      this.poseLandmarker = null;
    }
    if (this.faceLandmarker) {
      try {
        this.faceLandmarker.close();
      } catch {
        // Ignore close error
      }
      this.faceLandmarker = null;
    }
    this.isModelsLoaded = false;
  }
}

// Export singleton instance for app-wide access
export const visionEngine = new VisionEngine();
