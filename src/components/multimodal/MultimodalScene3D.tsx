/**
 * MultimodalScene3D Component
 * Phase 5: Multimodal Integration (Wii Balance Board + Camera Pose + SMPL + COP)
 *
 * Unified 3D visualization combining:
 * 1. Wii Balance Board force plate platform with 4 corner load cells
 * 2. Real-time COP ball marker (rendered ONLY when balance telemetry is available)
 * 3. 3D SMPL human body / kinematic fallback model standing on the board
 * 4. Standardized clinical coordinate axes (+X Right, -X Left, +Y Front, -Y Back)
 * 5. Camera pose status badge
 * 6. Balance hardware status badge & simulation safety banner
 *
 * STRICT INDEPENDENCE:
 * - Camera pose controls avatar posture and joint rotations.
 * - COP value controls the force plate COP marker location.
 * - Zero artificial coupling: COP does NOT alter joint rotations.
 */

import React from "react";
import { SMPLModelViewer } from "../smpl/SMPLModelViewer";
import { MultimodalTelemetryState } from "../../types/multimodal";

interface MultimodalScene3DProps {
  telemetry: MultimodalTelemetryState;
  height?: string | number;
  title?: string;
  showControls?: boolean;
}

export const MultimodalScene3D: React.FC<MultimodalScene3DProps> = ({
  telemetry,
  height = "520px",
  title = "3D Multimodal Biomechanical Arena",
  showControls = true,
}) => {
  const { mode, hardware, vision, simulationWarning } = telemetry;

  return (
    <div style={{ width: "100%", height }}>
      <SMPLModelViewer
        pose={vision.smplPose}
        copOffset={hardware.copOffset}
        telemetryMode={mode}
        dataSource={hardware.dataSource}
        simulationWarning={simulationWarning}
        boardConnected={hardware.boardConnected}
        trackingConfidence={vision.poseConfidence ?? 0}
        isLiveTracking={vision.isSMPLPoseActive}
        title={title}
        height="100%"
        showControls={showControls}
        showStatusBanner={true}
      />
    </div>
  );
};
