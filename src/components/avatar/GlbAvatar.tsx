import React, { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MovementState } from "../../types/avatar";

interface GlbAvatarProps {
  modelUrl?: string;
  movementState: MovementState;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export const GlbAvatar: React.FC<GlbAvatarProps> = ({
  modelUrl = "/models/patient_avatar.glb",
  movementState,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1.0,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(modelUrl);
  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  // Find named nodes in the cloned GLTF hierarchy
  const nodes = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    clonedScene.traverse((obj) => {
      if (obj.name) {
        map.set(obj.name, obj);
      }
    });
    return map;
  }, [clonedScene]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const breath = Math.sin(t * 1.6) * 0.012;
    const microSwayX = Math.sin(t * 0.7) * 0.006;
    const microSwayZ = Math.cos(t * 0.5) * 0.005;

    const lerpFactor = Math.min(1.0, delta * 7.0);

    // Root node movement & lean
    if (groupRef.current) {
      const targetX = position[0] + movementState.bodyPosition[0] + microSwayX;
      const targetY = position[1] + movementState.bodyPosition[1] + breath * 0.4;
      const targetZ = position[2] + movementState.bodyPosition[2] + microSwayZ;

      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, lerpFactor);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, lerpFactor);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, lerpFactor);

      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        rotation[0] + movementState.bodyRotation[0],
        lerpFactor
      );
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        rotation[2] + movementState.bodyRotation[2],
        lerpFactor
      );
    }

    // Spine articulation
    const spineNode = nodes.get("Spine");
    if (spineNode) {
      spineNode.rotation.z = THREE.MathUtils.lerp(
        spineNode.rotation.z,
        movementState.jointRotations.spine[2],
        lerpFactor
      );
      spineNode.rotation.x = THREE.MathUtils.lerp(
        spineNode.rotation.x,
        movementState.jointRotations.spine[0] + breath * 0.6,
        lerpFactor
      );
    }

    // Head articulation
    const headNode = nodes.get("Head");
    if (headNode) {
      headNode.rotation.z = THREE.MathUtils.lerp(
        headNode.rotation.z,
        movementState.jointRotations.head[2],
        lerpFactor
      );
      headNode.rotation.x = THREE.MathUtils.lerp(
        headNode.rotation.x,
        movementState.jointRotations.head[0],
        lerpFactor
      );
    }

    // Upper limb articulation
    const leftArmNode = nodes.get("LeftArm");
    if (leftArmNode) {
      leftArmNode.rotation.z = THREE.MathUtils.lerp(
        leftArmNode.rotation.z,
        movementState.jointRotations.leftShoulder[2],
        lerpFactor
      );
    }
    const rightArmNode = nodes.get("RightArm");
    if (rightArmNode) {
      rightArmNode.rotation.z = THREE.MathUtils.lerp(
        rightArmNode.rotation.z,
        movementState.jointRotations.rightShoulder[2],
        lerpFactor
      );
    }
  });

  return (
    <group ref={groupRef} scale={scale} position={position} rotation={rotation}>
      <primitive object={clonedScene} />
    </group>
  );
};

useGLTF.preload("/models/patient_avatar.glb");
