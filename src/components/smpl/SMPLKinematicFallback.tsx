import React, { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SMPLPose, SMPL_JOINT_NAMES } from "../../types/smpl";

interface SMPLKinematicFallbackProps {
  pose: SMPLPose;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  wireframe?: boolean;
  showJointMarkers?: boolean;
  showSkeleton?: boolean;
  opacity?: number;
}

/**
 * SMPL Kinematic Fallback Component
 *
 * Implements the standard 24-joint SMPL kinematic hierarchy and volume model.
 * Renders an anatomical human body in neutral standing posture standing on the
 * balance board, facing FRONT (+Y).
 *
 * Each joint is modeled with clinical anatomical proportions and can be driven
 * by standard SMPL joint rotations (Euler angles).
 */
export const SMPLKinematicFallback: React.FC<SMPLKinematicFallbackProps> = ({
  pose,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  wireframe = false,
  showJointMarkers = false,
  showSkeleton = true,
  opacity = 0.95,
}) => {
  const rootRef = useRef<THREE.Group>(null);

  // References for kinematic joints
  const jointRefs = useRef<Record<string, THREE.Group | null>>({});

  // When showSkeleton is false, body volumes fade into soft translucent silhouette
  const effectiveOpacity = showSkeleton ? opacity : 0.2;

  // Clinical medical materials
  const bodyMaterial = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#E2E8F0", // Slate-200 clinical body tone
        roughness: 0.45,
        metalness: 0.08,
        wireframe,
        transparent: effectiveOpacity < 1.0,
        opacity: effectiveOpacity,
      }),
    [wireframe, effectiveOpacity]
  );

  const tealAccentMaterial = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0D9488", // Medical teal
        roughness: 0.35,
        metalness: 0.12,
        wireframe,
        transparent: effectiveOpacity < 1.0,
        opacity: effectiveOpacity,
      }),
    [wireframe, effectiveOpacity]
  );

  const jointMarkerMaterial = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0F766E", // Deep teal joint marker
        roughness: 0.3,
        metalness: 0.2,
      }),
    []
  );

  const footMaterial = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({

        color: "#1E293B", // Dark slate plantar contact base
        roughness: 0.6,
        metalness: 0.05,
      }),
    []
  );

  // Update forward kinematics joint rotations on every frame
  useFrame((_, delta) => {
    const lerpRate = Math.min(1.0, delta * 12.0);

    // 1. Root group orientation & translation
    if (rootRef.current) {
      const targetPosX = position[0] + pose.globalTranslation[0];
      const targetPosY = position[1] + pose.globalTranslation[1];
      const targetPosZ = position[2] + pose.globalTranslation[2];

      rootRef.current.position.x = THREE.MathUtils.lerp(rootRef.current.position.x, targetPosX, lerpRate);
      rootRef.current.position.y = THREE.MathUtils.lerp(rootRef.current.position.y, targetPosY, lerpRate);
      rootRef.current.position.z = THREE.MathUtils.lerp(rootRef.current.position.z, targetPosZ, lerpRate);

      rootRef.current.rotation.x = THREE.MathUtils.lerp(
        rootRef.current.rotation.x,
        rotation[0] + pose.globalOrientation[0],
        lerpRate
      );
      rootRef.current.rotation.y = THREE.MathUtils.lerp(
        rootRef.current.rotation.y,
        rotation[1] + pose.globalOrientation[1],
        lerpRate
      );
      rootRef.current.rotation.z = THREE.MathUtils.lerp(
        rootRef.current.rotation.z,
        rotation[2] + pose.globalOrientation[2],
        lerpRate
      );
    }

    // 2. Individual SMPL joint rotations
    for (const jointName of SMPL_JOINT_NAMES) {
      const node = jointRefs.current[jointName];
      const jointRot = pose.jointRotations[jointName];
      if (node && jointRot) {
        node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, jointRot[0], lerpRate);
        node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, jointRot[1], lerpRate);
        node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, jointRot[2], lerpRate);
      }
    }
  });

  return (
    <group ref={rootRef} scale={scale} position={position} rotation={rotation}>
      {/* ============================================================ */}
      {/* SMPL JOINT 0: PELVIS (Root at y = 0.94m)                     */}
      {/* ============================================================ */}
      <group
        ref={(el) => { jointRefs.current["pelvis"] = el; }}
        position={[0, 0.94, 0]}
      >
        {/* Pelvis Anatomical Volume */}
        <mesh position={[0, 0, 0]} material={tealAccentMaterial} castShadow>
          <cylinderGeometry args={[0.13, 0.11, 0.12, 18]} />
        </mesh>
        {showJointMarkers && (
          <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
            <sphereGeometry args={[0.035, 16, 16]} />
          </mesh>
        )}

        {/* ============================================================ */}
        {/* SMPL JOINT 3: SPINE 1 (Lumbar)                               */}
        {/* ============================================================ */}
        <group
          ref={(el) => { jointRefs.current["spine1"] = el; }}
          position={[0, 0.12, 0]}
        >
          {/* Lumbar abdominal core volume */}
          <mesh position={[0, 0.06, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.12, 0.125, 0.13, 18]} />
          </mesh>
          {showJointMarkers && (
            <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
              <sphereGeometry args={[0.03, 16, 16]} />
            </mesh>
          )}

          {/* ============================================================ */}
          {/* SMPL JOINT 6: SPINE 2 (Mid-Thoracic)                         */}
          {/* ============================================================ */}
          <group
            ref={(el) => { jointRefs.current["spine2"] = el; }}
            position={[0, 0.13, 0]}
          >
            {/* Mid-Thoracic ribcage volume */}
            <mesh position={[0, 0.065, 0]} material={bodyMaterial} castShadow>
              <boxGeometry args={[0.26, 0.14, 0.15]} />
            </mesh>
            {showJointMarkers && (
              <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                <sphereGeometry args={[0.03, 16, 16]} />
              </mesh>
            )}

            {/* ============================================================ */}
            {/* SMPL JOINT 9: SPINE 3 (Upper Thoracic / Chest)               */}
            {/* ============================================================ */}
            <group
              ref={(el) => { jointRefs.current["spine3"] = el; }}
              position={[0, 0.13, 0]}
            >
              {/* Upper chest volume */}
              <mesh position={[0, 0.05, 0]} material={bodyMaterial} castShadow>
                <boxGeometry args={[0.28, 0.12, 0.16]} />
              </mesh>

              {/* Anterior Sagittal Center Alignment Stripe (indicates FRONT / +Y facing) */}
              <mesh position={[0, 0.05, 0.082]} material={tealAccentMaterial}>
                <planeGeometry args={[0.035, 0.11]} />
              </mesh>

              {showJointMarkers && (
                <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                  <sphereGeometry args={[0.032, 16, 16]} />
                </mesh>
              )}

              {/* ============================================================ */}
              {/* SMPL JOINT 12: NECK                                          */}
              {/* ============================================================ */}
              <group
                ref={(el) => { jointRefs.current["neck"] = el; }}
                position={[0, 0.11, 0]}
              >
                <mesh position={[0, 0.04, 0]} material={bodyMaterial}>
                  <cylinderGeometry args={[0.045, 0.05, 0.08, 16]} />
                </mesh>
                {showJointMarkers && (
                  <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                    <sphereGeometry args={[0.026, 16, 16]} />
                  </mesh>
                )}

                {/* ============================================================ */}
                {/* SMPL JOINT 15: HEAD                                          */}
                {/* ============================================================ */}
                <group
                  ref={(el) => { jointRefs.current["head"] = el; }}
                  position={[0, 0.15, 0]}
                >
                  <mesh position={[0, 0, 0]} material={bodyMaterial} castShadow>
                    <sphereGeometry args={[0.095, 24, 24]} />
                  </mesh>
                  {/* Facial plane pointing towards FRONT / +Y */}
                  <mesh position={[0, 0.01, 0.088]} material={tealAccentMaterial}>
                    <boxGeometry args={[0.055, 0.035, 0.018]} />
                  </mesh>
                  {showJointMarkers && (
                    <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                      <sphereGeometry args={[0.03, 16, 16]} />
                    </mesh>
                  )}
                </group>
              </group>

              {/* ============================================================ */}
              {/* SMPL JOINT 13: LEFT COLLAR (Clavicle)                        */}
              {/* ============================================================ */}
              <group
                ref={(el) => { jointRefs.current["left_collar"] = el; }}
                position={[-0.08, 0.08, 0]}
              >
                <mesh position={[-0.04, 0, 0]} material={bodyMaterial}>
                  <cylinderGeometry args={[0.028, 0.028, 0.08, 12]} />
                </mesh>
                {showJointMarkers && (
                  <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                    <sphereGeometry args={[0.025, 14, 14]} />
                  </mesh>
                )}

                {/* ============================================================ */}
                {/* SMPL JOINT 16: LEFT SHOULDER                                */}
                {/* ============================================================ */}
                <group
                  ref={(el) => { jointRefs.current["left_shoulder"] = el; }}
                  position={[-0.11, 0, 0]}
                >
                  <mesh material={tealAccentMaterial}>
                    <sphereGeometry args={[0.045, 16, 16]} />
                  </mesh>

                  {/* Left Upper Arm (Humerus) */}
                  <mesh position={[0, -0.13, 0]} material={bodyMaterial} castShadow>
                    <cylinderGeometry args={[0.035, 0.03, 0.24, 14]} />
                  </mesh>

                  {/* ============================================================ */}
                  {/* SMPL JOINT 18: LEFT ELBOW                                    */}
                  {/* ============================================================ */}
                  <group
                    ref={(el) => { jointRefs.current["left_elbow"] = el; }}
                    position={[0, -0.26, 0]}
                  >
                    <mesh material={jointMarkerMaterial}>
                      <sphereGeometry args={[0.032, 14, 14]} />
                    </mesh>

                    {/* Left Forearm (Radius / Ulna) */}
                    <mesh position={[0, -0.12, 0]} material={bodyMaterial} castShadow>
                      <cylinderGeometry args={[0.03, 0.024, 0.22, 14]} />
                    </mesh>

                    {/* ============================================================ */}
                    {/* SMPL JOINT 20: LEFT WRIST                                    */}
                    {/* ============================================================ */}
                    <group
                      ref={(el) => { jointRefs.current["left_wrist"] = el; }}
                      position={[0, -0.24, 0]}
                    >
                      <mesh material={jointMarkerMaterial}>
                        <sphereGeometry args={[0.026, 14, 14]} />
                      </mesh>

                      {/* ============================================================ */}
                      {/* SMPL JOINT 22: LEFT HAND                                     */}
                      {/* ============================================================ */}
                      <group
                        ref={(el) => { jointRefs.current["left_hand"] = el; }}
                        position={[0, -0.09, 0]}
                      >
                        <mesh material={tealAccentMaterial}>
                          <boxGeometry args={[0.03, 0.08, 0.02]} />
                        </mesh>
                      </group>
                    </group>
                  </group>
                </group>
              </group>

              {/* ============================================================ */}
              {/* SMPL JOINT 14: RIGHT COLLAR (Clavicle)                       */}
              {/* ============================================================ */}
              <group
                ref={(el) => { jointRefs.current["right_collar"] = el; }}
                position={[0.08, 0.08, 0]}
              >
                <mesh position={[0.04, 0, 0]} material={bodyMaterial}>
                  <cylinderGeometry args={[0.028, 0.028, 0.08, 12]} />
                </mesh>
                {showJointMarkers && (
                  <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                    <sphereGeometry args={[0.025, 14, 14]} />
                  </mesh>
                )}

                {/* ============================================================ */}
                {/* SMPL JOINT 17: RIGHT SHOULDER                               */}
                {/* ============================================================ */}
                <group
                  ref={(el) => { jointRefs.current["right_shoulder"] = el; }}
                  position={[0.11, 0, 0]}
                >
                  <mesh material={tealAccentMaterial}>
                    <sphereGeometry args={[0.045, 16, 16]} />
                  </mesh>

                  {/* Right Upper Arm (Humerus) */}
                  <mesh position={[0, -0.13, 0]} material={bodyMaterial} castShadow>
                    <cylinderGeometry args={[0.035, 0.03, 0.24, 14]} />
                  </mesh>

                  {/* ============================================================ */}
                  {/* SMPL JOINT 19: RIGHT ELBOW                                   */}
                  {/* ============================================================ */}
                  <group
                    ref={(el) => { jointRefs.current["right_elbow"] = el; }}
                    position={[0, -0.26, 0]}
                  >
                    <mesh material={jointMarkerMaterial}>
                      <sphereGeometry args={[0.032, 14, 14]} />
                    </mesh>

                    {/* Right Forearm (Radius / Ulna) */}
                    <mesh position={[0, -0.12, 0]} material={bodyMaterial} castShadow>
                      <cylinderGeometry args={[0.03, 0.024, 0.22, 14]} />
                    </mesh>

                    {/* ============================================================ */}
                    {/* SMPL JOINT 21: RIGHT WRIST                                   */}
                    {/* ============================================================ */}
                    <group
                      ref={(el) => { jointRefs.current["right_wrist"] = el; }}
                      position={[0, -0.24, 0]}
                    >
                      <mesh material={jointMarkerMaterial}>
                        <sphereGeometry args={[0.026, 14, 14]} />
                      </mesh>

                      {/* ============================================================ */}
                      {/* SMPL JOINT 23: RIGHT HAND                                    */}
                      {/* ============================================================ */}
                      <group
                        ref={(el) => { jointRefs.current["right_hand"] = el; }}
                        position={[0, -0.09, 0]}
                      >
                        <mesh material={tealAccentMaterial}>
                          <boxGeometry args={[0.03, 0.08, 0.02]} />
                        </mesh>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* ============================================================ */}
        {/* SMPL JOINT 1: LEFT HIP                                       */}
        {/* ============================================================ */}
        <group
          ref={(el) => { jointRefs.current["left_hip"] = el; }}
          position={[-0.095, -0.05, 0]}
        >
          <mesh material={jointMarkerMaterial}>
            <sphereGeometry args={[0.048, 16, 16]} />
          </mesh>

          {/* Left Thigh (Femur) */}
          <mesh position={[0, -0.21, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.055, 0.046, 0.38, 16]} />
          </mesh>

          {/* ============================================================ */}
          {/* SMPL JOINT 4: LEFT KNEE                                      */}
          {/* ============================================================ */}
          <group
            ref={(el) => { jointRefs.current["left_knee"] = el; }}
            position={[0, -0.42, 0]}
          >
            <mesh material={tealAccentMaterial}>
              <sphereGeometry args={[0.044, 16, 16]} />
            </mesh>

            {/* Left Shin (Tibia / Fibula) */}
            <mesh position={[0, -0.19, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.042, 0.034, 0.36, 16]} />
            </mesh>

            {/* ============================================================ */}
            {/* SMPL JOINT 7: LEFT ANKLE                                     */}
            {/* ============================================================ */}
            <group
              ref={(el) => { jointRefs.current["left_ankle"] = el; }}
              position={[0, -0.39, 0]}
            >
              <mesh material={jointMarkerMaterial}>
                <sphereGeometry args={[0.034, 14, 14]} />
              </mesh>

              {/* ============================================================ */}
              {/* SMPL JOINT 10: LEFT FOOT (Plantar base at y = 0.041m)        */}
              {/* ============================================================ */}
              <group
                ref={(el) => { jointRefs.current["left_foot"] = el; }}
                position={[0, -0.039, 0.07]}
              >
                {/* Foot Contact Sole on Balance Board */}
                <mesh position={[0, 0, 0]} material={footMaterial} castShadow>
                  <boxGeometry args={[0.082, 0.040, 0.19]} />
                </mesh>
                {/* Toes Accent Indicator pointing towards FRONT (+Y) */}
                <mesh position={[0, 0, 0.08]} material={tealAccentMaterial}>
                  <boxGeometry args={[0.076, 0.025, 0.03]} />
                </mesh>
                {showJointMarkers && (
                  <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                    <sphereGeometry args={[0.024, 12, 12]} />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        </group>

        {/* ============================================================ */}
        {/* SMPL JOINT 2: RIGHT HIP                                      */}
        {/* ============================================================ */}
        <group
          ref={(el) => { jointRefs.current["right_hip"] = el; }}
          position={[0.095, -0.05, 0]}
        >
          <mesh material={jointMarkerMaterial}>
            <sphereGeometry args={[0.048, 16, 16]} />
          </mesh>

          {/* Right Thigh (Femur) */}
          <mesh position={[0, -0.21, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.055, 0.046, 0.38, 16]} />
          </mesh>

          {/* ============================================================ */}
          {/* SMPL JOINT 5: RIGHT KNEE                                     */}
          {/* ============================================================ */}
          <group
            ref={(el) => { jointRefs.current["right_knee"] = el; }}
            position={[0, -0.42, 0]}
          >
            <mesh material={tealAccentMaterial}>
              <sphereGeometry args={[0.044, 16, 16]} />
            </mesh>

            {/* Right Shin (Tibia / Fibula) */}
            <mesh position={[0, -0.19, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.042, 0.034, 0.36, 16]} />
            </mesh>

            {/* ============================================================ */}
            {/* SMPL JOINT 8: RIGHT ANKLE                                    */}
            {/* ============================================================ */}
            <group
              ref={(el) => { jointRefs.current["right_ankle"] = el; }}
              position={[0, -0.39, 0]}
            >
              <mesh material={jointMarkerMaterial}>
                <sphereGeometry args={[0.034, 14, 14]} />
              </mesh>

              {/* ============================================================ */}
              {/* SMPL JOINT 11: RIGHT FOOT (Plantar base at y = 0.041m)       */}
              {/* ============================================================ */}
              <group
                ref={(el) => { jointRefs.current["right_foot"] = el; }}
                position={[0, -0.039, 0.07]}
              >
                {/* Foot Contact Sole on Balance Board */}
                <mesh position={[0, 0, 0]} material={footMaterial} castShadow>
                  <boxGeometry args={[0.082, 0.040, 0.19]} />
                </mesh>
                {/* Toes Accent Indicator pointing towards FRONT (+Y) */}
                <mesh position={[0, 0, 0.08]} material={tealAccentMaterial}>
                  <boxGeometry args={[0.076, 0.025, 0.03]} />
                </mesh>
                {showJointMarkers && (
                  <mesh position={[0, 0, 0]} material={jointMarkerMaterial}>
                    <sphereGeometry args={[0.024, 12, 12]} />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
