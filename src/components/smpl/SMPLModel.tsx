import React, { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SMPLPose, SMPLJointName, SMPL_JOINT_NAMES } from "../../types/smpl";

interface SMPLModelProps {
  assetUrl: string;
  pose: SMPLPose;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  wireframe?: boolean;
  opacity?: number;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Mapping table from standard SMPL canonical joint names
 * to common bone naming variations encountered in SMPL GLB exports:
 * - SMPL official: "pelvis", "left_hip", "right_hip", ...
 * - Prefix format: "SMPL_pelvis", "SMPL_left_hip", ...
 * - CamelCase: "Pelvis", "LeftHip", "RightHip", ...
 * - Biomechanical / FBX: "L_Hip", "R_Hip", "L_Knee", ...
 */
const BONE_NAME_ALIASES: Record<SMPLJointName, string[]> = {
  pelvis: ["pelvis", "SMPL_pelvis", "Pelvis", "root", "Root", "m_avg_Pelvis", "f_avg_Pelvis"],
  left_hip: ["left_hip", "SMPL_left_hip", "LeftHip", "L_Hip", "L_Femur", "m_avg_L_Hip", "f_avg_L_Hip"],
  right_hip: ["right_hip", "SMPL_right_hip", "RightHip", "R_Hip", "R_Femur", "m_avg_R_Hip", "f_avg_R_Hip"],
  spine1: ["spine1", "SMPL_spine1", "Spine1", "Spine", "m_avg_Spine1", "f_avg_Spine1"],
  left_knee: ["left_knee", "SMPL_left_knee", "LeftKnee", "L_Knee", "L_Tibia", "m_avg_L_Knee", "f_avg_L_Knee"],
  right_knee: ["right_knee", "SMPL_right_knee", "RightKnee", "R_Knee", "R_Tibia", "m_avg_R_Knee", "f_avg_R_Knee"],
  spine2: ["spine2", "SMPL_spine2", "Spine2", "Thoracic", "m_avg_Spine2", "f_avg_Spine2"],
  left_ankle: ["left_ankle", "SMPL_left_ankle", "LeftAnkle", "L_Ankle", "m_avg_L_Ankle", "f_avg_L_Ankle"],
  right_ankle: ["right_ankle", "SMPL_right_ankle", "RightAnkle", "R_Ankle", "m_avg_R_Ankle", "f_avg_R_Ankle"],
  spine3: ["spine3", "SMPL_spine3", "Spine3", "Chest", "Thorax", "m_avg_Spine3", "f_avg_Spine3"],
  left_foot: ["left_foot", "SMPL_left_foot", "LeftFoot", "L_Foot", "L_Toe", "m_avg_L_Foot", "f_avg_L_Foot"],
  right_foot: ["right_foot", "SMPL_right_foot", "RightFoot", "R_Foot", "R_Toe", "m_avg_R_Foot", "f_avg_R_Foot"],
  neck: ["neck", "SMPL_neck", "Neck", "m_avg_Neck", "f_avg_Neck"],
  left_collar: ["left_collar", "SMPL_left_collar", "LeftCollar", "L_Collar", "L_Clavicle", "m_avg_L_Collar", "f_avg_L_Collar"],
  right_collar: ["right_collar", "SMPL_right_collar", "RightCollar", "R_Collar", "R_Clavicle", "m_avg_R_Collar", "f_avg_R_Collar"],
  head: ["head", "SMPL_head", "Head", "m_avg_Head", "f_avg_Head"],
  left_shoulder: ["left_shoulder", "SMPL_left_shoulder", "LeftShoulder", "L_Shoulder", "m_avg_L_Shoulder", "f_avg_L_Shoulder"],
  right_shoulder: ["right_shoulder", "SMPL_right_shoulder", "RightShoulder", "R_Shoulder", "m_avg_R_Shoulder", "f_avg_R_Shoulder"],
  left_elbow: ["left_elbow", "SMPL_left_elbow", "LeftElbow", "L_Elbow", "m_avg_L_Elbow", "f_avg_L_Elbow"],
  right_elbow: ["right_elbow", "SMPL_right_elbow", "RightElbow", "R_Elbow", "m_avg_R_Elbow", "f_avg_R_Elbow"],
  left_wrist: ["left_wrist", "SMPL_left_wrist", "LeftWrist", "L_Wrist", "m_avg_L_Wrist", "f_avg_L_Wrist"],
  right_wrist: ["right_wrist", "SMPL_right_wrist", "RightWrist", "R_Wrist", "m_avg_R_Wrist", "f_avg_R_Wrist"],
  left_hand: ["left_hand", "SMPL_left_hand", "LeftHand", "L_Hand", "m_avg_L_Hand", "f_avg_L_Hand"],
  right_hand: ["right_hand", "SMPL_right_hand", "RightHand", "R_Hand", "m_avg_R_Hand", "f_avg_R_Hand"],
};

/**
 * SMPLModel Component
 *
 * Renders an official skinned SMPL GLB model asset and dynamically binds
 * SMPL 24-joint rotations and root transformations to the skeleton bones.
 */
export const SMPLModel: React.FC<SMPLModelProps> = ({
  assetUrl,
  pose,
  scale = 1.0,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  wireframe = false,
  opacity = 1.0,
  onLoaded,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(assetUrl);

  const clonedScene = useMemo(() => {
    return gltf.scene.clone(true);
  }, [gltf.scene]);

  // Index scene bones to SMPL canonical joint names
  const boneMap = useMemo(() => {
    const map = new Map<SMPLJointName, THREE.Object3D>();
    const allObjects = new Map<string, THREE.Object3D>();

    clonedScene.traverse((child) => {
      if (child.name) {
        allObjects.set(child.name.toLowerCase(), child);
      }
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              if ("wireframe" in mat) mat.wireframe = wireframe;
              if (opacity < 1.0) {
                mat.transparent = true;
                mat.opacity = opacity;
              }
            });
          } else {
            if ("wireframe" in child.material) child.material.wireframe = wireframe;
            if (opacity < 1.0) {
              child.material.transparent = true;
              child.material.opacity = opacity;
            }
          }
        }
      }
    });

    for (const jointName of SMPL_JOINT_NAMES) {
      const aliases = BONE_NAME_ALIASES[jointName] || [jointName];
      for (const alias of aliases) {
        const found = allObjects.get(alias.toLowerCase());
        if (found) {
          map.set(jointName, found);
          break;
        }
      }
    }

    return map;
  }, [clonedScene, wireframe, opacity]);

  useEffect(() => {
    if (onLoaded) {
      onLoaded();
    }
  }, [onLoaded]);

  // Articulate SMPL skeleton based on pose parameters
  useFrame((_, delta) => {
    const lerpRate = Math.min(1.0, delta * 12.0);

    if (groupRef.current) {
      const targetX = position[0] + pose.globalTranslation[0];
      const targetY = position[1] + pose.globalTranslation[1];
      const targetPosZ = position[2] + pose.globalTranslation[2];

      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, lerpRate);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, lerpRate);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetPosZ, lerpRate);

      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        rotation[0] + pose.globalOrientation[0],
        lerpRate
      );
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        rotation[1] + pose.globalOrientation[1],
        lerpRate
      );
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        rotation[2] + pose.globalOrientation[2],
        lerpRate
      );
    }

    // Apply joint rotations
    for (const jointName of SMPL_JOINT_NAMES) {
      const bone = boneMap.get(jointName);
      const rot = pose.jointRotations[jointName];
      if (bone && rot) {
        bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, rot[0], lerpRate);
        bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, rot[1], lerpRate);
        bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, rot[2], lerpRate);
      }
    }
  });

  return (
    <group ref={groupRef} scale={scale} position={position} rotation={rotation}>
      <primitive object={clonedScene} />
    </group>
  );
};
