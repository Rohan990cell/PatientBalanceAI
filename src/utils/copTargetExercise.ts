/**
 * Center of Pressure (COP) Target Exercise Engine & Mathematics
 *
 * PHASE A — WEDNESDAY DEMO EXERCISE 1:
 * Interactive rehabilitation exercise using solely the Wii Balance Board.
 * Camera / MediaPipe is NOT required for this exercise.
 *
 * SCIENTIFIC COORDINATE CONVENTION:
 * - COP X: negative = LEFT (-X), positive = RIGHT (+X)
 * - COP Y: negative = BACK / POSTERIOR (-Y), positive = FRONT / ANTERIOR (+Y)
 *
 * EXERCISE SAFETY:
 * Targets are strictly constrained within conservative boundaries well inside
 * the physical board perimeter to prevent extreme leaning or loss of balance.
 *
 * SCIENTIFIC DATA INTEGRITY:
 * Real hardware telemetry takes absolute priority over development simulation.
 * When sensor telemetry is unavailable, values strictly display as "--" (never fake zero).
 * No fake clinical balance scores are generated from simulation.
 */

export type CopTargetName = "CENTER" | "LEFT" | "RIGHT" | "FRONT" | "BACK";

export interface CopTarget {
  id: string;
  name: CopTargetName;
  label: string;
  instruction: string;
  x: number; // normalized coordinate [-1.0, 1.0] within SAFE_BOARD_BOUNDS
  y: number; // normalized coordinate [-1.0, 1.0] within SAFE_BOARD_BOUNDS
  tolerance: number; // normalized radial tolerance zone (e.g. 0.15)
}

/**
 * Conservative target boundaries for patient safety.
 * Physical board coordinates span [-1.0, +1.0], but rehabilitation targets
 * must remain well within stability limits to prevent falls or extreme leaning.
 */
export const SAFE_BOARD_BOUNDS = {
  minX: -0.60,
  maxX: 0.60,
  minY: -0.50,
  maxY: 0.50,
} as const;

/**
 * Default standard 5-target sequence for Weight Shift — COP Target exercise.
 * Sequences through CENTER -> LEFT -> RIGHT -> FRONT -> BACK.
 */
export const DEFAULT_COP_TARGETS: CopTarget[] = [
  {
    id: "target-1-center",
    name: "CENTER",
    label: "Center Equilibrium",
    instruction: "Settle your center of pressure in the middle of the board.",
    x: 0.0,
    y: 0.0,
    tolerance: 0.15,
  },
  {
    id: "target-2-left",
    name: "LEFT",
    label: "Left Shift",
    instruction: "Gently shift weight toward your left foot to reach the left target.",
    x: -0.40,
    y: 0.0,
    tolerance: 0.15,
  },
  {
    id: "target-3-right",
    name: "RIGHT",
    label: "Right Shift",
    instruction: "Smoothly transfer weight across to your right foot to reach the right target.",
    x: 0.40,
    y: 0.0,
    tolerance: 0.15,
  },
  {
    id: "target-4-front",
    name: "FRONT",
    label: "Forward Shift",
    instruction: "Shift weight gently forward toward the balls of your feet.",
    x: 0.0,
    y: 0.35,
    tolerance: 0.15,
  },
  {
    id: "target-5-back",
    name: "BACK",
    label: "Posterior Shift",
    instruction: "Shift weight smoothly back toward your heels.",
    x: 0.0,
    y: -0.35,
    tolerance: 0.15,
  },
];

/**
 * Generates and validates the target list, ensuring every target satisfies
 * conservative safe boundaries.
 */
export function generateSafeTargets(): CopTarget[] {
  for (const t of DEFAULT_COP_TARGETS) {
    if (
      t.x < SAFE_BOARD_BOUNDS.minX ||
      t.x > SAFE_BOARD_BOUNDS.maxX ||
      t.y < SAFE_BOARD_BOUNDS.minY ||
      t.y > SAFE_BOARD_BOUNDS.maxY
    ) {
      throw new Error(
        `Target ${t.id} (${t.name}) at (${t.x}, ${t.y}) exceeds safe board boundaries!`
      );
    }
  }
  return [...DEFAULT_COP_TARGETS];
}

/**
 * Calculates Euclidean distance between current COP and target in normalized coordinates.
 * Returns null if current COP is unavailable.
 */
export function calculateCopDistance(
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
 * Evaluates whether current COP is within target's radial tolerance zone.
 */
export function isCopTargetReached(
  copX: number | null | undefined,
  copY: number | null | undefined,
  target: CopTarget
): boolean {
  const dist = calculateCopDistance(copX, copY, target.x, target.y);
  if (dist === null) return false;
  return dist <= target.tolerance;
}

export interface DirectionGuidance {
  primaryInstruction: string;
  dx: number;
  dy: number;
  distance: number | null;
  isInTolerance: boolean;
}

/**
 * Computes clinical directional guidance to instruct the patient which way to shift weight.
 */
export function getDirectionGuidance(
  copX: number | null | undefined,
  copY: number | null | undefined,
  target: CopTarget
): DirectionGuidance {
  const distance = calculateCopDistance(copX, copY, target.x, target.y);

  if (distance === null || copX === null || copY === null || copX === undefined || copY === undefined) {
    return {
      primaryInstruction: "Step on the board to begin weight shifting",
      dx: 0,
      dy: 0,
      distance: null,
      isInTolerance: false,
    };
  }

  const dx = target.x - copX;
  const dy = target.y - copY;
  const isInTolerance = distance <= target.tolerance;

  if (isInTolerance) {
    return {
      primaryInstruction: "Target Reached! Hold steady",
      dx,
      dy,
      distance,
      isInTolerance: true,
    };
  }

  // Determine dominant shift direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let directionText = "";
  if (absDx > 0.08 && absDy > 0.08) {
    const horiz = dx > 0 ? "Right (+X)" : "Left (-X)";
    const vert = dy > 0 ? "Forward (+Y)" : "Backward (-Y)";
    directionText = `Shift ${vert} and ${horiz}`;
  } else if (absDx >= absDy) {
    directionText = dx > 0 ? "Shift Right (+X)" : "Shift Left (-X)";
  } else {
    directionText = dy > 0 ? "Shift Forward (+Y)" : "Shift Backward (-Y)";
  }

  return {
    primaryInstruction: directionText,
    dx,
    dy,
    distance,
    isInTolerance: false,
  };
}

/**
 * Returns formatted directional label for current COP position.
 * Returns "--" if COP is null/unavailable.
 */
export function getCurrentCopDirectionText(
  copX: number | null | undefined,
  copY: number | null | undefined
): string {
  if (copX === null || copY === null || copX === undefined || copY === undefined) {
    return "--";
  }
  const threshold = 0.08;
  const isCenteredX = Math.abs(copX) < threshold;
  const isCenteredY = Math.abs(copY) < threshold;

  if (isCenteredX && isCenteredY) {
    return "CENTER";
  }

  const parts: string[] = [];
  if (copY > threshold) parts.push("FRONT (+Y)");
  else if (copY < -threshold) parts.push("BACK (-Y)");

  if (copX > threshold) parts.push("RIGHT (+X)");
  else if (copX < -threshold) parts.push("LEFT (-X)");

  return parts.join(" & ") || "CENTER";
}

export type CopDataSourceMode = "LIVE_WII" | "SIMULATION" | "UNAVAILABLE";

export interface DataSourceStatus {
  mode: CopDataSourceMode;
  badgeLabel: string;
  isSimulated: boolean;
  isConnected: boolean;
  canProceed: boolean;
}

/**
 * Determines exact data source adhering to strict hardware precedence:
 * Real hardware ALWAYS takes precedence over simulation.
 */
export function evaluateDataSourceStatus(
  isConnected: boolean,
  isSimulated: boolean
): DataSourceStatus {
  if (isConnected) {
    return {
      mode: "LIVE_WII",
      badgeLabel: "Data Source: LIVE WII BALANCE BOARD",
      isSimulated: false,
      isConnected: true,
      canProceed: true,
    };
  }

  if (isSimulated) {
    return {
      mode: "SIMULATION",
      badgeLabel: "DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA",
      isSimulated: true,
      isConnected: false,
      canProceed: true,
    };
  }

  return {
    mode: "UNAVAILABLE",
    badgeLabel: "--",
    isSimulated: false,
    isConnected: false,
    canProceed: false,
  };
}

/**
 * Strictly prevents generating clinical balance scores from simulation data.
 */
export function shouldGenerateClinicalScore(isSimulated: boolean, isConnected: boolean): boolean {
  if (isConnected) return true;
  if (isSimulated) return false;
  return false;
}

export interface CopExerciseSessionSample {
  timestamp: number;
  copX: number | null;
  copY: number | null;
  targetX: number;
  targetY: number;
  targetReached: boolean;
  dataSource: "wii_balance_board" | "simulation" | "unavailable";
}

export interface CopExerciseResult {
  targetsCompleted: number;
  totalTargets: number;
  completionPercentage: number;
  durationSeconds: number;
  averageDistanceFromTarget: number | null;
  successfulTargetCount: number;
  dataSourceMode: CopDataSourceMode;
  isSimulated: boolean;
  clinicalScore: number | null; // Strictly null if simulated
  validationNotice: string;
  samplesCount: number;
}

/**
 * Calculates final completion statistics for the exercise session.
 */
export function calculateCopExerciseResult(params: {
  completedTargets: number;
  totalTargets: number;
  durationMs: number;
  distanceSamples: number[];
  dataSourceMode: CopDataSourceMode;
  samplesCount: number;
}): CopExerciseResult {
  const { completedTargets, totalTargets, durationMs, distanceSamples, dataSourceMode, samplesCount } = params;

  const durationSeconds = Math.max(0, Math.round((durationMs / 1000) * 10) / 10);
  const completionPercentage = totalTargets > 0 ? Math.round((completedTargets / totalTargets) * 100) : 0;

  const averageDistanceFromTarget =
    distanceSamples.length > 0
      ? Math.round((distanceSamples.reduce((a, b) => a + b, 0) / distanceSamples.length) * 1000) / 1000
      : null;

  const isSimulated = dataSourceMode === "SIMULATION";

  return {
    targetsCompleted: completedTargets,
    totalTargets,
    completionPercentage,
    durationSeconds,
    averageDistanceFromTarget,
    successfulTargetCount: completedTargets,
    dataSourceMode,
    isSimulated,
    clinicalScore: null, // STRICT RULE: No fake clinical score from simulation; validation pending
    validationNotice: "Development exercise — clinical validation pending.",
    samplesCount,
  };
}
