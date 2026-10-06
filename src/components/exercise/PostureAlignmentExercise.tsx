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
} from "lucide-react";
import { useVision } from "../../context/VisionContext";
import {
  SKELETON_2D_KEY_JOINTS,
  SKELETON_2D_BONES,
  analyzePostureAlignment,
  calculatePostureAlignmentSummary,
  PostureAlignmentAnalysis,
  PostureAlignmentSummary,
  POSTURE_CLINICAL_DISCLOSURE,
} from "../../utils/postureAlignmentExercise";
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

  // Metrics Sample Counters for Session Summary
  const sessionStartTimeRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const totalSamplesCountRef = useRef<number>(0);
  const trackedSamplesCountRef = useRef<number>(0);
  const goodPostureSamplesCountRef = useRef<number>(0);

  const [sessionSummary, setSessionSummary] = useState<PostureAlignmentSummary | null>(null);

  // Real-time Posture Analysis from MediaPipe 2D Pose landmarks
  const analysis: PostureAlignmentAnalysis = useMemo(() => {
    if (!visionState.hasPose || !visionState.pose?.allRawLandmarks) {
      return analyzePostureAlignment(null);
    }
    return analyzePostureAlignment(visionState.pose.allRawLandmarks);
  }, [visionState.hasPose, visionState.pose]);

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
  }, [phase, isCameraActive, getMediaStream]);

  // =========================================================================
  // 2D MEDIAPIPE SKELETON CANVAS OVERLAY RENDER LOOP
  // Shows at minimum: Head, Shoulders, Elbows, Wrists, Hips, Knees, Ankles
  // =========================================================================
  useEffect(() => {
    if (phase !== "ACTIVE" && phase !== "COUNTDOWN") {
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

    const render2DSkeleton = () => {
      // Sync canvas dimensions with video stream
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = visionState.pose?.allRawLandmarks;
      if (landmarks && landmarks.length >= 29 && visionState.hasPose) {
        const w = canvas.width;
        const h = canvas.height;

        // Color coding:
        // Vibrant Emerald Green if Good Posture
        // Warning Amber if Leaning Left/Right/Forward/Backward
        // Teal if neutral tracking
        let strokeColor = "rgba(13, 148, 136, 0.90)"; // teal
        let jointColor = "#0D9488";

        if (analysis.isUpright) {
          strokeColor = "rgba(16, 185, 129, 0.95)"; // green
          jointColor = "#10B981";
        } else if (
          analysis.postureState === "LEAN_LEFT" ||
          analysis.postureState === "LEAN_RIGHT" ||
          analysis.postureState === "LEAN_FORWARD" ||
          analysis.postureState === "LEAN_BACKWARD"
        ) {
          strokeColor = "rgba(245, 158, 11, 0.95)"; // amber
          jointColor = "#F59E0B";
        }

        // 1. Draw Kinematic 2D Bone Lines
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = strokeColor;

        for (const [fromIdx, toIdx] of SKELETON_2D_BONES) {
          const p1 = landmarks[fromIdx];
          const p2 = landmarks[toIdx];
          if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
            ctx.stroke();
          }
        }

        // 2. Draw Spine Midline Connection (Nose -> Mid-Shoulder -> Mid-Hip)
        const nose = landmarks[SKELETON_2D_KEY_JOINTS.NOSE];
        const ls = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER];
        const rs = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER];
        const lh = landmarks[SKELETON_2D_KEY_JOINTS.LEFT_HIP];
        const rh = landmarks[SKELETON_2D_KEY_JOINTS.RIGHT_HIP];

        if (ls && rs && lh && rh) {
          const midShoulderX = ((ls.x + rs.x) / 2) * w;
          const midShoulderY = ((ls.y + rs.y) / 2) * h;
          const midHipX = ((lh.x + rh.x) / 2) * w;
          const midHipY = ((lh.y + rh.y) / 2) * h;

          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = analysis.isUpright
            ? "rgba(16, 185, 129, 0.9)"
            : "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 2.5;

          // Head (Nose) to mid-shoulder
          if (nose) {
            ctx.beginPath();
            ctx.moveTo(nose.x * w, nose.y * h);
            ctx.lineTo(midShoulderX, midShoulderY);
            ctx.stroke();
          }

          // Spine: mid-shoulder to mid-hip
          ctx.beginPath();
          ctx.moveTo(midShoulderX, midShoulderY);
          ctx.lineTo(midHipX, midHipY);
          ctx.stroke();
          ctx.restore();
        }

        // 3. Draw Key 2D Joints:
        // Head, Shoulders, Elbows, Wrists, Hips, Knees, Ankles
        for (const [, jointIdx] of Object.entries(SKELETON_2D_KEY_JOINTS)) {
          const joint = landmarks[jointIdx];
          if (joint && (joint.visibility ?? 1) > 0.35) {
            const jx = joint.x * w;
            const jy = joint.y * h;

            // Outer glowing ring
            ctx.beginPath();
            ctx.arc(jx, jy, 7, 0, Math.PI * 2);
            ctx.fillStyle = jointColor;
            ctx.fill();

            // Inner white core
            ctx.beginPath();
            ctx.arc(jx, jy, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render2DSkeleton);
    };

    animFrameRef.current = requestAnimationFrame(render2DSkeleton);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [phase, visionState.pose, visionState.hasPose, analysis.isUpright, analysis.postureState]);

  // =========================================================================
  // ACTIVE POSTURE STABILITY TIMER & PROGRESS TRACKER
  // Accumulates hold time when in Good Posture until 10 seconds is reached
  // =========================================================================
  useEffect(() => {
    if (phase !== "ACTIVE") {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    sessionStartTimeRef.current = Date.now();
    lastSampleTimeRef.current = Date.now();

    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const deltaMs = lastSampleTimeRef.current ? now - lastSampleTimeRef.current : 100;
      lastSampleTimeRef.current = now;

      setElapsedTotalMs((prev) => prev + deltaMs);

      // Record sample metrics
      totalSamplesCountRef.current += 1;

      if (visionState.hasPose) {
        trackedSamplesCountRef.current += 1;

        if (analysis.isUpright) {
          goodPostureSamplesCountRef.current += 1;

          setTimeInCorrectPosture((prev) => {
            const next = prev + deltaMs / 1000;
            if (next >= REQUIRED_STABILITY_SECONDS) {
              // Complete Exercise
              setTimeout(() => {
                completeExercise(next);
              }, 100);
              return REQUIRED_STABILITY_SECONDS;
            }
            return next;
          });
        }
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [phase, visionState.hasPose, analysis.isUpright]);

  // Complete exercise and generate summary
  const completeExercise = useCallback(
    (finalGoodHoldSecs: number) => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      const totalElapsedSec = (Date.now() - (sessionStartTimeRef.current || Date.now())) / 1000;
      const summary = calculatePostureAlignmentSummary({
        totalDurationSeconds: Math.max(totalElapsedSec, finalGoodHoldSecs),
        totalSamples: totalSamplesCountRef.current,
        trackedSamples: trackedSamplesCountRef.current,
        goodPostureSamples: goodPostureSamplesCountRef.current,
        timeInCorrectPostureSeconds: finalGoodHoldSecs,
        requiredStabilitySeconds: REQUIRED_STABILITY_SECONDS,
      });

      setSessionSummary(summary);
      setPhase("COMPLETED");
    },
    [REQUIRED_STABILITY_SECONDS]
  );

  // Start exercise handler: checks camera, runs countdown
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
    totalSamplesCountRef.current = 0;
    trackedSamplesCountRef.current = 0;
    goodPostureSamplesCountRef.current = 0;
    setSessionSummary(null);

    setPhase("COUNTDOWN");
    setCountdownValue(3);

    let count = 3;
    const cdInterval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(cdInterval);
        setPhase("ACTIVE");
      } else {
        setCountdownValue(count);
      }
    }, 1000);
  };

  const handleRestart = () => {
    handleStart();
  };

  // Stability progress percentage
  const stabilityProgressPercent = Math.min(
    100,
    Math.round((timeInCorrectPosture / REQUIRED_STABILITY_SECONDS) * 100)
  );

  // Feedback banner styling
  const getFeedbackBannerStyle = () => {
    if (!visionState.hasPose) {
      return {
        bg: "rgba(241, 245, 249, 0.95)",
        border: "#94A3B8",
        text: "#475569",
        icon: <Eye size={24} color="#64748B" />,
      };
    }
    if (analysis.isUpright) {
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
              <span>Back to Library</span>
            </button>
          )}

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
            <span>Repeat Exercise</span>
          </button>
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
              {analysis.feedbackMessage}
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
          }}
        >
          {analysis.hasPose ? (
            analysis.isUpright ? "Alignment: Optimal" : "Alignment: Adjusting"
          ) : (
            "Pose: Not Detected"
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
          <div style={{ fontSize: "0.875rem", fontWeight: 800, color: "#0D9488" }}>
            {timeInCorrectPosture.toFixed(1)} / {REQUIRED_STABILITY_SECONDS}.0 s ({stabilityProgressPercent}%)
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
          <span>Maintain correct upright posture for {REQUIRED_STABILITY_SECONDS} seconds</span>
          <span>Elapsed: {(elapsedTotalMs / 1000).toFixed(1)}s • {stabilityProgressPercent === 100 ? "Complete ✓" : "In Progress"}</span>
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
        {/* Live Camera Video Feed */}
        {isCameraActive ? (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: "100%",
              maxHeight: "560px",
              objectFit: "contain",
              transform: isMirrored ? "scaleX(-1)" : "none",
            }}
          />
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

        {/* 2D MediaPipe Skeleton Canvas Overlay */}
        {isCameraActive && (
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              objectFit: "contain",
              transform: isMirrored ? "scaleX(-1)" : "none",
            }}
          />
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
              }}
            >
              {countdownValue}
            </div>
            <div style={{ fontSize: "1rem", color: "#E2E8F0", fontWeight: 600 }}>
              Get into upright position...
            </div>
          </div>
        )}

        {/* Pose Not Detected HUD Overlay */}
        {phase === "ACTIVE" && isCameraActive && !visionState.hasPose && (
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              backdropFilter: "blur(8px)",
              padding: "8px 20px",
              borderRadius: "20px",
              color: "#F8FAFC",
              fontSize: "0.875rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Eye size={16} color="#38BDF8" />
            <span>Pose: Not Detected — Step into camera view</span>
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
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
            {analysis.hasPose && analysis.shoulderTiltDeg !== null
              ? `${analysis.shoulderTiltDeg > 0 ? "+" : ""}${analysis.shoulderTiltDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {analysis.hasPose
              ? Math.abs(analysis.shoulderTiltDeg ?? 0) <= 4
                ? "Level (Normal)"
                : analysis.shoulderTiltDeg! > 0
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
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
            {analysis.hasPose && analysis.hipTiltDeg !== null
              ? `${analysis.hipTiltDeg > 0 ? "+" : ""}${analysis.hipTiltDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {analysis.hasPose
              ? Math.abs(analysis.hipTiltDeg ?? 0) <= 5
                ? "Level (Normal)"
                : analysis.hipTiltDeg! > 0
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
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
            {analysis.hasPose && analysis.trunkPitchDeg !== null
              ? `${analysis.trunkPitchDeg > 0 ? "+" : ""}${analysis.trunkPitchDeg}°`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {analysis.hasPose
              ? Math.abs(analysis.trunkPitchDeg ?? 0) <= 5
                ? "Vertical (Normal)"
                : analysis.trunkPitchDeg! > 0
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
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-main)" }}>
            {analysis.hasPose && analysis.symmetryScore !== null
              ? `${analysis.symmetryScore}%`
              : "--"}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            {analysis.hasPose ? "Coronal bilateral symmetry" : "Pose not detected"}
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
