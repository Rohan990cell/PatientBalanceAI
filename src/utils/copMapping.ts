import { BalanceBoardReading, WII_BOARD_DIMENSIONS } from "../types/hardware";

/**
 * Screen and visual coordinates for the Wii Balance Board visualization.
 */
export interface BoardCoordinates {
  /** X position as a percentage from 0% (full left) to 100% (full right) */
  xPercent: number;
  /** Y position as a percentage from 0% (full front/top) to 100% (full back/bottom) */
  yPercent: number;
  /** Clamped COP X in normalized range [-1.0, 1.0] */
  clampedX: number;
  /** Clamped COP Y in normalized range [-1.0, 1.0] */
  clampedY: number;
}

/**
 * Maps normalized Center of Pressure (COP) coordinates [-1.0, 1.0] to visual percentage coordinates
 * inside the Wii Balance Board container.
 *
 * SCIENTIFIC COORDINATE CONVENTION (Phase 1 Standard):
 * - copX:
 *   -1.0 = FULL LEFT
 *    0.0 = CENTER
 *   +1.0 = FULL RIGHT
 *
 * - copY:
 *   -1.0 = FULL BACK / POSTERIOR
 *    0.0 = CENTER
 *   +1.0 = FULL FRONT / ANTERIOR
 *
 * SCREEN / CSS MAPPING:
 * - CSS X: 0% is LEFT, 50% is CENTER, 100% is RIGHT
 *   formula: xPercent = 50 + (clampedCopX * 50)
 *
 * - CSS Y: 0% is TOP (FRONT), 50% is CENTER, 100% is BOTTOM (BACK)
 *   formula: yPercent = 50 - (clampedCopY * 50)
 *
 * Boundary handling:
 * Both copX and copY are strictly clamped to [-1.0, +1.0] to guarantee the visual COP ball
 * remains within the physical sensor perimeter of the board.
 */
export function mapCopToBoard(copX: number, copY: number): BoardCoordinates {
  const safeX = typeof copX === "number" && !isNaN(copX) ? copX : 0.0;
  const safeY = typeof copY === "number" && !isNaN(copY) ? copY : 0.0;

  const clampedX = Math.max(-1.0, Math.min(1.0, safeX));
  const clampedY = Math.max(-1.0, Math.min(1.0, safeY));

  // In CSS, Y=0 is TOP (Front). Positive copY moves towards FRONT (top).
  const xPercent = 50.0 + clampedX * 50.0;
  const yPercent = 50.0 - clampedY * 50.0;

  return {
    xPercent,
    yPercent,
    clampedX,
    clampedY,
  };
}

/**
 * Helper to generate a mathematically sound, scientifically consistent simulated
 * BalanceBoardReading for DEVELOPMENT/TESTING ONLY.
 *
 * Decomposes (copX, copY, totalWeight) into exact four-quadrant forces:
 * FL = totalWeight * (1 - copX) * (1 + copY) / 4
 * FR = totalWeight * (1 + copX) * (1 + copY) / 4
 * BL = totalWeight * (1 - copX) * (1 - copY) / 4
 * BR = totalWeight * (1 + copX) * (1 - copY) / 4
 */
export function generateSimulatedMeasurement(
  copX: number,
  copY: number,
  totalWeight: number = 70.0
): BalanceBoardReading {
  const clampedX = Math.max(-1.0, Math.min(1.0, isNaN(copX) ? 0 : copX));
  const clampedY = Math.max(-1.0, Math.min(1.0, isNaN(copY) ? 0 : copY));
  const safeWeight = Math.max(0.0, isNaN(totalWeight) ? 70.0 : totalWeight);

  // Exact 4-quadrant force decomposition
  const fl = (safeWeight * (1.0 - clampedX) * (1.0 + clampedY)) / 4.0;
  const fr = (safeWeight * (1.0 + clampedX) * (1.0 + clampedY)) / 4.0;
  const bl = (safeWeight * (1.0 - clampedX) * (1.0 - clampedY)) / 4.0;
  const br = (safeWeight * (1.0 + clampedX) * (1.0 - clampedY)) / 4.0;

  const leftWeight = fl + bl;
  const rightWeight = fr + br;
  const anteriorWeight = fl + fr;
  const posteriorWeight = bl + br;

  const hasWeight = safeWeight > WII_BOARD_DIMENSIONS.unloadedThresholdKg;
  const leftPercent = hasWeight ? (leftWeight / safeWeight) * 100.0 : 50.0;
  const rightPercent = hasWeight ? (rightWeight / safeWeight) * 100.0 : 50.0;
  const anteriorPercent = hasWeight ? (anteriorWeight / safeWeight) * 100.0 : 50.0;
  const posteriorPercent = hasWeight ? (posteriorWeight / safeWeight) * 100.0 : 50.0;

  const copXMm = clampedX * WII_BOARD_DIMENSIONS.halfDistanceXMm;
  const copYMm = clampedY * WII_BOARD_DIMENSIONS.halfDistanceYMm;

  return {
    timestamp: Date.now(),
    frontLeft: fl,
    frontRight: fr,
    backLeft: bl,
    backRight: br,
    topLeft: fl,
    topRight: fr,
    bottomLeft: bl,
    bottomRight: br,
    rawFrontLeft: Math.round(fl * 20),
    rawFrontRight: Math.round(fr * 20),
    rawBackLeft: Math.round(bl * 20),
    rawBackRight: Math.round(br * 20),
    rawTopLeft: Math.round(fl * 20),
    rawTopRight: Math.round(fr * 20),
    rawBottomLeft: Math.round(bl * 20),
    rawBottomRight: Math.round(br * 20),
    totalWeight: safeWeight,
    leftWeight,
    rightWeight,
    anteriorWeight,
    posteriorWeight,
    leftPercent,
    rightPercent,
    anteriorPercent,
    posteriorPercent,
    frontPercent: anteriorPercent,
    backPercent: posteriorPercent,
    copX: hasWeight ? clampedX : 0.0,
    copY: hasWeight ? clampedY : 0.0,
    copXMm: hasWeight ? copXMm : 0.0,
    copYMm: hasWeight ? copYMm : 0.0,
  };
}
