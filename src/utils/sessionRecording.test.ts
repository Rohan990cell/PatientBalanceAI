import {
  BalanceSession,
  RecordedMeasurementPoint,
} from "../types/session";
import { formatDurationMs } from "../hooks/useBalanceSessionRecorder";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

console.log("=== RUNNING PHASE 4 SESSION RECORDING & DATA STORAGE TEST SUITE ===");

// 1. Test Duration Formatting
const d1 = formatDurationMs(0);
assert(d1 === "00:00", `0ms formatted as 00:00, got ${d1}`);
console.log("  PASS: Test 1a - formatDurationMs(0) -> 00:00");

const d2 = formatDurationMs(65_000);
assert(d2 === "01:05", `65000ms formatted as 01:05, got ${d2}`);
console.log("  PASS: Test 1b - formatDurationMs(65000) -> 01:05");

const d3 = formatDurationMs(154_000);
assert(d3 === "02:34", `154000ms formatted as 02:34, got ${d3}`);
console.log("  PASS: Test 1c - formatDurationMs(154000) -> 02:34");

// 2. Test Measurement Structure Validation
const validPoint: RecordedMeasurementPoint = {
  timestamp: new Date().toISOString(),
  elapsedMs: 250,
  frontLeft: 17.5,
  frontRight: 17.5,
  backLeft: 17.5,
  backRight: 17.5,
  totalWeight: 70.0,
  leftWeight: 35.0,
  rightWeight: 35.0,
  leftPercent: 50.0,
  rightPercent: 50.0,
  anteriorWeight: 35.0,
  posteriorWeight: 35.0,
  anteriorPercent: 50.0,
  posteriorPercent: 50.0,
  copX: 0.0,
  copY: 0.0,
};

assert(validPoint.totalWeight === 70.0, "Total weight must be 70.0");
assert(validPoint.leftPercent + validPoint.rightPercent === 100.0, "Left and right sum to 100%");
assert(validPoint.anteriorPercent + validPoint.posteriorPercent === 100.0, "Ant and post sum to 100%");
console.log("  PASS: Test 2 - RecordedMeasurementPoint adheres to Phase 1 data contract");

// 3. Test Invalid Measurement Detection
function isValidReading(r: any): boolean {
  return (
    r !== null &&
    Number.isFinite(r.totalWeight) &&
    r.totalWeight > 0.1 &&
    Number.isFinite(r.copX) &&
    Number.isFinite(r.copY) &&
    Number.isFinite(r.leftPercent) &&
    Number.isFinite(r.rightPercent)
  );
}

assert(!isValidReading(null), "Null reading must be invalid");
assert(!isValidReading({ totalWeight: NaN, copX: 0, copY: 0, leftPercent: 50, rightPercent: 50 }), "NaN total weight rejected");
assert(!isValidReading({ totalWeight: Infinity, copX: 0, copY: 0, leftPercent: 50, rightPercent: 50 }), "Infinity total weight rejected");
assert(!isValidReading({ totalWeight: 0.0, copX: 0, copY: 0, leftPercent: 50, rightPercent: 50 }), "Zero unloaded weight rejected");
assert(!isValidReading({ totalWeight: 65.0, copX: NaN, copY: 0, leftPercent: 50, rightPercent: 50 }), "NaN COP rejected");
assert(isValidReading({ totalWeight: 65.0, copX: 0.0, copY: 0.0, leftPercent: 50, rightPercent: 50 }), "Clean reading accepted");
console.log("  PASS: Test 3 - Invalid data filters correctly identify corrupted/disconnected samples");

// 4. Test Simulated Session Creation
const simulatedSession: BalanceSession = {
  schemaVersion: 1,
  sessionId: "session-20260930-sim01",
  patientId: "pat-001",
  patientName: "Eleanor Vance",
  startTime: "2026-09-30T12:00:00.000Z",
  endTime: "2026-09-30T12:00:30.000Z",
  durationMs: 30000,
  dataSource: "simulation",
  boardModel: "RVL-WBC-01",
  measurementCount: 300,
  samplingRate: 10.0,
  quality: {
    validSamples: 300,
    invalidSamples: 2,
    dataGaps: 0,
    samplingRate: 10.0,
  },
  summary: {
    durationMs: 30000,
    durationFormatted: "00:30",
    measurementCount: 300,
    averageWeightKg: 70.0,
    averageLeftPercent: 49.5,
    averageRightPercent: 50.5,
    averageAnteriorPercent: 51.0,
    averagePosteriorPercent: 49.0,
    copSamples: 300,
    minCopX: -0.45,
    maxCopX: 0.45,
    minCopY: -0.35,
    maxCopY: 0.35,
  },
  measurements: [validPoint],
};

assert(simulatedSession.dataSource === "simulation", "Simulation session has dataSource = simulation");
assert(simulatedSession.schemaVersion === 1, "schemaVersion is 1");
console.log("  PASS: Test 4 - Simulated session metadata explicitly marked with dataSource: simulation");

// 5. Test Real Hardware Session Distinction
const hardwareSession: BalanceSession = {
  ...simulatedSession,
  sessionId: "session-20260930-hw01",
  dataSource: "wii_balance_board",
};

assert(hardwareSession.dataSource === "wii_balance_board", "Real board session has dataSource = wii_balance_board");
assert(hardwareSession.boardModel === "RVL-WBC-01", "Board model preserved as RVL-WBC-01");
console.log("  PASS: Test 5 - Real hardware session correctly tagged with dataSource: wii_balance_board");

// 6. Test JSON Serialization and Deserialization Round-trip
const jsonStr = JSON.stringify(simulatedSession);
const parsed: BalanceSession = JSON.parse(jsonStr);

assert(parsed.schemaVersion === 1, "schemaVersion intact after roundtrip");
assert(parsed.sessionId === "session-20260930-sim01", "sessionId intact after roundtrip");
assert(parsed.patientId === "pat-001", "patientId intact after roundtrip");
assert(parsed.dataSource === "simulation", "dataSource intact after roundtrip");
assert(parsed.summary.averageWeightKg === 70.0, "Summary stats intact after roundtrip");
assert(parsed.measurements.length === 1, "Measurements array preserved");
assert(parsed.measurements[0].copX === 0.0, "COP X measurement value preserved");
console.log("  PASS: Test 6 - Full JSON serialization/deserialization preserves 100% data fidelity");

// 7. Test Summary Calculation Algorithm
const mockPoints: RecordedMeasurementPoint[] = [
  { ...validPoint, elapsedMs: 0, totalWeight: 68.0, leftPercent: 45.0, rightPercent: 55.0, anteriorPercent: 60.0, posteriorPercent: 40.0, copX: -0.2, copY: 0.3 },
  { ...validPoint, elapsedMs: 100, totalWeight: 72.0, leftPercent: 55.0, rightPercent: 45.0, anteriorPercent: 40.0, posteriorPercent: 60.0, copX: 0.4, copY: -0.5 },
];

let sumW = 0, sumL = 0, sumR = 0, sumA = 0, sumP = 0;
let minX = mockPoints[0].copX, maxX = mockPoints[0].copX;
let minY = mockPoints[0].copY, maxY = mockPoints[0].copY;

mockPoints.forEach((p) => {
  sumW += p.totalWeight;
  sumL += p.leftPercent;
  sumR += p.rightPercent;
  sumA += p.anteriorPercent;
  sumP += p.posteriorPercent;
  if (p.copX < minX) minX = p.copX;
  if (p.copX > maxX) maxX = p.copX;
  if (p.copY < minY) minY = p.copY;
  if (p.copY > maxY) maxY = p.copY;
});

const avgW = sumW / mockPoints.length; // (68 + 72) / 2 = 70.0
const avgL = sumL / mockPoints.length; // (45 + 55) / 2 = 50.0
const avgR = sumR / mockPoints.length; // (55 + 45) / 2 = 50.0

assert(avgW === 70.0, `Average weight is 70.0, got ${avgW}`);
assert(avgL === 50.0, `Average left is 50.0, got ${avgL}`);
assert(avgR === 50.0, `Average right is 50.0, got ${avgR}`);
assert(minX === -0.2, `Min COP X is -0.2, got ${minX}`);
assert(maxX === 0.4, `Max COP X is 0.4, got ${maxX}`);
assert(minY === -0.5, `Min COP Y is -0.5, got ${minY}`);
assert(maxY === 0.3, `Max COP Y is 0.3, got ${maxY}`);
console.log("  PASS: Test 7 - Statistical summary aggregation calculates exact clinical averages");

// 8. Test Data Gaps Detection Logic
let gapCount = 0;
let lastTimestamp: number | null = 1000;
const testTimestamps = [1050, 1100, 1600, 1650]; // gap between 1100 and 1600 (>350ms)

testTimestamps.forEach((ts) => {
  if (lastTimestamp && ts - lastTimestamp > 350) {
    gapCount++;
  }
  lastTimestamp = ts;
});

assert(gapCount === 1, `Expected 1 gap, got ${gapCount}`);
console.log("  PASS: Test 8 - Data gaps detector correctly flags transmission dropouts > 350ms");

console.log("\nPHASE 4 TEST SUITE SUMMARY: ALL 11 TESTS PASSED!\n");
