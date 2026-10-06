import React, { useState, useEffect } from "react";
import {
  SMPLPose,
  NEUTRAL_SMPL_POSE,
  SMPLAssetStatus,
} from "../../types/smpl";
import { SMPLKinematicFallback } from "./SMPLKinematicFallback";
import { SMPLModel } from "./SMPLModel";

export interface SMPLBodyProps {
  /** Target SMPL joint rotations and root transforms */
  pose?: SMPLPose;
  /** Shape coefficients beta (optional) */
  betas?: number[];
  /** World position [x, y, z] */
  position?: [number, number, number];
  /** World orientation Euler [rx, ry, rz] */
  rotation?: [number, number, number];
  /** Uniform scale factor */
  scale?: number;
  /** Visibility toggle */
  visible?: boolean;
  /** Wireframe display toggle */
  wireframe?: boolean;
  /** Show anatomical joint sphere markers */
  showJointMarkers?: boolean;
  /** Show kinematic skeleton connector segments */
  showSkeleton?: boolean;
  /** Custom asset URL (default: /models/smpl_neutral.glb) */
  assetUrl?: string;
  /** Opacity of the body surface (0.0 to 1.0) */
  opacity?: number;
  /** Callback fired when asset loading status changes */
  onAssetStatusChange?: (status: SMPLAssetStatus) => void;
}

/** Error Boundary specifically for 3D GLTF asset loading */
class AssetErrorBoundary extends React.Component<
  { fallback: React.ReactNode; onError: (err: Error) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; onError: (err: Error) => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * SMPLBody Component
 *
 * Clean high-level abstraction for the SMPL Human Body Model in PatientBalanceAI.
 * Manages official SMPL mesh loading, kinematic joint articulation, and graceful
 * clinical fallback when the SMPL mesh asset is pending.
 */
export const SMPLBody: React.FC<SMPLBodyProps> = ({
  pose = NEUTRAL_SMPL_POSE,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1.0,
  visible = true,
  wireframe = false,
  showJointMarkers = false,
  showSkeleton = true,
  assetUrl = "/models/smpl_neutral.glb",
  opacity = 0.95,
  onAssetStatusChange,
}) => {
  const [assetStatus, setAssetStatus] = useState<SMPLAssetStatus>("checking");
  const [assetAvailable, setAssetAvailable] = useState<boolean>(false);

  // Probe whether the SMPL GLB asset file is available on the server
  useEffect(() => {
    let isMounted = true;

    async function probeAsset() {
      try {
        const response = await fetch(assetUrl, { method: "HEAD" });
        if (!isMounted) return;

        if (response.ok) {
          // File exists on server
          setAssetAvailable(true);
          setAssetStatus("loaded");
          onAssetStatusChange?.("loaded");
        } else {
          // File not found (HTTP 404) -> Fallback architecture active
          setAssetAvailable(false);
          setAssetStatus("pending");
          onAssetStatusChange?.("pending");
        }
      } catch {
        if (!isMounted) return;
        setAssetAvailable(false);
        setAssetStatus("pending");
        onAssetStatusChange?.("pending");
      }
    }

    probeAsset();

    return () => {
      isMounted = false;
    };
  }, [assetUrl, onAssetStatusChange]);

  if (!visible) {
    return null;
  }

  const fallbackElement = (
    <SMPLKinematicFallback
      pose={pose}
      scale={scale}
      position={position}
      rotation={rotation}
      wireframe={wireframe}
      showJointMarkers={showJointMarkers}
      showSkeleton={showSkeleton}
      opacity={opacity}
    />
  );

  if (!assetAvailable || assetStatus === "pending" || assetStatus === "fallback") {
    return fallbackElement;
  }

  return (
    <AssetErrorBoundary
      fallback={fallbackElement}
      onError={() => {
        setAssetAvailable(false);
        setAssetStatus("fallback");
        onAssetStatusChange?.("fallback");
      }}
    >
      <React.Suspense fallback={fallbackElement}>
        <SMPLModel
          assetUrl={assetUrl}
          pose={pose}
          scale={scale}
          position={position}
          rotation={rotation}
          wireframe={wireframe}
          opacity={opacity}
          onLoaded={() => {
            setAssetStatus("loaded");
            onAssetStatusChange?.("loaded");
          }}
          onError={() => {
            setAssetAvailable(false);
            setAssetStatus("fallback");
            onAssetStatusChange?.("fallback");
          }}
        />
      </React.Suspense>
    </AssetErrorBoundary>
  );
};
