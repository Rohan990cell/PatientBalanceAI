import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MovementState } from "../../types/avatar";
import { SMPLBody } from "../smpl/SMPLBody";
import { convertMovementStateToSMPLPose } from "../smpl/smplAdapter";


interface PatientAvatarProps {
  movementState: MovementState;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  useGlb?: boolean;
}

export const ProceduralHumanoid: React.FC<PatientAvatarProps> = ({
  movementState,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) => {
  // Hierarchical joint references for forward kinematics animation
  const rootGroupRef = useRef<THREE.Group>(null);
  const spineRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);

  // Soft medical healthcare materials (no neon, no glow)
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#E2E8F0", // Slate-100 clean clinical surface
    roughness: 0.45,
    metalness: 0.08,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: "#0D9488", // Soft medical teal accent
    roughness: 0.35,
    metalness: 0.12,
  });

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: "#94A3B8", // Subtle medical gray joint connectors
    roughness: 0.5,
    metalness: 0.15,
  });

  const footwearMaterial = new THREE.MeshStandardMaterial({
    color: "#0F766E", // Deep teal footwear standing on balance board
    roughness: 0.6,
    metalness: 0.05,
  });

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    // Idle breathing & micro-sway parameters
    const breath = Math.sin(t * 1.6) * 0.012;
    const microSwayX = Math.sin(t * 0.7) * 0.006;
    const microSwayZ = Math.cos(t * 0.5) * 0.005;

    const lerpFactor = Math.min(1.0, delta * 7.0);

    // 1. Root translation & overall tilt
    if (rootGroupRef.current) {
      const targetPosX = position[0] + movementState.bodyPosition[0] + microSwayX;
      const targetPosY = position[1] + movementState.bodyPosition[1] + breath * 0.4;
      const targetPosZ = position[2] + movementState.bodyPosition[2] + microSwayZ;

      rootGroupRef.current.position.x = THREE.MathUtils.lerp(rootGroupRef.current.position.x, targetPosX, lerpFactor);
      rootGroupRef.current.position.y = THREE.MathUtils.lerp(rootGroupRef.current.position.y, targetPosY, lerpFactor);
      rootGroupRef.current.position.z = THREE.MathUtils.lerp(rootGroupRef.current.position.z, targetPosZ, lerpFactor);

      // Body tilt (forward/back pitch, lateral roll)
      rootGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        rootGroupRef.current.rotation.x,
        rotation[0] + movementState.bodyRotation[0],
        lerpFactor
      );
      rootGroupRef.current.rotation.z = THREE.MathUtils.lerp(
        rootGroupRef.current.rotation.z,
        rotation[2] + movementState.bodyRotation[2],
        lerpFactor
      );
    }

    // 2. Spine & Thorax
    if (spineRef.current) {
      spineRef.current.rotation.z = THREE.MathUtils.lerp(
        spineRef.current.rotation.z,
        movementState.jointRotations.spine[2],
        lerpFactor
      );
      spineRef.current.rotation.x = THREE.MathUtils.lerp(
        spineRef.current.rotation.x,
        movementState.jointRotations.spine[0] + breath * 0.6,
        lerpFactor
      );
    }

    // 3. Head & Cervical spine (compensatory counter-tilt)
    if (headRef.current) {
      headRef.current.rotation.z = THREE.MathUtils.lerp(
        headRef.current.rotation.z,
        movementState.jointRotations.head[2],
        lerpFactor
      );
      headRef.current.rotation.x = THREE.MathUtils.lerp(
        headRef.current.rotation.x,
        movementState.jointRotations.head[0],
        lerpFactor
      );
    }

    // 4. Upper Limbs / Shoulders
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.z,
        movementState.jointRotations.leftShoulder[2],
        lerpFactor
      );
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
        rightArmRef.current.rotation.z,
        movementState.jointRotations.rightShoulder[2],
        lerpFactor
      );
    }

    // 5. Lower Limbs / Ankles
    if (leftFootRef.current) {
      leftFootRef.current.rotation.x = THREE.MathUtils.lerp(
        leftFootRef.current.rotation.x,
        movementState.jointRotations.leftAnkle[0],
        lerpFactor
      );
    }
    if (rightFootRef.current) {
      rightFootRef.current.rotation.x = THREE.MathUtils.lerp(
        rightFootRef.current.rotation.x,
        movementState.jointRotations.rightAnkle[0],
        lerpFactor
      );
    }
  });

  return (
    <group ref={rootGroupRef} scale={scale} position={position} rotation={rotation}>
      {/* --- PELVIS & LOWER TRUNK --- */}
      <group position={[0, 0.94, 0]}>
        {/* Pelvis Core */}
        <mesh position={[0, 0, 0]} material={accentMaterial} castShadow>
          <cylinderGeometry args={[0.13, 0.11, 0.12, 18]} />
        </mesh>

        {/* --- SPINE & THORAX HIERARCHY --- */}
        <group ref={spineRef} position={[0, 0.08, 0]}>
          {/* Lower spine joint */}
          <mesh position={[0, 0.04, 0]} material={jointMaterial}>
            <sphereGeometry args={[0.07, 16, 16]} />
          </mesh>

          {/* Abdominal core */}
          <mesh position={[0, 0.14, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.12, 0.11, 0.15, 18]} />
          </mesh>

          {/* Thorax / Ribcage */}
          <mesh position={[0, 0.28, 0]} material={bodyMaterial} castShadow>
            <boxGeometry args={[0.28, 0.22, 0.16]} />
          </mesh>

          {/* Medical Vest / Center Alignment Marker */}
          <mesh position={[0, 0.28, 0.085]} material={accentMaterial}>
            <planeGeometry args={[0.04, 0.18]} />
          </mesh>

          {/* Clavicles & Shoulders Beam */}
          <mesh position={[0, 0.38, 0]} rotation={[0, 0, Math.PI / 2]} material={jointMaterial}>
            <cylinderGeometry args={[0.04, 0.04, 0.34, 16]} />
          </mesh>

          {/* --- NECK & HEAD --- */}
          <group ref={headRef} position={[0, 0.40, 0]}>
            {/* Neck */}
            <mesh position={[0, 0.04, 0]} material={bodyMaterial}>
              <cylinderGeometry args={[0.045, 0.05, 0.08, 16]} />
            </mesh>

            {/* Cranium / Head */}
            <mesh position={[0, 0.16, 0]} material={bodyMaterial} castShadow>
              <sphereGeometry args={[0.10, 24, 24]} />
            </mesh>

            {/* Stylized Face Plane (Indicates Forward Facing) */}
            <mesh position={[0, 0.16, 0.09]} material={accentMaterial}>
              <boxGeometry args={[0.06, 0.04, 0.02]} />
            </mesh>
          </group>

          {/* --- LEFT UPPER LIMB --- */}
          <group ref={leftArmRef} position={[-0.18, 0.37, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.045, 16, 16]} />
            </mesh>
            {/* Left Upper Arm */}
            <mesh position={[-0.02, -0.12, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.035, 0.03, 0.22, 14]} />
            </mesh>
            {/* Left Elbow */}
            <mesh position={[-0.02, -0.24, 0]} material={jointMaterial}>
              <sphereGeometry args={[0.035, 14, 14]} />
            </mesh>
            {/* Left Forearm */}
            <mesh position={[-0.02, -0.34, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.03, 0.025, 0.18, 14]} />
            </mesh>
            {/* Left Hand */}
            <mesh position={[-0.02, -0.45, 0]} material={accentMaterial}>
              <sphereGeometry args={[0.03, 14, 14]} />
            </mesh>
          </group>

          {/* --- RIGHT UPPER LIMB --- */}
          <group ref={rightArmRef} position={[0.18, 0.37, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.045, 16, 16]} />
            </mesh>
            {/* Right Upper Arm */}
            <mesh position={[0.02, -0.12, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.035, 0.03, 0.22, 14]} />
            </mesh>
            {/* Right Elbow */}
            <mesh position={[0.02, -0.24, 0]} material={jointMaterial}>
              <sphereGeometry args={[0.035, 14, 14]} />
            </mesh>
            {/* Right Forearm */}
            <mesh position={[0.02, -0.34, 0]} material={bodyMaterial} castShadow>
              <cylinderGeometry args={[0.03, 0.025, 0.18, 14]} />
            </mesh>
            {/* Right Hand */}
            <mesh position={[0.02, -0.45, 0]} material={accentMaterial}>
              <sphereGeometry args={[0.03, 14, 14]} />
            </mesh>
          </group>
        </group>

        {/* --- LEFT LOWER LIMB --- */}
        <group ref={leftLegRef} position={[-0.10, -0.06, 0]}>
          {/* Left Hip Joint */}
          <mesh material={jointMaterial}>
            <sphereGeometry args={[0.05, 16, 16]} />
          </mesh>
          {/* Left Thigh */}
          <mesh position={[0, -0.20, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.055, 0.045, 0.36, 16]} />
          </mesh>
          {/* Left Knee Joint */}
          <mesh position={[0, -0.40, 0]} material={jointMaterial}>
            <sphereGeometry args={[0.045, 16, 16]} />
          </mesh>
          {/* Left Shin */}
          <mesh position={[0, -0.60, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.042, 0.035, 0.36, 16]} />
          </mesh>
          {/* Left Ankle & Foot */}
          <group ref={leftFootRef} position={[0, -0.80, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.035, 14, 14]} />
            </mesh>
            <mesh position={[0, -0.04, 0.05]} material={footwearMaterial} castShadow>
              <boxGeometry args={[0.08, 0.05, 0.17]} />
            </mesh>
          </group>
        </group>

        {/* --- RIGHT LOWER LIMB --- */}
        <group ref={rightLegRef} position={[0.10, -0.06, 0]}>
          {/* Right Hip Joint */}
          <mesh material={jointMaterial}>
            <sphereGeometry args={[0.05, 16, 16]} />
          </mesh>
          {/* Right Thigh */}
          <mesh position={[0, -0.20, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.055, 0.045, 0.36, 16]} />
          </mesh>
          {/* Right Knee Joint */}
          <mesh position={[0, -0.40, 0]} material={jointMaterial}>
            <sphereGeometry args={[0.045, 16, 16]} />
          </mesh>
          {/* Right Shin */}
          <mesh position={[0, -0.60, 0]} material={bodyMaterial} castShadow>
            <cylinderGeometry args={[0.042, 0.035, 0.36, 16]} />
          </mesh>
          {/* Right Ankle & Foot */}
          <group ref={rightFootRef} position={[0, -0.80, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.035, 14, 14]} />
            </mesh>
            <mesh position={[0, -0.04, 0.05]} material={footwearMaterial} castShadow>
              <boxGeometry args={[0.08, 0.05, 0.17]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
export const PatientAvatar: React.FC<PatientAvatarProps> = (props) => {
  const smplPose = React.useMemo(() => {
    return convertMovementStateToSMPLPose(props.movementState);
  }, [props.movementState]);

  return (
    <SMPLBody
      pose={smplPose}
      position={props.position}
      rotation={props.rotation}
      scale={props.scale}
    />
  );
};


