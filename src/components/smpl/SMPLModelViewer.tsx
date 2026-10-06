import React, { useState, useRef, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import {
  Camera,
  Eye,
  RotateCcw,
  Layers,
  Sparkles,
  Info,
  Compass,
  Activity,
  Scale,
  AlertTriangle,
} from "lucide-react";
import { SMPLPose, NEUTRAL_SMPL_POSE, SMPLAssetStatus } from "../../types/smpl";
import { SMPLBody } from "./SMPLBody";
import { BalanceBoardPlatform3D } from "./BalanceBoardPlatform3D";
import { SMPLPoseDebugInfo } from "../../services/vision/MediaPipePoseToSMPLAdapter";
import { MultimodalTelemetryMode, MultimodalDataSource } from "../../types/multimodal";

export type ViewPreset = "front" | "perspective" | "side" | "top";

interface CameraPresetConfig {
  position: [number, number, number];
  target: [number, number, number];
}

const VIEW_PRESETS: Record<ViewPreset, CameraPresetConfig> = {
  front: {
    position: [0, 1.05, 2.65],
    target: [0, 0.85, 0],
  },
  perspective: {
    position: [1.65, 1.35, 2.15],
    target: [0, 0.85, 0],
  },
  side: {
    position: [2.75, 1.05, 0],
    target: [0, 0.85, 0],
  },
  top: {
    position: [0, 2.95, 0.04],
    target: [0, 0.04, 0],
  },
};

interface CameraControllerProps {
  preset: ViewPreset;
  transitionCount: number;
}

/** Smooth camera interpolator to preset views */
const CameraController: React.FC<CameraControllerProps> = ({ preset, transitionCount }) => {
  const targetConfig = VIEW_PRESETS[preset];
  const lastTransitionRef = useRef(transitionCount);
  const transitioningRef = useRef(false);

  React.useEffect(() => {
    lastTransitionRef.current = transitionCount;
    transitioningRef.current = true;
  }, [preset, transitionCount]);

  useFrame(({ camera }) => {
    if (!transitioningRef.current) return;

    const [tx, ty, tz] = targetConfig.position;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.12);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.12);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, tz, 0.12);

    const dist = Math.hypot(
      camera.position.x - tx,
      camera.position.y - ty,
      camera.position.z - tz
    );

    if (dist < 0.01) {
      camera.position.set(tx, ty, tz);
      transitioningRef.current = false;
    }
  });

  return null;
};

export interface SMPLModelViewerProps {
  /** Target SMPL joint rotations and root transforms */
  pose?: SMPLPose;
  /** Normalized COP offset: x in [-1, 1], y in [-1, 1], or null if unavailable */
  copOffset?: { x: number; y: number } | null;
  /** Active multimodal telemetry mode */
  telemetryMode?: MultimodalTelemetryMode;
  /** Explicit data source: "REAL_HARDWARE" | "SIMULATION" | "NONE" */
  dataSource?: MultimodalDataSource;
  /** Mandatory development simulation warning banner */
  simulationWarning?: string | null;
  /** Physical board connection status */
  boardConnected?: boolean;
  /** Initial view preset (default: "front") */
  initialView?: ViewPreset;
  /** Uniform model scale */
  scale?: number;
  /** Height of viewer container */
  height?: string | number;
  /** Whether to show clinical toolbar controls */
  showControls?: boolean;
  /** Whether to show the top asset status banner */
  showStatusBanner?: boolean;
  /** Asset URL (default: /models/smpl_neutral.glb) */
  assetUrl?: string;
  /** Optional title badge */
  title?: string;
  /** Optional tracking confidence from camera pose estimation [0, 1] */
  trackingConfidence?: number;
  /** Optional debug information from MediaPipe pose adapter */
  debugInfo?: SMPLPoseDebugInfo;
  /** Whether the model is driven by live camera tracking */
  isLiveTracking?: boolean;
  /** Callback when smoothing alpha changes */
  onSmoothingAlphaChange?: (alpha: number) => void;
  /** Active smoothing alpha value */
  smoothingAlpha?: number;
}

/**
 * SMPLModelViewer Component
 *
 * Professional clinical 3D viewer for the SMPL Human Body Model standing on the
 * Wii Balance Board force plate.
 *
 * Features:
 * - Neutral standing anatomical pose facing FRONT (+Y)
 * - 4 Medical camera presets: Front (Anterior), Perspective, Side (Sagittal), Top (Overhead)
 * - OrbitControls for rotate/orbit and pinch/scroll zoom
 * - Toggles for Joint Markers, Kinematic Bones, Wireframe
 * - Real-time COP indicator aligned with board surface
 * - Fallback architecture with clear asset status badge
 * - Camera Pose Estimation Integration (Phase 4) with visual debug mode
 */
export const SMPLModelViewer: React.FC<SMPLModelViewerProps> = ({
  pose = NEUTRAL_SMPL_POSE,
  copOffset = null,
  telemetryMode,
  dataSource,
  simulationWarning,
  initialView = "front",
  scale = 0.95,
  height = "100%",
  showControls = true,
  showStatusBanner = true,
  assetUrl = "/models/smpl_neutral.glb",
  title = "SMPL Biomechanical Avatar",
  trackingConfidence,
  isLiveTracking = false,
}) => {
  const [activeView, setActiveView] = useState<ViewPreset>(initialView);
  const [transitionCount, setTransitionCount] = useState<number>(0);

  // Display toggles
  const [showJointMarkers, setShowJointMarkers] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  // Asset status state
  const [assetStatus, setAssetStatus] = useState<SMPLAssetStatus>("pending");


  const handleSelectView = useCallback((view: ViewPreset) => {
    setActiveView(view);
    setTransitionCount((c) => c + 1);
  }, []);

  const handleResetView = useCallback(() => {
    setActiveView("front");
    setTransitionCount((c) => c + 1);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        background: "linear-gradient(180deg, #F8FAFC 0%, #F0FDF4 100%)",
        borderRadius: "16px",
        overflow: "hidden",
        border: "1px solid #E2E8F0",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* --- TOP STATUS & CONTROL BAR --- */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {/* Left: Title Badge & Multimodal Statuses */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "auto", flexWrap: "wrap" }}>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(8px)",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #E2E8F0",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#0F172A",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Compass size={14} color="#0D9488" />
            <span>{title}</span>
          </div>

          {/* Multimodal Mode Badge */}
          {telemetryMode && (
            <div
              style={{
                background:
                  telemetryMode === "FULL_MULTIMODAL"
                    ? "#ECFDF5"
                    : telemetryMode === "VISION_ONLY"
                    ? "#EFF6FF"
                    : telemetryMode === "BALANCE_ONLY"
                    ? "#FFFBEB"
                    : "#F1F5F9",
                border: `1px solid ${
                  telemetryMode === "FULL_MULTIMODAL"
                    ? "#A7F3D0"
                    : telemetryMode === "VISION_ONLY"
                    ? "#BFDBFE"
                    : telemetryMode === "BALANCE_ONLY"
                    ? "#FDE68A"
                    : "#CBD5E1"
                }`,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color:
                  telemetryMode === "FULL_MULTIMODAL"
                    ? "#065F46"
                    : telemetryMode === "VISION_ONLY"
                    ? "#1E40AF"
                    : telemetryMode === "BALANCE_ONLY"
                    ? "#92400E"
                    : "#475569",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <span>{telemetryMode.replace("_", " ")}</span>
            </div>
          )}

          {/* Wii Hardware / Simulation Status */}
          {dataSource && (
            <div
              style={{
                background:
                  dataSource === "REAL_HARDWARE"
                    ? "#ECFDF5"
                    : dataSource === "SIMULATION"
                    ? "#FFFBEB"
                    : "#F8FAFC",
                border: `1px solid ${
                  dataSource === "REAL_HARDWARE"
                    ? "#A7F3D0"
                    : dataSource === "SIMULATION"
                    ? "#FDE68A"
                    : "#E2E8F0"
                }`,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color:
                  dataSource === "REAL_HARDWARE"
                    ? "#065F46"
                    : dataSource === "SIMULATION"
                    ? "#92400E"
                    : "#64748B",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <Scale size={12} />
              <span>
                Wii Board:{" "}
                {dataSource === "REAL_HARDWARE"
                  ? "Connected"
                  : dataSource === "SIMULATION"
                  ? "Simulated"
                  : "Not Connected"}
              </span>
            </div>
          )}

          {/* Camera Tracking Status */}
          {isLiveTracking ? (
            <div
              style={{
                background: "#ECFDF5",
                border: "1px solid #A7F3D0",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#065F46",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <Activity size={12} color="#059669" />
              <span>Camera Tracking ({Math.round((trackingConfidence ?? 0) * 100)}%)</span>
            </div>
          ) : (
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#64748B",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Camera size={12} />
              <span>Camera: Standby</span>
            </div>
          )}

          {showStatusBanner && (
            <div
              onClick={() => setShowInfoModal(true)}
              style={{
                background: assetStatus === "loaded" ? "#ECFDF5" : "#FFFBEB",
                border: `1px solid ${assetStatus === "loaded" ? "#A7F3D0" : "#FDE68A"}`,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: assetStatus === "loaded" ? "#065F46" : "#92400E",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              title="Click for SMPL Asset Status Information"
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: assetStatus === "loaded" ? "#10B981" : "#F59E0B",
                  display: "inline-block",
                }}
              />
              {assetStatus === "loaded"
                ? "SMPL Mesh Active"
                : "SMPL Asset Pending (Kinematic Fallback Active)"}
              <Info size={12} style={{ opacity: 0.7 }} />
            </div>
          )}
        </div>

        {/* Right: Reset View & Info Action */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", pointerEvents: "auto" }}>
          <button
            onClick={handleResetView}
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(8px)",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#334155",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
            title="Reset to default front view"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Mandatory Development Simulation Warning Banner */}
      {(simulationWarning || dataSource === "SIMULATION") && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 12,
            right: 12,
            background: "#FFFBEB",
            border: "1px solid #F59E0B",
            borderRadius: "8px",
            padding: "6px 14px",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#B45309",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            zIndex: 12,
            boxShadow: "0 2px 6px rgba(180, 83, 9, 0.1)",
          }}
        >
          <AlertTriangle size={14} color="#D97706" />
          <span>DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA</span>
        </div>
      )}

      {/* --- THREE.JS 3D CANVAS --- */}
      <div style={{ flex: 1, width: "100%", height: "100%" }}>
        <Canvas
          shadows
          camera={{
            position: VIEW_PRESETS[initialView].position,
            fov: 42,
          }}
          style={{ width: "100%", height: "100%" }}
          gl={{ antialias: true, alpha: true }}
        >
          {/* Preset Camera Interpolator */}
          <CameraController preset={activeView} transitionCount={transitionCount} />

          {/* Clinical Soft Lighting Setup */}
          <ambientLight intensity={0.75} color="#FFFFFF" />
          <directionalLight
            position={[3, 5, 3]}
            intensity={0.85}
            castShadow
            shadow-mapSize={[1024, 1024]}
            color="#FFFFFF"
          />
          <directionalLight position={[-2, 3, -2]} intensity={0.35} color="#E6FFFA" />
          <hemisphereLight intensity={0.35} color="#FFFFFF" groundColor="#E2E8F0" />

          {/* SMPL Human Body Model Standing on Balance Board */}
          <SMPLBody
            pose={pose}
            position={[0, 0.041, 0]}
            scale={scale}
            wireframe={wireframe}
            showJointMarkers={showJointMarkers}
            showSkeleton={showSkeleton}
            assetUrl={assetUrl}
            onAssetStatusChange={(status) => setAssetStatus(status)}
          />

          {/* Standardized 3D Balance Board Force Plate Platform */}
          <BalanceBoardPlatform3D copOffset={copOffset} showCop={copOffset !== null} showLabels={true} />

          {/* Soft Ground Contact Shadow */}
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={0.35}
            scale={3.0}
            blur={1.8}
            far={1.5}
            color="#0F172A"
          />

          {/* Ground Medical Disc */}
          <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.35, 48]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.85} />
          </mesh>

          {/* Constrained Clinical Orbit Controls */}
          <OrbitControls
            enablePan={false}
            minDistance={1.6}
            maxDistance={4.2}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.02}
            target={VIEW_PRESETS[activeView].target}
            dampingFactor={0.08}
            enableDamping
          />
        </Canvas>
      </div>

      {/* --- BOTTOM CLINICAL CONTROLS TOOLBAR --- */}
      {showControls && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {/* Left: View Angle Presets */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(8px)",
              padding: "4px",
              borderRadius: "10px",
              border: "1px solid #E2E8F0",
              display: "flex",
              gap: "4px",
              pointerEvents: "auto",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <button
              onClick={() => handleSelectView("front")}
              style={{
                background: activeView === "front" ? "#0D9488" : "transparent",
                color: activeView === "front" ? "#FFFFFF" : "#475569",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              <Eye size={13} />
              Front
            </button>

            <button
              onClick={() => handleSelectView("perspective")}
              style={{
                background: activeView === "perspective" ? "#0D9488" : "transparent",
                color: activeView === "perspective" ? "#FFFFFF" : "#475569",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              <Camera size={13} />
              Perspective
            </button>

            <button
              onClick={() => handleSelectView("side")}
              style={{
                background: activeView === "side" ? "#0D9488" : "transparent",
                color: activeView === "side" ? "#FFFFFF" : "#475569",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              Side (Sagittal)
            </button>

            <button
              onClick={() => handleSelectView("top")}
              style={{
                background: activeView === "top" ? "#0D9488" : "transparent",
                color: activeView === "top" ? "#FFFFFF" : "#475569",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              Top (Plate)
            </button>
          </div>

          {/* Right: Visual Toggles (Joints, Skeleton, Wireframe) */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(8px)",
              padding: "4px",
              borderRadius: "10px",
              border: "1px solid #E2E8F0",
              display: "flex",
              gap: "4px",
              pointerEvents: "auto",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}
          >
            <button
              onClick={() => setShowJointMarkers((v) => !v)}
              style={{
                background: showJointMarkers ? "#CCFBF1" : "transparent",
                color: showJointMarkers ? "#0F766E" : "#64748B",
                border: `1px solid ${showJointMarkers ? "#14B8A6" : "transparent"}`,
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Toggle 24 SMPL Joint Markers"
            >
              <Sparkles size={13} />
              Joints
            </button>

            <button
              onClick={() => setShowSkeleton((v) => !v)}
              style={{
                background: showSkeleton ? "#CCFBF1" : "transparent",
                color: showSkeleton ? "#0F766E" : "#64748B",
                border: `1px solid ${showSkeleton ? "#14B8A6" : "transparent"}`,
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Toggle Kinematic Skeleton Volumes"
            >
              Skeleton
            </button>

            <button
              onClick={() => setWireframe((v) => !v)}

              style={{
                background: wireframe ? "#CCFBF1" : "transparent",
                color: wireframe ? "#0F766E" : "#64748B",
                border: `1px solid ${wireframe ? "#14B8A6" : "transparent"}`,
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
              title="Toggle Mesh Wireframe Mode"
            >
              <Layers size={13} />
              Wireframe
            </button>
          </div>
        </div>
      )}

      {/* --- SMPL ASSET INFORMATION MODAL --- */}
      {showInfoModal && (
        <div
          onClick={() => setShowInfoModal(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
              border: "1px solid #E2E8F0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  background: "#CCFBF1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0D9488",
                }}
              >
                <Info size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.0625rem", color: "#0F172A", fontWeight: 700 }}>
                  SMPL Model Integration Architecture
                </h3>
                <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                  Phase 3 Standardized Biomechanical Model
                </span>
              </div>
            </div>

            <div style={{ fontSize: "0.8125rem", color: "#334155", lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                PatientBalanceAI is integrated with the standard <strong>SMPL 24-joint kinematic skeleton</strong> for
                clinical posture visualization and balance assessment.
              </p>
              <div
                style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: "4px" }}>
                  Asset Configuration:
                </div>
                <div>Expected file: <code>public/models/smpl_neutral.glb</code></div>
                <div>Status: <strong>{assetStatus === "loaded" ? "Active" : "Asset Pending (Kinematic Fallback Running)"}</strong></div>
              </div>
              <p style={{ margin: 0 }}>
                When the official skinned SMPL GLB mesh is placed in the designated path,
                it will automatically load and bind to the 24 SMPL joint rotations.
                In the meantime, the full 24-joint kinematic architecture accurately renders the
                neutral standing pose aligned with the Wii Balance Board force plate.
              </p>
            </div>

            <div style={{ marginTop: "18px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowInfoModal(false)}
                style={{
                  background: "#0D9488",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
