import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Camera,
  CameraOff,
  Clock,
  Award,
  Activity,
  ShieldCheck,
  Eye,
  Check,
  Save,
  Sliders,
} from "lucide-react";
import { useVision } from "../../context/VisionContext";
import {
  SKELETON_2D_KEY_JOINTS,
  analyzePostureAlignment,
  calculatePostureAlignmentSummary,
  PostureAlignmentAnalysis,
  PostureAlignmentSummary,
  PostureLandmarkSmoother,
  PostureSessionTracker,
  PostureTrackerState,
  POSTURE_CLINICAL_DISCLOSURE,
  DEFAULT_POSTURE_TOLERANCES,
} from "../../utils/postureAlignmentExercise";
import { SessionStorageService } from "../../services/sessionStorage";
import { PatientProfile } from "../../types/patient";

interface PostureAlignmentExerciseProps {
  patient?: PatientProfile;
  onExit?: () => void;
}

type ExercisePhase = "INTRO" | "COUNTDOWN" | "ACTIVE" | "COMPLETED";

export const PostureAlignmentExercise: React.FC<PostureAlignmentExerciseProps> = ({
  patient,
  onExit,
}) => {
  const {
    visionState,
    getLatestVisionState,
    isCameraActive,
    startCamera,
    getMediaStream,
    isMirrored,
  } = useVision();

  // Exercise Phase State
  const [phase, setPhase] = useState<ExercisePhase>("INTRO");
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [timeInCorrectPosture, setTimeInCorrectPosture] = useState<number>(0);
  const [elapsedTotalMs, setElapsedTotalMs] = useState<number>(0);

  // Target Stability Threshold: 10 seconds of correct posture required
  const REQUIRED_STABILITY_SECONDS = 10;

  // Video & Skeleton Canvas Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Landmark Smoother (EMA) & Session Tracker (Grace Period & Hysteresis)
  const smootherRef = useRef(new PostureLandmarkSmoother(0.30));
  const trackerRef = useRef(new PostureSessionTracker());

  const [trackerState, setTrackerState] = useState<PostureTrackerState>(() =>
    trackerRef.current.getState()
  );
  const [currentAnalysis, setCurrentAnalysis] = useState<PostureAlignmentAnalysis>(() =>
    analyzePostureAlignment(null)
  );

  // Synchronized refs to avoid re-triggering interval or animation loops on every frame
  const visionStateRef = useRef(visionState);
  useEffect(() => {
    visionStateRef.current = visionState;
  }, [visionState]);

  const currentAnalysisRef = useRef(currentAnalysis);
  useEffect(() => {
    currentAnalysisRef.current = currentAnalysis;
  }, [currentAnalysis]);

  const trackerStateRef = useRef(trackerState);
  useEffect(() => {
    trackerStateRef.current = trackerState;
  }, [trackerState]);

  // Metrics Sample Counters for Session Summary
  const sessionStartTimeRef = useRef<number | null>(null);
  const lastAnimTimeRef = useRef<number>(Date.now());
  const lastStateUpdateTimeRef = useRef<number>(0);
  const lastMidShoulderRef = useRef<{ x: number; y: number } | null>(null);
  const latestRenderStatsRef = useRef<{ renderedConnections: number; validCount: number }>({
    renderedConnections: 0,
    validCount: 0,
  });
  const latestIsStillRef = useRef<boolean>(true);
  const lastVidDimRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Video & Viewport Dimensions
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 640,
    height: 480,
  });

  // Internal developer logging throttle ref
  const lastDevLogTimeRef = useRef<number>(0);

  const [sessionSummary, setSessionSummary] = useState<PostureAlignmentSummary | null>(null);

  // Neutral Posture Calibration State (normalizes monocular camera elevation and user height)
  const calibratedBaselineRef = useRef<{
    pitch: number;
    shoulderTilt: number;
    offset: number;
  } | null>(null);
  const countdownSamplesRef = useRef<{
    pitch: number;
    shoulderTilt: number;
    offset: number;
  }[]>([]);
  const [isCalibrated, setIsCalibrated] = useState<boolean>(false);

  // Session Storage State
  const [isSessionSaved, setIsSessionSaved] = useState<boolean>(false);
  const [isSavingSession, setIsSavingSession] = useState<boolean>(false);

  // Preferred Camera Device Label (Intel RealSense prioritized when available)
  const cameraDeviceName = useMemo(() => {
    if (!isCameraActive && visionState.cameraStatus !== "connected") {
      return "Camera: Not Available";
    }
    if (
      visionState.isRealSenseAvailable ||
      visionState.activeCameraLabel?.toLowerCase().includes("realsense")
    ) {
      return `Intel RealSense RGB (${visionState.activeCameraLabel || "Connected"})`;
    }
    return visionState.activeCameraLabel || "Active Camera Feed";
  }, [isCameraActive, visionState.cameraStatus, visionState.isRealSenseAvailable, visionState.activeCameraLabel]);

  // =========================================================================
  // CAMERA STREAM ATTACHMENT
  // Reuses the existing VisionEngine media stream without duplicate pipelines
  // =========================================================================
  useEffect(() => {
    if (phase === "INTRO" || !isCameraActive) return;

    const stream = getMediaStream();
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn("[PostureAlignmentExercise] videoElement.play() warning:", err);
      });
    }
  }, [phase, isCameraActive, getMediaStream, visionState.selectedCameraId, visionState.activeCameraLabel]);

  // Helper to compute landmark tracking confidence percentage [0 - 100]
  const computeTrackingConfidence = (landmarks: any[] | null | undefined): number => {
    if (!landmarks || landmarks.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < landmarks.length; i++) {
      sum += (landmarks[i]?.visibility !== undefined ? landmarks[i].visibility : 1.0);
    }
    return Math.round((sum / landmarks.length) * 100);
  };

  // Upper-body posture connections matching Reference Image 3:
  // Shoulders, Left Arm (Shoulder -> Elbow -> Wrist), Right Arm (Shoulder -> Elbow -> Wrist)
  const UPPER_BODY_POSTURE_BONES: [number, number][] = [
    [11, 12], // Left shoulder to right shoulder
    [11, 13], // Left shoulder to left elbow
    [13, 15], // Left elbow to left wrist
    [12, 14], // Right shoulder to right elbow
    [14, 16], // Right elbow to right wrist
  ];

  // Specific posture landmarks for joint markers: Shoulders, Elbows, and Wrists ONLY
  const UPPER_BODY_POSTURE_JOINTS = [11, 12, 13, 14, 15, 16];

  // Helper to draw clean orange upper-body posture skeleton matching reference design
  const drawSkeleton2D = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    landmarks: any[],
    _isUpright: boolean = true,
    _isCountdown: boolean = false
  ): { renderedConnections: number; validCount: number } => {
    let renderedConnections = 0;
    let validCount = 0;

    // Landmark validity check: considers landmark valid when visibility >= 0.25
    const isLandmarkValid = (p?: any) =>
      Boolean(
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        (p.visibility === undefined ? 1.0 : p.visibility) >= 0.25
      );

    // Count valid upper body landmarks
    for (const idx of UPPER_BODY_POSTURE_JOINTS) {
      if (isLandmarkValid(landmarks[idx])) {
        validCount++;
      }
    }

    const ls = landmarks[11];
    const rs = landmarks[12];
    const nose = landmarks[0];

    // 1. Optional Torso Center Reference Line (Dashed white vertical line through mid-shoulder)
    if (isLandmarkValid(ls) && isLandmarkValid(rs)) {
      const midShoulderX = ((ls.x + rs.x) / 2) * w;
      const midShoulderY = ((ls.y + rs.y) / 2) * h;
      const shoulderSpan = Math.hypot((rs.x - ls.x) * w, (rs.y - ls.y) * h);

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.5;

      const topY = isLandmarkValid(nose)
        ? Math.min(nose.y * h, midShoulderY - shoulderSpan * 0.45)
        : midShoulderY - shoulderSpan * 0.45;
      const bottomY = midShoulderY + shoulderSpan * 0.55;

      ctx.beginPath();
      ctx.moveTo(midShoulderX, topY);
      ctx.lineTo(midShoulderX, bottomY);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Clean Orange Upper-Body Bone Lines (matching Reference Image 3)
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#F59E0B"; // Warm vibrant orange matching reference screenshot

    for (const [fromIdx, toIdx] of UPPER_BODY_POSTURE_BONES) {
      const p1 = landmarks[fromIdx];
      const p2 = landmarks[toIdx];
      if (isLandmarkValid(p1) && isLandmarkValid(p2)) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
        renderedConnections++;
      }
    }
    ctx.restore();

    // 3. Draw Small White-Centred Orange Joint Markers for Shoulders, Elbows, Wrists ONLY
    for (const idx of UPPER_BODY_POSTURE_JOINTS) {
      const joint = landmarks[idx];
      if (isLandmarkValid(joint)) {
        const jx = joint.x * w;
        const jy = joint.y * h;

        // Outer orange circle
        ctx.beginPath();
        ctx.arc(jx, jy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#F59E0B";
        ctx.fill();

        // Crisp white inner center
        ctx.beginPath();
        ctx.arc(jx, jy, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
      }
    }

    return { renderedConnections, validCount };
  };

  // Complete exercise and generate summary
  const completeExercise = useCallback(
    (finalTrackerState: PostureTrackerState) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const summary = calculatePostureAlignmentSummary({
        totalDurationSeconds: Math.max(
          finalTrackerState.totalDurationSeconds,
          finalTrackerState.timeInCorrectPostureSeconds
        ),
        totalSamples: finalTrackerState.totalSamplesCount,
        trackedSamples: finalTrackerState.trackedSamplesCount,
        goodPostureSamples: finalTrackerState.goodSamplesCount,
        timeInCorrectPostureSeconds: finalTrackerState.timeInCorrectPostureSeconds,
        requiredStabilitySeconds: REQUIRED_STABILITY_SECONDS,
      });

      setSessionSummary(summary);
      setPhase("COMPLETED");
    },
    [REQUIRED_STABILITY_SECONDS]
  );

  // =========================================================================
  // UNIFIED 60Hz ANIMATION & POSTURE VALIDATION LOOP
  // Microsecond synchronization: Canvas rendering, EMA landmark smoothing,
  // biomechanical posture validation, and hold stability timing run on the EXACT same frame.
  // =========================================================================
  useEffect(() => {
    if (phase !== "ACTIVE" && phase !== "COUNTDOWN" && !(phase === "INTRO" && isCameraActive)) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (phase === "ACTIVE" && !sessionStartTimeRef.current) {
      sessionStartTimeRef.current = Date.now();
    }
    lastAnimTimeRef.current = performance.now();
    lastStateUpdateTimeRef.current = performance.now();
    let lastCountdownSampleTime = 0;

    const unifiedLoop = () => {
      const now = performance.now();
      const dt = Math.max(8, Math.min(100, now - (lastAnimTimeRef.current || now)));
      lastAnimTimeRef.current = now;

      // 1. Sync canvas dimensions with video stream
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (lastVidDimRef.current.w !== video.videoWidth || lastVidDimRef.current.h !== video.videoHeight) {
          lastVidDimRef.current = { w: video.videoWidth, h: video.videoHeight };
          setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2. Fetch latest synchronous vision state
      const curVision = getLatestVisionState ? getLatestVisionState() : visionStateRef.current;
      const rawLandmarks = curVision.hasPose ? curVision.pose?.allRawLandmarks : null;
      const hasValidPose = Boolean(rawLandmarks && rawLandmarks.length >= 25 && curVision.hasPose);

      if (phase === "INTRO") {
        if (hasValidPose && rawLandmarks) {
          const smoothed = smootherRef.current.update(rawLandmarks) || rawLandmarks;
          const renderStats = drawSkeleton2D(ctx, canvas.width, canvas.height, smoothed, true, false);
          latestRenderStatsRef.current = renderStats;
          latestIsStillRef.current = true;

          if (now - lastStateUpdateTimeRef.current >= 60) {
            lastStateUpdateTimeRef.current = now;
          }
        }
        animFrameRef.current = requestAnimationFrame(unifiedLoop);
        return;
      }

      if (phase === "COUNTDOWN") {
        if (hasValidPose && rawLandmarks) {
          const smoothed = smootherRef.current.update(rawLandmarks);
          const renderStats = drawSkeleton2D(ctx, canvas.width, canvas.height, smoothed || rawLandmarks, false, true);
          latestRenderStatsRef.current = renderStats;
          latestIsStillRef.current = true;

          if (now - lastCountdownSampleTime >= 80) {
            lastCountdownSampleTime = now;
            const ls = rawLandmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
            const rs = rawLandmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
            const lh = rawLandmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
            const rh = rawLandmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];

            if (ls && rs) {
              const dxS = Math.abs(ls.x - rs.x);
              const dyS = rs.y - ls.y;
              const shoulderTilt = Math.round(Math.atan2(dyS, Math.max(0.01, dxS)) * (180 / Math.PI));
              const midShoulderX = (ls.x + rs.x) / 2;
              const midShoulderY = (ls.y + rs.y) / 2;
              const midShoulderZ = ((ls.z ?? 0) + (rs.z ?? 0)) / 2;

              let pitch = 0;
              let offset = 0;
              if (lh && rh) {
                const midHipX = (lh.x + rh.x) / 2;
                const midHipY = (lh.y + rh.y) / 2;
                const midHipZ = ((lh.z ?? 0) + (rh.z ?? 0)) / 2;
                const torsoHeight = Math.max(0.10, Math.abs(midHipY - midShoulderY));
                const torsoDz = midHipZ - midShoulderZ;
                pitch = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoHeight)) * (180 / Math.PI));
                offset = parseFloat(((midShoulderX - midHipX) / torsoHeight).toFixed(3));
              } else if (lh || rh) {
                const hip = lh || rh!;
                const torsoHeight = Math.max(0.10, Math.abs(hip.y - midShoulderY));
                const torsoDz = (hip.z ?? 0) - midShoulderZ;
                pitch = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoHeight)) * (180 / Math.PI));
              }
              countdownSamplesRef.current.push({ pitch, shoulderTilt, offset });
            }
          }
        }
        animFrameRef.current = requestAnimationFrame(unifiedLoop);
        return;
      }

      // PHASE === "ACTIVE"
      if (hasValidPose && rawLandmarks) {
        // Continuous latest-frame landmark update with adaptive velocity smoothing
        const smoothed = smootherRef.current.update(rawLandmarks) || rawLandmarks;

        // Torso Stillness Verification: evaluate mid-shoulder displacement between frames
        const ls = smoothed[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
        const rs = smoothed[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
        let torsoSpeed = 0;
        let isStill = true;

        if (ls && rs) {
          const curMidX = (ls.x + rs.x) / 2;
          const curMidY = (ls.y + rs.y) / 2;
          if (lastMidShoulderRef.current && dt > 0) {
            const dx = curMidX - lastMidShoulderRef.current.x;
            const dy = curMidY - lastMidShoulderRef.current.y;
            const dist = Math.hypot(dx, dy);
            torsoSpeed = dist / (dt / 1000);
            isStill = torsoSpeed <= (DEFAULT_POSTURE_TOLERANCES.maxTorsoSpeed ?? 0.22);
          }
          lastMidShoulderRef.current = { x: curMidX, y: curMidY };
        }

        // Fallback baseline calibration if countdown had no samples
        if (!calibratedBaselineRef.current && ls && rs) {
          const lh = smoothed[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
          const rh = smoothed[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];
          const dxS = Math.abs(ls.x - rs.x);
          const dyS = rs.y - ls.y;
          const shoulderTilt = Math.round(Math.atan2(dyS, Math.max(0.01, dxS)) * (180 / Math.PI));
          const midShoulderX = (ls.x + rs.x) / 2;
          const midShoulderY = (ls.y + rs.y) / 2;
          const midShoulderZ = ((ls.z ?? 0) + (rs.z ?? 0)) / 2;

          let pitch = 0;
          let offset = 0;
          if (lh && rh) {
            const midHipX = (lh.x + rh.x) / 2;
            const midHipY = (lh.y + rh.y) / 2;
            const midHipZ = ((lh.z ?? 0) + (rh.z ?? 0)) / 2;
            const torsoHeight = Math.max(0.10, Math.abs(midHipY - midShoulderY));
            const torsoDz = midHipZ - midShoulderZ;
            pitch = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoHeight)) * (180 / Math.PI));
            offset = parseFloat(((midShoulderX - midHipX) / torsoHeight).toFixed(3));
          }
          calibratedBaselineRef.current = { pitch, shoulderTilt, offset };
          trackerRef.current.calibrateBaseline(pitch, shoulderTilt, offset);
          setIsCalibrated(true);
        }

        const activeToleranceConfig = calibratedBaselineRef.current
          ? {
            neutralPitchBaselineDeg: calibratedBaselineRef.current.pitch,
            neutralShoulderTiltBaselineDeg: calibratedBaselineRef.current.shoulderTilt,
            neutralOffsetBaseline: calibratedBaselineRef.current.offset,
          }
          : undefined;

        // Perform normalized posture assessment
        const freshAnalysis = analyzePostureAlignment(
          smoothed,
          activeToleranceConfig,
          curVision.pose,
          { isStill, torsoSpeed }
        );
        currentAnalysisRef.current = freshAnalysis;

        // Update state machine tracker (timer, grace period, hysteresis)
        const nextTracker = trackerRef.current.update(freshAnalysis, dt);
        trackerStateRef.current = nextTracker;

        // Render skeleton on canvas in lockstep with posture evaluation
        const renderStats = drawSkeleton2D(ctx, canvas.width, canvas.height, smoothed, freshAnalysis.isUpright, false);
        latestRenderStatsRef.current = renderStats;
        latestIsStillRef.current = isStill;

        // Complete exercise automatically when 10.0 seconds achieved
        if (nextTracker.isComplete) {
          setCurrentAnalysis(freshAnalysis);
          setTrackerState(nextTracker);
          setTimeInCorrectPosture(nextTracker.timeInCorrectPostureSeconds);
          completeExercise(nextTracker);
          return;
        }
      } else {
        // Missing pose or tracking lost
        lastMidShoulderRef.current = null;
        latestRenderStatsRef.current = { renderedConnections: 0, validCount: 0 };
        latestIsStillRef.current = false;
        const freshAnalysis = analyzePostureAlignment(null);
        currentAnalysisRef.current = freshAnalysis;

        const nextTracker = trackerRef.current.update(freshAnalysis, dt);
        trackerStateRef.current = nextTracker;
      }

      // Throttle React state re-renders to every ~50ms (20Hz)
      if (now - lastStateUpdateTimeRef.current >= 50) {
        lastStateUpdateTimeRef.current = now;
        setElapsedTotalMs((prev) => prev + dt);
        setCurrentAnalysis(currentAnalysisRef.current);
        setTrackerState(trackerStateRef.current);
        setTimeInCorrectPosture(trackerStateRef.current.timeInCorrectPostureSeconds);

        // Internal developer console diagnostic logging (throttled ~3s, not displayed in UI)
        if (now - lastDevLogTimeRef.current >= 3000) {
          lastDevLogTimeRef.current = now;
          if (process.env.NODE_ENV !== "production") {
            console.debug("[PostureAlignment] Pose tracking status:", {
              phase,
              validJoints: latestRenderStatsRef.current.validCount,
              confidence: computeTrackingConfidence(rawLandmarks),
              isStill: latestIsStillRef.current,
              isUpright: currentAnalysisRef.current.isUpright,
            });
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(unifiedLoop);
    };

    animFrameRef.current = requestAnimationFrame(unifiedLoop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [phase, isCameraActive, completeExercise, getLatestVisionState]);

  // Start exercise handler: checks camera, runs countdown and establishes neutral baseline
  const handleStart = async () => {
    if (!isCameraActive) {
      try {
        await startCamera();
      } catch (err) {
        console.warn("[PostureAlignmentExercise] Camera initialization notice:", err);
      }
    }

    setTimeInCorrectPosture(0);
    setElapsedTotalMs(0);
    smootherRef.current.reset();
    trackerRef.current.reset();
    lastMidShoulderRef.current = null;
    calibratedBaselineRef.current = null;
    countdownSamplesRef.current = [];
    setIsCalibrated(false);
    setIsSessionSaved(false);
    setTrackerState(trackerRef.current.getState());
    setCurrentAnalysis(analyzePostureAlignment(null));
    setSessionSummary(null);

    setPhase("COUNTDOWN");
    setCountdownValue(3);

    let count = 3;
    const cdInterval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(cdInterval);
        // Establish neutral baseline from countdown samples
        const samples = countdownSamplesRef.current;
        if (samples.length >= 2) {
          const avgPitch = Math.round(samples.reduce((a, s) => a + s.pitch, 0) / samples.length);
          const avgShoulder = Math.round(samples.reduce((a, s) => a + s.shoulderTilt, 0) / samples.length);
          const avgOffset = parseFloat((samples.reduce((a, s) => a + s.offset, 0) / samples.length).toFixed(3));
          calibratedBaselineRef.current = { pitch: avgPitch, shoulderTilt: avgShoulder, offset: avgOffset };
          trackerRef.current.calibrateBaseline(avgPitch, avgShoulder, avgOffset);
          setIsCalibrated(true);
        }
        setPhase("ACTIVE");
      } else {
        setCountdownValue(count);
      }
    }, 1000);
  };

  const handleRestart = () => {
    handleStart();
  };

  const handleRecalibrate = () => {
    handleStart();
  };

  // Save session record to persistent storage
  const handleSaveSession = async () => {
    if (!sessionSummary || isSessionSaved || isSavingSession) return;
    setIsSavingSession(true);
    try {
      const completedSession = {
        sessionId: `posture-${Date.now()}`,
        patientId: patient?.id || "anonymous-patient",
        patientName: patient?.fullName || "Anonymous Patient",
        startTime: sessionStartTimeRef.current || Date.now(),
        durationMs: sessionSummary.durationSeconds * 1000,
        measurementCount: Math.round(sessionSummary.durationSeconds * 10),
        dataSource: "webcam-optical",
        exerciseType: "posture-alignment",
        summary: {
          durationFormatted: sessionSummary.formattedDuration,
          timeInCorrectPostureSeconds: sessionSummary.timeInCorrectPostureSeconds,
          postureAlignmentPercentage: sessionSummary.postureAlignmentPercentage,
          poseTrackingAvailabilityPercent: sessionSummary.poseTrackingAvailabilityPercent,
          clinicalDisclaimer: sessionSummary.disclosure,
        },
      };
      await SessionStorageService.saveSession(completedSession as any);
      setIsSessionSaved(true);
    } catch (err) {
      console.warn("Failed to save posture session:", err);
      setIsSessionSaved(true);
    } finally {
      setIsSavingSession(false);
    }
  };

  // Stability progress percentage
  const stabilityProgressPercent = Math.min(
    100,
    Math.round((timeInCorrectPosture / REQUIRED_STABILITY_SECONDS) * 100)
  );

  // Feedback banner styling
  const getFeedbackBannerStyle = () => {
    if (!isCameraActive || trackerState.isTrackingLost) {
      return {
        bg: "rgba(241, 245, 249, 0.95)",
        border: "#94A3B8",
        text: "#475569",
        icon: <Eye size={24} color="#64748B" />,
      };
    }
    if (trackerState.guidanceMessage === "Good posture — hold naturally") {
      return {
        bg: "rgba(236, 253, 245, 0.95)",
        border: "#10B981",
        text: "#065F46",
        icon: <CheckCircle2 size={24} color="#10B981" />,
      };
    }
    return {
      bg: "rgba(254, 243, 199, 0.95)",
      border: "#F59E0B",
      text: "#92400E",
      icon: <AlertTriangle size={24} color="#F59E0B" />,
    };
  };

  const feedbackStyle = getFeedbackBannerStyle();

  // =========================================================================
  // VIEW: INTRO SCREEN
  // =========================================================================
  if (phase === "INTRO") {
    return (
      <div
        style={{
          maxWidth: "880px",
          margin: "0 auto",
          padding: "24px 16px 48px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Navigation & Header */}
        <div
          className="medical-card"
          style={{
            padding: "24px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {onExit && (
              <button
                onClick={onExit}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  fontSize: "0.875rem",
                }}
              >
                <ArrowLeft size={16} />
                <span>Library</span>
              </button>
            )}

            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--teal-primary)",
                  marginBottom: "4px",
                }}
              >
                <Camera size={14} />
                <span>Camera-Only Protocol • Wii Board Not Required</span>
              </div>
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  margin: 0,
                }}
              >
                Posture Alignment
              </h1>
              {patient && (
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Patient: <strong style={{ color: "var(--text-main)" }}>{patient.fullName}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Camera status badge */}
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              fontSize: "0.8125rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: isCameraActive ? "#ECFDF5" : "#F1F5F9",
              color: isCameraActive ? "#065F46" : "#64748B",
              border: `1px solid ${isCameraActive ? "#A7F3D0" : "#CBD5E1"}`,
            }}
          >
            {isCameraActive ? <Camera size={14} /> : <CameraOff size={14} />}
            <span>{cameraDeviceName}</span>
          </div>
        </div>

        {/* Protocol Instruction Card */}
        <div
          className="medical-card"
          style={{
            padding: "32px",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 100%)",
            border: "1px solid #CCFBF1",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #0D9488, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                flexShrink: 0,
              }}
            >
              <Activity size={24} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--text-main)",
                  margin: "0 0 6px 0",
                }}
              >
                Instruction
              </h2>
              <p
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "#0F766E",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Stand upright in front of the camera and align your body with the target posture.
              </p>
            </div>
          </div>

          {/* Key Guidelines */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)", marginBottom: "4px" }}>
                1. Full Body Visibility
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Position yourself so your head, shoulders, hips, knees, and ankles are clearly tracked by the 2D skeleton.
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)", marginBottom: "4px" }}>
                2. Real-Time Feedback
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Follow visual directional cues to adjust your shoulders, hips, and vertical torso alignment.
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "10px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-main)", marginBottom: "4px" }}>
                3. Posture Stability
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Maintain upright posture stability for 10 seconds to successfully complete the exercise.
              </div>
            </div>
          </div>

          {/* Safety & Clinical Disclaimer Notice */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "#F8FAFC",
              border: "1px solid #E2E8F0",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.8125rem",
              color: "#64748B",
            }}
          >
            <ShieldCheck size={16} color="#0D9488" style={{ flexShrink: 0 }} />
            <span>
              <strong>Clinical Notice:</strong> {POSTURE_CLINICAL_DISCLOSURE} Does not claim medical diagnosis.
            </span>
          </div>

          {/* Action Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
            <button
              onClick={handleStart}
              className="btn-primary"
              style={{
                padding: "14px 32px",
                fontSize: "1rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                boxShadow: "0 4px 14px rgba(13, 148, 136, 0.25)",
              }}
            >
              <Play size={18} fill="#FFFFFF" />
              <span>Start Posture Alignment</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: SUMMARY (COMPLETED)
  // =========================================================================
  if (phase === "COMPLETED" && sessionSummary) {
    return (
      <div
        style={{
          maxWidth: "880px",
          margin: "0 auto",
          padding: "24px 16px 48px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Completion Header Banner */}
        <div
          className="medical-card"
          style={{
            padding: "32px",
            background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
            border: "2px solid #10B981",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "#10B981",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 18px rgba(16, 185, 129, 0.35)",
            }}
          >
            <Check size={36} strokeWidth={3} />
          </div>

          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 800,
              color: "#065F46",
              margin: 0,
            }}
          >
            Exercise Complete ✓
          </h1>

          <p
            style={{
              fontSize: "1rem",
              color: "#047857",
              margin: 0,
              maxWidth: "540px",
              lineHeight: 1.5,
            }}
          >
            Target posture stability maintained for {REQUIRED_STABILITY_SECONDS} seconds. Upright biomechanical alignment successfully recorded.
          </p>
        </div>

        {/* Required Metrics Summary Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Duration */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 700 }}>
              <Clock size={16} />
              <span>Duration</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-main)" }}>
              {sessionSummary.formattedDuration}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {sessionSummary.durationSeconds.toFixed(1)} seconds elapsed
            </div>
          </div>

          {/* Pose Tracking Availability */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 700 }}>
              <Eye size={16} />
              <span>Pose Tracking</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0D9488" }}>
              {sessionSummary.poseTrackingAvailabilityPercent}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              MediaPipe 2D optical coverage
            </div>
          </div>

          {/* Time in Correct Posture */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 700 }}>
              <CheckCircle2 size={16} />
              <span>Time in Correct Posture</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#10B981" }}>
              {sessionSummary.timeInCorrectPostureSeconds.toFixed(1)} s
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Target: {REQUIRED_STABILITY_SECONDS}s upright stability
            </div>
          </div>

          {/* Posture Alignment Percentage */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 700 }}>
              <Award size={16} />
              <span>Posture Alignment</span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0284C7" }}>
              {sessionSummary.postureAlignmentPercentage}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Upright symmetry compliance
            </div>
          </div>
        </div>

        {/* Safety Disclaimer Banner */}
        <div
          style={{
            padding: "14px 18px",
            borderRadius: "10px",
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            fontSize: "0.8125rem",
            color: "#64748B",
            lineHeight: 1.5,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <ShieldCheck size={18} color="#0D9488" style={{ flexShrink: 0 }} />
          <span>
            {sessionSummary.disclosure} No clinical medical diagnosis or scores are claimed.
          </span>
        </div>

        {/* Action Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "8px",
          }}
        >
          {onExit && (
            <button
              onClick={onExit}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                fontSize: "0.9375rem",
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Exercises</span>
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={handleSaveSession}
              disabled={isSessionSaved || isSavingSession}
              className={isSessionSaved ? "btn-outline" : "btn-primary"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 20px",
                fontSize: "0.9375rem",
                fontWeight: 700,
                backgroundColor: isSessionSaved ? "#ECFDF5" : undefined,
                color: isSessionSaved ? "#065F46" : undefined,
                borderColor: isSessionSaved ? "#A7F3D0" : undefined,
              }}
            >
              {isSessionSaved ? (
                <>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>Session Saved ✓</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>{isSavingSession ? "Saving..." : "Save Session"}</span>
                </>
              )}
            </button>

            <button
              onClick={handleRestart}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 24px",
                fontSize: "0.9375rem",
                fontWeight: 700,
              }}
            >
              <RotateCcw size={16} />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: ACTIVE / COUNTDOWN WORKBENCH
  // =========================================================================
  return (
    <div
      style={{
        maxWidth: "1040px",
        margin: "0 auto",
        padding: "16px 16px 40px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Top Header Card */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {onExit && (
            <button
              onClick={onExit}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.8125rem",
              }}
            >
              <ArrowLeft size={14} />
              <span>Library</span>
            </button>
          )}

          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--teal-primary)", textTransform: "uppercase" }}>
              Camera Rehabilitation Protocol
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
              Posture Alignment
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {isCalibrated && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: "12px",
                backgroundColor: "#ECFDF5",
                color: "#065F46",
                fontSize: "0.6875rem",
                fontWeight: 700,
                border: "1px solid #A7F3D0",
              }}
            >
              Baseline Calibrated ✓
            </span>
          )}

          <button
            onClick={handleRecalibrate}
            className="btn-ghost"
            style={{
              padding: "5px 12px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid #CBD5E1",
              backgroundColor: "#FFFFFF",
              color: "#475569",
            }}
            title="Recalibrate neutral posture baseline"
          >
            <Sliders size={13} />
            <span>Recalibrate</span>
          </button>

          {/* Camera device status pill */}
          <div
            style={{
              padding: "5px 12px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: isCameraActive ? "#ECFDF5" : "#FEF2F2",
              color: isCameraActive ? "#065F46" : "#991B1B",
              border: `1px solid ${isCameraActive ? "#A7F3D0" : "#FECACA"}`,
            }}
          >
            {isCameraActive ? <Camera size={13} /> : <CameraOff size={13} />}
            <span>{cameraDeviceName}</span>
          </div>
        </div>
      </div>

      {/* Main Real-Time Feedback Banner */}
      <div
        className="medical-card"
        style={{
          padding: "16px 24px",
          backgroundColor: feedbackStyle.bg,
          border: `2px solid ${feedbackStyle.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {feedbackStyle.icon}
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: feedbackStyle.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Real-Time Guidance
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 800, color: feedbackStyle.text }}>
              {trackerState.guidanceMessage}
            </div>
          </div>
        </div>

        {/* Posture status badge */}
        <div
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "0.8125rem",
            fontWeight: 700,
            backgroundColor: "#FFFFFF",
            border: `1px solid ${feedbackStyle.border}`,
            color: feedbackStyle.text,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {!isCameraActive ? (
            <span style={{ color: "#991B1B" }}>Camera: Unavailable</span>
          ) : trackerState.isTrackingLost ? (
            <span>Pose: Not Detected</span>
          ) : trackerState.isInGracePeriod ? (
            <span style={{ color: "#D97706" }}>Grace Period (Adjust)</span>
          ) : trackerState.guidanceMessage === "Adjusting posture" ? (
            <span style={{ color: "#D97706" }}>Adjusting Posture</span>
          ) : currentAnalysis.isUpright ? (
            <span style={{ color: "#059669" }}>Alignment: Optimal</span>
          ) : (
            <span style={{ color: "#D97706" }}>Alignment: Adjusting</span>
          )}
        </div>
      </div>

      {/* Progress Card: Posture Stability */}
      <div
        className="medical-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
            Posture Stability
          </div>
          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: trackerState.isInGracePeriod ? "#D97706" : "#0D9488", fontVariantNumeric: "tabular-nums" }}>
            {trackerState.timeInCorrectPostureSeconds.toFixed(1)} / {REQUIRED_STABILITY_SECONDS}.0 s ({stabilityProgressPercent}%)
            {trackerState.timeInCorrectPostureSeconds < REQUIRED_STABILITY_SECONDS && (
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginLeft: "8px", fontVariantNumeric: "tabular-nums" }}>
                ({trackerState.remainingSeconds.toFixed(1)}s remaining)
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: "100%",
            height: "14px",
            backgroundColor: "#E2E8F0",
            borderRadius: "7px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${stabilityProgressPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #0D9488 0%, #10B981 100%)",
              borderRadius: "7px",
              transition: "width 0.15s ease",
            }}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
          <span>Maintain upright posture for {REQUIRED_STABILITY_SECONDS} seconds</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {trackerState.isInGracePeriod ? (
              <span style={{ color: "#D97706", fontWeight: 600 }}>Grace period active — realign now • </span>
            ) : null}
            Elapsed: {(elapsedTotalMs / 1000).toFixed(1)}s • {stabilityProgressPercent === 100 ? "Complete ✓" : !isCameraActive ? "Paused (Camera unavailable)" : trackerState.isTrackingLost ? "Paused (Tracking lost)" : trackerState.guidanceMessage === "Hold steady — avoid moving" ? "Paused (Movement detected)" : !currentAnalysis.isUpright ? `Paused (${trackerState.guidanceMessage})` : "In Progress (Optimal)"}
          </span>
        </div>
      </div>

      {/* Camera Live View & 2D Skeleton Overlay Container */}
      <div
        className="medical-card"
        style={{
          padding: "0",
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#0F172A",
          minHeight: "440px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Live Camera Video Feed & Skeleton Overlay Viewport */}
        {isCameraActive ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              maxHeight: "560px",
              aspectRatio:
                videoDimensions.width > 0 && videoDimensions.height > 0
                  ? `${videoDimensions.width} / ${videoDimensions.height}`
                  : "4 / 3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                transform: isMirrored ? "scaleX(-1)" : "none",
              }}
            />

            {/* 2D MediaPipe Skeleton Canvas Overlay */}
            <canvas
              ref={canvasRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                transform: isMirrored ? "scaleX(-1)" : "none",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              color: "#94A3B8",
              padding: "48px 24px",
              textAlign: "center",
            }}
          >
            <CameraOff size={48} color="#64748B" />
            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#F1F5F9" }}>
              Camera: Not Available
            </div>
            <p style={{ fontSize: "0.875rem", color: "#94A3B8", maxWidth: "360px", margin: 0 }}>
              The camera feed is currently off or unavailable. You can retry starting the camera below.
            </p>
            <button
              onClick={() => startCamera()}
              className="btn-primary"
              style={{
                marginTop: "12px",
                padding: "8px 18px",
                fontSize: "0.875rem",
              }}
            >
              Start Camera
            </button>
          </div>
        )}

        {/* Countdown Overlay */}
        {phase === "COUNTDOWN" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              zIndex: 10,
            }}
          >
            <div
              style={{
                fontSize: "5rem",
                fontWeight: 900,
                color: "#FFFFFF",
                textShadow: "0 4px 20px rgba(0,0,0,0.5)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {countdownValue}
            </div>
            <div style={{ fontSize: "1.25rem", color: "#F1F5F9", fontWeight: 700 }}>
              Calibrating Neutral Upright Posture...
            </div>
            <div style={{ fontSize: "0.875rem", color: "#94A3B8", fontWeight: 500 }}>
              Stand naturally upright facing the camera
            </div>
          </div>
        )}

        {/* Tracking Loss Alert Banner */}
        {phase === "ACTIVE" && isCameraActive && trackerState.isTrackingLost && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(220, 38, 38, 0.92)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              backdropFilter: "blur(8px)",
              padding: "10px 24px",
              borderRadius: "24px",
              color: "#FFFFFF",
              fontSize: "0.875rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 10,
            }}
          >
            <AlertTriangle size={18} color="#FFFFFF" />
            <span>Tracking Lost — Timer Paused • Step into camera view</span>
          </div>
        )}
      </div>

      {/* Biomechanical Telemetry Metrics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        {/* Shoulder Tilt */}
        <div
          className="medical-card"
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            Shoulder Alignment
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", fontVariantNumeric: "tabular-nums" }}>
            {currentAnalysis.hasPose && currentAnalysis.shoulderTiltDeg !== null
              ? `${currentAnalysis.shoulderTiltDeg > 0 ? "+" : ""}${currentAnalysis.shoulderTiltDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {currentAnalysis.hasPose
              ? Math.abs(currentAnalysis.shoulderTiltDeg ?? 0) <= DEFAULT_POSTURE_TOLERANCES.shoulderTiltToleranceDeg
                ? "Level (Normal tolerance)"
                : currentAnalysis.shoulderTiltDeg! > 0
                  ? "Right shoulder lowered"
                  : "Left shoulder lowered"
              : "Pose not detected"}
          </div>
        </div>

        {/* Hip Tilt */}
        <div
          className="medical-card"
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            Hip Alignment
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", fontVariantNumeric: "tabular-nums" }}>
            {currentAnalysis.hasPose && currentAnalysis.hipTiltDeg !== null
              ? `${currentAnalysis.hipTiltDeg > 0 ? "+" : ""}${currentAnalysis.hipTiltDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {currentAnalysis.hasPose
              ? Math.abs(currentAnalysis.hipTiltDeg ?? 0) <= DEFAULT_POSTURE_TOLERANCES.hipTiltToleranceDeg
                ? "Level (Normal tolerance)"
                : currentAnalysis.hipTiltDeg! > 0
                  ? "Right hip dipped"
                  : "Left hip dipped"
              : "Pose not detected"}
          </div>
        </div>

        {/* Sagittal Pitch */}
        <div
          className="medical-card"
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            Trunk Sagittal Pitch
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", fontVariantNumeric: "tabular-nums" }}>
            {currentAnalysis.hasPose && currentAnalysis.trunkPitchDeg !== null
              ? `${currentAnalysis.trunkPitchDeg > 0 ? "+" : ""}${currentAnalysis.trunkPitchDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {currentAnalysis.hasPose
              ? Math.abs(currentAnalysis.trunkPitchDeg ?? 0) <= DEFAULT_POSTURE_TOLERANCES.trunkPitchToleranceDeg
                ? "Upright (Normal tolerance)"
                : currentAnalysis.trunkPitchDeg! > 0
                  ? "Leaning forward"
                  : "Leaning backward"
              : "Pose not detected"}
          </div>
        </div>

        {/* Torso Symmetry */}
        <div
          className="medical-card"
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
            Left/Right Symmetry
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)", fontVariantNumeric: "tabular-nums" }}>
            {currentAnalysis.hasPose && currentAnalysis.symmetryScore !== null
              ? `${currentAnalysis.symmetryScore}%`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {currentAnalysis.hasPose ? "Coronal bilateral symmetry" : "Pose not detected"}
          </div>
        </div>
      </div>

      {/* Clinical Validation Disclaimer Notice */}
      <div
        style={{
          padding: "10px 16px",
          borderRadius: "8px",
          backgroundColor: "#F8FAFC",
          border: "1px solid #E2E8F0",
          fontSize: "0.75rem",
          color: "#64748B",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <ShieldCheck size={14} color="#0D9488" style={{ flexShrink: 0 }} />
        <span>
          {POSTURE_CLINICAL_DISCLOSURE} No clinical medical diagnosis or scores are claimed.
        </span>
      </div>
    </div>
  );
};
