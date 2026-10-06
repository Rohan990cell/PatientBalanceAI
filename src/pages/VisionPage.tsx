import React, { useRef, useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Layers,
  Info,
  FlipHorizontal,
  Play,
  RotateCcw,
  Sparkles,
  Award,
} from "lucide-react";
import { useVision } from "../context/VisionContext";

export const VisionPage: React.FC = () => {
  const {
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
  } = useVision();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Active Protocol Mode: "romberg" | "single-leg" | "reach"
  const [activeProtocol, setActiveProtocol] = useState<"romberg" | "single-leg" | "reach">("romberg");

  // Romberg Protocol State
  // Phase: "idle" | "eyes-open" | "eyes-closed" | "complete"
  const [rombergPhase, setRombergPhase] = useState<"idle" | "eyes-open" | "eyes-closed" | "complete">("idle");
  const [rombergTimer, setRombergTimer] = useState<number>(15);
  const [rombergViolations, setRombergViolations] = useState<number>(0);
  const [rombergComplianceScore, setRombergComplianceScore] = useState<number | null>(null);

  // Single Leg Stance Best Hold
  const [bestHoldDuration, setBestHoldDuration] = useState<number>(0);

  // Connect stream to video preview when camera is active, and attach canvas overlay
  useEffect(() => {
    if (isCameraActive && videoRef.current) {
      const stream = getMediaStream();
      if (stream && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      if (canvasRef.current) {
        setDisplayCanvas(canvasRef.current);
      }
    }
    return () => {
      // Phase 6: Do NOT turn off camera when navigating away! Only detach this page's display canvas.
      setDisplayCanvas(null);
    };
  }, [isCameraActive, getMediaStream, setDisplayCanvas]);

  // Handle Start Camera button click
  // Requirement 7: Call startCamera passing selectedDeviceId (or visionState.selectedCameraId)
  const handleStartCamera = async (deviceId?: string) => {
    const targetId = deviceId || visionState.selectedCameraId || undefined;
    const ok = await startCamera(null, null, targetId);
    if (ok && videoRef.current) {
      const stream = getMediaStream();
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      if (canvasRef.current) {
        setDisplayCanvas(canvasRef.current);
      }
    }
  };

  // Handle Stop Camera button click
  const handleStopCamera = () => {
    stopCamera();
    setDisplayCanvas(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRombergPhase("idle");
    setRombergTimer(15);
  };

  // Handle Camera Device Switch
  // Requirement 8 & 9: Reliable switching without page refresh, stops previous stream
  const handleSelectCamera = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const devId = e.target.value;
    if (devId === "realsense-unavailable") {
      return;
    }
    if (isCameraActive) {
      await switchCamera(devId);
    } else {
      await switchCamera(devId);
    }
  };

  // Romberg Protocol Loop
  useEffect(() => {
    if (rombergPhase === "idle" || rombergPhase === "complete" || !isCameraActive) return;

    const interval = setInterval(() => {
      setRombergTimer((prev) => {
        if (prev <= 1) {
          // Transition phase
          if (rombergPhase === "eyes-open") {
            setRombergPhase("eyes-closed");
            return 15; // 15 seconds of eyes closed
          } else if (rombergPhase === "eyes-closed") {
            setRombergPhase("complete");
            // Compute compliance score: penalty for violations during eyes-closed
            const score = Math.max(60, Math.round(100 - rombergViolations * 12));
            setRombergComplianceScore(score);
            return 0;
          }
        }

        // Validate eye closure during eyes-closed phase
        if (rombergPhase === "eyes-closed") {
          const isClosed = visionState.face.overallEyeState === "EYES CLOSED";
          if (!isClosed && visionState.face.hasFace) {
            setRombergViolations((v) => v + 1);
          }
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rombergPhase, isCameraActive, visionState.face.overallEyeState, visionState.face.hasFace, rombergViolations]);

  // Track single-leg hold duration
  useEffect(() => {
    if (visionState.pose?.singleLeg.isSingleLeg) {
      const current = visionState.pose.singleLeg.holdDurationSeconds;
      if (current > bestHoldDuration) {
        setBestHoldDuration(current);
      }
    }
  }, [visionState.pose?.singleLeg.holdDurationSeconds, visionState.pose?.singleLeg.isSingleLeg, bestHoldDuration]);

  // Start Romberg Protocol
  const handleStartRomberg = () => {
    setRombergPhase("eyes-open");
    setRombergTimer(15);
    setRombergViolations(0);
    setRombergComplianceScore(null);
  };

  // Reset Romberg Protocol
  const handleResetRomberg = () => {
    setRombergPhase("idle");
    setRombergTimer(15);
    setRombergViolations(0);
    setRombergComplianceScore(null);
  };

  // Requirement 13: Clear camera states (Ready, Starting, Connected, Unavailable, Permission Denied, Error)
  const getStatusColor = () => {
    switch (visionState.cameraStatus) {
      case "connected":
        return "var(--green-primary)";
      case "starting":
        return "#D97706";
      case "ready":
        return "var(--teal-primary)";
      case "unavailable":
        return "#EA580C";
      case "permission-denied":
      case "error":
        return "var(--red-alert)";
      default:
        return "var(--text-muted)";
    }
  };

  const getStatusLabel = () => {
    switch (visionState.cameraStatus) {
      case "connected":
        return "Connected";
      case "starting":
        return "Starting";
      case "ready":
        return "Ready";
      case "unavailable":
        return "Unavailable";
      case "permission-denied":
        return "Permission Denied";
      case "error":
        return "Error";
      default:
        return "Ready";
    }
  };

  const selectedCamera = visionState.availableCameras.find((c) => c.deviceId === visionState.selectedCameraId);
  const activeCameraName = visionState.activeCameraLabel || selectedCamera?.label || "None";
  const hasDeviceId = Boolean(visionState.selectedCameraId && visionState.selectedCameraId.trim().length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Top Header Card */}
      <div
        className="medical-card"
        style={{
          padding: "18px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--text-main)", letterSpacing: "-0.02em", margin: 0 }}>
              Computer Vision & Biomechanics
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 10px",
                borderRadius: "20px",
                background: isCameraActive ? "var(--bg-subtle-mint)" : "#F1F5F9",
                border: `1px solid ${isCameraActive ? "var(--border-mint)" : "#CBD5E1"}`,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: getStatusColor(),
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: getStatusColor(),
                }}
              />
              {getStatusLabel()}
            </span>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
            MediaPipe Pose Landmarker, Mathematical Eye Aspect Ratio (EAR), Romberg compliance validation, and Unipedal stance analysis.
          </p>
        </div>

        {/* Action Controls & Device Selection Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Camera Selector Dropdown & Rescan Controls (Requirements 2, 5, 6, 12) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <select
              value={visionState.selectedCameraId || ""}
              onChange={handleSelectCamera}
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid var(--border-light)",
                background: "#FFFFFF",
                fontSize: "0.8125rem",
                color: "var(--text-main)",
                fontWeight: 600,
                cursor: "pointer",
                maxWidth: "280px",
              }}
              title="Select Camera Input"
            >
              {visionState.availableCameras.length === 0 && (
                <option value="">No cameras enumerated</option>
              )}
              {visionState.availableCameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}{cam.isRealSenseRgb ? " [RealSense RGB]" : ""}
                </option>
              ))}
              {!visionState.isRealSenseAvailable && (
                <option value="realsense-unavailable" disabled>
                  Intel RealSense RGB (Unavailable)
                </option>
              )}
            </select>

            {/* Re-scan Cameras Button */}
            <button
              onClick={() => enumerateCameras(true)}
              className="btn-ghost"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 10px",
                borderRadius: "10px",
                border: "1px solid var(--border-light)",
                background: "#FFFFFF",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Re-scan and enumerate camera hardware"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {isCameraActive ? (
            <>
              {/* Mirror View Toggle */}
              <button
                onClick={toggleMirrored}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  fontSize: "0.8125rem",
                  background: isMirrored ? "var(--bg-subtle-mint)" : "#FFFFFF",
                  border: `1px solid ${isMirrored ? "var(--border-mint)" : "var(--border-light)"}`,
                  color: isMirrored ? "var(--teal-primary)" : "var(--text-secondary)",
                }}
                title="Toggle horizontal mirror"
              >
                <FlipHorizontal size={15} />
                <span>{isMirrored ? "Mirror ON" : "Mirror OFF"}</span>
              </button>

              {/* Skeleton Overlay Toggle */}
              <button
                onClick={toggleSkeletonOverlay}
                className="btn-ghost"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  fontSize: "0.8125rem",
                  background: showSkeleton ? "var(--bg-subtle-mint)" : "#FFFFFF",
                  border: `1px solid ${showSkeleton ? "var(--border-mint)" : "var(--border-light)"}`,
                  color: showSkeleton ? "var(--teal-primary)" : "var(--text-secondary)",
                }}
                title="Toggle skeletal overlay"
              >
                <Layers size={15} />
                <span>{showSkeleton ? "Skeleton ON" : "Skeleton OFF"}</span>
              </button>

              {/* Stop Camera Button */}
              <button
                onClick={handleStopCamera}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 18px",
                  borderRadius: "10px",
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  color: "var(--red-alert)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <CameraOff size={15} />
                <span>Stop Camera</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleStartCamera()}
              disabled={visionState.cameraStatus === "starting"}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 20px",
                fontSize: "0.875rem",
              }}
            >
              <Camera size={16} />
              <span>{visionState.cameraStatus === "starting" ? "Starting..." : "Start Camera"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Requirement 14: RealSense Unavailable Notice */}
      {(!visionState.isRealSenseAvailable || visionState.cameraStatus === "unavailable" || (visionState.errorMessage && visionState.errorMessage.includes("RealSense"))) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
          }}
        >
          <AlertCircle size={20} color="#D97706" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: "0.84rem" }}>
            <span style={{ fontWeight: 700 }}>
              Intel RealSense RGB camera is not available to the browser.
            </span>
            <span style={{ fontWeight: 400, marginLeft: "6px", color: "#B45309" }}>
              (Windows detects the RealSense hardware, but the browser videoinput stream is currently restricted or missing. You can use Lenovo Virtual Camera as an available fallback.)
            </span>
          </div>
        </div>
      )}

      {/* Permission Denied Notice */}
      {visionState.cameraStatus === "permission-denied" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            borderRadius: "12px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
          }}
        >
          <AlertCircle size={22} color="#D97706" />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.875rem" }}>Camera Permission Denied</div>
            <div style={{ fontSize: "0.8125rem", marginTop: "2px" }}>
              Camera access is required for movement tracking. Please allow camera permissions in your browser or Windows privacy settings, then click Start Camera again.
            </div>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Webcam Feed & Interactive Protocols */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Webcam Live Frame */}
          <div
            className="medical-card"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Camera size={17} color="var(--teal-primary)" />
                <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Live Optical Sensor Feed
                </span>
              </div>
              {isCameraActive && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    {visionState.fps} FPS
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: "var(--bg-subtle-mint)",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      color: "var(--teal-primary)",
                    }}
                  >
                    WASM Accelerated
                  </span>
                </div>
              )}
            </div>

            {/* Video Viewport Container */}
            <div
              style={{
                position: "relative",
                width: "100%",
                borderRadius: "12px",
                overflow: "hidden",
                background: "#0F172A",
                aspectRatio: "16 / 9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />

              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: isMirrored ? "scaleX(-1)" : "none",
                  pointerEvents: "none",
                  display: isCameraActive ? "block" : "none",
                }}
              />

              {/* Inactive Camera State */}
              {!isCameraActive && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                    color: "#94A3B8",
                    padding: "32px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "50%",
                      background: "#1E293B",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748B",
                    }}
                  >
                    <Camera size={28} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#E2E8F0", fontSize: "0.9375rem" }}>
                      Camera is currently in standby
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "#94A3B8", marginTop: "4px" }}>
                      Click "Start Camera" above to initiate on-device computer vision tracking.
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartCamera()}
                    className="btn-primary"
                    style={{ marginTop: "6px", padding: "8px 20px", fontSize: "0.8125rem" }}
                  >
                    Activate Camera
                  </button>
                </div>
              )}
            </div>

            {/* Quick Live Tracking Status Pill Bar */}
            {isCameraActive && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#F8FAFC",
                  borderRadius: "8px",
                  fontSize: "0.75rem",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div style={{ display: "flex", gap: "16px" }}>
                  <span>
                    Pose:{" "}
                    <strong style={{ color: visionState.hasPose ? "var(--teal-primary)" : "var(--text-muted)" }}>
                      {visionState.hasPose ? "Tracked" : "Searching"}
                    </strong>
                  </span>
                  <span>
                    Face:{" "}
                    <strong style={{ color: visionState.face.hasFace ? "var(--green-primary)" : "var(--text-muted)" }}>
                      {visionState.face.hasFace ? "Detected" : "Searching"}
                    </strong>
                  </span>
                  <span>
                    Eyes:{" "}
                    <strong
                      style={{
                        color:
                          visionState.face.overallEyeState === "EYES OPEN"
                            ? "var(--green-primary)"
                            : visionState.face.overallEyeState === "EYES CLOSED"
                            ? "#D97706"
                            : "var(--text-muted)",
                      }}
                    >
                      {visionState.face.overallEyeState}
                    </strong>
                  </span>
                </div>

                <div style={{ display: "flex", gap: "12px", color: "var(--text-secondary)" }}>
                  <span>
                    EAR: <strong style={{ color: "var(--text-main)" }}>{visionState.face.averageEAR}</strong>
                  </span>
                  <span>
                    Shoulder:{" "}
                    <strong style={{ color: "var(--text-main)" }}>
                      {visionState.pose
                        ? visionState.pose.shoulderTiltDeg === 0
                          ? "0° (Level)"
                          : `${Math.abs(visionState.pose.shoulderTiltDeg)}° (${visionState.pose.shoulderTiltDeg > 0 ? "R" : "L"})`
                        : "—"}
                    </strong>
                  </span>
                  <span>
                    Pitch:{" "}
                    <strong style={{ color: "var(--text-main)" }}>
                      {visionState.pose
                        ? visionState.pose.trunkPitchDeg === 0
                          ? "0° (Upright)"
                          : `${Math.abs(visionState.pose.trunkPitchDeg)}° (${visionState.pose.trunkPitchDeg > 0 ? "Fwd" : "Back"})`
                        : "—"}
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {/* Requirement 15: Small diagnostic section during development */}
            <div
              style={{
                marginTop: "4px",
                padding: "12px 16px",
                background: "#F8FAFC",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Activity size={13} color="var(--teal-primary)" />
                  Camera Diagnostics (Phase 5 Telemetry)
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "6px",
                    background: isCameraActive ? "var(--bg-subtle-mint)" : "#EDF2F7",
                    color: isCameraActive ? "var(--green-primary)" : "var(--text-muted)",
                  }}
                >
                  {isCameraActive ? "Live Stream" : "Standby"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "10px",
                  fontSize: "0.8125rem",
                  paddingTop: "2px",
                }}
              >
                {/* 1. Camera Name */}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Camera Name
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--text-main)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={activeCameraName}
                  >
                    {activeCameraName}
                  </div>
                </div>

                {/* 2. Device ID detected */}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Device ID detected
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: hasDeviceId ? "var(--green-primary)" : "var(--red-alert)",
                    }}
                  >
                    {hasDeviceId ? "Yes" : "No"}
                  </div>
                </div>

                {/* 3. Resolution */}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Resolution
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--text-main)" }}>
                    {visionState.activeResolution || "--"}
                  </div>
                </div>

                {/* 4. FPS */}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    FPS
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--teal-primary)" }}>
                    {visionState.fps} FPS
                  </div>
                </div>

                {/* 5. Stream Status */}
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    Stream Status
                  </div>
                  <div style={{ fontWeight: 700, color: getStatusColor() }}>
                    {getStatusLabel()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Protocol Validation Suite */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* Protocol Tabs */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} color="var(--teal-primary)" />
                <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                  Active Clinical Protocols
                </h2>
              </div>

              <div style={{ display: "flex", gap: "6px", background: "#F1F5F9", padding: "3px", borderRadius: "8px" }}>
                <button
                  onClick={() => setActiveProtocol("romberg")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: activeProtocol === "romberg" ? "#FFFFFF" : "transparent",
                    color: activeProtocol === "romberg" ? "var(--teal-primary)" : "var(--text-secondary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: activeProtocol === "romberg" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Romberg (EAR)
                </button>
                <button
                  onClick={() => setActiveProtocol("single-leg")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: activeProtocol === "single-leg" ? "#FFFFFF" : "transparent",
                    color: activeProtocol === "single-leg" ? "var(--teal-primary)" : "var(--text-secondary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: activeProtocol === "single-leg" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Single-Leg Stance
                </button>
                <button
                  onClick={() => setActiveProtocol("reach")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: activeProtocol === "reach" ? "#FFFFFF" : "transparent",
                    color: activeProtocol === "reach" ? "var(--teal-primary)" : "var(--text-secondary)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: activeProtocol === "reach" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  Functional Reach
                </button>
              </div>
            </div>

            {/* PROTOCOL 1: ROMBERG PROTOCOL (EAR VALIDATED) */}
            {activeProtocol === "romberg" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  The Romberg Protocol evaluates vestibular vs proprioceptive balance by comparing stability during Eyes Open vs Eyes Closed. MediaPipe EAR automatically verifies continuous compliance.
                </p>

                {/* Status Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    borderRadius: "12px",
                    background:
                      rombergPhase === "eyes-closed"
                        ? "#FEF3C7"
                        : rombergPhase === "eyes-open"
                        ? "var(--bg-subtle-mint)"
                        : rombergPhase === "complete"
                        ? "#ECFDF5"
                        : "#F8FAFC",
                    border: `1px solid ${
                      rombergPhase === "eyes-closed"
                        ? "#FDE68A"
                        : rombergPhase === "eyes-open"
                        ? "var(--border-mint)"
                        : rombergPhase === "complete"
                        ? "#A7F3D0"
                        : "var(--border-light)"
                    }`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {rombergPhase === "eyes-open" ? (
                      <Eye size={22} color="var(--teal-primary)" />
                    ) : rombergPhase === "eyes-closed" ? (
                      <EyeOff size={22} color="#B45309" />
                    ) : rombergPhase === "complete" ? (
                      <Award size={22} color="var(--green-primary)" />
                    ) : (
                      <Activity size={22} color="var(--text-muted)" />
                    )}

                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                        {rombergPhase === "idle" && "Ready to Start Romberg Protocol"}
                        {rombergPhase === "eyes-open" && "Phase 1: Eyes Open (Steady Stance)"}
                        {rombergPhase === "eyes-closed" && "Phase 2: Eyes Closed (Compliance Active)"}
                        {rombergPhase === "complete" && "Romberg Protocol Completed"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {rombergPhase === "idle" && "Click Start to begin 15s eyes-open followed by 15s eyes-closed."}
                        {rombergPhase === "eyes-open" && `Hold position with eyes open: ${rombergTimer}s remaining`}
                        {rombergPhase === "eyes-closed" &&
                          `Keep eyes closed! EAR is continuously monitored: ${rombergTimer}s remaining`}
                        {rombergPhase === "complete" &&
                          `Clinical score: ${rombergComplianceScore}% | Infractions: ${rombergViolations}`}
                      </div>
                    </div>
                  </div>

                  {/* Timer & Controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {rombergPhase !== "idle" && rombergPhase !== "complete" && (
                      <div
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: rombergPhase === "eyes-closed" ? "#B45309" : "var(--teal-primary)",
                        }}
                      >
                        {rombergTimer}s
                      </div>
                    )}

                    {rombergPhase === "idle" ? (
                      <button
                        onClick={handleStartRomberg}
                        disabled={!isCameraActive}
                        className="btn-primary"
                        style={{ padding: "8px 16px", fontSize: "0.8125rem" }}
                      >
                        <Play size={14} />
                        <span>Start Test</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleResetRomberg}
                        className="btn-secondary"
                        style={{ padding: "8px 14px", fontSize: "0.8125rem" }}
                      >
                        <RotateCcw size={14} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Violation Warning Alert */}
                {rombergPhase === "eyes-closed" && visionState.face.overallEyeState !== "EYES CLOSED" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "#FEF2F2",
                      border: "1px solid #FECACA",
                      borderRadius: "8px",
                      color: "var(--red-alert)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>Eye opening detected during closed phase! Please keep eyes closed.</span>
                  </div>
                )}
              </div>
            )}

            {/* PROTOCOL 2: SINGLE-LEG STANCE */}
            {activeProtocol === "single-leg" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  Unipedal Stance Test measures postural control by tracking unipedal ground elevation. Pose Landmarker detects when one ankle is elevated above ground baseline.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  {/* Current Hold */}
                  <div style={{ background: "#F8FAFC", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Current Stance Hold
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px" }}>
                      {visionState.pose?.singleLeg.holdDurationSeconds || 0}s
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Status:{" "}
                      <strong>
                        {visionState.pose?.singleLeg.isSingleLeg
                          ? `${visionState.pose.singleLeg.liftedLeg} Foot Elevated`
                          : "Both Feet on Ground"}
                      </strong>
                    </div>
                  </div>

                  {/* Best Session Hold */}
                  <div style={{ background: "#F8FAFC", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Session Best Hold
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green-primary)", marginTop: "4px" }}>
                      {bestHoldDuration}s
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Target: &gt; 10s unipedal stability
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PROTOCOL 3: FUNCTIONAL REACH TEST */}
            {activeProtocol === "reach" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  Measures maximum forward and lateral reach distance while maintaining a fixed base of support, validating dynamic stability margins.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <div style={{ background: "#F8FAFC", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Arm Extension Ratio
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--teal-primary)", marginTop: "4px" }}>
                      {visionState.pose?.armReach.maxReachRatio || 0}x
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Relative to shoulder breadth
                    </div>
                  </div>

                  <div style={{ background: "#F8FAFC", padding: "14px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Reaching Classification
                    </div>
                    <div
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: visionState.pose?.armReach.isReachingForward ? "var(--green-primary)" : "var(--text-muted)",
                        marginTop: "8px",
                      }}
                    >
                      {visionState.pose?.armReach.isReachingForward ? "Forward Extension Active" : "Resting Posture"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Exercise Reset & Disclaimer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)" }}>
                <Info size={14} />
                <span style={{ fontSize: "0.6875rem" }}>
                  Engineering prototype for balance biofeedback. Complies with local privacy invariants.
                </span>
              </div>
              <button
                onClick={handleResetRomberg}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-light)",
                  background: "#FFFFFF",
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Reset Demo
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Real-Time Vision Analytics Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Card 1: Mathematical Eye Aspect Ratio (EAR) & Blink Engine */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={18} color="var(--teal-primary)" />
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                  Eye Aspect Ratio (EAR) Engine
                </h3>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: visionState.face.hasFace ? "var(--green-primary)" : "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: visionState.face.hasFace ? "var(--bg-subtle-mint)" : "#F1F5F9",
                }}
              >
                {visionState.face.hasFace ? "Mesh Active" : "No Face"}
              </span>
            </div>

            {/* EAR Gauges (Left Eye & Right Eye) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Left Eye */}
              <div style={{ background: "#F8FAFC", borderRadius: "10px", padding: "12px", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Left Eye EAR</span>
                  <span style={{ fontWeight: 700, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                    {visionState.face.leftEAR}
                  </span>
                </div>
                {/* Visual Meter Bar */}
                <div style={{ height: "6px", background: "#E2E8F0", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (visionState.face.leftEAR / 0.4) * 100)}%`,
                      background:
                        visionState.face.leftEAR >= visionState.face.earThreshold
                          ? "var(--green-primary)"
                          : "var(--red-alert)",
                      transition: "width 0.1s ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  State: <strong>{visionState.face.leftEyeState}</strong>
                </div>
              </div>

              {/* Right Eye */}
              <div style={{ background: "#F8FAFC", borderRadius: "10px", padding: "12px", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Right Eye EAR</span>
                  <span style={{ fontWeight: 700, color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                    {visionState.face.rightEAR}
                  </span>
                </div>
                {/* Visual Meter Bar */}
                <div style={{ height: "6px", background: "#E2E8F0", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (visionState.face.rightEAR / 0.4) * 100)}%`,
                      background:
                        visionState.face.rightEAR >= visionState.face.earThreshold
                          ? "var(--green-primary)"
                          : "var(--red-alert)",
                      transition: "width 0.1s ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                  State: <strong>{visionState.face.rightEyeState}</strong>
                </div>
              </div>
            </div>

            {/* Overall EAR Banner & Calibration Slider */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "12px",
                background: "var(--bg-subtle-mint)",
                borderRadius: "10px",
                border: "1px solid var(--border-mint)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Composite Status:
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    color:
                      visionState.face.overallEyeState === "EYES OPEN"
                        ? "var(--teal-primary)"
                        : visionState.face.overallEyeState === "EYES CLOSED"
                        ? "#B45309"
                        : "var(--text-muted)",
                  }}
                >
                  {visionState.face.overallEyeState}
                </span>
              </div>

              {/* EAR Threshold Calibration Slider */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                  <span>EAR Closure Threshold: {visionState.face.earThreshold}</span>
                  <span>(Calibrate for glasses / morphology)</span>
                </div>
                <input
                  type="range"
                  min="0.14"
                  max="0.28"
                  step="0.01"
                  value={visionState.face.earThreshold}
                  onChange={(e) => setEarThreshold(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--teal-primary)", cursor: "pointer" }}
                />
              </div>
            </div>

            {/* Temporal Blink Metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "8px",
                textAlign: "center",
                paddingTop: "4px",
              }}
            >
              <div style={{ background: "#F8FAFC", padding: "10px 6px", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Blinks</span>
                <span style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--teal-primary)" }}>
                  {visionState.blink.blinkCount}
                </span>
              </div>

              <div style={{ background: "#F8FAFC", padding: "10px 6px", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Rate</span>
                <span style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  {visionState.blink.blinkRatePerMinute}/m
                </span>
              </div>

              <div style={{ background: "#F8FAFC", padding: "10px 6px", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Duration</span>
                <span style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>
                  {visionState.blink.lastBlinkDurationMs ? `${visionState.blink.lastBlinkDurationMs}ms` : "—"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={resetBlinkCount}
                className="btn-ghost"
                style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.6875rem", padding: "4px 8px" }}
              >
                <RefreshCw size={12} />
                <span>Reset Blinks</span>
              </button>
            </div>
          </div>

          {/* Card 2: Biomechanical Pose Landmarks & Alignment */}
          <div
            className="medical-card"
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} color="var(--teal-primary)" />
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
                  Pose Biomechanics & Alignment
                </h3>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: visionState.hasPose ? "var(--green-primary)" : "var(--text-muted)",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: visionState.hasPose ? "var(--bg-subtle-mint)" : "#F1F5F9",
                }}
              >
                {visionState.hasPose ? "Kinematics Active" : "No Body"}
              </span>
            </div>

            {/* Posture Classification Banner */}
            {visionState.pose && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background:
                    visionState.pose.postureLean === "NEUTRAL"
                      ? "var(--bg-subtle-mint)"
                      : "#FEF3C7",
                  border: `1px solid ${
                    visionState.pose.postureLean === "NEUTRAL"
                      ? "var(--border-mint)"
                      : "#FDE68A"
                  }`,
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Alignment Status:
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 800,
                    color:
                      visionState.pose.postureLean === "NEUTRAL"
                        ? "var(--teal-primary)"
                        : "#B45309",
                  }}
                >
                  {visionState.pose.postureLean === "NEUTRAL" && "✓ Neutral Posture (Balanced)"}
                  {visionState.pose.postureLean === "LEAN_LEFT" && "⚠ Lean Left (Coronal Tilt)"}
                  {visionState.pose.postureLean === "LEAN_RIGHT" && "⚠ Lean Right (Coronal Tilt)"}
                  {visionState.pose.postureLean === "LEAN_FORWARD" && "⚠ Lean Forward (Sagittal Pitch)"}
                  {visionState.pose.postureLean === "LEAN_BACKWARD" && "⚠ Lean Backward (Sagittal Pitch)"}
                </span>
              </div>
            )}

            {/* Coronal & Sagittal Alignment Metrics Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>
                  Shoulder Tilt
                </span>
                <span
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color:
                      visionState.pose && Math.abs(visionState.pose.shoulderTiltDeg) > 5
                        ? "#D97706"
                        : "var(--text-main)",
                  }}
                >
                  {visionState.pose
                    ? visionState.pose.shoulderTiltDeg === 0
                      ? "0° (Level)"
                      : `${Math.abs(visionState.pose.shoulderTiltDeg)}° (${visionState.pose.shoulderTiltDeg > 0 ? "Right" : "Left"})`
                    : "—"}
                </span>
              </div>

              <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>
                  Pelvic Hip Tilt
                </span>
                <span
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color:
                      visionState.pose && Math.abs(visionState.pose.hipTiltDeg) > 5
                        ? "#D97706"
                        : "var(--text-main)",
                  }}
                >
                  {visionState.pose
                    ? visionState.pose.hipTiltDeg === 0
                      ? "0° (Level)"
                      : `${Math.abs(visionState.pose.hipTiltDeg)}° (${visionState.pose.hipTiltDeg > 0 ? "Right" : "Left"})`
                    : "—"}
                </span>
              </div>

              <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>
                  Head Tilt Angle
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-main)" }}>
                  {visionState.pose
                    ? visionState.pose.headTiltDeg === 0
                      ? "0° (Upright)"
                      : `${Math.abs(visionState.pose.headTiltDeg)}° (${visionState.pose.headTiltDeg > 0 ? "Right" : "Left"})`
                    : "—"}
                </span>
              </div>

              <div style={{ background: "#F8FAFC", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>
                  Trunk Pitch (Sagittal)
                </span>
                <span
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    color:
                      visionState.pose && Math.abs(visionState.pose.trunkPitchDeg) > 6
                        ? "#D97706"
                        : "var(--text-main)",
                  }}
                >
                  {visionState.pose
                    ? visionState.pose.trunkPitchDeg === 0
                      ? "0° (Upright)"
                      : `${Math.abs(visionState.pose.trunkPitchDeg)}° (${visionState.pose.trunkPitchDeg > 0 ? "Forward" : "Backward"})`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Lower Extremity Angles (Knee Flexion & Stance) */}
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Lower Extremity Kinematics:
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.75rem" }}>
                <div style={{ background: "#F8FAFC", padding: "6px 10px", borderRadius: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Left Knee: </span>
                  <strong>{visionState.pose ? `${visionState.pose.kneeFlexion.leftKneeAngleDeg}°` : "—"}</strong>
                </div>
                <div style={{ background: "#F8FAFC", padding: "6px 10px", borderRadius: "6px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Right Knee: </span>
                  <strong>{visionState.pose ? `${visionState.pose.kneeFlexion.rightKneeAngleDeg}°` : "—"}</strong>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background:
                    visionState.pose?.singleLeg.isSingleLeg
                      ? "var(--bg-subtle-mint)"
                      : "#F8FAFC",
                  border: `1px solid ${
                    visionState.pose?.singleLeg.isSingleLeg
                      ? "var(--border-mint)"
                      : "var(--border-light)"
                  }`,
                  fontSize: "0.75rem",
                }}
              >
                <span style={{ color: "var(--text-secondary)" }}>Single-Leg Stance:</span>
                <strong style={{ color: visionState.pose?.singleLeg.isSingleLeg ? "var(--teal-primary)" : "var(--text-muted)" }}>
                  {visionState.pose?.singleLeg.isSingleLeg
                    ? `${visionState.pose.singleLeg.liftedLeg} Foot Lifted (+${visionState.pose.singleLeg.elevationRatio}x)`
                    : "Bipedal (Both Down)"}
                </strong>
              </div>
            </div>
          </div>

          {/* Privacy & Safety Information Card */}
          <div
            style={{
              background: "#F8FAFC",
              borderRadius: "14px",
              border: "1px solid var(--border-light)",
              padding: "16px",
              display: "flex",
              gap: "12px",
            }}
          >
            <ShieldCheck size={22} color="var(--teal-primary)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
                Strict On-Device Privacy Guarantee
              </div>
              <p style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.4, margin: 0 }}>
                All camera frames and geometric landmark calculations are executed locally inside WebAssembly memory. Patient video streams are never recorded, saved to disk, or sent across any network.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
