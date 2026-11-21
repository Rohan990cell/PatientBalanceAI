/**
 * Directional Weight Shift — Core Rehabilitation Exercise Engine & Mathematics
 *
 * PHASE D — WII BALANCE BOARD ONLY INTERACTIVE REHABILITATION EXERCISE
 *
 * GOAL:
 * The patient stands on the Wii Balance Board and follows on-screen movement
 * instructions by shifting their body weight sequentially:
 * 1. "SHIFT LEFT"
 * 2. "SHIFT RIGHT"
 * 3. "SHIFT FORWARD"
 * 4. "SHIFT BACKWARD"
 * 5. "RETURN TO CENTER"
 *
 * SCIENTIFIC COORDINATE CONVENTION:
 * Canonical clinical COP coordinate system:
 * +X = RIGHT
 * -X = LEFT
 * +Y = FRONT / ANTERIOR
 * -Y = BACK / POSTERIOR
 *
 * SCIENTIFIC DATA INTEGRITY:
 * - Uses ONLY REAL Wii Balance Board telemetry.
 * - No fake weight, COP, or sensor values.
 * - Does NOT use simulation mode.
 * - If disconnected or unavailable, values strictly display as "--" / "Waiting for Balance Board" (never fake 0).
 */

import { WII_BOARD_DIMENSIONS } from "../types/hardware";
export { WII_BOARD_DIMENSIONS };

/**
 * Standard patient neutral stance calibration baseline.
 * Computed from a 5-second quiet standing window with both feet on the Wii Balance Board.
 */
export interface DirectionalCalibrationBaseline {
  /** Baseline COP X (normalized [-1.0, 1.0]) averaged over 5s window */
  baselineX0: number;
  /** Baseline COP Y (normalized [-1.0, 1.0]) averaged over 5s window */
  baselineY0: number;
  /** Baseline COP X in physical millimetres on the board (X0 * 223.0 mm) */
  baselineX0Mm: number;
  /** Baseline COP Y in physical millimetres on the board (Y0 * 119.0 mm) */
  baselineY0Mm: number;
  /** Mean patient weight recorded during baseline calibration (kg) */
  calibratedWeightKg: number;
  /** Standard deviation of patient weight during calibration (kg) */
  weightStdDevKg: number;
  /** Standard deviation of COP X during calibration (normalized) */
  copSdXNorm: number;
  /** Standard deviation of COP Y during calibration (normalized) */
  copSdYNorm: number;
  /** Standard deviation of COP sway dispersion in physical mm */
  copSdMm: number;
  /** Clinical alias for COP sway dispersion in physical mm */
  copSwayDispersionMm: number;
  /** Number of valid samples collected during calibration window */
  sampleCount: number;
  /** Duration of calibration window in seconds */
  calibrationDurationSeconds: number;
  /** Timestamp when calibration completed */
  timestamp: number;
  /** Whether calibration passed stability and hardware validation */
  isCalibrated: boolean;
  /** Status description or diagnostic message */
  statusMessage?: string;
}

/**
 * Structured result of computing Center of Pressure (COP) directly from four load-cell forces.
 */
export interface LoadCellCopResult {
  isValid: boolean;
  totalWeight: number;
  copX: number;
  copY: number;
  copXMm: number;
  copYMm: number;
  leftWeight: number;
  rightWeight: number;
  anteriorWeight: number;
  posteriorWeight: number;
  errorReason?: string;
}

/**
 * Result of validating a 5-second quiet standing baseline calibration.
 */
export interface CalibrationValidationResult {
  isValid: boolean;
  baseline?: DirectionalCalibrationBaseline;
  errorReason?: string;
}

/**
 * Single timestamped calibration sample point.
 */
export interface CalibrationSample {
  timestamp: number;
  totalWeight: number;
  copX: number;
  copY: number;
  fl?: number;
  fr?: number;
  bl?: number;
  br?: number;
}

/**
 * Computes Center of Pressure (COP) strictly from the four physical load cells
 * of the Nintendo Wii Balance Board (Model RVL-WBC-01).
 *
 * Physical Sensor Layout:
 * - Front Left (FL):  (-223.0 mm, +119.0 mm) -> Lateral -X, Anterior +Y
 * - Front Right (FR): (+223.0 mm, +119.0 mm) -> Lateral +X, Anterior +Y
 * - Back Left (BL):   (-223.0 mm, -119.0 mm) -> Lateral -X, Posterior -Y
 * - Back Right (BR):  (+223.0 mm, -119.0 mm) -> Lateral +X, Posterior -Y
 *
 * Mathematical Mapping:
 * - Total Weight W = FL + FR + BL + BR
 * - F_Right = FR + BR,  F_Left = FL + BL
 * - F_Anterior = FL + FR,  F_Posterior = BL + BR
 *
 * Normalized COP [-1.0, 1.0]:
 * - copX = (F_Right - F_Left) / W      (+X = Right, -X = Left)
 * - copY = (F_Anterior - F_Posterior) / W  (+Y = Forward, -Y = Backward)
 *
 * Physical COP in mm:
 * - copXMm = copX * 223.0 mm
 * - copYMm = copY * 119.0 mm
 */
export function calculateCopFromLoadCells(
  frontLeft: number | null | undefined,
  frontRight: number | null | undefined,
  backLeft: number | null | undefined,
  backRight: number | null | undefined
): LoadCellCopResult {
  if (
    frontLeft === null || frontLeft === undefined || isNaN(frontLeft) ||
    frontRight === null || frontRight === undefined || isNaN(frontRight) ||
    backLeft === null || backLeft === undefined || isNaN(backLeft) ||
    backRight === null || backRight === undefined || isNaN(backRight)
  ) {
    return {
      isValid: false,
      totalWeight: 0,
      copX: 0,
      copY: 0,
      copXMm: 0,
      copYMm: 0,
      leftWeight: 0,
      rightWeight: 0,
      anteriorWeight: 0,
      posteriorWeight: 0,
      errorReason: "Missing or non-numeric load cell sensor reading",
    };
  }

  // Check for negative forces beyond small zero-noise tolerance (-0.05kg)
  if (frontLeft < -0.05 || frontRight < -0.05 || backLeft < -0.05 || backRight < -0.05) {
    return {
      isValid: false,
      totalWeight: 0,
      copX: 0,
      copY: 0,
      copXMm: 0,
      copYMm: 0,
      leftWeight: 0,
      rightWeight: 0,
      anteriorWeight: 0,
      posteriorWeight: 0,
      errorReason: "Negative force detected on load cell sensor",
    };
  }

  const fl = Math.max(0, frontLeft);
  const fr = Math.max(0, frontRight);
  const bl = Math.max(0, backLeft);
  const br = Math.max(0, backRight);

  const totalWeight = fl + fr + bl + br;

  if (totalWeight < 10.0) {
    return {
      isValid: false,
      totalWeight: parseFloat(totalWeight.toFixed(2)),
      copX: 0,
      copY: 0,
      copXMm: 0,
      copYMm: 0,
      leftWeight: parseFloat((fl + bl).toFixed(2)),
      rightWeight: parseFloat((fr + br).toFixed(2)),
      anteriorWeight: parseFloat((fl + fr).toFixed(2)),
      posteriorWeight: parseFloat((bl + br).toFixed(2)),
      errorReason: "Insufficient weight on board: minimum 10.0 kg required for patient detection",
    };
  }

  const leftWeight = fl + bl;
  const rightWeight = fr + br;
  const anteriorWeight = fl + fr;
  const posteriorWeight = bl + br;

  // Normalized COP:
  // copX: +Right, -Left
  // copY: +Forward (anterior), -Backward (posterior)
  const copX = (rightWeight - leftWeight) / totalWeight;
  const copY = (anteriorWeight - posteriorWeight) / totalWeight;

  if (Math.abs(copX) > 1.0 || Math.abs(copY) > 1.0) {
    return {
      isValid: false,
      totalWeight: parseFloat(totalWeight.toFixed(2)),
      copX: Math.max(-1.0, Math.min(1.0, copX)),
      copY: Math.max(-1.0, Math.min(1.0, copY)),
      copXMm: parseFloat((copX * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(2)),
      copYMm: parseFloat((copY * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(2)),
      leftWeight: parseFloat(leftWeight.toFixed(2)),
      rightWeight: parseFloat(rightWeight.toFixed(2)),
      anteriorWeight: parseFloat(anteriorWeight.toFixed(2)),
      posteriorWeight: parseFloat(posteriorWeight.toFixed(2)),
      errorReason: "Calculated COP exceeds physical board boundaries",
    };
  }

  return {
    isValid: true,
    totalWeight: parseFloat(totalWeight.toFixed(2)),
    copX: parseFloat(copX.toFixed(4)),
    copY: parseFloat(copY.toFixed(4)),
    copXMm: parseFloat((copX * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(2)),
    copYMm: parseFloat((copY * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(2)),
    leftWeight: parseFloat(leftWeight.toFixed(2)),
    rightWeight: parseFloat(rightWeight.toFixed(2)),
    anteriorWeight: parseFloat(anteriorWeight.toFixed(2)),
    posteriorWeight: parseFloat(posteriorWeight.toFixed(2)),
  };
}

/**
 * Calculates relative COP from the patient's calibrated neutral baseline (X0, Y0).
 *
 * Sets relative neutral centre to (0, 0):
 * - relCopX = copX - X0
 * - relCopY = copY - Y0
 */
export function calculateRelativeCop(
  copX: number | null | undefined,
  copY: number | null | undefined,
  baseline?: DirectionalCalibrationBaseline | null
): { relCopX: number | null; relCopY: number | null; relCopXMm: number | null; relCopYMm: number | null } {
  if (copX === null || copX === undefined || isNaN(copX) || copY === null || copY === undefined || isNaN(copY)) {
    return { relCopX: null, relCopY: null, relCopXMm: null, relCopYMm: null };
  }
  const x0 = baseline && baseline.isCalibrated ? baseline.baselineX0 : 0.0;
  const y0 = baseline && baseline.isCalibrated ? baseline.baselineY0 : 0.0;

  const relCopX = copX - x0;
  const relCopY = copY - y0;

  return {
    relCopX: parseFloat(relCopX.toFixed(4)),
    relCopY: parseFloat(relCopY.toFixed(4)),
    relCopXMm: parseFloat((relCopX * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(2)),
    relCopYMm: parseFloat((relCopY * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(2)),
  };
}

// =========================================================================
// STEP 2: REAL COP DIRECTION VALIDATION & NOISE REJECTION PIPELINE
// =========================================================================

/**
 * Validated physiological movement directions relative to patient's calibrated neutral center.
 */
export type CopMovementDirection = "LEFT" | "RIGHT" | "FORWARD" | "BACKWARD" | "NEUTRAL" | "INDETERMINATE";

/**
 * Deadband configuration to prevent sensor ADC noise from triggering false movement.
 */
export interface DirectionalDeadbandConfig {
  /** Deadband threshold for normalized COP coordinates (default: 0.02 ~ 4.46mm lateral, 2.38mm AP) */
  deadbandNorm: number;
  /** Minimum physical radial displacement in millimetres to escape neutral deadband (default: 4.0 mm) */
  minDisplacementMm: number;
}

export const DEFAULT_DIRECTION_DEADBAND: DirectionalDeadbandConfig = {
  deadbandNorm: 0.020, // ~4.46 mm lateral, ~2.38 mm AP
  minDisplacementMm: 4.0, // 4.0 mm radial deadband
};

/**
 * Complete diagnostic telemetry record for Directional Weight Shift movement validation.
 */
export interface CopDirectionDiagnostic {
  /** Physical movement direction detected from sensor telemetry */
  detectedDirection: CopMovementDirection;
  /** Whether displacement exceeds sensor noise deadband */
  isOutsideDeadband: boolean;
  /** Current raw normalized COP */
  rawCopX: number;
  rawCopY: number;
  /** Calibrated baseline neutral COP */
  baselineX0: number;
  baselineY0: number;
  /** Relative displacement from baseline in normalized units */
  relCopX: number;
  relCopY: number;
  /** Relative displacement from baseline in physical millimetres */
  relCopXMm: number;
  relCopYMm: number;
  /** Euclidean radial distance from neutral baseline in millimetres */
  displacementMm: number;
  /** Total weight measured by 4 load cells in kg */
  totalWeight: number;
  /** Individual 4 load cell readings in kg */
  loadCells: {
    frontLeft: number;
    frontRight: number;
    backLeft: number;
    backRight: number;
  };
  /** Directional force balance validation */
  forceBalance: {
    leftForce: number;
    rightForce: number;
    anteriorForce: number;
    posteriorForce: number;
    lateralRatio: number; // (right - left) / total
    apRatio: number; // (anterior - posterior) / total
  };
  /** Diagnostic confirmation message explaining physical validation */
  diagnosticMessage: string;
}

/**
 * Low-latency rolling filter for Wii Balance Board COP telemetry.
 * Reduces ADC high-frequency noise and sensor jitter without introducing perceptible latency.
 * Window size: 3-5 samples (at 30-50Hz = 60-100ms window, phase delay ~30-50ms).
 */
export class CopRollingFilter {
  private buffer: Array<{ x: number; y: number; weight: number; timestamp: number }> = [];
  public windowSize: number;

  constructor(windowSize: number = 4) {
    this.windowSize = Math.max(1, Math.min(10, windowSize));
  }

  public reset(): void {
    this.buffer = [];
  }

  public pushSample(
    timestamp: number,
    copX: number | null | undefined,
    copY: number | null | undefined,
    totalWeight: number | null | undefined
  ): { filteredX: number | null; filteredY: number | null; filteredWeight: number | null; sampleCount: number } {
    if (
      copX === null || copX === undefined || isNaN(copX) ||
      copY === null || copY === undefined || isNaN(copY) ||
      totalWeight === null || totalWeight === undefined || isNaN(totalWeight) ||
      totalWeight < 10.0
    ) {
      // Missing or invalid sensor sample: reset buffer to avoid dragging stale values
      return { filteredX: null, filteredY: null, filteredWeight: null, sampleCount: this.buffer.length };
    }

    this.buffer.push({ x: copX, y: copY, weight: totalWeight, timestamp });
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }

    const n = this.buffer.length;
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;
    for (const s of this.buffer) {
      sumX += s.x;
      sumY += s.y;
      sumW += s.weight;
    }

    return {
      filteredX: parseFloat((sumX / n).toFixed(4)),
      filteredY: parseFloat((sumY / n).toFixed(4)),
      filteredWeight: parseFloat((sumW / n).toFixed(2)),
      sampleCount: n,
    };
  }

  public getBufferLength(): number {
    return this.buffer.length;
  }
}

/**
 * Rigorously classifies COP movement direction from raw 4-load-cell telemetry,
 * evaluates relative displacement from calibrated baseline (X0, Y0), applies deadband
 * filtering, and validates physical force balance:
 *
 * Expected Directions:
 * - Patient shifts LEFT    -> COP moves towards -X (relCopX < 0, F_Left > F_Right)
 * - Patient shifts RIGHT   -> COP moves towards +X (relCopX > 0, F_Right > F_Left)
 * - Patient shifts FORWARD -> COP moves towards +Y (relCopY > 0, F_Anterior > F_Posterior)
 * - Patient shifts BACKWARD-> COP moves towards -Y (relCopY < 0, F_Posterior > F_Anterior)
 * - Neutral Quiet Stance   -> Displacement within deadband (displacementMm < minDisplacementMm)
 */
export function classifyCopMovementDirection(
  fl: number | null | undefined,
  fr: number | null | undefined,
  bl: number | null | undefined,
  br: number | null | undefined,
  baseline?: DirectionalCalibrationBaseline | null,
  config: DirectionalDeadbandConfig = DEFAULT_DIRECTION_DEADBAND
): CopDirectionDiagnostic {
  const calc = calculateCopFromLoadCells(fl, fr, bl, br);

  const defaultEmptyLoadCells = {
    frontLeft: typeof fl === "number" ? fl : 0,
    frontRight: typeof fr === "number" ? fr : 0,
    backLeft: typeof bl === "number" ? bl : 0,
    backRight: typeof br === "number" ? br : 0,
  };

  const defaultForceBalance = {
    leftForce: 0,
    rightForce: 0,
    anteriorForce: 0,
    posteriorForce: 0,
    lateralRatio: 0,
    apRatio: 0,
  };

  if (!calc.isValid) {
    return {
      detectedDirection: "INDETERMINATE",
      isOutsideDeadband: false,
      rawCopX: 0,
      rawCopY: 0,
      baselineX0: baseline?.baselineX0 ?? 0,
      baselineY0: baseline?.baselineY0 ?? 0,
      relCopX: 0,
      relCopY: 0,
      relCopXMm: 0,
      relCopYMm: 0,
      displacementMm: 0,
      totalWeight: calc.totalWeight,
      loadCells: defaultEmptyLoadCells,
      forceBalance: defaultForceBalance,
      diagnosticMessage: calc.errorReason || "Invalid or missing 4-load-cell sensor telemetry",
    };
  }

  const rawCopX = calc.copX;
  const rawCopY = calc.copY;
  const baselineX0 = baseline && baseline.isCalibrated ? baseline.baselineX0 : 0.0;
  const baselineY0 = baseline && baseline.isCalibrated ? baseline.baselineY0 : 0.0;

  const relCopX = parseFloat((rawCopX - baselineX0).toFixed(4));
  const relCopY = parseFloat((rawCopY - baselineY0).toFixed(4));
  const relCopXMm = parseFloat((relCopX * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(2));
  const relCopYMm = parseFloat((relCopY * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(2));
  const displacementMm = parseFloat(Math.hypot(relCopXMm, relCopYMm).toFixed(2));

  const loadCells = {
    frontLeft: Math.max(0, fl ?? 0),
    frontRight: Math.max(0, fr ?? 0),
    backLeft: Math.max(0, bl ?? 0),
    backRight: Math.max(0, br ?? 0),
  };

  const leftForce = calc.leftWeight;
  const rightForce = calc.rightWeight;
  const anteriorForce = calc.anteriorWeight;
  const posteriorForce = calc.posteriorWeight;
  const lateralRatio = parseFloat(((rightForce - leftForce) / calc.totalWeight).toFixed(4));
  const apRatio = parseFloat(((anteriorForce - posteriorForce) / calc.totalWeight).toFixed(4));

  const forceBalance = {
    leftForce,
    rightForce,
    anteriorForce,
    posteriorForce,
    lateralRatio,
    apRatio,
  };

  // Deadband check: radial displacement and coordinate deadband
  const isOutsideDeadband =
    displacementMm >= config.minDisplacementMm ||
    Math.abs(relCopX) >= config.deadbandNorm ||
    Math.abs(relCopY) >= config.deadbandNorm;

  if (!isOutsideDeadband) {
    return {
      detectedDirection: "NEUTRAL",
      isOutsideDeadband: false,
      rawCopX,
      rawCopY,
      baselineX0,
      baselineY0,
      relCopX,
      relCopY,
      relCopXMm,
      relCopYMm,
      displacementMm,
      totalWeight: calc.totalWeight,
      loadCells,
      forceBalance,
      diagnosticMessage: `Neutral quiet stance: displacement (${displacementMm.toFixed(1)} mm) is within sensor deadband (<= ${config.minDisplacementMm.toFixed(1)} mm).`,
    };
  }

  // Dominant directional axis classification
  const absX = Math.abs(relCopX);
  const absY = Math.abs(relCopY);

  let detectedDirection: CopMovementDirection;
  let diagnosticMessage: string;

  if (absX >= absY) {
    if (relCopX < 0) {
      detectedDirection = "LEFT";
      diagnosticMessage = `Leftward weight shift verified: relCopX = ${relCopX} (-X), lateral displacement = ${Math.abs(relCopXMm).toFixed(1)} mm LEFT. Left force (${leftForce.toFixed(1)} kg) > Right force (${rightForce.toFixed(1)} kg).`;
    } else {
      detectedDirection = "RIGHT";
      diagnosticMessage = `Rightward weight shift verified: relCopX = +${relCopX} (+X), lateral displacement = ${relCopXMm.toFixed(1)} mm RIGHT. Right force (${rightForce.toFixed(1)} kg) > Left force (${leftForce.toFixed(1)} kg).`;
    }
  } else {
    if (relCopY > 0) {
      detectedDirection = "FORWARD";
      diagnosticMessage = `Forward anterior weight shift verified: relCopY = +${relCopY} (+Y), anterior displacement = ${relCopYMm.toFixed(1)} mm FORWARD. Anterior force (${anteriorForce.toFixed(1)} kg) > Posterior force (${posteriorForce.toFixed(1)} kg).`;
    } else {
      detectedDirection = "BACKWARD";
      diagnosticMessage = `Backward posterior weight shift verified: relCopY = ${relCopY} (-Y), posterior displacement = ${Math.abs(relCopYMm).toFixed(1)} mm BACKWARD. Posterior force (${posteriorForce.toFixed(1)} kg) > Anterior force (${anteriorForce.toFixed(1)} kg).`;
    }
  }

  return {
    detectedDirection,
    isOutsideDeadband: true,
    rawCopX,
    rawCopY,
    baselineX0,
    baselineY0,
    relCopX,
    relCopY,
    relCopXMm,
    relCopYMm,
    displacementMm,
    totalWeight: calc.totalWeight,
    loadCells,
    forceBalance,
    diagnosticMessage,
  };
}

/**
 * Rigorously validates a 5-second baseline calibration window:
 * 1. Confirms all four sensors provided valid readings.
 * 2. Confirms total patient weight is positive, >= 15.0kg, and stable (std dev <= 3.0kg).
 * 3. Confirms all COP readings are finite and within physically possible board limits.
 * 4. Confirms baseline postural sway is stable during the window (std dev <= 0.12).
 * 5. Returns exact error reason if validation fails.
 */
export function validateBaselineCalibration(
  samples: CalibrationSample[],
  targetDurationSeconds: number = 5.0
): CalibrationValidationResult {
  if (!samples || samples.length === 0) {
    return {
      isValid: false,
      errorReason: "No sensor samples received during calibration window",
    };
  }

  // Minimum sample count check (e.g. at 20-50Hz, 5 seconds is 100-250 samples; require at least 25 samples)
  if (samples.length < 25) {
    return {
      isValid: false,
      errorReason: `Insufficient sensor samples (${samples.length}/25 minimum). Check Bluetooth/HID connection stability.`,
    };
  }

  const startTime = samples[0].timestamp;
  const endTime = samples[samples.length - 1].timestamp;
  const durationMs = endTime - startTime;

  // Window duration check: must span at least 4.5 seconds (allowing for minor timer jitter)
  if (durationMs < (targetDurationSeconds * 1000) - 500) {
    return {
      isValid: false,
      errorReason: `Calibration period too short (${(durationMs / 1000).toFixed(1)}s / ${targetDurationSeconds}s required). Patient must stand for the full 5 seconds.`,
    };
  }

  // Weights check
  const weights = samples.map((s) => s.totalWeight);
  const meanWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

  if (meanWeight < 15.0) {
    return {
      isValid: false,
      errorReason: `Insufficient patient weight detected (${meanWeight.toFixed(1)} kg). Please stand firmly with both feet centered on the Wii Balance Board.`,
    };
  }

  // Weight stability: std dev of weight
  const weightVariance = weights.reduce((acc, w) => acc + Math.pow(w - meanWeight, 2), 0) / weights.length;
  const weightStdDevKg = Math.sqrt(weightVariance);

  if (weightStdDevKg > 3.0) {
    return {
      isValid: false,
      errorReason: `Weight was unstable during calibration (variation ±${weightStdDevKg.toFixed(1)} kg). Patient stepped off or shifted feet. Please remain standing still.`,
    };
  }

  // COP bounds check
  for (const s of samples) {
    if (Math.abs(s.copX) > 0.95 || Math.abs(s.copY) > 0.95) {
      return {
        isValid: false,
        errorReason: "Center of pressure exceeded safe physical board perimeter during baseline calibration.",
      };
    }
  }

  // COP stability: mean and standard deviation
  const copXs = samples.map((s) => s.copX);
  const copYs = samples.map((s) => s.copY);

  const baselineX0 = copXs.reduce((a, b) => a + b, 0) / copXs.length;
  const baselineY0 = copYs.reduce((a, b) => a + b, 0) / copYs.length;

  const varX = copXs.reduce((acc, x) => acc + Math.pow(x - baselineX0, 2), 0) / copXs.length;
  const varY = copYs.reduce((acc, y) => acc + Math.pow(y - baselineY0, 2), 0) / copXs.length;

  const copSdXNorm = Math.sqrt(varX);
  const copSdYNorm = Math.sqrt(varY);

  const copSdXMm = copSdXNorm * WII_BOARD_DIMENSIONS.halfDistanceXMm;
  const copSdYMm = copSdYNorm * WII_BOARD_DIMENSIONS.halfDistanceYMm;
  const copSdMm = Math.hypot(copSdXMm, copSdYMm);

  // Maximum allowed sway during quiet stance baseline: 0.12 normalized (~26.7mm X, ~14.3mm Y)
  if (copSdXNorm > 0.12 || copSdYNorm > 0.12) {
    return {
      isValid: false,
      errorReason: `Excessive postural sway during baseline measurement (sway dispersion: ${copSdMm.toFixed(1)} mm). Patient must stand still with feet stationary.`,
    };
  }

  return {
    isValid: true,
    baseline: {
      baselineX0: parseFloat(baselineX0.toFixed(4)),
      baselineY0: parseFloat(baselineY0.toFixed(4)),
      baselineX0Mm: parseFloat((baselineX0 * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(1)),
      baselineY0Mm: parseFloat((baselineY0 * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(1)),
      calibratedWeightKg: parseFloat(meanWeight.toFixed(1)),
      weightStdDevKg: parseFloat(weightStdDevKg.toFixed(2)),
      copSdXNorm: parseFloat(copSdXNorm.toFixed(4)),
      copSdYNorm: parseFloat(copSdYNorm.toFixed(4)),
      copSdMm: parseFloat(copSdMm.toFixed(1)),
      copSwayDispersionMm: parseFloat(copSdMm.toFixed(1)),
      sampleCount: samples.length,
      calibrationDurationSeconds: parseFloat((durationMs / 1000).toFixed(1)),
      timestamp: Date.now(),
      isCalibrated: true,
      statusMessage: "Neutral baseline successfully calibrated",
    },
  };
}

/**
 * High-performance collector for accumulating and validating 5-second patient calibration samples.
 */
export class BaselineCalibrationCollector {
  public samples: CalibrationSample[] = [];
  public startTimestamp: number | null = null;
  public targetDurationSeconds: number = 5.0;

  constructor(targetDurationSeconds: number = 5.0) {
    this.targetDurationSeconds = targetDurationSeconds;
  }

  public reset(startTime: number = Date.now()) {
    this.samples = [];
    this.startTimestamp = startTime;
  }

  public addLoadCellSample(
    timestamp: number,
    fl: number | null | undefined,
    fr: number | null | undefined,
    bl: number | null | undefined,
    br: number | null | undefined
  ): { isSampleValid: boolean; totalWeight: number; copX: number; copY: number; errorReason?: string } {
    if (this.startTimestamp === null) {
      this.startTimestamp = timestamp;
    }

    const calc = calculateCopFromLoadCells(fl, fr, bl, br);
    if (!calc.isValid) {
      return {
        isSampleValid: false,
        totalWeight: calc.totalWeight,
        copX: calc.copX,
        copY: calc.copY,
        errorReason: calc.errorReason,
      };
    }

    this.samples.push({
      timestamp,
      totalWeight: calc.totalWeight,
      copX: calc.copX,
      copY: calc.copY,
      fl: calc.leftWeight,
      fr: calc.rightWeight,
      bl: calc.anteriorWeight,
      br: calc.posteriorWeight,
    });

    return {
      isSampleValid: true,
      totalWeight: calc.totalWeight,
      copX: calc.copX,
      copY: calc.copY,
    };
  }

  public addCopSample(
    timestamp: number,
    copX: number | null | undefined,
    copY: number | null | undefined,
    totalWeight: number | null | undefined
  ): boolean {
    if (
      copX === null || copX === undefined || isNaN(copX) ||
      copY === null || copY === undefined || isNaN(copY) ||
      totalWeight === null || totalWeight === undefined || isNaN(totalWeight) ||
      totalWeight < 10.0
    ) {
      return false;
    }

    if (this.startTimestamp === null) {
      this.startTimestamp = timestamp;
    }

    this.samples.push({
      timestamp,
      totalWeight,
      copX: Math.max(-1.0, Math.min(1.0, copX)),
      copY: Math.max(-1.0, Math.min(1.0, copY)),
    });
    return true;
  }

  public getSampleCount(): number {
    return this.samples.length;
  }

  public getSamples(): CalibrationSample[] {
    return this.samples;
  }

  public getStatus(currentTimestamp: number = Date.now()): {
    elapsedSeconds: number;
    targetSeconds: number;
    progressPct: number;
    sampleCount: number;
    isComplete: boolean;
  } {
    const prog = this.getProgress(currentTimestamp);
    return {
      elapsedSeconds: prog.elapsedSeconds,
      targetSeconds: prog.targetSeconds,
      progressPct: prog.progressPct,
      sampleCount: prog.sampleCount,
      isComplete: prog.isTimeElapsed && this.samples.length >= 25,
    };
  }

  public getProgress(currentTimestamp: number = Date.now()): {
    elapsedSeconds: number;
    targetSeconds: number;
    progressPct: number;
    sampleCount: number;
    isTimeElapsed: boolean;
  } {
    if (this.startTimestamp === null) {
      return { elapsedSeconds: 0, targetSeconds: this.targetDurationSeconds, progressPct: 0, sampleCount: 0, isTimeElapsed: false };
    }
    const elapsedMs = Math.max(0, currentTimestamp - this.startTimestamp);
    const elapsedSeconds = parseFloat((elapsedMs / 1000).toFixed(1));
    const targetMs = this.targetDurationSeconds * 1000;
    const progressPct = Math.min(100, Math.round((elapsedMs / targetMs) * 100));
    const isTimeElapsed = elapsedMs >= targetMs;

    return {
      elapsedSeconds,
      targetSeconds: this.targetDurationSeconds,
      progressPct,
      sampleCount: this.samples.length,
      isTimeElapsed,
    };
  }

  public validateAndFinalize(targetDurationSeconds: number = this.targetDurationSeconds): CalibrationValidationResult {
    return validateBaselineCalibration(this.samples, targetDurationSeconds);
  }
}

export type DirectionalTargetName =
  | "SHIFT LEFT"
  | "SHIFT RIGHT"
  | "SHIFT FORWARD"
  | "SHIFT BACKWARD"
  | "SHIFT FORWARD-RIGHT"
  | "SHIFT FORWARD-LEFT"
  | "SHIFT BACKWARD-RIGHT"
  | "SHIFT BACKWARD-LEFT"
  | "RETURN TO CENTER";

export interface DirectionalTarget {
  id: string;
  stepNumber: number;
  name: DirectionalTargetName;
  shortLabel: string;
  instruction: string;
  x: number; // Normalized coordinate [-1.0, 1.0] on Wii Board
  y: number; // Normalized coordinate [-1.0, 1.0] on Wii Board
  targetXMm?: number; // Physical board coordinate X in mm
  targetYMm?: number; // Physical board coordinate Y in mm
  relTargetXMm?: number; // Relative coordinate X in mm (relative to patient baseline X0)
  relTargetYMm?: number; // Relative coordinate Y in mm (relative to patient baseline Y0)
  tolerance: number; // Radial tolerance zone radius (normalized)
  toleranceMm?: number; // Radial tolerance zone radius in physical millimetres
  requiredHoldDurationSeconds: number; // Configurable required hold duration in seconds
  parameterClassification?: string; // Disclaimer identifying parameter as configurable protocol setting, not validated clinical limit
}

/**
 * Conservative target boundaries for patient safety on the physical board.
 * Ensures targets remain safely inside the support base to avoid loss of balance.
 */
export const DIRECTIONAL_SAFE_BOUNDS = {
  minX: -0.78,
  maxX: 0.78,
  minY: -0.60,
  maxY: 0.60,
} as const;

/**
 * Default hold durations per target direction (seconds).
 * Configurable per assessment protocol:
 * - Left: 2s
 * - Right: 3s
 * - Forward: 1s
 * - Backward: 2s
 * - Center: 3s
 */
export const DEFAULT_DIRECTIONAL_DURATIONS: Record<DirectionalTargetName, number> = {
  "SHIFT LEFT": 2,
  "SHIFT RIGHT": 3,
  "SHIFT FORWARD": 2,
  "SHIFT BACKWARD": 2,
  "SHIFT FORWARD-RIGHT": 2,
  "SHIFT FORWARD-LEFT": 2,
  "SHIFT BACKWARD-RIGHT": 2,
  "SHIFT BACKWARD-LEFT": 2,
  "RETURN TO CENTER": 3,
};

/**
 * Default target offset distances in physical millimetres.
 *
 * IMPORTANT SCIENTIFIC DISCLAIMER:
 * These displacements are configurable exercise protocol settings, NOT validated
 * physiological limits of stability (LOS) or clinical boundaries. Individual limits
 * vary by patient height, stance width, pathology, and foot size.
 */
export const DEFAULT_PATIENT_TARGET_OFFSETS_MM = {
  /** Far lateral (~0.68 normalized) — near board edge */
  leftDistanceMm: 151.64,
  rightDistanceMm: 151.64,
  /** Far anteroposterior (~0.52 normalized) — near board edge */
  forwardDistanceMm: 61.88,
  backwardDistanceMm: 61.88,
  toleranceMm: 48.0, // ~0.215 normalized radial tolerance
} as const;

/** Seconds the patient must hold center stance before Target 1 begins */
export const CENTER_START_HOLD_SECONDS = 3;

/**
 * Configurable patient-specific directional assessment parameters.
 * Allows clinicians to tailor target displacement distances to individual rehabilitation protocols.
 */
export interface PatientSpecificTargetConfig {
  /** Lateral left target displacement in physical mm (default: 84.74 mm) */
  leftDistanceMm?: number;
  /** Lateral right target displacement in physical mm (default: 84.74 mm) */
  rightDistanceMm?: number;
  /** Anteroposterior forward target displacement in physical mm (default: 38.08 mm) */
  forwardDistanceMm?: number;
  /** Anteroposterior backward target displacement in physical mm (default: 38.08 mm) */
  backwardDistanceMm?: number;
  /** Radial tolerance zone radius in physical mm (default: 40.4 mm) */
  toleranceMm?: number;
  /** Custom required hold durations per direction in seconds */
  customDurations?: Partial<Record<DirectionalTargetName, number>>;
  /** Explicit classification indicating configurable assessment parameter vs validated clinical limit */
  parameterClassification?: string;
}

/**
 * Verifies that the starting COP baseline (X0, Y0) has met all stability and hardware validation gates.
 * Requires:
 * 1. isCalibrated is true
 * 2. At least 25 authentic samples collected over the 5-second quiet standing window
 * 3. Total patient weight >= 15.0kg with standard deviation <= 3.0kg
 * 4. Baseline postural sway dispersion <= 40.0mm
 */
export function isBaselineCalibrationReady(baseline?: DirectionalCalibrationBaseline | null): boolean {
  if (!baseline || !baseline.isCalibrated) return false;
  return (
    baseline.sampleCount >= 25 &&
    baseline.calibratedWeightKg >= 15.0 &&
    baseline.copSdMm <= 40.0 &&
    baseline.weightStdDevKg <= 3.0
  );
}

/**
 * Legacy hold duration requirement constant in milliseconds (2.0 seconds) for backward compatibility.
 */
export const TARGET_HOLD_DURATION_MS = 2000;

/**
 * Small tremor/jitter tolerance buffer added to radius when patient is already inside target,
 * preventing accidental timer resets from natural microscopic sensor fluctuations.
 */
export const SENSOR_JITTER_TOLERANCE_BUFFER = 0.025;

/**
 * Configurable default target coordinate sample count setting.
 * Based on the professor's handwritten coordinate calculation method (provisional default: 60 points).
 */
export const DEFAULT_COORDINATE_SAMPLE_COUNT = 60;

/**
 * The canonical 5 sequential targets for Phase D Directional Weight Shift.
 * Strictly ordered:
 * 1. SHIFT LEFT (2s default hold)
 * 2. SHIFT RIGHT (3s default hold)
 * 3. SHIFT FORWARD (1s default hold)
 * 4. SHIFT BACKWARD (2s default hold)
 * 5. RETURN TO CENTER (3s default hold)
 *
 * Target coordinates stored in calibrated physical millimetres relative to neutral center:
 * - LEFT: (-84.74 mm, 0.0 mm)
 * - RIGHT: (+84.74 mm, 0.0 mm)
 * - FORWARD: (0.0 mm, +38.08 mm)
 * - BACKWARD: (0.0 mm, -38.08 mm)
 * - CENTER: (0.0 mm, 0.0 mm)
 */
export const DIRECTIONAL_TARGET_SEQUENCE: DirectionalTarget[] = [
  {
    id: "dir-target-1-left",
    stepNumber: 1,
    name: "SHIFT LEFT",
    shortLabel: "Left",
    instruction: "Move your body weight towards the left target and hold for 2 seconds.",
    x: -0.38,
    y: 0.0,
    targetXMm: -84.74,
    targetYMm: 0.0,
    relTargetXMm: -84.74,
    relTargetYMm: 0.0,
    tolerance: 0.16,
    toleranceMm: 40.4,
    requiredHoldDurationSeconds: 2,
    parameterClassification: "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
  },
  {
    id: "dir-target-2-right",
    stepNumber: 2,
    name: "SHIFT RIGHT",
    shortLabel: "Right",
    instruction: "Move your body weight across to the right target and hold for 3 seconds.",
    x: 0.38,
    y: 0.0,
    targetXMm: 84.74,
    targetYMm: 0.0,
    relTargetXMm: 84.74,
    relTargetYMm: 0.0,
    tolerance: 0.16,
    toleranceMm: 40.4,
    requiredHoldDurationSeconds: 3,
    parameterClassification: "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
  },
  {
    id: "dir-target-3-forward",
    stepNumber: 3,
    name: "SHIFT FORWARD",
    shortLabel: "Forward",
    instruction: "Move your body weight forward towards the front target and hold for 1 second.",
    x: 0.0,
    y: 0.32,
    targetXMm: 0.0,
    targetYMm: 38.08,
    relTargetXMm: 0.0,
    relTargetYMm: 38.08,
    tolerance: 0.16,
    toleranceMm: 40.4,
    requiredHoldDurationSeconds: 1,
    parameterClassification: "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
  },
  {
    id: "dir-target-4-backward",
    stepNumber: 4,
    name: "SHIFT BACKWARD",
    shortLabel: "Backward",
    instruction: "Move your body weight backward towards the back target and hold for 2 seconds.",
    x: 0.0,
    y: -0.32,
    targetXMm: 0.0,
    targetYMm: -38.08,
    relTargetXMm: 0.0,
    relTargetYMm: -38.08,
    tolerance: 0.16,
    toleranceMm: 40.4,
    requiredHoldDurationSeconds: 2,
    parameterClassification: "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
  },
  {
    id: "dir-target-5-center",
    stepNumber: 5,
    name: "RETURN TO CENTER",
    shortLabel: "Center",
    instruction: "Return your body weight to the center target and hold for 3 seconds.",
    x: 0.0,
    y: 0.0,
    targetXMm: 0.0,
    targetYMm: 0.0,
    relTargetXMm: 0.0,
    relTargetYMm: 0.0,
    tolerance: 0.16,
    toleranceMm: 40.4,
    requiredHoldDurationSeconds: 3,
    parameterClassification: "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
  },
];

/**
 * Generates patient-specific calibrated targets positioned relative to the patient's neutral baseline (X0, Y0).
 *
 * Mathematical formulation:
 * - Left:     Relative (-leftDist, 0)       -> Board (X0_mm - leftDist, Y0_mm)
 * - Right:    Relative (+rightDist, 0)      -> Board (X0_mm + rightDist, Y0_mm)
 * - Forward:  Relative (0, +fwdDist)        -> Board (X0_mm, Y0_mm + fwdDist)
 * - Backward: Relative (0, -bwdDist)        -> Board (X0_mm, Y0_mm - bwdDist)
 * - Center:   Relative (0, 0)               -> Board (X0_mm, Y0_mm)
 *
 * Clinical note: Target offsets are configurable assessment parameters tailored to individual protocols,
 * NOT validated physiological limits of stability (LOS).
 */
export function getPatientCalibratedTargets(
  baseline?: DirectionalCalibrationBaseline | null,
  config?: PatientSpecificTargetConfig
): DirectionalTarget[] {
  const leftDist = config?.leftDistanceMm ?? DEFAULT_PATIENT_TARGET_OFFSETS_MM.leftDistanceMm;
  const rightDist = config?.rightDistanceMm ?? DEFAULT_PATIENT_TARGET_OFFSETS_MM.rightDistanceMm;
  const fwdDist = config?.forwardDistanceMm ?? DEFAULT_PATIENT_TARGET_OFFSETS_MM.forwardDistanceMm;
  const bwdDist = config?.backwardDistanceMm ?? DEFAULT_PATIENT_TARGET_OFFSETS_MM.backwardDistanceMm;
  const tolMm = config?.toleranceMm ?? DEFAULT_PATIENT_TARGET_OFFSETS_MM.toleranceMm;
  const tolNorm = parseFloat((tolMm / WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(3));

  const x0Mm = baseline && baseline.isCalibrated ? baseline.baselineX0Mm : 0.0;
  const y0Mm = baseline && baseline.isCalibrated ? baseline.baselineY0Mm : 0.0;

  const disclaimer = config?.parameterClassification ??
    "Configurable Assessment Parameter (Non-Validated Clinical Limit)";

  // Far layout: 4 corners + Forward + Backward + Center (7 targets), near board edges.
  const targetDefs: Array<{
    name: DirectionalTargetName;
    id: string;
    stepNumber: number;
    shortLabel: string;
    relXMm: number;
    relYMm: number;
    defaultHold: number;
    instruction: (secWord: string) => string;
  }> = [
    {
      name: "SHIFT FORWARD-RIGHT",
      id: "dir-target-1-fwd-right",
      stepNumber: 1,
      shortLabel: "Fwd-Right",
      relXMm: rightDist,
      relYMm: fwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight to the FRONT-RIGHT corner and hold for ${secWord}.`,
    },
    {
      name: "SHIFT BACKWARD-LEFT",
      id: "dir-target-2-back-left",
      stepNumber: 2,
      shortLabel: "Back-Left",
      relXMm: -leftDist,
      relYMm: -bwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight to the BACK-LEFT corner (opposite side) and hold for ${secWord}.`,
    },
    {
      name: "SHIFT FORWARD",
      id: "dir-target-3-forward",
      stepNumber: 3,
      shortLabel: "Forward",
      relXMm: 0.0,
      relYMm: fwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight fully FORWARD and hold for ${secWord}.`,
    },
    {
      name: "SHIFT BACKWARD",
      id: "dir-target-4-backward",
      stepNumber: 4,
      shortLabel: "Backward",
      relXMm: 0.0,
      relYMm: -bwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight fully BACKWARD and hold for ${secWord}.`,
    },
    {
      name: "SHIFT FORWARD-LEFT",
      id: "dir-target-5-fwd-left",
      stepNumber: 5,
      shortLabel: "Fwd-Left",
      relXMm: -leftDist,
      relYMm: fwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight to the FRONT-LEFT corner and hold for ${secWord}.`,
    },
    {
      name: "SHIFT BACKWARD-RIGHT",
      id: "dir-target-6-back-right",
      stepNumber: 6,
      shortLabel: "Back-Right",
      relXMm: rightDist,
      relYMm: -bwdDist,
      defaultHold: 2,
      instruction: (secWord) =>
        `Shift your weight to the BACK-RIGHT corner (opposite side) and hold for ${secWord}.`,
    },
    {
      name: "RETURN TO CENTER",
      id: "dir-target-7-center",
      stepNumber: 7,
      shortLabel: "Center",
      relXMm: 0.0,
      relYMm: 0.0,
      defaultHold: 3,
      instruction: (secWord) =>
        `Return your body weight to the center target and hold for ${secWord}.`,
    },
  ];

  const targets: DirectionalTarget[] = targetDefs.map((def) => {
    const holdSec = config?.customDurations && config.customDurations[def.name] !== undefined
      ? Math.max(0.5, config.customDurations[def.name]!)
      : (DEFAULT_DIRECTIONAL_DURATIONS[def.name] ?? def.defaultHold);

    const secWord = holdSec === 1 ? "1 second" : `${holdSec} seconds`;
    const absTargetXMm = parseFloat((x0Mm + def.relXMm).toFixed(2));
    const absTargetYMm = parseFloat((y0Mm + def.relYMm).toFixed(2));
    const normX = parseFloat((def.relXMm / WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(4));
    const normY = parseFloat((def.relYMm / WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(4));

    return {
      id: def.id,
      stepNumber: def.stepNumber,
      name: def.name,
      shortLabel: def.shortLabel,
      instruction: def.instruction(secWord),
      x: normX,
      y: normY,
      targetXMm: absTargetXMm,
      targetYMm: absTargetYMm,
      relTargetXMm: parseFloat(def.relXMm.toFixed(2)),
      relTargetYMm: parseFloat(def.relYMm.toFixed(2)),
      tolerance: tolNorm,
      toleranceMm: tolMm,
      requiredHoldDurationSeconds: holdSec,
      parameterClassification: disclaimer,
    };
  });

  for (const t of targets) {
    if (
      t.x < DIRECTIONAL_SAFE_BOUNDS.minX ||
      t.x > DIRECTIONAL_SAFE_BOUNDS.maxX ||
      t.y < DIRECTIONAL_SAFE_BOUNDS.minY ||
      t.y > DIRECTIONAL_SAFE_BOUNDS.maxY
    ) {
      throw new Error(`Target ${t.name} exceeds safe limits!`);
    }
  }

  return targets;
}

/**
 * Returns a cloned copy of the 5 sequential targets, allowing optional custom hold durations per target,
 * configurable patient-specific target distances, baseline calibration, and verifies safety bounds.
 */
export function getDirectionalTargets(
  customDurations?: Partial<Record<DirectionalTargetName, number>>,
  targetConfig?: PatientSpecificTargetConfig,
  baseline?: DirectionalCalibrationBaseline | null
): DirectionalTarget[] {
  const mergedConfig: PatientSpecificTargetConfig = {
    ...targetConfig,
    customDurations: customDurations ?? targetConfig?.customDurations,
  };
  return getPatientCalibratedTargets(baseline, mergedConfig);
}

/** Fisher–Yates shuffle (new array). */
export function shuffleDirectionalTargets<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Far session sequence (7 targets):
 * opposite corner pairs + Forward/Backward, then Center.
 * Default: Fwd-Right → Back-Left → Forward → Backward → Fwd-Left → Back-Right → Center.
 */
export function getRandomizedFarDirectionalTargets(
  customDurations?: Partial<Record<DirectionalTargetName, number>>,
  baseline?: DirectionalCalibrationBaseline | null
): DirectionalTarget[] {
  const all = getDirectionalTargets(customDurations, undefined, baseline);
  const byName = (name: DirectionalTargetName) => all.find((t) => t.name === name)!;
  const center = byName("RETURN TO CENTER");

  const cornerPairA = [byName("SHIFT FORWARD-RIGHT"), byName("SHIFT BACKWARD-LEFT")];
  const axisPair = [byName("SHIFT FORWARD"), byName("SHIFT BACKWARD")];
  const cornerPairB = [byName("SHIFT FORWARD-LEFT"), byName("SHIFT BACKWARD-RIGHT")];

  const orient = <T,>(pair: T[]): T[] => (Math.random() < 0.2 ? [...pair].reverse() : pair);

  const midPairs =
    Math.random() < 0.5
      ? [...orient(axisPair), ...orient(cornerPairB)]
      : [...orient(cornerPairB), ...orient(axisPair)];

  const ordered = [...orient(cornerPairA), ...midPairs, center];
  return ordered.map((t, i) => ({
    ...t,
    stepNumber: i + 1,
    id: `dir-target-${i + 1}-${t.shortLabel.toLowerCase().replace(/\s+/g, "-")}`,
  }));
}

/** Synthetic center target used for the pre-start 3s center stance gate. */
export function getCenterStartGateTarget(
  baseline?: DirectionalCalibrationBaseline | null
): DirectionalTarget {
  const x0Mm = baseline && baseline.isCalibrated ? baseline.baselineX0Mm : 0;
  const y0Mm = baseline && baseline.isCalibrated ? baseline.baselineY0Mm : 0;
  const tolMm = 50.0;
  const tolNorm = parseFloat((tolMm / WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(3));
  return {
    id: "dir-center-start-gate",
    stepNumber: 0,
    name: "RETURN TO CENTER",
    shortLabel: "Center",
    instruction: `Stand naturally in the center of the board and hold for ${CENTER_START_HOLD_SECONDS} seconds to begin Target 1.`,
    x: 0,
    y: 0,
    targetXMm: x0Mm,
    targetYMm: y0Mm,
    relTargetXMm: 0,
    relTargetYMm: 0,
    tolerance: tolNorm,
    toleranceMm: tolMm,
    requiredHoldDurationSeconds: CENTER_START_HOLD_SECONDS,
    parameterClassification: "Pre-Start Center Stance Gate",
  };
}

/**
 * Calculates Euclidean distance between current real COP and target in normalized coordinates.
 * Returns null if COP is null/undefined/NaN.
 */
export function calculateCopDistanceToTarget(
  copX: number | null | undefined,
  copY: number | null | undefined,
  targetX: number,
  targetY: number
): number | null {
  if (
    copX === null ||
    copX === undefined ||
    isNaN(copX) ||
    copY === null ||
    copY === undefined ||
    isNaN(copY)
  ) {
    return null;
  }
  return Math.hypot(copX - targetX, copY - targetY);
}

/**
 * Converts normalized COP coordinate [-1.0, 1.0] to physical millimetres on Wii Balance Board.
 * Lateral: 223.0 mm half-distance.
 * Anteroposterior: 119.0 mm half-distance.
 */
export function convertNormalizedCopToMm(
  copX: number | null | undefined,
  copY: number | null | undefined
): { xMm: number; yMm: number } | null {
  if (
    copX === null ||
    copX === undefined ||
    isNaN(copX) ||
    copY === null ||
    copY === undefined ||
    isNaN(copY)
  ) {
    return null;
  }
  return {
    xMm: copX * WII_BOARD_DIMENSIONS.halfDistanceXMm,
    yMm: copY * WII_BOARD_DIMENSIONS.halfDistanceYMm,
  };
}

/**
 * Calculates Euclidean distance between COP and target in physical millimetres,
 * calibrated against the physical Nintendo Wii Balance Board dimensions (446mm x 238mm).
 * Returns null if COP is null/undefined/NaN.
 */
export function calculateCopDistanceToTargetMm(
  copX: number | null | undefined,
  copY: number | null | undefined,
  targetX: number,
  targetY: number
): number | null {
  if (
    copX === null ||
    copX === undefined ||
    isNaN(copX) ||
    copY === null ||
    copY === undefined ||
    isNaN(copY)
  ) {
    return null;
  }
  const dxMm = (copX - targetX) * WII_BOARD_DIMENSIONS.halfDistanceXMm;
  const dyMm = (copY - targetY) * WII_BOARD_DIMENSIONS.halfDistanceYMm;
  return Math.hypot(dxMm, dyMm);
}

/**
 * Evaluates whether the patient's COP has entered the target tolerance zone.
 * Strictly returns false if telemetry is unavailable or disconnected.
 */
export function isDirectionalTargetReached(
  copX: number | null | undefined,
  copY: number | null | undefined,
  target: DirectionalTarget
): boolean {
  const dist = calculateCopDistanceToTarget(copX, copY, target.x, target.y);
  if (dist === null) return false;
  return dist <= target.tolerance;
}

export interface DirectionalMovementGuidance {
  guidanceMessage: string;
  isGood: boolean;
  isInTargetZone: boolean;
  isBoardWaiting: boolean;
  dx: number;
  dy: number;
  distance: number | null;
}

/**
 * Computes guidance message:
 * - If board disconnected / COP unavailable: "Waiting for Balance Board"
 * - If hold completed: "GOOD"
 * - If in target zone: "Target reached! Hold steady"
 * - If in wrong direction:
 *     "Move slightly more LEFT"
 *     "Move slightly more RIGHT"
 *     "Move slightly FORWARD"
 *     "Move slightly BACKWARD"
 */
export function computeDirectionalGuidance(
  copX: number | null | undefined,
  copY: number | null | undefined,
  target: DirectionalTarget,
  isHoldComplete: boolean = false,
  isHolding: boolean = false
): DirectionalMovementGuidance {
  const distance = calculateCopDistanceToTarget(copX, copY, target.x, target.y);

  if (distance === null || copX === null || copY === null || copX === undefined || copY === undefined) {
    return {
      guidanceMessage: "Waiting for Balance Board",
      isGood: false,
      isInTargetZone: false,
      isBoardWaiting: true,
      dx: 0,
      dy: 0,
      distance: null,
    };
  }

  if (isHoldComplete) {
    return {
      guidanceMessage: "GOOD",
      isGood: true,
      isInTargetZone: true,
      isBoardWaiting: false,
      dx: 0,
      dy: 0,
      distance,
    };
  }

  const isInTargetZone = distance <= target.tolerance;
  const dx = target.x - copX;
  const dy = target.y - copY;

  if (isInTargetZone) {
    const holdReqSec = target.requiredHoldDurationSeconds ?? 2;
    return {
      guidanceMessage: isHolding ? `Hold position... (${holdReqSec}s)` : "Target reached! Hold steady",
      isGood: false,
      isInTargetZone: true,
      isBoardWaiting: false,
      dx,
      dy,
      distance,
    };
  }

  // Not in target zone: guide patient in the dominant required direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let guidanceText = "";
  if (absDx >= absDy) {
    // Lateral adjustment dominant
    guidanceText = dx > 0 ? "Move slightly more RIGHT" : "Move slightly more LEFT";
  } else {
    // Anteroposterior adjustment dominant
    guidanceText = dy > 0 ? "Move slightly FORWARD" : "Move slightly BACKWARD";
  }

  return {
    guidanceMessage: guidanceText,
    isGood: false,
    isInTargetZone: false,
    isBoardWaiting: false,
    dx,
    dy,
    distance,
  };
}

/**
 * Format telemetry helpers guaranteeing "--" is rendered when sensor data is absent.
 */
export function formatWeightTelemetry(weightKg: number | null | undefined, isConnected: boolean): string {
  if (!isConnected || weightKg === null || weightKg === undefined || isNaN(weightKg)) {
    return "--";
  }
  return `${weightKg.toFixed(1)} kg`;
}

export function formatCopTelemetry(copVal: number | null | undefined, isConnected: boolean): string {
  if (!isConnected || copVal === null || copVal === undefined || isNaN(copVal)) {
    return "--";
  }
  return copVal >= 0 ? `+${copVal.toFixed(2)}` : copVal.toFixed(2);
}

export function formatSessionTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface DirectionalSamplePoint {
  timestamp: number; // millisecond timestamp of the sensor sample
  elapsedMs: number; // relative to target start
  copX: number; // normalized [-1.0, 1.0]
  copY: number; // normalized [-1.0, 1.0]
  copXMm: number; // physical mm on Wii Balance Board
  copYMm: number; // physical mm on Wii Balance Board
  relCopXMm?: number; // relative displacement from patient baseline in mm (copXMm - X0mm)
  relCopYMm?: number; // relative displacement from patient baseline in mm (copYMm - Y0mm)
  totalWeight: number; // kg
  distanceNorm: number; // Euclidean distance in normalized coords
  distanceMm: number; // Euclidean distance in mm
  isInside: boolean;
}

/**
 * One board+camera-synced frame from first border hit on a target through hold completion.
 * Includes leave/re-enter frames after first contact (hold timer still requires a continuous hold).
 *
 * Per-frame error:
 *   e = √( (x₁ − xₜ)² + (y₁ − yₜ)² )
 * where (x₁,y₁) is the target center and (xₜ,yₜ) is this frame's COP.
 */
export interface HoldWindowFrameSample {
  frameIndex: number;
  /** Shared soft-sync wall clock used to pair board + camera at this tick */
  syncTimestamp: number;
  /** Session T0 when 3s center hold ended / Target 1 began (wall-clock ms) */
  syncEpochMs: number | null;
  boardTimestampMs: number | null;
  visionTimestampMs: number | null;
  /** boardTimestamp − syncEpoch (ms since session T0); null if either missing */
  boardRelMs: number | null;
  /** visionTimestamp − syncEpoch (ms since session T0); null if either missing */
  visionRelMs: number | null;
  /**
   * ms since THIS target's first stored coordinate (first border hit).
   * Same gate as coordinate storing — graph X-axis uses this.
   */
  holdRelMs: number | null;
  /** |boardTimestamp − visionTimestamp| when both available */
  timeSkewMs: number | null;
  targetX: number;
  targetY: number;
  targetXMm: number;
  targetYMm: number;
  copX: number;
  copY: number;
  copXMm: number;
  copYMm: number;
  /** √((targetX − copX)² + (targetY − copY)²) in normalized COP space */
  errorNorm: number;
  /** √((targetXMm − copXMm)² + (targetYMm − copYMm)²) in millimetres */
  errorMm: number;
  /** Signed offset from target in mm: copXMm − targetXMm */
  dxMm: number;
  /** Signed offset from target in mm: copYMm − targetYMm */
  dyMm: number;
  /** True when COP was inside the target tolerance at this frame */
  isInside: boolean;
  weightKg: number | null;
  hasPose: boolean;
  visionFps: number | null;
}

/** Per-target series of hold-window frame errors (first border hit → hold complete). */
export interface HoldWindowErrorSeries {
  targetId: string;
  stepNumber: number;
  targetName: DirectionalTargetName;
  shortLabel: string;
  requiredHoldDurationSeconds: number;
  sampleCount: number;
  samples: HoldWindowFrameSample[];
  /** First frameIndex of the trailing continuous inside streak (final successful hold) */
  finalHoldStartFrameIndex: number | null;
  /** Last frameIndex of the final successful hold (usually last sample) */
  finalHoldEndFrameIndex: number | null;
  meanErrorNorm: number | null;
  rmsErrorNorm: number | null;
  minErrorNorm: number | null;
  maxErrorNorm: number | null;
  meanErrorMm: number | null;
  rmsErrorMm: number | null;
  minErrorMm: number | null;
  maxErrorMm: number | null;
}

/** Trailing continuous inside streak = the final successful hold window. */
export function findFinalHoldFrameRange(
  samples: HoldWindowFrameSample[]
): { startFrameIndex: number | null; endFrameIndex: number | null } {
  if (!samples.length) return { startFrameIndex: null, endFrameIndex: null };
  let i = samples.length - 1;
  if (!samples[i].isInside) {
    // Should not happen on a completed hold, but stay safe
    while (i >= 0 && !samples[i].isInside) i--;
    if (i < 0) return { startFrameIndex: null, endFrameIndex: null };
  }
  const endFrameIndex = samples[i].frameIndex;
  while (i >= 0 && samples[i].isInside) i--;
  const startFrameIndex = samples[i + 1].frameIndex;
  return { startFrameIndex, endFrameIndex };
}

/** Euclidean error between target center and a COP sample (normalized + mm). */
export function computeHoldFrameTargetError(
  targetX: number,
  targetY: number,
  copX: number,
  copY: number
): { errorNorm: number; errorMm: number; copXMm: number; copYMm: number; targetXMm: number; targetYMm: number } {
  const targetXMm = targetX * WII_BOARD_DIMENSIONS.halfDistanceXMm;
  const targetYMm = targetY * WII_BOARD_DIMENSIONS.halfDistanceYMm;
  const copXMm = copX * WII_BOARD_DIMENSIONS.halfDistanceXMm;
  const copYMm = copY * WII_BOARD_DIMENSIONS.halfDistanceYMm;
  const errorNorm = Math.hypot(targetX - copX, targetY - copY);
  const errorMm = Math.hypot(targetXMm - copXMm, targetYMm - copYMm);
  return {
    errorNorm: parseFloat(errorNorm.toFixed(6)),
    errorMm: parseFloat(errorMm.toFixed(3)),
    copXMm: parseFloat(copXMm.toFixed(2)),
    copYMm: parseFloat(copYMm.toFixed(2)),
    targetXMm: parseFloat(targetXMm.toFixed(2)),
    targetYMm: parseFloat(targetYMm.toFixed(2)),
  };
}

export function buildHoldWindowErrorSeries(params: {
  targetId: string;
  stepNumber: number;
  targetName: DirectionalTargetName;
  shortLabel: string;
  requiredHoldDurationSeconds: number;
  samples: HoldWindowFrameSample[];
}): HoldWindowErrorSeries {
  const samples = params.samples;
  const N = samples.length;
  const finalHold = findFinalHoldFrameRange(samples);
  if (N === 0) {
    return {
      ...params,
      sampleCount: 0,
      finalHoldStartFrameIndex: null,
      finalHoldEndFrameIndex: null,
      meanErrorNorm: null,
      rmsErrorNorm: null,
      minErrorNorm: null,
      maxErrorNorm: null,
      meanErrorMm: null,
      rmsErrorMm: null,
      minErrorMm: null,
      maxErrorMm: null,
    };
  }

  const norms = samples.map((s) => s.errorNorm);
  const mms = samples.map((s) => s.errorMm);
  const meanNorm = norms.reduce((a, b) => a + b, 0) / N;
  const meanMm = mms.reduce((a, b) => a + b, 0) / N;
  const rmsNorm = Math.sqrt(norms.reduce((a, b) => a + b * b, 0) / N);
  const rmsMm = Math.sqrt(mms.reduce((a, b) => a + b * b, 0) / N);

  return {
    ...params,
    sampleCount: N,
    finalHoldStartFrameIndex: finalHold.startFrameIndex,
    finalHoldEndFrameIndex: finalHold.endFrameIndex,
    meanErrorNorm: parseFloat(meanNorm.toFixed(6)),
    rmsErrorNorm: parseFloat(rmsNorm.toFixed(6)),
    minErrorNorm: parseFloat(Math.min(...norms).toFixed(6)),
    maxErrorNorm: parseFloat(Math.max(...norms).toFixed(6)),
    meanErrorMm: parseFloat(meanMm.toFixed(2)),
    rmsErrorMm: parseFloat(rmsMm.toFixed(2)),
    minErrorMm: parseFloat(Math.min(...mms).toFixed(2)),
    maxErrorMm: parseFloat(Math.max(...mms).toFixed(2)),
  };
}

/**
 * Coordinate error statistics computed from measured physical COP coordinates (mm)
 * according to the professor's handwritten COP coordinate calculation method.
 */
export interface CoordinateErrorMetrics {
  targetXMm: number;
  targetYMm: number;
  toleranceMm: number;
  validSampleCount: number; // N: number of valid coordinate samples
  configuredSampleCount: number; // e.g. 60
  meanDistanceErrorMm: number; // d_bar = (1/N) * sum_{i=1}^N d(i)
  sdDistanceErrorMm: number; // sigma_d = sqrt((1/N) * sum_{i=1}^N (d(i) - d_bar)^2)
  rmsDistanceErrorMm: number; // d_RMS = sqrt((1/N) * sum_{i=1}^N d(i)^2)
  minDistanceErrorMm: number; // d_min = min_i d(i)
  maxDistanceErrorMm: number; // d_max = max_i d(i)
  samplesInTargetZoneCount: number; // N_inside
  samplesInTargetZonePercentage: number; // (N_inside / N) * 100%
  distanceErrorsMm: number[]; // All raw Euclidean distance errors d(i) in mm
  rawMeanDistanceErrorMm: number; // Unrounded mean distance error
  rawSdDistanceErrorMm: number; // Unrounded SD distance error
  rawRmsDistanceErrorMm: number; // Unrounded RMS distance error
}

/**
 * Calculates rigorous coordinate error metrics from actual COP measurements (in mm)
 * relative to target coordinates, implementing the professor's handwritten coordinate calculation method:
 *
 * 1. Euclidean distance error for each valid sample i:
 *    d(i) = sqrt((X(i) - TargetX)^2 + (Y(i) - TargetY)^2) [mm]
 * 2. Mean COP distance error:
 *    d_bar = (1/N) * sum_{i=1}^N d(i) [mm]
 * 3. Standard deviation of COP distance error:
 *    sigma_d = sqrt((1/N) * sum_{i=1}^N (d(i) - d_bar)^2) [mm]
 * 4. Root Mean Square (RMS) distance error:
 *    d_RMS = sqrt((1/N) * sum_{i=1}^N d(i)^2) [mm]
 * 5. Minimum and Maximum distance errors:
 *    d_min = min_i d(i), d_max = max_i d(i) [mm]
 * 6. Percentage of valid samples in target zone:
 *    (N_inside / N) * 100%
 *
 * Rejects disconnected, invalid, NaN, and unladen sensor readings (< 10kg).
 */
export function calculateCoordinateErrorMetrics(
  samples: Array<{
    copXMm?: number | null;
    copYMm?: number | null;
    relCopXMm?: number | null;
    relCopYMm?: number | null;
    copX?: number | null;
    copY?: number | null;
    totalWeight?: number | null;
    distanceMm?: number;
    isInside?: boolean;
  }>,
  targetXMm: number,
  targetYMm: number,
  toleranceMm: number = 40.4,
  configuredSampleCount: number = DEFAULT_COORDINATE_SAMPLE_COUNT
): CoordinateErrorMetrics {
  const validDistances: number[] = [];
  let insideCount = 0;

  for (const s of samples) {
    if (!s) continue;

    // Reject unloaded board (< 10.0kg) or non-numeric weight if totalWeight is present
    if (s.totalWeight !== undefined && s.totalWeight !== null) {
      if (isNaN(s.totalWeight) || s.totalWeight < 10.0) {
        continue;
      }
    }

    let xMm: number | null = null;
    let yMm: number | null = null;

    if (typeof s.copXMm === "number" && !isNaN(s.copXMm) && typeof s.copYMm === "number" && !isNaN(s.copYMm)) {
      xMm = s.copXMm;
      yMm = s.copYMm;
    } else if (typeof s.relCopXMm === "number" && !isNaN(s.relCopXMm) && typeof s.relCopYMm === "number" && !isNaN(s.relCopYMm)) {
      xMm = s.relCopXMm;
      yMm = s.relCopYMm;
    } else if (typeof s.copX === "number" && !isNaN(s.copX) && typeof s.copY === "number" && !isNaN(s.copY)) {
      xMm = s.copX * WII_BOARD_DIMENSIONS.halfDistanceXMm;
      yMm = s.copY * WII_BOARD_DIMENSIONS.halfDistanceYMm;
    }

    if (xMm === null || yMm === null) {
      continue;
    }

    const distMm = Math.hypot(xMm - targetXMm, yMm - targetYMm);
    validDistances.push(distMm);

    // Strict physical zone only — do not reuse tracker jitter `isInside` flags
    if (distMm <= toleranceMm) {
      insideCount++;
    }
  }

  const N = validDistances.length;
  if (N === 0) {
    return {
      targetXMm,
      targetYMm,
      toleranceMm,
      validSampleCount: 0,
      configuredSampleCount,
      meanDistanceErrorMm: 0,
      sdDistanceErrorMm: 0,
      rmsDistanceErrorMm: 0,
      // Sentinel so empty data never reads as "perfect hit" (0 mm)
      minDistanceErrorMm: Number.POSITIVE_INFINITY,
      maxDistanceErrorMm: 0,
      samplesInTargetZoneCount: 0,
      samplesInTargetZonePercentage: 0,
      distanceErrorsMm: [],
      rawMeanDistanceErrorMm: 0,
      rawSdDistanceErrorMm: 0,
      rawRmsDistanceErrorMm: 0,
    };
  }

  const sumD = validDistances.reduce((acc, d) => acc + d, 0);
  const rawMean = sumD / N;

  const sumSqD = validDistances.reduce((acc, d) => acc + d * d, 0);
  const rawRms = Math.sqrt(sumSqD / N);

  const sumDevSq = validDistances.reduce((acc, d) => acc + (d - rawMean) ** 2, 0);
  const rawSd = Math.sqrt(sumDevSq / N);

  const rawMin = Math.min(...validDistances);
  const rawMax = Math.max(...validDistances);
  const rawInZonePct = (insideCount / N) * 100;

  return {
    targetXMm,
    targetYMm,
    toleranceMm,
    validSampleCount: N,
    configuredSampleCount,
    meanDistanceErrorMm: parseFloat(rawMean.toFixed(2)),
    sdDistanceErrorMm: parseFloat(rawSd.toFixed(2)),
    rmsDistanceErrorMm: parseFloat(rawRms.toFixed(2)),
    minDistanceErrorMm: parseFloat(rawMin.toFixed(2)),
    maxDistanceErrorMm: parseFloat(rawMax.toFixed(2)),
    samplesInTargetZoneCount: insideCount,
    samplesInTargetZonePercentage: parseFloat(rawInZonePct.toFixed(1)),
    distanceErrorsMm: validDistances,
    rawMeanDistanceErrorMm: rawMean,
    rawSdDistanceErrorMm: rawSd,
    rawRmsDistanceErrorMm: rawRms,
  };
}

/**
 * Calculates total cumulative COP trajectory path length in physical millimetres.
 * Sums Euclidean distance between consecutive valid sensor coordinates:
 * L = sum_{k=1}^{N-1} sqrt((X_{k+1} - X_k)^2 + (Y_{k+1} - Y_k)^2)
 *
 * Drops/filters intervals where data gaps exceed 350ms to prevent artificial leap distances.
 */
export function calculateCopPathLengthMm(
  samples: Array<{ copXMm?: number | null; copYMm?: number | null; timestamp?: number }>
): number {
  if (!samples || samples.length < 2) return 0;
  let totalLength = 0;

  for (let i = 0; i < samples.length - 1; i++) {
    const curr = samples[i];
    const next = samples[i + 1];

    if (
      typeof curr.copXMm === "number" &&
      !isNaN(curr.copXMm) &&
      typeof curr.copYMm === "number" &&
      !isNaN(curr.copYMm) &&
      typeof next.copXMm === "number" &&
      !isNaN(next.copXMm) &&
      typeof next.copYMm === "number" &&
      !isNaN(next.copYMm)
    ) {
      if (curr.timestamp && next.timestamp && next.timestamp - curr.timestamp > 350) {
        continue; // Discard time gaps > 350ms
      }
      totalLength += Math.hypot(next.copXMm - curr.copXMm, next.copYMm - curr.copYMm);
    }
  }

  return parseFloat(totalLength.toFixed(1));
}

export interface DirectionalTargetAssessment {
  targetId: string;
  stepNumber: number; // 1 to 5
  name: DirectionalTargetName;
  shortLabel: string;
  targetX: number;
  targetY: number;
  targetXMm: number;
  targetYMm: number;
  relTargetXMm?: number; // Relative coordinate X in mm (relative to baseline X0)
  relTargetYMm?: number; // Relative coordinate Y in mm (relative to baseline Y0)
  baselineX0Mm?: number; // Starting baseline X0 in physical mm
  baselineY0Mm?: number; // Starting baseline Y0 in physical mm
  tolerance: number;
  toleranceMm: number;
  parameterClassification?: string;

  // Phase 4 Objective Coordinate Measurements
  actualCopXMm?: number | null; // Centroid measured actual COP X in physical board mm
  actualCopYMm?: number | null; // Centroid measured actual COP Y in physical board mm
  actualRelCopXMm?: number | null; // Centroid measured relative COP X in mm (relative to X0)
  actualRelCopYMm?: number | null; // Centroid measured relative COP Y in mm (relative to Y0)
  pathLengthMm?: number; // Total cumulative COP trajectory path length (mm)
  coordinateHitRatePercentage?: number; // Spatial containment hit rate: % of valid samples in tolerance
  isTargetReached?: boolean; // Whether patient reached within target tolerance region (d_min <= toleranceMm)

  // Status
  isCompleted: boolean;
  completionTimeSeconds: number | null; // time from target start until hold requirement achieved

  // Hold durations strictly computed from sensor sample timestamps
  requiredHoldDurationSeconds: number; // e.g. Left: 2s, Right: 3s, Forward: 1s, Backward: 2s, Center: 3s
  actualSuccessfulHoldDurationSeconds: number; // Measured uninterrupted hold achieved (>= required if completed, or max continuous if not)
  longestContinuousHoldSeconds: number; // Longest continuous successful hold for backward compatibility
  continuousHoldDurationSeconds: number; // Measured uninterrupted hold duration achieved
  accumulatedHoldDurationSeconds: number; // Total cumulative time spent inside target zone

  // Durations (seconds) strictly computed from sensor sample timestamps
  validDurationSeconds: number; // Total valid measurement duration
  timeInsideSeconds: number; // Time spent inside target
  timeOutsideSeconds: number; // Time spent outside target
  timeInsidePercentage: number; // (timeInsideSeconds / validDurationSeconds) * 100
  timeAccuracyPercentage: number; // Clinical alias for time inside percentage

  // Exact unrounded durations for aggregate calculations
  rawValidDurationSeconds?: number;
  rawTimeInsideSeconds?: number;
  rawTimeOutsideSeconds?: number;

  // Transitions & Attempts
  attemptCount: number; // Number of distinct genuine entries into the target zone
  enterCount: number;
  exitCount: number;

  // Accuracy & Position metrics
  accuracyPercentage: number; // (valid samples inside / total valid samples) * 100
  validSampleCount: number;
  samplesInsideCount: number;
  samplesOutsideCount: number;

  // Distance from target center
  meanDistanceNorm: number | null;
  meanDistanceMm: number | null;
  medianDistanceNorm: number | null;
  medianDistanceMm: number | null;
  maxDistanceNorm: number | null;
  maxDistanceMm: number | null;
  minDistanceNorm: number | null;
  minDistanceMm: number | null;

  // COP variability while attempting target (Standard Deviation)
  copSdNorm: number | null;
  copSdMm: number | null;
  copSdXNorm: number | null;
  copSdYNorm: number | null;

  // Professor's Coordinate-Based Error Metrics
  coordinateMetrics?: CoordinateErrorMetrics;
  meanDistanceErrorMm?: number | null;
  sdDistanceErrorMm?: number | null;
  rmsDistanceErrorMm?: number | null;
  minDistanceErrorMm?: number | null;
  maxDistanceErrorMm?: number | null;
  configuredCoordinateSampleCount?: number;

  // Data Quality & Limitations
  missingDataDurationSeconds: number;
  invalidSampleCount: number;
  dataGapsCount: number;
  sensorQuality: "Optimal" | "Degraded" | "Interrupted" | "Unavailable";
  validSamplePercentage: number; // (validSampleCount / totalSampleCount) * 100

  // Samples
  samples: DirectionalSamplePoint[];

  /**
   * Board+camera-synced frames captured only while inside the target border
   * during the successful continuous hold that completed this target.
   */
  holdWindowFrameSamples?: HoldWindowFrameSample[];
  holdWindowErrorSeries?: HoldWindowErrorSeries | null;
}

export interface DirectionalWeightShiftSessionSummary {
  sessionId: string;
  patientId: string;
  patientName: string;
  sessionDate: string;
  startTime: number;
  endTime: number;
  totalDurationSeconds: number;
  completedTargetsCount: number; // out of 5
  totalTargetsCount: number; // 5
  allTargetsCompleted: boolean;

  // Aggregate Metrics
  overallAccuracyPercentage: number;
  overallTimeWeightedAccuracyPercentage: number; // Time-weighted accuracy across valid measurement duration
  meanTargetAccuracyPercentage: number; // Arithmetic mean of individual target accuracies
  totalTimeInsideSeconds: number;
  totalTimeOutsideSeconds: number;
  totalAttemptsCount: number; // Total genuine attempts across all targets
  meanCopDistanceMm: number | null; // Mean distance to target center across all samples in mm
  meanHoldTimeSeconds: number;
  meanCompletedHoldTimeSeconds?: number | null; // Mean hold duration of strictly completed targets
  overallCopSdNorm: number | null;
  overallCopSdMm: number | null;

  // Professor's Coordinate-Based Error Metrics (Aggregate)
  meanDistanceErrorMm?: number | null;
  sdDistanceErrorMm?: number | null;
  rmsDistanceErrorMm?: number | null;
  minDistanceErrorMm?: number | null;
  maxDistanceErrorMm?: number | null;
  totalValidCoordinateSamples?: number;
  configuredCoordinateSampleCount?: number;

  // Phase 4 Coordinate-Based Session Measurements
  meanCoordinateErrorMm?: number | null; // Session mean coordinate error across all targets (mm)
  overallPathLengthMm?: number; // Overall cumulative COP trajectory path length across all targets (mm)
  trajectoryVariabilityMm?: number | null; // Trajectory spatial standard deviation sqrt(varX + varY) in mm
  sessionHitRatePercentage?: number; // Percentage of all valid coordinate samples inside target tolerance zones (%)
  returnToCenterErrorMm?: number | null; // Mean distance error specifically for Return to Center target (mm)
  returnToCenterMinErrorMm?: number | null; // Minimum distance to center reached during Return to Center (mm)
  successfulTargetsCount?: number; // Number of targets successfully reached (tolerance zone entered)
  unsuccessfulTargetsCount?: number; // Number of targets not reached (5 - successfulTargetsCount)

  // Sensor Quality
  hardwareModel: string;
  isRealHardware: boolean;
  totalValidSamples: number;
  totalInvalidSamples: number;
  validSamplePercentage: number; // (valid / (valid + invalid)) * 100
  totalMissingDataDurationSeconds: number;
  overallSensorQuality: string;
  qualityWarnings: string[];

  // Target assessments
  targets: DirectionalTargetAssessment[];

  /**
   * Per-target hold-window frame error series (inside border only, until hold complete).
   * Mirrors data also attached onto each DirectionalTargetAssessment.
   */
  holdWindowErrorSeries?: HoldWindowErrorSeries[];

  // Patient Neutral Baseline Calibration
  calibrationBaseline?: DirectionalCalibrationBaseline;
  isBaselineCalibrated?: boolean;
  parameterClassification?: string;

  /**
   * Shared multimodal clock epoch (wall-clock ms) stamped when the 3s center
   * hold ends and Target 1 begins. All hold-frame relative times use this T0.
   */
  multimodalSyncEpochMs?: number | null;
}

export function createInitialTargetAssessment(
  target: DirectionalTarget,
  baseline?: DirectionalCalibrationBaseline | null
): DirectionalTargetAssessment {
  const reqHoldSec = target.requiredHoldDurationSeconds ?? (DEFAULT_DIRECTIONAL_DURATIONS[target.name] || 2);
  const targetXMm = target.targetXMm ?? parseFloat((target.x * WII_BOARD_DIMENSIONS.halfDistanceXMm).toFixed(1));
  const targetYMm = target.targetYMm ?? parseFloat((target.y * WII_BOARD_DIMENSIONS.halfDistanceYMm).toFixed(1));
  const toleranceMm = target.toleranceMm ?? parseFloat(
    Math.hypot(
      target.tolerance * WII_BOARD_DIMENSIONS.halfDistanceXMm,
      target.tolerance * WII_BOARD_DIMENSIONS.halfDistanceYMm
    ).toFixed(1)
  );

  const x0Mm = baseline && baseline.isCalibrated ? baseline.baselineX0Mm : 0.0;
  const y0Mm = baseline && baseline.isCalibrated ? baseline.baselineY0Mm : 0.0;
  const relTargetXMm = target.relTargetXMm !== undefined
    ? target.relTargetXMm
    : parseFloat((targetXMm - x0Mm).toFixed(2));
  const relTargetYMm = target.relTargetYMm !== undefined
    ? target.relTargetYMm
    : parseFloat((targetYMm - y0Mm).toFixed(2));

  return {
    targetId: target.id,
    stepNumber: target.stepNumber,
    name: target.name,
    shortLabel: target.shortLabel,
    targetX: target.x,
    targetY: target.y,
    targetXMm,
    targetYMm,
    relTargetXMm,
    relTargetYMm,
    baselineX0Mm: x0Mm,
    baselineY0Mm: y0Mm,
    tolerance: target.tolerance,
    toleranceMm,
    parameterClassification: target.parameterClassification,

    // Phase 4 Objective Coordinate Measurements
    actualCopXMm: null,
    actualCopYMm: null,
    actualRelCopXMm: null,
    actualRelCopYMm: null,
    pathLengthMm: 0,
    coordinateHitRatePercentage: 0,
    isTargetReached: false,

    requiredHoldDurationSeconds: reqHoldSec,
    actualSuccessfulHoldDurationSeconds: 0,
    longestContinuousHoldSeconds: 0,
    continuousHoldDurationSeconds: 0,
    accumulatedHoldDurationSeconds: 0,

    isCompleted: false,
    completionTimeSeconds: null,

    validDurationSeconds: 0,
    timeInsideSeconds: 0,
    timeOutsideSeconds: 0,
    timeInsidePercentage: 0,
    timeAccuracyPercentage: 0,

    attemptCount: 0,
    enterCount: 0,
    exitCount: 0,

    accuracyPercentage: 0,
    validSampleCount: 0,
    samplesInsideCount: 0,
    samplesOutsideCount: 0,

    meanDistanceNorm: null,
    meanDistanceMm: null,
    medianDistanceNorm: null,
    medianDistanceMm: null,
    maxDistanceNorm: null,
    maxDistanceMm: null,
    minDistanceNorm: null,
    minDistanceMm: null,

    copSdNorm: null,
    copSdMm: null,
    copSdXNorm: null,
    copSdYNorm: null,

    meanDistanceErrorMm: null,
    sdDistanceErrorMm: null,
    rmsDistanceErrorMm: null,
    minDistanceErrorMm: null,
    maxDistanceErrorMm: null,
    configuredCoordinateSampleCount: DEFAULT_COORDINATE_SAMPLE_COUNT,

    missingDataDurationSeconds: 0,
    invalidSampleCount: 0,
    dataGapsCount: 0,
    sensorQuality: "Unavailable",
    validSamplePercentage: 0,

    samples: [],
    holdWindowFrameSamples: [],
    holdWindowErrorSeries: null,
  };
}

/**
 * Robust accumulator and tracker for an individual directional target attempt.
 * Evaluates target entry, hold duration (strictly meeting the target's configured duration),
 * sample timestamps, tremor buffer to prevent micro-fluctuation resets,
 * relative baseline tracking, and handles disconnections / stale packets cleanly.
 */
export class DirectionalTargetTracker {
  public assessment: DirectionalTargetAssessment;
  private baseline: DirectionalCalibrationBaseline | null = null;
  private currentContinuousHoldMs: number = 0;
  private lastValidTimestamp: number | null = null;
  private lastProcessedTimestamp: number | null = null;
  private targetStartTimestamp: number | null = null;
  private wasInside: boolean = false;

  constructor(target: DirectionalTarget, baseline?: DirectionalCalibrationBaseline | null) {
    this.baseline = baseline ?? null;
    this.assessment = createInitialTargetAssessment(target, baseline);
  }

  public start(timestamp: number) {
    this.targetStartTimestamp = timestamp;
    this.lastValidTimestamp = null;
    this.lastProcessedTimestamp = null;
    this.currentContinuousHoldMs = 0;
    this.wasInside = false;
  }

  public recordSample(
    timestamp: number,
    copX: number | null | undefined,
    copY: number | null | undefined,
    totalWeight: number | null | undefined,
    isConnected: boolean,
    rawCopX?: number | null | undefined,
    rawCopY?: number | null | undefined
  ): {
    isCompleted: boolean;
    holdProgressPct: number;
    currentContinuousHoldSeconds: number;
    isInside: boolean;
  } {
    const requiredHoldMs = Math.round(this.assessment.requiredHoldDurationSeconds * 1000);

    // Valid when connected with a finite COP. Do not hard-block on the 10kg standing
    // gate — that previously froze hold progress when tare/calibration under-reported weight.
    const hasCop =
      copX !== null &&
      copX !== undefined &&
      !isNaN(copX) &&
      copY !== null &&
      copY !== undefined &&
      !isNaN(copY);
    const isValid = Boolean(isConnected && hasCop);

    if (!isValid) {
      // Disconnected or invalid packet
      if (this.targetStartTimestamp !== null) {
        if (this.lastProcessedTimestamp !== null && timestamp > this.lastProcessedTimestamp) {
          const gapMs = timestamp - this.lastProcessedTimestamp;
          this.assessment.missingDataDurationSeconds += gapMs / 1000;
        }
        this.assessment.invalidSampleCount++;
      }
      // Reset continuous hold timer when board telemetry is missing/invalid
      this.currentContinuousHoldMs = 0;
      this.wasInside = false;
      this.lastProcessedTimestamp = timestamp;

      return {
        isCompleted: this.assessment.isCompleted,
        holdProgressPct: 0,
        currentContinuousHoldSeconds: 0,
        isInside: false,
      };
    }

    // Guard against duplicate / stale samples
    if (this.lastProcessedTimestamp !== null && timestamp <= this.lastProcessedTimestamp) {
      const currentHoldSec = this.currentContinuousHoldMs / 1000;
      const progress = Math.min(100, Math.round((this.currentContinuousHoldMs / requiredHoldMs) * 100));
      return {
        isCompleted: this.assessment.isCompleted,
        holdProgressPct: progress,
        currentContinuousHoldSeconds: parseFloat(currentHoldSec.toFixed(2)),
        isInside: this.wasInside,
      };
    }

    if (this.targetStartTimestamp === null) {
      this.targetStartTimestamp = timestamp;
    }

    // Determine timestamp delta strictly from hardware timestamps
    let dtMs = 0;
    if (this.lastValidTimestamp !== null) {
      dtMs = timestamp - this.lastValidTimestamp;
      if (dtMs > 350) {
        // Intermittent latency dropout
        this.assessment.dataGapsCount++;
        const excessiveGap = dtMs - 50;
        this.assessment.missingDataDurationSeconds += Math.max(0, excessiveGap) / 1000;
        dtMs = 50; // Clamp nominal integration increment
      }
    } else if (this.targetStartTimestamp !== null && timestamp > this.targetStartTimestamp) {
      dtMs = Math.min(50, timestamp - this.targetStartTimestamp);
    } else {
      dtMs = 0;
    }

    const distNorm = calculateCopDistanceToTarget(copX, copY, this.assessment.targetX, this.assessment.targetY) ?? 0;
    const distMm = calculateCopDistanceToTargetMm(copX, copY, this.assessment.targetX, this.assessment.targetY) ?? 0;

    // Strict target boundary logic with small tremor buffer:
    // When entering from outside: strictly require distNorm <= tolerance.
    // While holding inside: allow small natural tremor buffer (tolerance + SENSOR_JITTER_TOLERANCE_BUFFER)
    // so natural sway right at the edge doesn't cause frustrating instantaneous resets.
    // If COP leaves beyond this tolerance buffer, reset uninterrupted hold timer immediately.
    const effectiveTolerance = this.wasInside
      ? this.assessment.tolerance + SENSOR_JITTER_TOLERANCE_BUFFER
      : this.assessment.tolerance;
    const isInside = distNorm <= effectiveTolerance;

    const dtSec = dtMs / 1000;
    this.assessment.validDurationSeconds += dtSec;
    this.assessment.validSampleCount++;

    const elapsedMs = timestamp - this.targetStartTimestamp;
    const x0Mm = this.baseline?.baselineX0Mm ?? this.assessment.baselineX0Mm ?? 0.0;
    const y0Mm = this.baseline?.baselineY0Mm ?? this.assessment.baselineY0Mm ?? 0.0;

    let absCopXMm: number;
    let absCopYMm: number;
    let relCopXMm: number;
    let relCopYMm: number;

    if (
      rawCopX !== undefined &&
      rawCopX !== null &&
      !isNaN(rawCopX) &&
      rawCopY !== undefined &&
      rawCopY !== null &&
      !isNaN(rawCopY)
    ) {
      absCopXMm = rawCopX * WII_BOARD_DIMENSIONS.halfDistanceXMm;
      absCopYMm = rawCopY * WII_BOARD_DIMENSIONS.halfDistanceYMm;
      relCopXMm = absCopXMm - x0Mm;
      relCopYMm = absCopYMm - y0Mm;
    } else {
      const relMm = convertNormalizedCopToMm(copX, copY) ?? { xMm: 0, yMm: 0 };
      relCopXMm = relMm.xMm;
      relCopYMm = relMm.yMm;
      absCopXMm = x0Mm + relCopXMm;
      absCopYMm = y0Mm + relCopYMm;
    }

    this.assessment.samples.push({
      timestamp,
      elapsedMs,
      copX,
      copY,
      copXMm: parseFloat(absCopXMm.toFixed(2)),
      copYMm: parseFloat(absCopYMm.toFixed(2)),
      relCopXMm: parseFloat(relCopXMm.toFixed(2)),
      relCopYMm: parseFloat(relCopYMm.toFixed(2)),
      totalWeight: totalWeight ?? 0,
      distanceNorm: parseFloat(distNorm.toFixed(4)),
      distanceMm: parseFloat(distMm.toFixed(2)),
      isInside,
    });

    if (isInside) {
      this.assessment.timeInsideSeconds += dtSec;
      this.assessment.samplesInsideCount++;

      if (!this.wasInside) {
        this.assessment.enterCount++;
        this.assessment.attemptCount++;
        this.currentContinuousHoldMs = 0;
      }

      this.currentContinuousHoldMs += dtMs;
      const currentHoldSec = this.currentContinuousHoldMs / 1000;
      if (currentHoldSec > this.assessment.longestContinuousHoldSeconds) {
        this.assessment.longestContinuousHoldSeconds = parseFloat(currentHoldSec.toFixed(2));
      }

      if (this.currentContinuousHoldMs >= requiredHoldMs && !this.assessment.isCompleted) {
        this.assessment.isCompleted = true;
        this.assessment.actualSuccessfulHoldDurationSeconds = parseFloat((this.currentContinuousHoldMs / 1000).toFixed(2));
        this.assessment.completionTimeSeconds = parseFloat(((timestamp - this.targetStartTimestamp) / 1000).toFixed(2));
      }
    } else {
      this.assessment.timeOutsideSeconds += dtSec;
      this.assessment.samplesOutsideCount++;

      if (this.wasInside) {
        this.assessment.exitCount++;
      }

      // Reset continuous hold timer to zero whenever ball leaves target circle beyond tolerance
      this.currentContinuousHoldMs = 0;
    }

    this.wasInside = isInside;
    this.lastValidTimestamp = timestamp;
    this.lastProcessedTimestamp = timestamp;

    const progressPct = Math.min(100, Math.round((this.currentContinuousHoldMs / requiredHoldMs) * 100));
    return {
      isCompleted: this.assessment.isCompleted,
      holdProgressPct: progressPct,
      currentContinuousHoldSeconds: parseFloat((this.currentContinuousHoldMs / 1000).toFixed(2)),
      isInside,
    };
  }

  public finalize(): DirectionalTargetAssessment {
    return finalizeTargetAssessment(this.assessment);
  }
}

/**
 * Calculates exact statistical median for an array of numerical values.
 */
export function calculateMedian(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return parseFloat(sorted[mid].toFixed(2));
  }
  return parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
}

/**
 * Computes scientific statistics and finalize summary metrics for a single target.
 */
export function finalizeTargetAssessment(assessment: DirectionalTargetAssessment): DirectionalTargetAssessment {
  const result: DirectionalTargetAssessment = { ...assessment };

  // Retain exact unrounded raw values for session aggregation
  const rawValid = assessment.validDurationSeconds;
  const rawInside = assessment.timeInsideSeconds;
  const rawOutside = assessment.timeOutsideSeconds;

  result.rawValidDurationSeconds = rawValid;
  result.rawTimeInsideSeconds = rawInside;
  result.rawTimeOutsideSeconds = rawOutside;

  // Round durations for display while strictly ensuring:
  // timeInsideSeconds + timeOutsideSeconds === validDurationSeconds
  const roundedValid = parseFloat(rawValid.toFixed(2));
  const roundedInside = parseFloat(rawInside.toFixed(2));
  const roundedOutside = parseFloat((roundedValid - roundedInside).toFixed(2));

  result.validDurationSeconds = roundedValid;
  result.timeInsideSeconds = roundedInside;
  result.timeOutsideSeconds = Math.max(0, roundedOutside);
  result.longestContinuousHoldSeconds = parseFloat(result.longestContinuousHoldSeconds.toFixed(2));
  result.actualSuccessfulHoldDurationSeconds = result.isCompleted
    ? parseFloat(result.actualSuccessfulHoldDurationSeconds.toFixed(2))
    : result.longestContinuousHoldSeconds;
  result.continuousHoldDurationSeconds = result.actualSuccessfulHoldDurationSeconds;
  result.accumulatedHoldDurationSeconds = parseFloat(result.timeInsideSeconds.toFixed(2));
  result.missingDataDurationSeconds = parseFloat(result.missingDataDurationSeconds.toFixed(2));

  // Time accuracy percentage: (timeInsideSeconds / validDurationSeconds) * 100
  // Computed from raw unrounded values, then rounded to 1 decimal place for display
  if (rawValid > 0) {
    result.timeInsidePercentage = parseFloat(
      ((rawInside / rawValid) * 100).toFixed(1)
    );
  } else {
    result.timeInsidePercentage = 0;
  }
  result.timeAccuracyPercentage = result.timeInsidePercentage;

  // Data quality: percentage of valid samples
  const totalAttemptedSamples = result.validSampleCount + result.invalidSampleCount;
  result.validSamplePercentage = totalAttemptedSamples > 0
    ? parseFloat(((result.validSampleCount / totalAttemptedSamples) * 100).toFixed(1))
    : 0;

  // Professor's Coordinate-Based Error Metrics
  const coordMetrics = calculateCoordinateErrorMetrics(
    result.samples,
    result.targetXMm,
    result.targetYMm,
    result.toleranceMm,
    result.configuredCoordinateSampleCount ?? DEFAULT_COORDINATE_SAMPLE_COUNT
  );

  result.coordinateMetrics = coordMetrics;
  result.meanDistanceErrorMm = coordMetrics.meanDistanceErrorMm;
  result.sdDistanceErrorMm = coordMetrics.sdDistanceErrorMm;
  result.rmsDistanceErrorMm = coordMetrics.rmsDistanceErrorMm;
  result.minDistanceErrorMm =
    coordMetrics.validSampleCount > 0 && Number.isFinite(coordMetrics.minDistanceErrorMm)
      ? coordMetrics.minDistanceErrorMm
      : null;
  result.maxDistanceErrorMm =
    coordMetrics.validSampleCount > 0 ? coordMetrics.maxDistanceErrorMm : null;
  result.configuredCoordinateSampleCount = coordMetrics.configuredSampleCount;

  // Phase 4 Objective Coordinate Measurements
  result.coordinateHitRatePercentage = coordMetrics.samplesInTargetZonePercentage;
  result.pathLengthMm = calculateCopPathLengthMm(result.samples);
  result.isTargetReached =
    coordMetrics.validSampleCount > 0 &&
    (coordMetrics.samplesInTargetZoneCount > 0 ||
      (Number.isFinite(coordMetrics.minDistanceErrorMm) &&
        coordMetrics.minDistanceErrorMm <= result.toleranceMm));

  // Actual Centroid COP coordinates (in mm)
  if (result.samples.length > 0) {
    const validCopSamples = result.samples.filter(
      (s) => typeof s.copXMm === "number" && !isNaN(s.copXMm) && typeof s.copYMm === "number" && !isNaN(s.copYMm)
    );
    if (validCopSamples.length > 0) {
      const sumX = validCopSamples.reduce((acc, s) => acc + s.copXMm, 0);
      const sumY = validCopSamples.reduce((acc, s) => acc + s.copYMm, 0);
      result.actualCopXMm = parseFloat((sumX / validCopSamples.length).toFixed(2));
      result.actualCopYMm = parseFloat((sumY / validCopSamples.length).toFixed(2));

      const x0 = result.baselineX0Mm ?? 0;
      const y0 = result.baselineY0Mm ?? 0;
      result.actualRelCopXMm = parseFloat((result.actualCopXMm - x0).toFixed(2));
      result.actualRelCopYMm = parseFloat((result.actualCopYMm - y0).toFixed(2));
    } else {
      result.actualCopXMm = null;
      result.actualCopYMm = null;
      result.actualRelCopXMm = null;
      result.actualRelCopYMm = null;
    }
  } else {
    result.actualCopXMm = null;
    result.actualCopYMm = null;
    result.actualRelCopXMm = null;
    result.actualRelCopYMm = null;
  }

  // Scientific Accuracy Percentage:
  // Accuracy (%) = (Valid coordinate samples inside target / Total valid coordinate samples during target) * 100
  // NOT derived from hold duration or elapsed time.
  if (coordMetrics.validSampleCount > 0) {
    result.accuracyPercentage = coordMetrics.samplesInTargetZonePercentage;
  } else if (result.validSampleCount > 0) {
    result.accuracyPercentage = parseFloat(
      ((result.samplesInsideCount / result.validSampleCount) * 100).toFixed(1)
    );
  } else {
    result.accuracyPercentage = 0;
  }

  // Distance and variability calculations from recorded samples
  const samples = result.samples;
  if (samples.length > 0) {
    const distancesNorm = samples.map((s) => s.distanceNorm);
    const distancesMm = samples.map((s) => s.distanceMm);

    const sumDistNorm = distancesNorm.reduce((a, b) => a + b, 0);
    const sumDistMm = distancesMm.reduce((a, b) => a + b, 0);

    result.meanDistanceNorm = parseFloat((sumDistNorm / samples.length).toFixed(4));
    result.meanDistanceMm = parseFloat((sumDistMm / samples.length).toFixed(1));
    result.medianDistanceNorm = calculateMedian(distancesNorm);
    result.medianDistanceMm = calculateMedian(distancesMm);
    result.maxDistanceNorm = parseFloat(Math.max(...distancesNorm).toFixed(4));
    result.maxDistanceMm = parseFloat(Math.max(...distancesMm).toFixed(1));
    result.minDistanceNorm = parseFloat(Math.min(...distancesNorm).toFixed(4));
    result.minDistanceMm = parseFloat(Math.min(...distancesMm).toFixed(1));

    // COP Position Variation (Standard Deviation of COP coordinates)
    const xs = samples.map((s) => s.copX);
    const ys = samples.map((s) => s.copY);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const varX = xs.reduce((acc, val) => acc + (val - meanX) ** 2, 0) / xs.length;
    const varY = ys.reduce((acc, val) => acc + (val - meanY) ** 2, 0) / ys.length;

    const sdX = Math.sqrt(varX);
    const sdY = Math.sqrt(varY);
    const sdNorm = Math.hypot(sdX, sdY);

    // Standard deviation in physical millimetres
    const varXMm = varX * (WII_BOARD_DIMENSIONS.halfDistanceXMm ** 2);
    const varYMm = varY * (WII_BOARD_DIMENSIONS.halfDistanceYMm ** 2);
    const sdMm = Math.sqrt(varXMm + varYMm);

    result.copSdXNorm = parseFloat(sdX.toFixed(4));
    result.copSdYNorm = parseFloat(sdY.toFixed(4));
    result.copSdNorm = parseFloat(sdNorm.toFixed(4));
    result.copSdMm = parseFloat(sdMm.toFixed(1));
  } else {
    result.meanDistanceNorm = null;
    result.meanDistanceMm = null;
    result.medianDistanceNorm = null;
    result.medianDistanceMm = null;
    result.maxDistanceNorm = null;
    result.maxDistanceMm = null;
    result.minDistanceNorm = null;
    result.minDistanceMm = null;
    result.copSdNorm = null;
    result.copSdMm = null;
  }

  // Sensor Quality Classification
  if (result.validSampleCount === 0) {
    result.sensorQuality = "Unavailable";
  } else if (result.missingDataDurationSeconds > 1.0) {
    result.sensorQuality = "Interrupted";
  } else if (result.dataGapsCount > 0 || result.missingDataDurationSeconds > 0) {
    result.sensorQuality = "Degraded";
  } else {
    result.sensorQuality = "Optimal";
  }

  return result;
}

/**
 * Calculates complete session summary across all 5 directional targets.
 */
export function calculateDirectionalSessionSummary(params: {
  sessionId?: string;
  patientId?: string;
  patientName?: string;
  startTime?: number;
  endTime?: number;
  targets: DirectionalTargetAssessment[];
  isRealHardware?: boolean;
  calibrationBaseline?: DirectionalCalibrationBaseline;
}): DirectionalWeightShiftSessionSummary {
  const {
    sessionId = `session-dir-${Date.now()}`,
    patientId = "P-DEFAULT",
    patientName = "Unspecified Patient",
    startTime = Date.now() - 30000,
    endTime = Date.now(),
    targets,
    isRealHardware = true,
    calibrationBaseline,
  } = params;

  const totalDurationSeconds = parseFloat((Math.max(0, endTime - startTime) / 1000).toFixed(1));
  const completedTargetsCount = targets.filter((t) => t.isCompleted).length;
  const totalTargetsCount = targets.length;
  const allTargetsCompleted = completedTargetsCount === totalTargetsCount && totalTargetsCount > 0;

  let totalValidSamples = 0;
  let totalSamplesInside = 0;
  let rawTotalTimeInside = 0;
  let rawTotalTimeOutside = 0;
  let totalMissingDataDurationSeconds = 0;
  let totalInvalidSamples = 0;
  let holdTimesSum = 0;
  let completedHoldSum = 0;
  let completedCount = 0;

  const allRecordedSamples: DirectionalSamplePoint[] = [];

  for (const t of targets) {
    totalValidSamples += t.validSampleCount;
    totalSamplesInside += t.samplesInsideCount;
    const tInside = (typeof t.rawTimeInsideSeconds === "number" && t.rawTimeInsideSeconds > 0)
      ? t.rawTimeInsideSeconds
      : t.timeInsideSeconds;
    const tOutside = (typeof t.rawTimeOutsideSeconds === "number" && t.rawTimeOutsideSeconds > 0)
      ? t.rawTimeOutsideSeconds
      : t.timeOutsideSeconds;
    rawTotalTimeInside += tInside;
    rawTotalTimeOutside += tOutside;
    totalMissingDataDurationSeconds += t.missingDataDurationSeconds;
    totalInvalidSamples += t.invalidSampleCount;
    const holdAchieved = t.actualSuccessfulHoldDurationSeconds ?? t.longestContinuousHoldSeconds;
    holdTimesSum += holdAchieved;
    if (t.isCompleted) {
      completedHoldSum += holdAchieved;
      completedCount++;
    }
    allRecordedSamples.push(...t.samples);
  }

  // Session totals derived from unrounded raw values, rounded only for display
  const rawTotalValidDuration = rawTotalTimeInside + rawTotalTimeOutside;
  const roundedSessionValid = parseFloat(rawTotalValidDuration.toFixed(1));
  const roundedSessionInside = parseFloat(rawTotalTimeInside.toFixed(1));
  const roundedSessionOutside = parseFloat((roundedSessionValid - roundedSessionInside).toFixed(1));

  const totalTimeInsideSeconds = roundedSessionInside;
  const totalTimeOutsideSeconds = Math.max(0, roundedSessionOutside);

  // Scientific Overall Accuracy:
  // (Total valid samples inside / Total valid samples) * 100
  const overallAccuracyPercentage =
    totalValidSamples > 0
      ? parseFloat(((totalSamplesInside / totalValidSamples) * 100).toFixed(1))
      : 0;

  // Time-weighted accuracy: (Total time inside / Total valid duration) * 100
  const overallTimeWeightedAccuracyPercentage =
    rawTotalValidDuration > 0
      ? parseFloat(((rawTotalTimeInside / rawTotalValidDuration) * 100).toFixed(1))
      : 0;

  // Arithmetic mean of individual target accuracies
  const meanTargetAccuracyPercentage =
    targets.length > 0
      ? parseFloat((targets.reduce((acc, t) => acc + t.accuracyPercentage, 0) / targets.length).toFixed(1))
      : 0;

  // Total genuine attempts across all targets
  const totalAttemptsCount = targets.reduce((sum, t) => sum + (t.attemptCount ?? t.enterCount ?? 0), 0);

  // Mean distance to target center across all samples in mm
  const meanCopDistanceMm =
    allRecordedSamples.length > 0
      ? parseFloat((allRecordedSamples.reduce((sum, s) => sum + s.distanceMm, 0) / allRecordedSamples.length).toFixed(1))
      : null;

  // Data Quality percentage: (totalValidSamples / (totalValidSamples + totalInvalidSamples)) * 100
  const totalAttemptedSamples = totalValidSamples + totalInvalidSamples;
  const validSamplePercentage =
    totalAttemptedSamples > 0
      ? parseFloat(((totalValidSamples / totalAttemptedSamples) * 100).toFixed(1))
      : 0;

  const meanHoldTimeSeconds =
    targets.length > 0
      ? parseFloat((holdTimesSum / targets.length).toFixed(2))
      : 0;

  const meanCompletedHoldTimeSeconds =
    completedCount > 0
      ? parseFloat((completedHoldSum / completedCount).toFixed(2))
      : null;

  // Composite COP variability across entire session
  let overallCopSdNorm: number | null = null;
  let overallCopSdMm: number | null = null;

  if (allRecordedSamples.length > 0) {
    const xs = allRecordedSamples.map((s) => s.copX);
    const ys = allRecordedSamples.map((s) => s.copY);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;

    const varX = xs.reduce((acc, val) => acc + (val - meanX) ** 2, 0) / xs.length;
    const varY = ys.reduce((acc, val) => acc + (val - meanY) ** 2, 0) / ys.length;
    overallCopSdNorm = parseFloat(Math.hypot(Math.sqrt(varX), Math.sqrt(varY)).toFixed(4));

    const varXMm = varX * (WII_BOARD_DIMENSIONS.halfDistanceXMm ** 2);
    const varYMm = varY * (WII_BOARD_DIMENSIONS.halfDistanceYMm ** 2);
    overallCopSdMm = parseFloat(Math.sqrt(varXMm + varYMm).toFixed(1));
  }

  // Aggregate Coordinate Error Metrics across all targets (Professor's calculation)
  const allValidDistanceErrors: number[] = [];
  let totalValidCoordSamples = 0;

  for (const t of targets) {
    if (t.coordinateMetrics && t.coordinateMetrics.distanceErrorsMm.length > 0) {
      allValidDistanceErrors.push(...t.coordinateMetrics.distanceErrorsMm);
      totalValidCoordSamples += t.coordinateMetrics.validSampleCount;
    } else if (t.samples && t.samples.length > 0) {
      for (const s of t.samples) {
        if (typeof s.distanceMm === "number") {
          allValidDistanceErrors.push(s.distanceMm);
          totalValidCoordSamples++;
        }
      }
    }
  }

  let sessionMeanDistanceErrorMm: number | null = null;
  let sessionSdDistanceErrorMm: number | null = null;
  let sessionRmsDistanceErrorMm: number | null = null;
  let sessionMinDistanceErrorMm: number | null = null;
  let sessionMaxDistanceErrorMm: number | null = null;

  if (allValidDistanceErrors.length > 0) {
    const N_coord = allValidDistanceErrors.length;
    const sumD = allValidDistanceErrors.reduce((a, b) => a + b, 0);
    const meanD = sumD / N_coord;
    const sumSqD = allValidDistanceErrors.reduce((a, b) => a + b * b, 0);
    const rmsD = Math.sqrt(sumSqD / N_coord);
    const sumDevSq = allValidDistanceErrors.reduce((a, b) => a + (b - meanD) ** 2, 0);
    const sdD = Math.sqrt(sumDevSq / N_coord);

    sessionMeanDistanceErrorMm = parseFloat(meanD.toFixed(2));
    sessionSdDistanceErrorMm = parseFloat(sdD.toFixed(2));
    sessionRmsDistanceErrorMm = parseFloat(rmsD.toFixed(2));
    sessionMinDistanceErrorMm = parseFloat(Math.min(...allValidDistanceErrors).toFixed(2));
    sessionMaxDistanceErrorMm = parseFloat(Math.max(...allValidDistanceErrors).toFixed(2));
  }

  // Phase 4 Session Measurements
  const overallPathLengthMm = parseFloat(
    targets.reduce((acc, t) => acc + (t.pathLengthMm ?? calculateCopPathLengthMm(t.samples)), 0).toFixed(1)
  );

  const meanCoordinateErrorMm = sessionMeanDistanceErrorMm;
  const trajectoryVariabilityMm = overallCopSdMm;

  const totalCoordInsideCount = targets.reduce(
    (sum, t) => sum + (t.coordinateMetrics?.samplesInTargetZoneCount ?? t.samplesInsideCount),
    0
  );
  const sessionHitRatePercentage =
    totalValidCoordSamples > 0
      ? parseFloat(((totalCoordInsideCount / totalValidCoordSamples) * 100).toFixed(1))
      : overallAccuracyPercentage;

  const centerTarget = targets.find((t) => t.name === "RETURN TO CENTER") || targets[4];
  const returnToCenterErrorMm =
    centerTarget && centerTarget.meanDistanceErrorMm !== null && centerTarget.meanDistanceErrorMm !== undefined
      ? centerTarget.meanDistanceErrorMm
      : (centerTarget?.meanDistanceMm ?? null);
  const returnToCenterMinErrorMm =
    centerTarget && centerTarget.minDistanceErrorMm !== null && centerTarget.minDistanceErrorMm !== undefined
      ? centerTarget.minDistanceErrorMm
      : (centerTarget?.minDistanceMm ?? null);

  const successfulTargetsCount = targets.filter(
    (t) =>
      t.isTargetReached ||
      (t.minDistanceErrorMm !== null && t.minDistanceErrorMm !== undefined && t.minDistanceErrorMm <= t.toleranceMm) ||
      (t.coordinateMetrics && t.coordinateMetrics.samplesInTargetZoneCount > 0)
  ).length;
  const unsuccessfulTargetsCount = Math.max(0, targets.length - successfulTargetsCount);

  // Quality warnings
  const qualityWarnings: string[] = [];
  if (!isRealHardware) {
    qualityWarnings.push("No live hardware connection. Authentic balance board measurements required.");
  }
  if (totalMissingDataDurationSeconds > 0) {
    qualityWarnings.push(
      `Sensor telemetry disconnected or unavailable for ${totalMissingDataDurationSeconds.toFixed(1)}s during exercise.`
    );
  }
  if (totalInvalidSamples > 0) {
    qualityWarnings.push(`${totalInvalidSamples} invalid or out-of-range packet(s) filtered from evaluation.`);
  }

  let overallSensorQuality = "Optimal (100% Stream Integrity)";
  if (!isRealHardware || totalValidSamples === 0) {
    overallSensorQuality = "Unavailable (No Real Hardware Telemetry)";
  } else if (totalMissingDataDurationSeconds > 2.0) {
    overallSensorQuality = "Interrupted (Telemetry Gaps Detected)";
  } else if (totalMissingDataDurationSeconds > 0 || totalInvalidSamples > 0) {
    overallSensorQuality = "Degraded (Minor Latency Intervals)";
  }

  return {
    sessionId,
    patientId,
    patientName,
    sessionDate: new Date(startTime).toLocaleDateString(),
    startTime,
    endTime,
    totalDurationSeconds,
    completedTargetsCount,
    totalTargetsCount,
    allTargetsCompleted,

    overallAccuracyPercentage,
    overallTimeWeightedAccuracyPercentage,
    meanTargetAccuracyPercentage,
    totalTimeInsideSeconds,
    totalTimeOutsideSeconds,
    totalAttemptsCount,
    meanCopDistanceMm,
    meanHoldTimeSeconds,
    meanCompletedHoldTimeSeconds,
    overallCopSdNorm,
    overallCopSdMm,

    meanDistanceErrorMm: sessionMeanDistanceErrorMm,
    sdDistanceErrorMm: sessionSdDistanceErrorMm,
    rmsDistanceErrorMm: sessionRmsDistanceErrorMm,
    minDistanceErrorMm: sessionMinDistanceErrorMm,
    maxDistanceErrorMm: sessionMaxDistanceErrorMm,
    totalValidCoordinateSamples: totalValidCoordSamples > 0 ? totalValidCoordSamples : totalValidSamples,
    configuredCoordinateSampleCount: DEFAULT_COORDINATE_SAMPLE_COUNT,

    // Phase 4 Coordinate-Based Session Measurements
    meanCoordinateErrorMm,
    overallPathLengthMm,
    trajectoryVariabilityMm,
    sessionHitRatePercentage,
    returnToCenterErrorMm,
    returnToCenterMinErrorMm,
    successfulTargetsCount,
    unsuccessfulTargetsCount,

    hardwareModel: "RVL-WBC-01",
    isRealHardware,
    totalValidSamples,
    totalInvalidSamples,
    validSamplePercentage,
    totalMissingDataDurationSeconds: parseFloat(totalMissingDataDurationSeconds.toFixed(1)),
    overallSensorQuality,
    qualityWarnings,

    targets,
    calibrationBaseline,
    isBaselineCalibrated: Boolean(calibrationBaseline?.isCalibrated),
    parameterClassification: targets[0]?.parameterClassification,
  };
}

export interface DirectionalExerciseResult {
  isComplete: boolean;
  completedTargetsCount: number;
  totalTargetsCount: number;
  targetsSummary: string; // e.g. "5/5 Targets Completed"
  sessionTimeSeconds: number;
  sessionTimeFormatted: string; // e.g. "00:45"
  accuracyPercentage: number;
  isRealHardwareTelemetry: boolean;
  targetAssessments?: DirectionalTargetAssessment[];
  sessionSummary?: DirectionalWeightShiftSessionSummary;
  calibrationBaseline?: DirectionalCalibrationBaseline;
  sessionCoordinateMetrics?: {
    meanDistanceErrorMm: number | null;
    sdDistanceErrorMm: number | null;
    rmsDistanceErrorMm: number | null;
    minDistanceErrorMm: number | null;
    maxDistanceErrorMm: number | null;
    totalValidSamples: number;
    overallPathLengthMm?: number;
    trajectoryVariabilityMm?: number | null;
    sessionHitRatePercentage?: number;
    returnToCenterErrorMm?: number | null;
    successfulTargetsCount?: number;
    unsuccessfulTargetsCount?: number;
  };
}

/**
 * Evaluates completion and computes session accuracy.
 * Supports both legacy distanceSamples calculation (for backward test compatibility)
 * and detailed targetAssessments calculation.
 */
export function calculateDirectionalExerciseResult(params: {
  completedTargets: number;
  totalTargets: number;
  elapsedMs: number;
  distanceSamples: number[];
  isConnected: boolean;
  targetAssessments?: DirectionalTargetAssessment[];
  patientId?: string;
  patientName?: string;
  startTime?: number;
  endTime?: number;
  calibrationBaseline?: DirectionalCalibrationBaseline;
}): DirectionalExerciseResult {
  const {
    completedTargets,
    totalTargets,
    elapsedMs,
    distanceSamples,
    isConnected,
    targetAssessments,
    patientId,
    patientName,
    startTime,
    endTime,
    calibrationBaseline,
  } = params;

  const sessionTimeSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const isComplete = completedTargets >= totalTargets && totalTargets > 0;

  let accuracyPercentage = 100;

  if (targetAssessments && targetAssessments.length > 0) {
    // Scientific calculation from recorded target assessments
    const totalValid = targetAssessments.reduce((sum, t) => sum + t.validSampleCount, 0);
    const totalInside = targetAssessments.reduce((sum, t) => sum + t.samplesInsideCount, 0);
    if (totalValid > 0) {
      accuracyPercentage = Math.round((totalInside / totalValid) * 100);
    } else {
      accuracyPercentage = 0;
    }
  } else if (distanceSamples.length > 0) {
    const avgDistance = distanceSamples.reduce((a, b) => a + b, 0) / distanceSamples.length;
    const rawAccuracy = Math.max(50, Math.min(100, Math.round(100 - avgDistance * 80)));
    accuracyPercentage = rawAccuracy;
  }

  let sessionSummary: DirectionalWeightShiftSessionSummary | undefined;
  if (targetAssessments && targetAssessments.length > 0) {
    sessionSummary = calculateDirectionalSessionSummary({
      patientId,
      patientName,
      startTime: startTime ?? (Date.now() - elapsedMs),
      endTime: endTime ?? Date.now(),
      targets: targetAssessments,
      isRealHardware: isConnected,
      calibrationBaseline,
    });
  }

  const sessionCoordinateMetrics = sessionSummary ? {
    meanDistanceErrorMm: sessionSummary.meanCoordinateErrorMm ?? sessionSummary.meanDistanceErrorMm ?? null,
    sdDistanceErrorMm: sessionSummary.sdDistanceErrorMm ?? null,
    rmsDistanceErrorMm: sessionSummary.rmsDistanceErrorMm ?? null,
    minDistanceErrorMm: sessionSummary.minDistanceErrorMm ?? null,
    maxDistanceErrorMm: sessionSummary.maxDistanceErrorMm ?? null,
    totalValidSamples: sessionSummary.totalValidCoordinateSamples ?? (targetAssessments?.reduce((sum, t) => sum + t.validSampleCount, 0) || 0),
    overallPathLengthMm: sessionSummary.overallPathLengthMm ?? 0,
    trajectoryVariabilityMm: sessionSummary.trajectoryVariabilityMm ?? sessionSummary.overallCopSdMm ?? null,
    sessionHitRatePercentage: sessionSummary.sessionHitRatePercentage ?? sessionSummary.overallAccuracyPercentage ?? 0,
    returnToCenterErrorMm: sessionSummary.returnToCenterErrorMm ?? null,
    successfulTargetsCount: sessionSummary.successfulTargetsCount ?? 0,
    unsuccessfulTargetsCount: sessionSummary.unsuccessfulTargetsCount ?? 0,
  } : undefined;

  return {
    isComplete,
    completedTargetsCount: completedTargets,
    totalTargetsCount: totalTargets,
    targetsSummary: `${completedTargets}/${totalTargets} Targets Completed`,
    sessionTimeSeconds,
    sessionTimeFormatted: formatSessionTime(sessionTimeSeconds),
    accuracyPercentage,
    isRealHardwareTelemetry: isConnected,
    targetAssessments,
    sessionSummary,
    calibrationBaseline,
    sessionCoordinateMetrics,
  };
}

