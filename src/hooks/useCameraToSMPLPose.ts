/**
 * useCameraToSMPLPose Hook
 *
 * PatientBalanceAI - Phase 4: Camera Pose Estimation -> SMPL Body Movement
 *
 * Connects the live MediaPipe vision stream from VisionContext to the
 * MediaPipePoseToSMPLAdapter, providing a real-time reactive SMPL pose for 3D visualization.
 */

import { useRef, useEffect, useState } from "react";
import { useVision } from "../context/VisionContext";
import {
  MediaPipePoseToSMPLAdapter,
  MediaPipeSMPLAdapterOptions,
  SMPLPoseConversionResult,
} from "../services/vision/MediaPipePoseToSMPLAdapter";
import { createNeutralSMPLPose } from "../types/smpl";

export interface UseCameraToSMPLPoseReturn extends SMPLPoseConversionResult {
  isCameraActive: boolean;
  setSmoothingAlpha: (alpha: number) => void;
  resetPose: () => void;
}

export function useCameraToSMPLPose(
  options?: MediaPipeSMPLAdapterOptions
): UseCameraToSMPLPoseReturn {
  const { visionState, isCameraActive, isMirrored } = useVision();

  const adapterRef = useRef<MediaPipePoseToSMPLAdapter | null>(null);

  if (!adapterRef.current) {
    adapterRef.current = new MediaPipePoseToSMPLAdapter({
      ...options,
      isMirrored,
    });
  }

  // Synchronize mirroring state with VisionContext
  useEffect(() => {
    if (adapterRef.current) {
      adapterRef.current.setMirrored(isMirrored);
    }
  }, [isMirrored]);

  const [conversionResult, setConversionResult] = useState<SMPLPoseConversionResult>(() => ({
    pose: createNeutralSMPLPose(),
    confidence: 0,
    jointConfidences: {} as any,
    isPoseValid: false,
    debugInfo: {
      pelvisMidpoint: [0, 0, 0],
      shoulderMidpoint: [0, 0, 0],
      spineVector: [0, 1, 0],
      leftSideAligned: true,
      rightSideAligned: true,
      frontBackAligned: true,
      derivedJoints: [],
      rawLandmarkCount: 0,
      overallConfidence: 0,
    },
  }));

  useEffect(() => {
    if (!isCameraActive || !visionState.hasPose || !visionState.pose) {
      // Return neutral standing pose if camera inactive or subject not detected
      setConversionResult((prev) => ({
        ...prev,
        pose: createNeutralSMPLPose(),
        confidence: 0,
        isPoseValid: false,
      }));
      return;
    }

    if (adapterRef.current) {
      const result = adapterRef.current.convert(visionState.pose);
      setConversionResult(result);
    }
  }, [visionState.pose, visionState.hasPose, isCameraActive]);

  const setSmoothingAlpha = (alpha: number) => {
    adapterRef.current?.setSmoothingAlpha(alpha);
  };

  const resetPose = () => {
    adapterRef.current?.reset();
    setConversionResult({
      pose: createNeutralSMPLPose(),
      confidence: 0,
      jointConfidences: {} as any,
      isPoseValid: false,
      debugInfo: {
        pelvisMidpoint: [0, 0, 0],
        shoulderMidpoint: [0, 0, 0],
        spineVector: [0, 1, 0],
        leftSideAligned: true,
        rightSideAligned: true,
        frontBackAligned: true,
        derivedJoints: [],
        rawLandmarkCount: 0,
        overallConfidence: 0,
      },
    });
  };

  return {
    ...conversionResult,
    isCameraActive,
    setSmoothingAlpha,
    resetPose,
  };
}
