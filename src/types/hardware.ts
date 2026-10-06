export type DeviceConnectionStatus = "connected" | "disconnected" | "scanning" | "error";

/**
 * Physical geometry and constants for Nintendo Wii Balance Board (Model RVL-WBC-01).
 * Verified sensor distance: 446.0 mm lateral (X), 238.0 mm anteroposterior (Y).
 */
export const WII_BOARD_DIMENSIONS = {
  distanceXMm: 446.0,
  distanceYMm: 238.0,
  halfDistanceXMm: 223.0,
  halfDistanceYMm: 119.0,
  unloadedThresholdKg: 0.1,
} as const;

/**
 * Full biomechanical Balance Measurement streamed from the Nintendo Wii Balance Board.
 *
 * Coordinate Convention:
 * - COP X: -1.0 = LEFT, 0.0 = CENTER, +1.0 = RIGHT
 * - COP Y: -1.0 = BACK / POSTERIOR, 0.0 = CENTER, +1.0 = FRONT / ANTERIOR
 */
export interface BalanceBoardReading {
  timestamp: number;

  // --- Calibrated Force per Corner (kg) ---
  frontLeft: number;
  frontRight: number;
  backLeft: number;
  backRight: number;

  // Legacy corner aliases
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;

  // --- Raw ADC load-cell readings (untouched by calibration or tare) ---
  rawFrontLeft: number;
  rawFrontRight: number;
  rawBackLeft: number;
  rawBackRight: number;

  // Raw legacy aliases
  rawTopLeft: number;
  rawTopRight: number;
  rawBottomLeft: number;
  rawBottomRight: number;

  // --- Total and Directional Weights (kg) ---
  totalWeight: number;
  leftWeight: number;
  rightWeight: number;
  anteriorWeight: number;
  posteriorWeight: number;

  // --- Directional Balance Distribution Percentages (%) ---
  leftPercent: number;
  rightPercent: number;
  anteriorPercent: number;
  posteriorPercent: number;

  // Legacy percentage aliases
  frontPercent: number;
  backPercent: number;

  // --- Center of Pressure (COP) ---
  /** Normalized COP X: [-1.0 = Left, 0.0 = Center, +1.0 = Right] */
  copX: number;
  /** Normalized COP Y: [-1.0 = Back/Posterior, 0.0 = Center, +1.0 = Front/Anterior] */
  copY: number;

  /** Physical Center of Pressure X in millimeters from center */
  copXMm: number;
  /** Physical Center of Pressure Y in millimeters from center */
  copYMm: number;
}

/** Shared balance measurement model alias */
export type BalanceMeasurement = BalanceBoardReading;

export interface BoardStatus {
  isConnected: boolean;
  isScanning: boolean;
  deviceName?: string | null;
  macAddress?: string | null;
  message: string;
  error?: string | null;
}
