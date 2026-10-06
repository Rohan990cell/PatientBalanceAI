import React from "react";
import { Text } from "@react-three/drei";
import { normalizedCOPToBoardWorld3D } from "../../types/smpl";

interface BalanceBoardPlatform3DProps {
  /** Normalized COP offset: x in [-1, 1], y in [-1, 1], or null if unavailable */
  copOffset?: { x: number; y: number } | null;
  /** Whether to display 3D anatomical directional labels */
  showLabels?: boolean;
  /** Whether to display the 3D COP ball marker (defaults to true if copOffset is provided) */
  showCop?: boolean;
  /** Whether to show 3D coordinate reference axes */
  showAxes?: boolean;
}

/**
 * BalanceBoardPlatform3D
 *
 * High-fidelity 3D representation of the Wii Balance Board force plate platform.
 *
 * COORDINATE SYSTEM ARCHITECTURE:
 * 1. Clinical 2D COP Plane:
 *    +X = RIGHT, -X = LEFT, +Y = FRONT / ANTERIOR, -Y = BACK / POSTERIOR
 * 2. 3D Rendering World (Three.js Y-Up):
 *    worldX = copX (Right/Left)
 *    worldY = vertical height (0.041m board standing surface)
 *    worldZ = copY (Front/Back)
 *
 * Visual Alignment:
 *               FRONT / +Y (Anterior: +Z in 3D world)
 *                         ↑
 *    LEFT / -X (-X in 3D) ┼ RIGHT / +X (+X in 3D)
 *                         ↓
 *               BACK / -Y (Posterior: -Z in 3D world)
 */
export const BalanceBoardPlatform3D: React.FC<BalanceBoardPlatform3DProps> = ({
  copOffset = null,
  showLabels = true,
  showCop = true,
  showAxes = true,
}) => {
  // Canonical conversion: clinical COP (x, y) -> 3D rendering world (worldX, worldY, worldZ)
  const isCopAvailable = copOffset !== null && showCop;
  const [copWorldX, copWorldY, copWorldZ] = isCopAvailable
    ? normalizedCOPToBoardWorld3D(copOffset, 0.040)
    : [0, 0.040, 0];


  return (
    <group position={[0, 0.02, 0]}>
      {/* 1. Main White Board Chassis Housing (Wii Balance Board Form Factor) */}
      <mesh position={[0, 0.018, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.50, 0.036, 0.30]} />
        <meshStandardMaterial
          color="#FFFFFF"
          roughness={0.25}
          metalness={0.06}
        />
      </mesh>

      {/* 2. Soft Clinical Bevel Base Skirt */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[0.52, 0.010, 0.32]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.5} />
      </mesh>

      {/* 3. Surface Standing Mat (Clinical Mint #F0FDF4 with Teal Border) */}
      <mesh position={[0, 0.037, 0]} receiveShadow>
        <boxGeometry args={[0.46, 0.002, 0.26]} />
        <meshStandardMaterial color="#F0FDF4" roughness={0.45} />
      </mesh>

      {/* 4. Center Reference Target Crosshair */}
      <mesh position={[0, 0.039, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.022, 0.027, 32]} />
        <meshBasicMaterial color="#94A3B8" transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.039, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.004, 16]} />
        <meshBasicMaterial color="#0D9488" />
      </mesh>

      {/* 5. Four Corner Load Cell Sensor Discs */}
      {/* Front-Right (+X, +Y/Anterior) */}
      <mesh position={[0.18, 0.039, 0.09]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.019, 20]} />
        <meshBasicMaterial color="#CBD5E1" />
      </mesh>

      {/* Front-Left (-X, +Y/Anterior) */}
      <mesh position={[-0.18, 0.039, 0.09]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.019, 20]} />
        <meshBasicMaterial color="#CBD5E1" />
      </mesh>

      {/* Rear-Right (+X, -Y/Posterior) */}
      <mesh position={[0.18, 0.039, -0.09]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.019, 20]} />
        <meshBasicMaterial color="#CBD5E1" />
      </mesh>

      {/* Rear-Left (-X, -Y/Posterior) */}
      <mesh position={[-0.18, 0.039, -0.09]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.019, 20]} />
        <meshBasicMaterial color="#CBD5E1" />
      </mesh>

      {/* 6. Live Center of Pressure (COP) Visual Ball Marker (Rendered ONLY when telemetry available) */}
      {isCopAvailable && (
        <group position={[copWorldX, copWorldY, copWorldZ]}>
          {/* Core COP Disc */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.016, 24]} />
            <meshBasicMaterial color="#0D9488" />
          </mesh>
          {/* Glowing Outer Indicator Ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.021, 0.027, 24]} />
            <meshBasicMaterial color="#14B8A6" transparent opacity={0.8} />
          </mesh>
          {/* Small Center Pin */}
          <mesh position={[0, 0.002, 0]}>
            <sphereGeometry args={[0.005, 12, 12]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        </group>
      )}

      {/* 6b. Subtle 3D Coordinate Reference Axes */}
      {showAxes && (
        <group position={[0, 0.039, 0]}>
          {/* Lateral Axis: -X to +X (Red/Teal line) */}
          <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.001, 0.001, 0.44, 8]} />
            <meshBasicMaterial color="#0D9488" transparent opacity={0.3} />
          </mesh>
          {/* Sagittal Axis: -Y to +Y (Front/Back) */}
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.001, 0.001, 0.24, 8]} />
            <meshBasicMaterial color="#0D9488" transparent opacity={0.3} />
          </mesh>
        </group>
      )}

      {/* 7. Clinical Directional Markings on Board Top Surface */}
      {showLabels && (
        <>
          {/* FRONT / +Y Label */}
          <Text
            position={[0, 0.039, 0.125]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.014}
            color="#0F766E"
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            FRONT / +Y
          </Text>

          {/* BACK / -Y Label */}
          <Text
            position={[0, 0.039, -0.125]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={0.014}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            BACK / -Y
          </Text>

          {/* LEFT / -X Label */}
          <Text
            position={[-0.22, 0.039, 0]}
            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.013}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            LEFT / -X
          </Text>

          {/* RIGHT / +X Label */}
          <Text
            position={[0.22, 0.039, 0]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            fontSize={0.013}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            RIGHT / +X
          </Text>
        </>
      )}
    </group>
  );
};
