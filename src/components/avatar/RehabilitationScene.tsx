import React from "react";
import { MovementState } from "../../types/avatar";
import { SMPLModelViewer } from "../smpl/SMPLModelViewer";
import { convertMovementStateToSMPLPose } from "../smpl/smplAdapter";

interface RehabilitationSceneProps {
  movementState: MovementState;
}

/**
 * RehabilitationScene
 *
 * Integrated with the Phase 3 SMPL Human Body Model Architecture.
 * Adapts incoming movement state from exercise demonstrations into standard
 * SMPL 24-joint poses and presents them in the clinical SMPLModelViewer.
 */
export const RehabilitationScene: React.FC<RehabilitationSceneProps> = ({ movementState }) => {
  const smplPose = React.useMemo(() => {
    return convertMovementStateToSMPLPose(movementState);
  }, [movementState]);

  return (
    <SMPLModelViewer
      pose={smplPose}
      copOffset={movementState.copOffset}
      title="SMPL Rehabilitation Avatar"
      height="100%"
      showControls={true}
      showStatusBanner={true}
    />
  );
};

