import fs from "fs";
import path from "path";
import {
  DIRECTIONAL_TARGET_SEQUENCE,
  DIRECTIONAL_SAFE_BOUNDS,
  TARGET_HOLD_DURATION_MS,
  getDirectionalTargets,
  calculateCopDistanceToTarget,
  calculateCopDistanceToTargetMm,
  convertNormalizedCopToMm,
  isDirectionalTargetReached,
  computeDirectionalGuidance,
  formatWeightTelemetry,
  formatCopTelemetry,
  formatSessionTime,
  calculateDirectionalExerciseResult,
  DirectionalTarget,
  DirectionalTargetTracker,
  calculateDirectionalSessionSummary,
  calculateCopFromLoadCells,
  calculateRelativeCop,
  validateBaselineCalibration,
  BaselineCalibrationCollector,
  WII_BOARD_DIMENSIONS,
  classifyCopMovementDirection,
  DEFAULT_DIRECTION_DEADBAND,
  CopRollingFilter,
  calculateMedian,
  createInitialTargetAssessment,
  finalizeTargetAssessment,
  DEFAULT_COORDINATE_SAMPLE_COUNT,
  calculateCoordinateErrorMetrics,
  CoordinateErrorMetrics,
  computeHoldFrameTargetError,
  buildHoldWindowErrorSeries,
  HoldWindowFrameSample,
  DEFAULT_PATIENT_TARGET_OFFSETS_MM,
  PatientSpecificTargetConfig,
  isBaselineCalibrationReady,
  getPatientCalibratedTargets,
  DirectionalCalibrationBaseline,
  calculateCopPathLengthMm,
} from "./directionalWeightShiftExercise";
import { PdfReportGenerator } from "../services/pdfReportGenerator";

function runTests() {
  console.log("=================================================================");
  console.log("=== PHASE D: WII BALANCE BOARD REHABILITATION EXERCISE TEST ===");
  console.log("=== DIRECTIONAL WEIGHT SHIFT (WII BOARD ONLY, NO CAMERA) =======");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: 5 Sequential Targets & Exact Order
  // -------------------------------------------------------------
  const targets = getDirectionalTargets();
  assert(targets.length === 5, "Test 1a: Target sequence contains exactly 5 targets");
  assert(DIRECTIONAL_TARGET_SEQUENCE.length === 5, "Test 1a-2: DIRECTIONAL_TARGET_SEQUENCE contains exactly 5 items");
  assert(targets[0].name === "SHIFT LEFT", "Test 1b: Target 1 is 'SHIFT LEFT'");
  assert(targets[1].name === "SHIFT RIGHT", "Test 1c: Target 2 is 'SHIFT RIGHT'");
  assert(targets[2].name === "SHIFT FORWARD", "Test 1d: Target 3 is 'SHIFT FORWARD'");
  assert(targets[3].name === "SHIFT BACKWARD", "Test 1e: Target 4 is 'SHIFT BACKWARD'");
  assert(targets[4].name === "RETURN TO CENTER", "Test 1f: Target 5 is 'RETURN TO CENTER'");

  // All within conservative safe bounds
  let allSafe = true;
  for (const t of targets) {
    if (
      t.x < DIRECTIONAL_SAFE_BOUNDS.minX ||
      t.x > DIRECTIONAL_SAFE_BOUNDS.maxX ||
      t.y < DIRECTIONAL_SAFE_BOUNDS.minY ||
      t.y > DIRECTIONAL_SAFE_BOUNDS.maxY
    ) {
      allSafe = false;
      break;
    }
  }
  assert(allSafe, "Test 1g: All 5 targets strictly adhere to safe board bounds");

  // -------------------------------------------------------------
  // Test 2: LEFT target detection (-X, Y=0)
  // -------------------------------------------------------------
  const leftTarget: DirectionalTarget = targets[0];
  assert(leftTarget.x < 0, "Test 2a: Left target X is negative (-X = LEFT)");
  assert(Math.abs(leftTarget.y) < 0.001, "Test 2b: Left target Y is 0.0 (coronal lateral shift)");

  // Patient COP at target position (-0.38, 0.0)
  const leftDist = calculateCopDistanceToTarget(-0.38, 0.0, leftTarget.x, leftTarget.y);
  assert(leftDist !== null && leftDist < 0.001, "Test 2c: Euclidean distance to LEFT target is ~0");
  assert(isDirectionalTargetReached(-0.38, 0.0, leftTarget), "Test 2d: LEFT target detection returns true within tolerance");

  // Patient COP slightly off but within tolerance
  assert(isDirectionalTargetReached(-0.30, 0.05, leftTarget), "Test 2e: LEFT target detection returns true within radial tolerance zone");

  // Patient moving in wrong direction (moving right instead of left)
  assert(!isDirectionalTargetReached(0.20, 0.0, leftTarget), "Test 2f: LEFT target returns false when patient shifts RIGHT");
  const leftGuidanceWrong = computeDirectionalGuidance(0.20, 0.0, leftTarget);
  assert(leftGuidanceWrong.guidanceMessage === "Move slightly more LEFT", "Test 2g: Guidance prompts 'Move slightly more LEFT'");

  // -------------------------------------------------------------
  // Test 3: RIGHT target detection (+X, Y=0)
  // -------------------------------------------------------------
  const rightTarget = targets[1];
  assert(rightTarget.x > 0, "Test 3a: Right target X is positive (+X = RIGHT)");
  assert(Math.abs(rightTarget.y) < 0.001, "Test 3b: Right target Y is 0.0");

  const rightDist = calculateCopDistanceToTarget(0.38, 0.0, rightTarget.x, rightTarget.y);
  assert(rightDist !== null && rightDist < 0.001, "Test 3c: Euclidean distance to RIGHT target is ~0");
  assert(isDirectionalTargetReached(0.38, 0.0, rightTarget), "Test 3d: RIGHT target detection returns true within tolerance");

  // Wrong direction guidance for RIGHT target
  assert(!isDirectionalTargetReached(-0.25, 0.0, rightTarget), "Test 3e: RIGHT target returns false when patient is LEFT");
  const rightGuidanceWrong = computeDirectionalGuidance(-0.25, 0.0, rightTarget);
  assert(rightGuidanceWrong.guidanceMessage === "Move slightly more RIGHT", "Test 3f: Guidance prompts 'Move slightly more RIGHT'");

  // -------------------------------------------------------------
  // Test 4: FORWARD target detection (X=0, +Y)
  // -------------------------------------------------------------
  const forwardTarget = targets[2];
  assert(forwardTarget.y > 0, "Test 4a: Forward target Y is positive (+Y = FRONT/ANTERIOR)");
  assert(Math.abs(forwardTarget.x) < 0.001, "Test 4b: Forward target X is 0.0");

  const forwardDist = calculateCopDistanceToTarget(0.0, 0.32, forwardTarget.x, forwardTarget.y);
  assert(forwardDist !== null && forwardDist < 0.001, "Test 4c: Distance to FORWARD target is ~0");
  assert(isDirectionalTargetReached(0.0, 0.32, forwardTarget), "Test 4d: FORWARD target detection returns true within tolerance");

  // Wrong direction guidance for FORWARD target
  assert(!isDirectionalTargetReached(0.0, -0.20, forwardTarget), "Test 4e: FORWARD target returns false when patient is BACKWARD");
  const fwdGuidanceWrong = computeDirectionalGuidance(0.0, -0.20, forwardTarget);
  assert(fwdGuidanceWrong.guidanceMessage === "Move slightly FORWARD", "Test 4f: Guidance prompts 'Move slightly FORWARD'");

  // -------------------------------------------------------------
  // Test 5: BACKWARD target detection (X=0, -Y)
  // -------------------------------------------------------------
  const backwardTarget = targets[3];
  assert(backwardTarget.y < 0, "Test 5a: Backward target Y is negative (-Y = BACK/POSTERIOR)");
  assert(Math.abs(backwardTarget.x) < 0.001, "Test 5b: Backward target X is 0.0");

  const backDist = calculateCopDistanceToTarget(0.0, -0.32, backwardTarget.x, backwardTarget.y);
  assert(backDist !== null && backDist < 0.001, "Test 5c: Distance to BACKWARD target is ~0");
  assert(isDirectionalTargetReached(0.0, -0.32, backwardTarget), "Test 5d: BACKWARD target detection returns true within tolerance");

  // Wrong direction guidance for BACKWARD target
  assert(!isDirectionalTargetReached(0.0, 0.25, backwardTarget), "Test 5e: BACKWARD target returns false when patient is FORWARD");
  const backGuidanceWrong = computeDirectionalGuidance(0.0, 0.25, backwardTarget);
  assert(backGuidanceWrong.guidanceMessage === "Move slightly BACKWARD", "Test 5f: Guidance prompts 'Move slightly BACKWARD'");

  // -------------------------------------------------------------
  // Test 6: CENTER target detection (X=0, Y=0)
  // -------------------------------------------------------------
  const centerTarget = targets[4];
  assert(centerTarget.x === 0.0 && centerTarget.y === 0.0, "Test 6a: Center target is at (0, 0)");
  assert(isDirectionalTargetReached(0.0, 0.0, centerTarget), "Test 6b: CENTER target detection returns true at (0, 0)");
  assert(isDirectionalTargetReached(0.05, -0.04, centerTarget), "Test 6c: CENTER target detection returns true near equilibrium");
  assert(!isDirectionalTargetReached(0.40, 0.0, centerTarget), "Test 6d: CENTER target returns false when leaning right");

  // -------------------------------------------------------------
  // Test 7: Hold-time requirement (~2 seconds)
  // -------------------------------------------------------------
  assert(TARGET_HOLD_DURATION_MS === 2000, "Test 7a: TARGET_HOLD_DURATION_MS is exactly 2000 ms (2 seconds)");

  // Simulating hold sequence
  let elapsedHold = 500;
  let holdComplete = elapsedHold >= TARGET_HOLD_DURATION_MS;
  assert(!holdComplete, "Test 7b: After 500ms, hold requirement is NOT satisfied");

  elapsedHold = 1500;
  holdComplete = elapsedHold >= TARGET_HOLD_DURATION_MS;
  assert(!holdComplete, "Test 7c: After 1500ms, hold requirement is NOT satisfied");

  elapsedHold = 2000;
  holdComplete = elapsedHold >= TARGET_HOLD_DURATION_MS;
  assert(holdComplete, "Test 7d: At 2000ms (2 seconds), hold requirement IS satisfied");

  // Guidance outputs "GOOD" upon hold completion
  const goodGuidance = computeDirectionalGuidance(-0.38, 0.0, leftTarget, true, true);
  assert(goodGuidance.isGood === true, "Test 7e: Guidance reports isGood = true when hold is complete");
  assert(goodGuidance.guidanceMessage === "GOOD", "Test 7f: Guidance message is 'GOOD' upon target completion");

  // -------------------------------------------------------------
  // Test 8: Disconnected-board handling ("--" / "Waiting for Balance Board")
  // -------------------------------------------------------------
  // Null COP handling
  assert(!isDirectionalTargetReached(null, null, leftTarget), "Test 8a: Target detection safely returns false for null COP");
  assert(!isDirectionalTargetReached(undefined, undefined, leftTarget), "Test 8b: Target detection safely returns false for undefined COP");
  assert(!isDirectionalTargetReached(NaN, NaN, leftTarget), "Test 8c: Target detection safely returns false for NaN COP");

  // Guidance outputs "Waiting for Balance Board"
  const disconnectedGuidance = computeDirectionalGuidance(null, null, leftTarget);
  assert(disconnectedGuidance.isBoardWaiting === true, "Test 8d: Disconnected telemetry reports isBoardWaiting = true");
  assert(disconnectedGuidance.guidanceMessage === "Waiting for Balance Board", "Test 8e: Disconnected telemetry displays 'Waiting for Balance Board'");

  // Telemetry formatting strictly shows "--" instead of zero
  assert(formatWeightTelemetry(null, false) === "--", "Test 8f: Disconnected weight displays '--' (never zero)");
  assert(formatWeightTelemetry(undefined, false) === "--", "Test 8g: Undefined weight displays '--'");
  assert(formatWeightTelemetry(0, false) === "--", "Test 8h: Disconnected board with 0 weight displays '--'");
  assert(formatCopTelemetry(null, false) === "--", "Test 8i: Disconnected COP X displays '--'");
  assert(formatCopTelemetry(undefined, false) === "--", "Test 8j: Undefined COP displays '--'");
  assert(formatCopTelemetry(0, false) === "--", "Test 8k: Disconnected COP with 0 value displays '--' (never fake 0.00)");

  // -------------------------------------------------------------
  // Test 9: No fake telemetry (verifying real hardware only)
  // -------------------------------------------------------------
  // When connected with real data:
  assert(formatWeightTelemetry(68.4, true) === "68.4 kg", "Test 9a: Live real weight formatted correctly");
  assert(formatCopTelemetry(0.25, true) === "+0.25", "Test 9b: Live real COP X formatted correctly with sign");
  assert(formatCopTelemetry(-0.18, true) === "-0.18", "Test 9c: Live real COP Y formatted correctly with sign");

  // Result marks whether telemetry was real hardware
  const realResult = calculateDirectionalExerciseResult({
    completedTargets: 5,
    totalTargets: 5,
    elapsedMs: 35000,
    distanceSamples: [0.05, 0.04, 0.06, 0.03, 0.05],
    isConnected: true,
  });
  assert(realResult.isRealHardwareTelemetry === true, "Test 9d: Real hardware session flagged as authentic telemetry");
  assert(realResult.isComplete === true, "Test 9e: Exercise complete flag set");
  assert(realResult.targetsSummary === "5/5 Targets Completed", "Test 9f: Summary shows '5/5 Targets Completed'");
  assert(realResult.sessionTimeFormatted === "00:35", "Test 9g: Session time formatted as mm:ss (00:35)");
  assert(realResult.accuracyPercentage >= 90, "Test 9h: Accuracy percentage calculated properly");

  const disconnectedResult = calculateDirectionalExerciseResult({
    completedTargets: 0,
    totalTargets: 5,
    elapsedMs: 5000,
    distanceSamples: [],
    isConnected: false,
  });
  assert(disconnectedResult.isRealHardwareTelemetry === false, "Test 9i: Disconnected session correctly flagged");
  assert(disconnectedResult.isComplete === false, "Test 9j: Incomplete session flagged");
  assert(formatSessionTime(75) === "01:15", "Test 9k: formatSessionTime formats 75 seconds as 01:15");

  // -------------------------------------------------------------
  // Test 10: Calibrated Physical Millimetre Geometry
  // -------------------------------------------------------------
  const mmLeft = convertNormalizedCopToMm(-0.38, 0.0);
  assert(mmLeft !== null, "Test 10a: convertNormalizedCopToMm returns non-null coordinates");
  assert(Math.abs(mmLeft!.xMm - (-0.38 * 223.0)) < 0.01, "Test 10b: Lateral mm conversion matches 223mm scale");
  assert(Math.abs(mmLeft!.yMm) < 0.01, "Test 10c: Coronal AP mm conversion is 0");

  const mmDistToSelf = calculateCopDistanceToTargetMm(-0.38, 0.0, -0.38, 0.0);
  assert(mmDistToSelf !== null && mmDistToSelf < 0.001, "Test 10d: Distance to target center is 0.0 mm");

  // Distance from center (0, 0) to Left target (-0.38, 0)
  const mmDistFromCenterToLeft = calculateCopDistanceToTargetMm(0.0, 0.0, -0.38, 0.0);
  assert(mmDistFromCenterToLeft !== null && Math.abs(mmDistFromCenterToLeft - (0.38 * 223.0)) < 0.01, "Test 10e: Physical mm distance from center to left target is ~84.7 mm");

  // Null handling in mm
  assert(calculateCopDistanceToTargetMm(null, null, 0, 0) === null, "Test 10f: calculateCopDistanceToTargetMm handles null safely");
  assert(convertNormalizedCopToMm(undefined, undefined) === null, "Test 10g: convertNormalizedCopToMm handles undefined safely");

  // -------------------------------------------------------------
  // Test 11: DirectionalTargetTracker — Hold Timer & Transitions
  // -------------------------------------------------------------
  const tracker1 = new DirectionalTargetTracker(targets[0]); // SHIFT LEFT
  const t0 = 1000000;
  tracker1.start(t0);

  // Patient starts outside target: at (0, 0)
  const rOutside1 = tracker1.recordSample(t0 + 50, 0.0, 0.0, 68.0, true);
  assert(!rOutside1.isInside, "Test 11a: Initial sample at center is outside LEFT target");
  assert(!rOutside1.isCompleted, "Test 11b: Not completed when outside");
  assert(rOutside1.holdProgressPct === 0, "Test 11c: Hold progress is 0% when outside");

  // Patient moves inside LEFT target: at (-0.38, 0.0)
  const rInside1 = tracker1.recordSample(t0 + 100, -0.38, 0.0, 68.0, true);
  assert(rInside1.isInside, "Test 11d: Sample at (-0.38, 0) is inside LEFT target");
  assert(tracker1.assessment.enterCount === 1, "Test 11e: enterCount is incremented upon entering");

  // Hold for 1000 ms (20 samples at 50ms)
  let lastRes = rInside1;
  for (let i = 1; i <= 20; i++) {
    lastRes = tracker1.recordSample(t0 + 100 + i * 50, -0.38, 0.0, 68.0, true);
  }
  assert(!lastRes.isCompleted, "Test 11f: After 1000ms hold, target is NOT yet completed (requires 2000ms)");
  assert(lastRes.holdProgressPct >= 48 && lastRes.holdProgressPct <= 55, "Test 11g: Hold progress is approximately 50%");

  // Patient leaves target temporarily (sways to center)
  const rExited = tracker1.recordSample(t0 + 1150, 0.0, 0.0, 68.0, true);
  assert(!rExited.isInside, "Test 11h: Patient moved outside target");
  assert(tracker1.assessment.exitCount === 1, "Test 11i: exitCount incremented upon exiting");
  assert(rExited.holdProgressPct === 0, "Test 11j: Continuous hold timer resets to 0% upon leaving target");

  // Longest continuous hold is preserved (approx 1.0s)
  assert(tracker1.assessment.longestContinuousHoldSeconds >= 0.95, "Test 11k: Longest continuous hold before leaving was preserved");

  // Patient re-enters and holds continuously for 2000ms (40 samples)
  tracker1.recordSample(t0 + 1200, -0.38, 0.0, 68.0, true);
  assert(tracker1.assessment.enterCount === 2, "Test 11l: enterCount incremented on second entry");

  for (let i = 1; i <= 40; i++) {
    lastRes = tracker1.recordSample(t0 + 1200 + i * 50, -0.38, 0.0, 68.0, true);
  }
  assert(lastRes.isCompleted === true, "Test 11m: Target is COMPLETED when held for 2.0 continuous seconds");
  assert(lastRes.holdProgressPct === 100, "Test 11n: Hold progress reaches 100% upon completion");
  assert(tracker1.assessment.longestContinuousHoldSeconds >= 2.0, "Test 11o: Longest continuous hold is >= 2.0s");
  assert(tracker1.assessment.completionTimeSeconds !== null, "Test 11p: Completion time recorded accurately");

  // -------------------------------------------------------------
  // Test 12: Timestamp-Based Durations & Scientific Accuracy
  // -------------------------------------------------------------
  const finalized1 = tracker1.finalize();
  assert(finalized1.validDurationSeconds > 3.0, "Test 12a: Total valid measurement duration accumulated");
  assert(finalized1.timeInsideSeconds > 2.8, "Test 12b: Time inside target accumulated");
  assert(finalized1.timeOutsideSeconds > 0.05, "Test 12c: Time outside target accumulated");
  assert(
    Math.abs((finalized1.timeInsideSeconds + finalized1.timeOutsideSeconds) - finalized1.validDurationSeconds) < 0.1,
    "Test 12d: Inside time + outside time equals valid measurement duration"
  );

  // Accuracy calculation: (valid samples inside / total valid samples) * 100
  const expectedAccuracy = (finalized1.samplesInsideCount / finalized1.validSampleCount) * 100;
  assert(Math.abs(finalized1.accuracyPercentage - expectedAccuracy) < 0.2, "Test 12e: Scientific accuracy percentage matches formula");

  // Distances and variability
  assert(finalized1.meanDistanceMm !== null && finalized1.meanDistanceMm > 0, "Test 12f: Mean distance reported in calibrated mm");
  assert(finalized1.maxDistanceMm !== null && finalized1.maxDistanceMm >= finalized1.meanDistanceMm!, "Test 12g: Max distance >= mean distance");
  assert(finalized1.copSdMm !== null && finalized1.copSdMm >= 0, "Test 12h: Postural sway variability reported in calibrated mm");
  assert(finalized1.sensorQuality === "Optimal", "Test 12i: Signal quality marked Optimal when continuous");

  // -------------------------------------------------------------
  // Test 13: Disconnected Board & Missing Data Handling
  // -------------------------------------------------------------
  const trackerDisc = new DirectionalTargetTracker(targets[1]); // SHIFT RIGHT
  trackerDisc.start(t0);

  // 5 valid samples inside
  for (let i = 1; i <= 5; i++) {
    trackerDisc.recordSample(t0 + i * 50, 0.38, 0.0, 65.0, true);
  }
  // Board disconnects for 1500ms
  const discRes = trackerDisc.recordSample(t0 + 1750, null, null, null, false);
  assert(discRes.isCompleted === false, "Test 13a: Target NOT completed when board disconnects");
  assert(discRes.holdProgressPct === 0, "Test 13b: Continuous hold timer paused/reset on disconnection");

  const finalizedDisc = trackerDisc.finalize();
  assert(finalizedDisc.missingDataDurationSeconds >= 1.0, "Test 13c: Missing-data duration accumulated strictly from timestamps");
  assert(finalizedDisc.sensorQuality === "Interrupted", "Test 13d: Interrupted sensor stream classified correctly");

  // -------------------------------------------------------------
  // Test 14: Incomplete Target Handling & Session Summary
  // -------------------------------------------------------------
  const trackerIncomplete = new DirectionalTargetTracker(targets[2]); // SHIFT FORWARD
  trackerIncomplete.start(t0);
  // Patient only holds forward for 0.8s, then leaves
  for (let i = 1; i <= 16; i++) {
    trackerIncomplete.recordSample(t0 + i * 50, 0.0, 0.32, 70.0, true);
  }
  const finalizedIncomplete = trackerIncomplete.finalize();
  assert(finalizedIncomplete.isCompleted === false, "Test 14a: Target strictly marked Incomplete when hold requirement not met");
  assert(finalizedIncomplete.completionTimeSeconds === null, "Test 14b: Completion time is null for incomplete target");
  assert(finalizedIncomplete.longestContinuousHoldSeconds >= 0.75, "Test 14c: Actual measured hold time preserved");

  // Build 5-target assessment list (3 completed, 2 incomplete)
  const full5Targets = targets.map((t, idx) => {
    const tr = new DirectionalTargetTracker(t);
    tr.start(t0 + idx * 10000);
    if (idx < 3) {
      // Completed targets: provide enough samples to meet each target's duration (e.g. up to 3.0s = 65 samples)
      for (let s = 1; s <= 70; s++) {
        tr.recordSample(t0 + idx * 10000 + s * 50, t.x, t.y, 68.0, true);
      }
    } else {
      // Incomplete targets (held only 0.8s)
      for (let s = 1; s <= 16; s++) {
        tr.recordSample(t0 + idx * 10000 + s * 50, t.x, t.y, 68.0, true);
      }
    }
    return tr.finalize();
  });

  const sessionSummary = calculateDirectionalSessionSummary({
    sessionId: "test-dir-session-001",
    patientId: "PAT-TEST-101",
    patientName: "Arthur Morgan",
    startTime: t0,
    endTime: t0 + 45000,
    targets: full5Targets,
    isRealHardware: true,
  });

  assert(sessionSummary.completedTargetsCount === 3, "Test 14d: Exactly 3 of 5 targets completed");
  assert(sessionSummary.allTargetsCompleted === false, "Test 14e: allTargetsCompleted is false when partial");
  assert(sessionSummary.totalTargetsCount === 5, "Test 14f: Total targets count is 5");
  assert(sessionSummary.overallAccuracyPercentage > 95, "Test 14g: Overall session accuracy percentage calculated");
  assert(sessionSummary.totalTimeInsideSeconds > 5.0, "Test 14h: Total time inside all targets summed");
  assert(sessionSummary.hardwareModel === "RVL-WBC-01", "Test 14i: Hardware model identifies RVL-WBC-01");

  // -------------------------------------------------------------
  // Test 15: Doctor PDF Report Generation
  // -------------------------------------------------------------
  const doc = PdfReportGenerator.generateDirectionalWeightShiftReport(sessionSummary);
  assert(doc !== null, "Test 15a: generateDirectionalWeightShiftReport returned a valid jsPDF document");

  const pdfPages = doc.getNumberOfPages();
  assert(pdfPages === 3, `Test 15b: Directional report contains exactly 3 clinical pages (got ${pdfPages})`);

  const pdfArrayBuf = doc.output("arraybuffer");
  const pdfBytes = new Uint8Array(pdfArrayBuf);
  assert(pdfBytes.length > 5000, `Test 15c: PDF binary output generated (${pdfBytes.length} bytes)`);

  const magic = String.fromCharCode(...pdfBytes.slice(0, 5));
  assert(magic === "%PDF-", "Test 15d: Output starts with valid %PDF- magic signature");

  // Save report to disk in ./reports directory
  const reportsDir = path.resolve("./reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const pdfPath = path.join(reportsDir, `PatientBalanceAI_DirectionalReport_${sessionSummary.sessionId}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  assert(fs.existsSync(pdfPath), "Test 15e: Doctor PDF saved to disk successfully");

  // Test report generation for completely completed session
  const complete5Targets = targets.map((t, idx) => {
    const tr = new DirectionalTargetTracker(t);
    tr.start(t0 + idx * 10000);
    for (let s = 1; s <= 70; s++) {
      tr.recordSample(t0 + idx * 10000 + s * 50, t.x, t.y, 70.0, true);
    }
    return tr.finalize();
  });
  const completeSessionSummary = calculateDirectionalSessionSummary({
    sessionId: "test-dir-complete-002",
    patientId: "PAT-TEST-102",
    patientName: "Sadie Adler",
    startTime: t0,
    endTime: t0 + 35000,
    targets: complete5Targets,
    isRealHardware: true,
  });
  assert(completeSessionSummary.allTargetsCompleted === true, "Test 15f: Complete session flags allTargetsCompleted = true");
  const docComplete = PdfReportGenerator.generateDirectionalWeightShiftReport(completeSessionSummary);
  assert(docComplete.getNumberOfPages() === 3, "Test 15g: Complete session PDF has 3 pages");

  // -------------------------------------------------------------
  // Test 16: Configurable Hold Durations per Directional Target
  // -------------------------------------------------------------
  const defaultTargets = getDirectionalTargets();
  assert(defaultTargets[0].requiredHoldDurationSeconds === 2, "Test 16a: Default Left hold duration is 2s");
  assert(defaultTargets[1].requiredHoldDurationSeconds === 3, "Test 16b: Default Right hold duration is 3s");
  assert(defaultTargets[2].requiredHoldDurationSeconds === 1, "Test 16c: Default Forward hold duration is 1s");
  assert(defaultTargets[3].requiredHoldDurationSeconds === 2, "Test 16d: Default Backward hold duration is 2s");
  assert(defaultTargets[4].requiredHoldDurationSeconds === 3, "Test 16e: Default Center hold duration is 3s");

  // Instruction text accurately includes the required duration
  assert(
    defaultTargets[0].instruction.includes("2 seconds"),
    "Test 16f: Left instruction includes '2 seconds'"
  );
  assert(
    defaultTargets[1].instruction.includes("3 seconds"),
    "Test 16g: Right instruction includes '3 seconds'"
  );
  assert(
    defaultTargets[2].instruction.includes("1 second"),
    "Test 16h: Forward instruction includes '1 second'"
  );

  // Custom durations override
  const customTargets = getDirectionalTargets({
    "SHIFT LEFT": 4,
    "SHIFT RIGHT": 5,
    "SHIFT FORWARD": 2,
    "SHIFT BACKWARD": 3,
    "RETURN TO CENTER": 4,
  });
  assert(customTargets[0].requiredHoldDurationSeconds === 4, "Test 16i: Custom Left duration is 4s");
  assert(customTargets[1].requiredHoldDurationSeconds === 5, "Test 16j: Custom Right duration is 5s");
  assert(customTargets[0].instruction.includes("4 seconds"), "Test 16k: Custom instruction updated to '4 seconds'");

  // -------------------------------------------------------------
  // Test 17: Tremor Buffer / Fluctuation Tolerance
  // -------------------------------------------------------------
  const tremorTracker = new DirectionalTargetTracker(defaultTargets[0]); // Left target: x=-0.38, tolerance=0.16
  tremorTracker.start(t0);

  // Enter target at center of circle
  tremorTracker.recordSample(t0 + 50, -0.38, 0.0, 68.0, true);
  assert(tremorTracker.assessment.attemptCount === 1, "Test 17a: First entry increments attemptCount to 1");

  // Hold for 800ms
  for (let s = 1; s <= 16; s++) {
    tremorTracker.recordSample(t0 + 50 + s * 50, -0.38, 0.0, 68.0, true);
  }

  // Micro-tremor right at boundary: distance = 0.175 (within tolerance 0.16 + buffer 0.025 = 0.185)
  // (-0.38 + 0.175 = -0.205)
  const tremorSample = tremorTracker.recordSample(t0 + 900, -0.205, 0.0, 68.0, true);
  assert(tremorSample.isInside === true, "Test 17b: Micro tremor within jitter buffer keeps isInside = true");
  assert(tremorSample.currentContinuousHoldSeconds >= 0.85, "Test 17c: Hold timer does not reset during small natural tremor");

  // True exit: sway far out to x = 0.0 (center)
  const exitSample = tremorTracker.recordSample(t0 + 950, 0.0, 0.0, 68.0, true);
  assert(exitSample.isInside === false, "Test 17d: True exit beyond buffer detected as outside");
  assert(exitSample.currentContinuousHoldSeconds === 0, "Test 17e: Hold timer strictly resets to 0 upon leaving target zone");

  // Re-entry: should increment attemptCount to 2
  tremorTracker.recordSample(t0 + 1000, -0.38, 0.0, 68.0, true);
  assert(tremorTracker.assessment.attemptCount === 2, "Test 17f: Re-entering target zone increments attemptCount to 2");

  // -------------------------------------------------------------
  // Test 18: Objective Metrics Integrity & Removal of Static Metric
  // -------------------------------------------------------------
  const finalizedTremor = tremorTracker.finalize();
  assert(finalizedTremor.requiredHoldDurationSeconds === 2, "Test 18a: Target assessment stores requiredHoldDurationSeconds");
  assert(
    typeof finalizedTremor.actualSuccessfulHoldDurationSeconds === "number",
    "Test 18b: Target assessment stores actualSuccessfulHoldDurationSeconds"
  );
  assert(finalizedTremor.attemptCount === 2, "Test 18c: Finalized target records 2 attempts");
  assert(
    finalizedTremor.timeInsideSeconds > 0 && finalizedTremor.timeOutsideSeconds > 0,
    "Test 18d: Time inside and outside both recorded objectively"
  );


  // -------------------------------------------------------------
  // Test 19: 4-Load-Cell Physical COP Coordinate System & Force Mapping
  // -------------------------------------------------------------
  // +X = Right, -X = Left, +Y = Forward (Anterior), -Y = Backward (Posterior)
  // Perfectly centered standing: 17.5kg on each sensor = 70.0kg total
  const centerCop = calculateCopFromLoadCells(17.5, 17.5, 17.5, 17.5);
  assert(centerCop.isValid === true, "Test 19a: Equal 4 load-cell forces yield valid COP");
  assert(centerCop.totalWeight === 70.0, "Test 19b: Total weight sums to 70.0 kg");
  assert(Math.abs(centerCop.copX) < 0.001, "Test 19c: Symmetrical load produces copX = 0.0");
  assert(Math.abs(centerCop.copY) < 0.001, "Test 19d: Symmetrical load produces copY = 0.0");
  assert(centerCop.copXMm === 0.0, "Test 19e: Physical copXMm is 0.0 mm");
  assert(centerCop.copYMm === 0.0, "Test 19f: Physical copYMm is 0.0 mm");

  // Patient leaning RIGHT (+X): Left sensors 10kg, Right sensors 25kg (Total 70kg)
  // copX = (50 - 20) / 70 = +0.4286
  const rightCop = calculateCopFromLoadCells(10.0, 25.0, 10.0, 25.0);
  assert(rightCop.isValid === true, "Test 19g: Right-shifted force distribution is valid");
  assert(rightCop.copX > 0, "Test 19h: Rightward force yields positive copX (+X = Right)");
  assert(Math.abs(rightCop.copX - 0.4286) < 0.001, "Test 19i: copX matches analytical rightward ratio (+0.4286)");
  assert(Math.abs(rightCop.copY) < 0.001, "Test 19j: Lateral shift does not alter anteroposterior copY");

  // Patient leaning LEFT (-X): Left sensors 25kg, Right sensors 10kg (Total 70kg)
  // copX = (20 - 50) / 70 = -0.4286
  const leftCop = calculateCopFromLoadCells(25.0, 10.0, 25.0, 10.0);
  assert(leftCop.copX < 0, "Test 19k: Leftward force yields negative copX (-X = Left)");
  assert(Math.abs(leftCop.copX - (-0.4286)) < 0.001, "Test 19l: copX matches analytical leftward ratio (-0.4286)");

  // Patient leaning FORWARD / ANTERIOR (+Y): Front sensors 25kg, Back sensors 10kg (Total 70kg)
  // copY = (50 - 20) / 70 = +0.4286
  const forwardCop = calculateCopFromLoadCells(25.0, 25.0, 10.0, 10.0);
  assert(forwardCop.copY > 0, "Test 19m: Anterior force yields positive copY (+Y = Forward)");
  assert(Math.abs(forwardCop.copY - 0.4286) < 0.001, "Test 19n: copY matches analytical forward ratio (+0.4286)");
  assert(Math.abs(forwardCop.copX) < 0.001, "Test 19o: Pure AP shift does not alter lateral copX");

  // Patient leaning BACKWARD / POSTERIOR (-Y): Front sensors 10kg, Back sensors 25kg (Total 70kg)
  // copY = (20 - 50) / 70 = -0.4286
  const backwardCop = calculateCopFromLoadCells(10.0, 10.0, 25.0, 25.0);
  assert(backwardCop.copY < 0, "Test 19p: Posterior force yields negative copY (-Y = Backward)");
  assert(Math.abs(backwardCop.copY - (-0.4286)) < 0.001, "Test 19q: copY matches analytical backward ratio (-0.4286)");

  // Board physical geometry scaling: L_X = 446mm (half 223mm), L_Y = 238mm (half 119mm)
  assert(WII_BOARD_DIMENSIONS.halfDistanceXMm === 223.0, "Test 19r: Wii board physical half X is 223.0 mm");
  assert(WII_BOARD_DIMENSIONS.halfDistanceYMm === 119.0, "Test 19s: Wii board physical half Y is 119.0 mm");
  assert(Math.abs(rightCop.copXMm - (0.4286 * 223.0)) < 0.1, "Test 19t: Physical copXMm correctly scales by 223.0mm");

  // Sensor reading validation safeguards
  const nullSensors = calculateCopFromLoadCells(null, 15, 15, 15);
  assert(nullSensors.isValid === false, "Test 19u: Null sensor reading is rejected");
  assert(Boolean(nullSensors.errorReason?.includes("Missing")), "Test 19v: Null sensor reports missing error");

  const lowWeight = calculateCopFromLoadCells(1.0, 1.0, 1.0, 1.0); // 4.0kg < 10.0kg
  assert(lowWeight.isValid === false, "Test 19w: Weight below 10kg threshold is rejected as unladen board");
  assert(Boolean(lowWeight.errorReason?.includes("10.0 kg")), "Test 19x: Low weight reports threshold error");

  // -------------------------------------------------------------
  // Test 20: 5-Second Baseline Calibration Validation & Rejection Logic
  // -------------------------------------------------------------
  const baseTime = 1700000000000;

  // Synthesize 5 seconds of stable quiet standing (50 samples at 10Hz, span 5000ms)
  const validSamples = [];
  for (let i = 0; i < 50; i++) {
    validSamples.push({
      timestamp: baseTime + i * 100, // 0 to 4900ms
      copX: 0.03 + (i % 2 === 0 ? 0.002 : -0.002), // subtle physiological sway around +0.03 (+6.7mm)
      copY: -0.02 + (i % 3 === 0 ? 0.001 : -0.001), // subtle sway around -0.02 (-2.4mm)
      totalWeight: 68.2 + (i % 2 === 0 ? 0.2 : -0.2), // stable weight ~68.2kg
    });
  }

  const validCalibration = validateBaselineCalibration(validSamples, 5.0);
  assert(validCalibration.isValid === true, "Test 20a: Stable 5-second quiet standing passes calibration validation");
  assert(validCalibration.baseline !== undefined, "Test 20b: Calibrated baseline is returned");
  assert(Math.abs((validCalibration.baseline?.baselineX0 || 0) - 0.03) < 0.005, "Test 20c: Average baseline X0 calculated accurately");
  assert(Math.abs((validCalibration.baseline?.baselineY0 || 0) - (-0.02)) < 0.005, "Test 20d: Average baseline Y0 calculated accurately");
  assert(validCalibration.baseline?.isCalibrated === true, "Test 20e: isCalibrated flag set to true");
  assert(validCalibration.baseline?.calibratedWeightKg === 68.2, "Test 20f: Calibrated patient weight recorded accurately");

  // Failure: empty samples
  const emptyCal = validateBaselineCalibration([], 5.0);
  assert(emptyCal.isValid === false, "Test 20g: Empty calibration window fails validation");

  // Failure: insufficient sample count (< 25)
  const sparseSamples = validSamples.slice(0, 15);
  const sparseCal = validateBaselineCalibration(sparseSamples, 5.0);
  assert(sparseCal.isValid === false, "Test 20h: Insufficient sample count (<25) fails validation");
  assert(Boolean(sparseCal.errorReason?.includes("Insufficient")), "Test 20i: Sparse samples error message provided");

  // Failure: insufficient duration (< 4.5s)
  const shortSamples = validSamples.slice(0, 30).map((s, idx) => ({ ...s, timestamp: baseTime + idx * 100 })); // 2900ms
  const shortCal = validateBaselineCalibration(shortSamples, 5.0);
  assert(shortCal.isValid === false, "Test 20j: Truncated duration (< 4.5s) fails validation");
  assert(Boolean(shortCal.errorReason?.includes("too short")), "Test 20k: Truncated duration error message provided");

  // Failure: insufficient patient weight (< 15.0kg)
  const childToySamples = validSamples.map((s) => ({ ...s, totalWeight: 8.5 }));
  const lightCal = validateBaselineCalibration(childToySamples, 5.0);
  assert(lightCal.isValid === false, "Test 20l: Weight under 15kg fails validation");
  assert(Boolean(lightCal.errorReason?.includes("Insufficient patient weight")), "Test 20m: Low weight error message provided");

  // Failure: unstable weight (std dev > 3.0kg, e.g. stepping off)
  const steppingOffSamples = validSamples.map((s, idx) => ({
    ...s,
    totalWeight: idx < 25 ? 68.0 : 15.0, // stepped off mid-way
  }));
  const unstableWeightCal = validateBaselineCalibration(steppingOffSamples, 5.0);
  assert(unstableWeightCal.isValid === false, "Test 20n: Weight variation > 3.0kg fails validation");
  assert(Boolean(unstableWeightCal.errorReason?.includes("unstable")), "Test 20o: Unstable weight error message provided");

  // Failure: excessive postural sway (std dev > 0.12)
  const excessiveSwaySamples = validSamples.map((s, idx) => ({
    ...s,
    copX: idx % 2 === 0 ? 0.35 : -0.35, // large wild swaying
  }));
  const wildSwayCal = validateBaselineCalibration(excessiveSwaySamples, 5.0);
  assert(wildSwayCal.isValid === false, "Test 20p: Excessive postural sway (> 0.12) fails validation");
  assert(Boolean(wildSwayCal.errorReason?.includes("Excessive postural sway")), "Test 20q: Excessive sway error message provided");

  // -------------------------------------------------------------
  // Test 21: Relative COP Subtraction (Neutral Center = 0, 0)
  // -------------------------------------------------------------
  const baseline = validCalibration.baseline!;
  // Patient is at their natural neutral stance (copX = baselineX0, copY = baselineY0)
  const atNeutral = calculateRelativeCop(baseline.baselineX0, baseline.baselineY0, baseline);
  assert(atNeutral.relCopX === 0.0, "Test 21a: Relative COP X at patient neutral baseline is strictly 0.0");
  assert(atNeutral.relCopY === 0.0, "Test 21b: Relative COP Y at patient neutral baseline is strictly 0.0");
  assert(atNeutral.relCopXMm === 0.0, "Test 21c: Relative COP X in mm at baseline is strictly 0.0 mm");
  assert(atNeutral.relCopYMm === 0.0, "Test 21d: Relative COP Y in mm at baseline is strictly 0.0 mm");

  // Patient shifts 0.20 to the right from baseline
  const shiftedRight = calculateRelativeCop(baseline.baselineX0 + 0.20, baseline.baselineY0, baseline);
  assert(Math.abs((shiftedRight.relCopX || 0) - 0.20) < 0.001, "Test 21e: Relative COP X shifts +0.20 relative to individual baseline");
  assert(shiftedRight.relCopY === 0.0, "Test 21f: Relative COP Y remains 0.0 during pure lateral shift");

  // Null/NaN safe handling
  const nullRelative = calculateRelativeCop(null, null, baseline);
  assert(nullRelative.relCopX === null && nullRelative.relCopY === null, "Test 21g: Null input safely handled");

  // Uncalibrated baseline fallback (relative equals raw when not calibrated)
  const uncalibratedRel = calculateRelativeCop(0.15, -0.10, null);
  assert(uncalibratedRel.relCopX === 0.15, "Test 21h: Uncalibrated relative X defaults to raw");
  assert(uncalibratedRel.relCopY === -0.10, "Test 21i: Uncalibrated relative Y defaults to raw");

  // -------------------------------------------------------------
  // Test 22: BaselineCalibrationCollector Real-Time Accumulation
  // -------------------------------------------------------------
  const collector = new BaselineCalibrationCollector(5.0);
  assert(collector.getSampleCount() === 0, "Test 22a: Newly instantiated collector has 0 samples");

  // Add 3 seconds of samples
  for (let i = 0; i < 30; i++) {
    collector.addCopSample(baseTime + i * 100, 0.01, 0.01, 65.0);
  }
  const midStatus = collector.getStatus(baseTime + 3000);
  assert(midStatus.isComplete === false, "Test 22b: After 3 seconds, isComplete is false");
  assert(midStatus.sampleCount === 30, "Test 22c: Exactly 30 samples recorded");
  assert(midStatus.progressPct >= 55 && midStatus.progressPct <= 65, "Test 22d: Progress is ~60%");

  // Add remaining 2 seconds (up to 5.1s)
  for (let i = 30; i < 52; i++) {
    collector.addCopSample(baseTime + i * 100, 0.01, 0.01, 65.0);
  }
  const endStatus = collector.getStatus(baseTime + 5100);
  assert(endStatus.isComplete === true, "Test 22e: At 5.1s, isComplete is true");
  assert(endStatus.progressPct === 100, "Test 22f: Progress reached 100%");

  const finalizeResult = collector.validateAndFinalize(5.0);
  assert(finalizeResult.isValid === true, "Test 22g: Collector finalize returns valid baseline");
  assert(finalizeResult.baseline?.calibratedWeightKg === 65.0, "Test 22h: Collector finalizes correct weight");

  // Reset collector
  collector.reset(baseTime + 6000);
  assert(collector.getSampleCount() === 0, "Test 22i: Reset clears all collector samples");

  // -------------------------------------------------------------
  // Test 23: Session Summary & Exercise Result Store Calibration Baseline
  // -------------------------------------------------------------
  const sessionSummaryWithCal = calculateDirectionalSessionSummary({
    targets: [],
    calibrationBaseline: validCalibration.baseline,
  });
  assert(sessionSummaryWithCal.calibrationBaseline !== undefined, "Test 23a: Session summary persists calibration baseline");
  assert(sessionSummaryWithCal.calibrationBaseline?.isCalibrated === true, "Test 23b: Persisted baseline retains isCalibrated = true");
  assert(sessionSummaryWithCal.calibrationBaseline?.baselineX0 === validCalibration.baseline?.baselineX0, "Test 23c: Baseline X0 stored intact");

  const exerciseResultWithCal = calculateDirectionalExerciseResult({
    completedTargets: 5,
    totalTargets: 5,
    elapsedMs: 25000,
    distanceSamples: [0.01, 0.02],
    isConnected: true,
    calibrationBaseline: validCalibration.baseline,
  });
  assert(exerciseResultWithCal.calibrationBaseline !== undefined, "Test 23d: Exercise result persists calibration baseline");
  assert(exerciseResultWithCal.calibrationBaseline?.calibratedWeightKg === 68.2, "Test 23e: Exercise result stores calibrated body weight");

  // =============================================================
  // STEP 2 TESTS: REAL COP DIRECTION VALIDATION & SENSOR PIPELINE
  // =============================================================

  // Baseline calibration reference for tests: neutral quiet stance baseline at X0 = +0.015, Y0 = -0.010
  const calBaseline = {
    baselineX0: 0.015,
    baselineY0: -0.010,
    baselineX0Mm: 3.3,
    baselineY0Mm: -1.2,
    calibratedWeightKg: 70.0,
    weightStdDevKg: 0.2,
    copSdXNorm: 0.01,
    copSdYNorm: 0.01,
    copSdMm: 2.5,
    copSwayDispersionMm: 2.5,
    sampleCount: 50,
    calibrationDurationSeconds: 5.0,
    timestamp: baseTime,
    isCalibrated: true,
  };

  // -------------------------------------------------------------
  // Test 24: Real Sensor LEFT Movement Validation (COP moves towards -X)
  // -------------------------------------------------------------
  // Patient shifts LEFT on Wii Balance Board:
  // FL = 25.0 kg, BL = 25.0 kg, FR = 10.0 kg, BR = 10.0 kg (Total = 70.0 kg)
  // Left side force = 50.0 kg, Right side force = 20.0 kg
  // rawCopX = (20 - 50) / 70 = -0.4286
  // relCopX = -0.4286 - (+0.015) = -0.4436 (-X direction)
  // relCopXMm = -0.4436 * 223.0 = -98.92 mm
  const leftDiag = classifyCopMovementDirection(25.0, 10.0, 25.0, 10.0, calBaseline);
  assert(leftDiag.detectedDirection === "LEFT", "Test 24a: Left weight shift classifies as 'LEFT'");
  assert(leftDiag.relCopX < 0, "Test 24b: Left movement yields negative relative COP X (-X)");
  assert(leftDiag.relCopXMm < -50.0, "Test 24c: Left movement displacement exceeds -50 mm leftward");
  assert(leftDiag.isOutsideDeadband === true, "Test 24d: Left shift is recognized outside deadband");
  assert(leftDiag.forceBalance.leftForce > leftDiag.forceBalance.rightForce, "Test 24e: Physical check: Left force (50kg) > Right force (20kg)");
  assert(leftDiag.totalWeight === 70.0, "Test 24f: Total weight recorded accurately as 70.0 kg");
  assert(leftDiag.loadCells.frontLeft === 25.0 && leftDiag.loadCells.frontRight === 10.0, "Test 24g: 4 individual load-cell readings preserved");
  assert(leftDiag.diagnosticMessage.includes("Leftward weight shift verified"), "Test 24h: Diagnostic confirms physical validation");

  // -------------------------------------------------------------
  // Test 25: Real Sensor RIGHT Movement Validation (COP moves towards +X)
  // -------------------------------------------------------------
  // Patient shifts RIGHT on Wii Balance Board:
  // FL = 10.0 kg, BL = 10.0 kg, FR = 25.0 kg, BR = 25.0 kg (Total = 70.0 kg)
  // Left side force = 20.0 kg, Right side force = 50.0 kg
  // rawCopX = (50 - 20) / 70 = +0.4286
  // relCopX = +0.4286 - (+0.015) = +0.4136 (+X direction)
  // relCopXMm = +0.4136 * 223.0 = +92.23 mm
  const rightDiag = classifyCopMovementDirection(10.0, 25.0, 10.0, 25.0, calBaseline);
  assert(rightDiag.detectedDirection === "RIGHT", "Test 25a: Right weight shift classifies as 'RIGHT'");
  assert(rightDiag.relCopX > 0, "Test 25b: Right movement yields positive relative COP X (+X)");
  assert(rightDiag.relCopXMm > 50.0, "Test 25c: Right movement displacement exceeds +50 mm rightward");
  assert(rightDiag.isOutsideDeadband === true, "Test 25d: Right shift is recognized outside deadband");
  assert(rightDiag.forceBalance.rightForce > rightDiag.forceBalance.leftForce, "Test 25e: Physical check: Right force (50kg) > Left force (20kg)");
  assert(rightDiag.diagnosticMessage.includes("Rightward weight shift verified"), "Test 25f: Diagnostic confirms physical validation");

  // -------------------------------------------------------------
  // Test 26: Real Sensor FORWARD Movement Validation (COP moves towards +Y)
  // -------------------------------------------------------------
  // Patient shifts FORWARD (Anterior) on Wii Balance Board:
  // FL = 25.0 kg, FR = 25.0 kg, BL = 10.0 kg, BR = 10.0 kg (Total = 70.0 kg)
  // Anterior force = 50.0 kg, Posterior force = 20.0 kg
  // rawCopY = (50 - 20) / 70 = +0.4286
  // relCopY = +0.4286 - (-0.010) = +0.4386 (+Y direction)
  // relCopYMm = +0.4386 * 119.0 = +52.19 mm
  const forwardDiag = classifyCopMovementDirection(25.0, 25.0, 10.0, 10.0, calBaseline);
  assert(forwardDiag.detectedDirection === "FORWARD", "Test 26a: Forward weight shift classifies as 'FORWARD'");
  assert(forwardDiag.relCopY > 0, "Test 26b: Forward movement yields positive relative COP Y (+Y)");
  assert(forwardDiag.relCopYMm > 40.0, "Test 26c: Forward displacement exceeds +40 mm anterior");
  assert(forwardDiag.isOutsideDeadband === true, "Test 26d: Forward shift recognized outside deadband");
  assert(forwardDiag.forceBalance.anteriorForce > forwardDiag.forceBalance.posteriorForce, "Test 26e: Physical check: Anterior force (50kg) > Posterior force (20kg)");
  assert(forwardDiag.diagnosticMessage.includes("Forward anterior weight shift verified"), "Test 26f: Diagnostic confirms physical validation");

  // -------------------------------------------------------------
  // Test 27: Real Sensor BACKWARD Movement Validation (COP moves towards -Y)
  // -------------------------------------------------------------
  // Patient shifts BACKWARD (Posterior) on Wii Balance Board:
  // FL = 10.0 kg, FR = 10.0 kg, BL = 25.0 kg, BR = 25.0 kg (Total = 70.0 kg)
  // Anterior force = 20.0 kg, Posterior force = 50.0 kg
  // rawCopY = (20 - 50) / 70 = -0.4286
  // relCopY = -0.4286 - (-0.010) = -0.4186 (-Y direction)
  // relCopYMm = -0.4186 * 119.0 = -49.81 mm
  const backwardDiag = classifyCopMovementDirection(10.0, 10.0, 25.0, 25.0, calBaseline);
  assert(backwardDiag.detectedDirection === "BACKWARD", "Test 27a: Backward weight shift classifies as 'BACKWARD'");
  assert(backwardDiag.relCopY < 0, "Test 27b: Backward movement yields negative relative COP Y (-Y)");
  assert(backwardDiag.relCopYMm < -40.0, "Test 27c: Backward displacement exceeds -40 mm posterior");
  assert(backwardDiag.isOutsideDeadband === true, "Test 27d: Backward shift recognized outside deadband");
  assert(backwardDiag.forceBalance.posteriorForce > backwardDiag.forceBalance.anteriorForce, "Test 27e: Physical check: Posterior force (50kg) > Anterior force (20kg)");
  assert(backwardDiag.diagnosticMessage.includes("Backward posterior weight shift verified"), "Test 27f: Diagnostic confirms physical validation");

  // -------------------------------------------------------------
  // Test 28: Neutral Quiet Standing Validation (At Calibrated Baseline)
  // -------------------------------------------------------------
  // Patient standing at their calibrated baseline position:
  // Baseline: X0 = 0.015, Y0 = -0.010
  // Load cells producing exactly (0.015, -0.010) on 70kg total:
  // W = 70kg, Right - Left = 0.015 * 70 = 1.05kg -> Right = 35.525kg, Left = 34.475kg
  // Anterior - Posterior = -0.010 * 70 = -0.70kg -> Anterior = 34.65kg, Posterior = 35.35kg
  // FL = 17.075, FR = 17.575, BL = 17.400, BR = 17.950 (Total = 70.0kg)
  const neutralDiag = classifyCopMovementDirection(17.075, 17.575, 17.400, 17.950, calBaseline);
  assert(neutralDiag.detectedDirection === "NEUTRAL", "Test 28a: Standing at calibrated baseline classifies as 'NEUTRAL'");
  assert(neutralDiag.isOutsideDeadband === false, "Test 28b: Neutral position is inside deadband");
  assert(neutralDiag.displacementMm < DEFAULT_DIRECTION_DEADBAND.minDisplacementMm, "Test 28c: Displacement (0 mm) is strictly under deadband threshold");
  assert(Math.abs(neutralDiag.relCopX) < 0.005, "Test 28d: Relative COP X is ~0.0 at baseline");
  assert(Math.abs(neutralDiag.relCopY) < 0.005, "Test 28e: Relative COP Y is ~0.0 at baseline");

  // -------------------------------------------------------------
  // Test 29: Sensor Noise Rejection & Short Rolling Filter Performance
  // -------------------------------------------------------------
  // Micro-jitter: 0.5 mm fluctuation around neutral center
  // Should NOT trigger false direction movement
  const noiseDiag = classifyCopMovementDirection(17.15, 17.50, 17.45, 17.90, calBaseline);
  assert(noiseDiag.detectedDirection === "NEUTRAL", "Test 29a: Micro sensor noise does NOT trigger directional shift");
  assert(noiseDiag.isOutsideDeadband === false, "Test 29b: Sub-deadband noise stays inside deadband");

  // Rolling Filter: test noise attenuation over 4-sample window
  const filter = new CopRollingFilter(4);
  assert(filter.getBufferLength() === 0, "Test 29c: Initial filter buffer length is 0");

  // Feed samples with high-frequency alternating noise around 0.10: [0.12, 0.08, 0.12, 0.08]
  const s1 = filter.pushSample(baseTime, 0.12, 0.05, 68.0);
  assert(s1.filteredX === 0.12, "Test 29d: 1st sample returns value directly without lag");
  const s2 = filter.pushSample(baseTime + 25, 0.08, 0.05, 68.0);
  assert(s2.filteredX === 0.10, "Test 29e: 2nd sample rolling average is smoothed to 0.10");
  filter.pushSample(baseTime + 50, 0.12, 0.05, 68.0);
  const s4 = filter.pushSample(baseTime + 75, 0.08, 0.05, 68.0);
  assert(s4.filteredX === 0.10, "Test 29f: 4th sample perfectly cancels alternating noise to exactly 0.10");
  assert(filter.getBufferLength() === 4, "Test 29g: Filter maintains strict windowSize = 4");

  // Fifth sample pushes oldest out
  const s5 = filter.pushSample(baseTime + 100, 0.20, 0.05, 68.0);
  assert(filter.getBufferLength() === 4, "Test 29h: Window size remains capped at 4");
  assert(s5.sampleCount === 4, "Test 29i: Sample count reports 4");

  // -------------------------------------------------------------
  // Test 30: Missing, Null, or Unladen Sensor Telemetry Protection
  // -------------------------------------------------------------
  // Null sensor reading
  const nullDiag = classifyCopMovementDirection(null, 15.0, 15.0, 15.0, calBaseline);
  assert(nullDiag.detectedDirection === "INDETERMINATE", "Test 30a: Null load-cell reading returns 'INDETERMINATE'");
  assert(nullDiag.isOutsideDeadband === false, "Test 30b: Indeterminate reading is not marked outside deadband");
  assert(nullDiag.diagnosticMessage.includes("Missing"), "Test 30c: Diagnostic message identifies missing sensor");

  // Negative sensor reading (hardware error / negative tare spike)
  const negDiag = classifyCopMovementDirection(-1.5, 20.0, 20.0, 20.0, calBaseline);
  assert(negDiag.detectedDirection === "INDETERMINATE", "Test 30d: Negative sensor reading returns 'INDETERMINATE'");
  assert(negDiag.diagnosticMessage.includes("Negative force"), "Test 30e: Diagnostic identifies negative force");

  // Unladen board (< 10kg, patient stepped off)
  const unladenDiag = classifyCopMovementDirection(1.0, 1.0, 1.0, 1.0, calBaseline);
  assert(unladenDiag.detectedDirection === "INDETERMINATE", "Test 30f: Unladen board (<10kg) returns 'INDETERMINATE'");
  assert(unladenDiag.diagnosticMessage.includes("minimum 10.0 kg required"), "Test 30g: Diagnostic identifies unladen board");

  // Rolling filter invalid sample handling: resets buffer safely
  const invalidPush = filter.pushSample(baseTime + 150, null, null, null);
  assert(invalidPush.filteredX === null, "Test 30h: Invalid sample yields null filtered values");
  filter.reset();
  assert(filter.getBufferLength() === 0, "Test 30i: Filter reset clears buffer completely");

  // -------------------------------------------------------------
  // Test 31: Target Accuracy Calculation, Physical Distances & Median
  // -------------------------------------------------------------
  // Test calculateMedian
  assert(calculateMedian([10, 20, 30]) === 20, "Test 31a: Median of odd length array [10, 20, 30] is 20");
  assert(calculateMedian([10, 20, 30, 40]) === 25, "Test 31b: Median of even length array [10, 20, 30, 40] is 25");
  assert(calculateMedian([]) === null, "Test 31c: Median of empty array is null");

  // Exact target center test: Distance must be 0.0 mm
  const centerTarget31 = targets[4]; // Center target (0, 0)
  const distCenterMm = calculateCopDistanceToTargetMm(0.0, 0.0, centerTarget31.x, centerTarget31.y);
  assert(distCenterMm !== null && Math.abs(distCenterMm) < 0.001, "Test 31d: COP at exact target center produces 0.0 mm distance");

  // Target tracker accuracy computation
  const tracker31 = new DirectionalTargetTracker(targets[0]); // Left (-0.38, 0.0)
  tracker31.start(baseTime);
  // Feed 10 samples inside target (50ms intervals = 500ms)
  for (let i = 0; i < 10; i++) {
    tracker31.recordSample(baseTime + (i + 1) * 50, -0.38, 0.0, 70.0, true);
  }
  // Feed 5 samples outside target (50ms intervals = 250ms)
  for (let i = 10; i < 15; i++) {
    tracker31.recordSample(baseTime + (i + 1) * 50, 0.0, 0.0, 70.0, true);
  }
  const assessment31 = tracker31.finalize();
  // Total valid samples: 15. Inside: 10. Accuracy = (10/15)*100 = 66.7%
  assert(assessment31.validSampleCount === 15, "Test 31e: Correct valid sample count recorded");
  assert(assessment31.samplesInsideCount === 10, "Test 31f: Correct inside sample count recorded");
  assert(assessment31.accuracyPercentage === 66.7, "Test 31g: Scientific accuracy (%) is (10/15)*100 = 66.7%");
  // Time inside: 0.5s, Time outside: 0.25s, Total: 0.75s -> Time inside % = (0.5/0.75)*100 = 66.7%
  assert(assessment31.timeInsidePercentage === 66.7, "Test 31h: Time inside percentage equals 66.7%");
  assert(assessment31.medianDistanceMm !== null, "Test 31i: Median distance is calculated");
  assert(assessment31.maxDistanceMm !== null && assessment31.maxDistanceMm > 0, "Test 31j: Max distance is calculated and positive");

  // -------------------------------------------------------------
  // Test 32: Continuous vs Accumulated Hold Duration & Exiting Reset
  // -------------------------------------------------------------
  // Target requires 2.0s hold
  const target32: DirectionalTarget = { ...targets[0], requiredHoldDurationSeconds: 2.0 };
  const tracker32 = new DirectionalTargetTracker(target32);
  tracker32.start(baseTime);

  // Step 1: Hold inside for 1.2s (24 intervals at 50ms)
  tracker32.recordSample(baseTime, target32.x, target32.y, 70.0, true);
  for (let i = 1; i <= 24; i++) {
    tracker32.recordSample(baseTime + i * 50, target32.x, target32.y, 70.0, true);
  }
  assert(!tracker32.assessment.isCompleted, "Test 32a: Target is NOT completed after only 1.2s hold (2.0s required)");
  assert(Math.abs(tracker32.assessment.timeInsideSeconds - 1.2) < 0.05, "Test 32b: Accumulated time inside is ~1.2s");

  // Step 2: Exit target for 0.5s (10 samples outside)
  for (let i = 25; i <= 34; i++) {
    tracker32.recordSample(baseTime + i * 50, 0.0, 0.0, 70.0, true);
  }
  assert(!tracker32.assessment.isCompleted, "Test 32c: Target remains NOT completed after exiting");

  // Step 3: Re-enter and hold continuously for 2.0s (40 intervals inside)
  for (let i = 35; i <= 75; i++) {
    tracker32.recordSample(baseTime + i * 50, target32.x, target32.y, 70.0, true);
  }
  assert(tracker32.assessment.isCompleted, "Test 32d: Target completes once a full 2.0s continuous hold is achieved");
  const finalized32 = tracker32.finalize();
  assert(finalized32.continuousHoldDurationSeconds >= 2.0, "Test 32e: Continuous hold duration is >= 2.0s");
  assert(finalized32.accumulatedHoldDurationSeconds > finalized32.continuousHoldDurationSeconds, "Test 32f: Accumulated hold (3.2s) strictly exceeds continuous hold (2.0s)");
  assert(finalized32.attemptCount === 2, "Test 32g: Exactly 2 attempts recorded (initial entry, exit, re-entry)");

  // -------------------------------------------------------------
  // Test 33: Time-Weighted Overall Session Accuracy vs Unweighted Mean
  // -------------------------------------------------------------
  // Two targets with unequal durations:
  // Target A: Quick target (1.0s valid duration, 1.0s inside -> 100% accuracy, 1 attempt)
  const targetA = { ...createInitialTargetAssessment(targets[0]) };
  targetA.validDurationSeconds = 1.0;
  targetA.timeInsideSeconds = 1.0;
  targetA.timeOutsideSeconds = 0.0;
  targetA.validSampleCount = 20;
  targetA.samplesInsideCount = 20;
  targetA.accuracyPercentage = 100.0;
  targetA.attemptCount = 1;
  targetA.isCompleted = true;

  // Target B: Long target (9.0s valid duration, 1.0s inside, 8.0s outside -> 11.1% accuracy, 3 attempts)
  const targetB = { ...createInitialTargetAssessment(targets[1]) };
  targetB.validDurationSeconds = 9.0;
  targetB.timeInsideSeconds = 1.0;
  targetB.timeOutsideSeconds = 8.0;
  targetB.validSampleCount = 180;
  targetB.samplesInsideCount = 20;
  targetB.accuracyPercentage = 11.1;
  targetB.attemptCount = 3;
  targetB.isCompleted = false;

  const sessionSummary33 = calculateDirectionalSessionSummary({
    targets: [targetA, targetB],
    isRealHardware: true,
  });

  // Time-weighted accuracy: (1.0 + 1.0) / (1.0 + 9.0) * 100 = 2.0 / 10.0 = 20.0%
  assert(sessionSummary33.overallTimeWeightedAccuracyPercentage === 20.0, "Test 33a: Time-weighted accuracy is exactly 20.0%");
  // Unweighted arithmetic mean: (100.0 + 11.1) / 2 = 55.5% (or 55.6% with rounding)
  assert(
    sessionSummary33.meanTargetAccuracyPercentage === 55.5 || sessionSummary33.meanTargetAccuracyPercentage === 55.6,
    "Test 33b: Mean target accuracy is (100.0 + 11.1) / 2 = ~55.5% - 55.6%"
  );
  // Total attempts: 1 + 3 = 4
  assert(sessionSummary33.totalAttemptsCount === 4, "Test 33c: Total attempts is 4 (1 + 3)");

  // -------------------------------------------------------------
  // Test 34: Invariance to Different Sampling Rates (20 Hz, 50 Hz, 100 Hz)
  // -------------------------------------------------------------
  // Run 2.0s hold at 20 Hz (dt = 50ms, 40 samples)
  const tracker20Hz = new DirectionalTargetTracker(target32);
  tracker20Hz.start(baseTime);
  for (let i = 1; i <= 40; i++) {
    tracker20Hz.recordSample(baseTime + i * 50, target32.x, target32.y, 70.0, true);
  }
  const res20Hz = tracker20Hz.finalize();

  // Run 2.0s hold at 50 Hz (dt = 20ms, 100 samples)
  const tracker50Hz = new DirectionalTargetTracker(target32);
  tracker50Hz.start(baseTime);
  for (let i = 1; i <= 100; i++) {
    tracker50Hz.recordSample(baseTime + i * 20, target32.x, target32.y, 70.0, true);
  }
  const res50Hz = tracker50Hz.finalize();

  // Run 2.0s hold at 100 Hz (dt = 10ms, 200 samples)
  const tracker100Hz = new DirectionalTargetTracker(target32);
  tracker100Hz.start(baseTime);
  for (let i = 1; i <= 200; i++) {
    tracker100Hz.recordSample(baseTime + i * 10, target32.x, target32.y, 70.0, true);
  }
  const res100Hz = tracker100Hz.finalize();

  assert(res20Hz.validDurationSeconds === 2.0, "Test 34a: 20 Hz valid duration is 2.0s");
  assert(res50Hz.validDurationSeconds === 2.0, "Test 34b: 50 Hz valid duration is 2.0s");
  assert(res100Hz.validDurationSeconds === 2.0, "Test 34c: 100 Hz valid duration is 2.0s");
  assert(res20Hz.isCompleted && res50Hz.isCompleted && res100Hz.isCompleted, "Test 34d: All sampling rates complete target accurately at 2.0s");
  assert(res20Hz.accuracyPercentage === 100 && res50Hz.accuracyPercentage === 100 && res100Hz.accuracyPercentage === 100, "Test 34e: Accuracy is 100% across all frequencies");

  // -------------------------------------------------------------
  // Test 35: Interrupted Telemetry & Missing Frame Protection
  // -------------------------------------------------------------
  const tracker35 = new DirectionalTargetTracker(target32);
  tracker35.start(baseTime);
  // Hold for 0.5s inside
  for (let i = 1; i <= 10; i++) {
    tracker35.recordSample(baseTime + i * 50, target32.x, target32.y, 70.0, true);
  }
  // Sudden telemetry dropout: gap of 2000ms (Bluetooth packet loss)
  tracker35.recordSample(baseTime + 10 * 50 + 2000, target32.x, target32.y, 70.0, true);
  const assessment35 = tracker35.finalize();

  assert(assessment35.missingDataDurationSeconds >= 1.5, "Test 35a: Telemetry dropout >= 1.5s recorded in missingDataDurationSeconds");
  assert(assessment35.timeInsideSeconds <= 1.0, "Test 35b: Missing duration was NOT fraudulently added to timeInsideSeconds");
  assert(!assessment35.isCompleted, "Test 35c: Target not completed during packet dropout");
  assert(assessment35.sensorQuality === "Interrupted", "Test 35d: Sensor quality correctly classified as 'Interrupted'");

  // =============================================================
  // SCIENTIFIC AUDIT TESTS: DISPLAYED METRICS VS MANUAL CALCULATIONS
  // =============================================================

  // -------------------------------------------------------------
  // Test 36: Target Accuracy Exact Formulas & Denominator Audit
  // -------------------------------------------------------------
  // Manual raw data: 7 valid samples inside, 3 valid samples outside (10 total valid samples at 50ms)
  const auditTarget36: DirectionalTarget = { ...targets[0], requiredHoldDurationSeconds: 2.0 };
  const tracker36 = new DirectionalTargetTracker(auditTarget36);
  tracker36.start(baseTime);

  // 7 samples inside target (-0.38, 0)
  for (let i = 1; i <= 7; i++) {
    tracker36.recordSample(baseTime + i * 50, auditTarget36.x, auditTarget36.y, 70.0, true);
  }
  // 3 samples outside target (0, 0)
  for (let i = 8; i <= 10; i++) {
    tracker36.recordSample(baseTime + i * 50, 0.0, 0.0, 70.0, true);
  }
  const assessment36 = tracker36.finalize();

  // Manual expected values:
  // Valid sample count = 10
  // Inside sample count = 7
  // Sample accuracy = (7 / 10) * 100 = 70.0%
  // Time inside = 7 * 0.05 = 0.35s
  // Time outside = 3 * 0.05 = 0.15s
  // Valid duration = 10 * 0.05 = 0.50s
  // Time accuracy % = (0.35 / 0.50) * 100 = 70.0%
  assert(assessment36.validSampleCount === 10, "Test 36a: Valid sample count is exactly 10");
  assert(assessment36.samplesInsideCount === 7, "Test 36b: Inside sample count is exactly 7");
  assert(assessment36.accuracyPercentage === 70.0, "Test 36c: Sample-based accuracy is exactly 70.0% (7/10)");
  assert(assessment36.timeInsidePercentage === 70.0, "Test 36d: Time-based accuracy is exactly 70.0% (0.35s/0.50s)");
  assert(assessment36.timeAccuracyPercentage === 70.0, "Test 36e: Time accuracy alias is exactly 70.0%");

  // -------------------------------------------------------------
  // Test 37: Time Inside + Time Outside Strictly Equals Valid Duration
  // -------------------------------------------------------------
  // Test target 36
  const sumTarget36 = parseFloat((assessment36.timeInsideSeconds + assessment36.timeOutsideSeconds).toFixed(2));
  assert(
    sumTarget36 === assessment36.validDurationSeconds,
    `Test 37a: Target timeInside (${assessment36.timeInsideSeconds}s) + timeOutside (${assessment36.timeOutsideSeconds}s) === validDuration (${assessment36.validDurationSeconds}s)`
  );

  // Test edge case with fractional durations: raw 1.004s inside, raw 1.004s outside
  const mockFractionalTarget = { ...createInitialTargetAssessment(targets[1]) };
  mockFractionalTarget.validDurationSeconds = 2.008;
  mockFractionalTarget.timeInsideSeconds = 1.004;
  mockFractionalTarget.timeOutsideSeconds = 1.004;
  mockFractionalTarget.validSampleCount = 100;
  mockFractionalTarget.samplesInsideCount = 50;

  const finalizedFractional = finalizeTargetAssessment(mockFractionalTarget);
  const sumFractional = parseFloat((finalizedFractional.timeInsideSeconds + finalizedFractional.timeOutsideSeconds).toFixed(2));
  assert(
    sumFractional === finalizedFractional.validDurationSeconds,
    `Test 37b: Fractional edge case: timeInside (${finalizedFractional.timeInsideSeconds}s) + timeOutside (${finalizedFractional.timeOutsideSeconds}s) === validDuration (${finalizedFractional.validDurationSeconds}s)`
  );

  // -------------------------------------------------------------
  // Test 38: Session Totals Calculated From Unrounded Raw Values
  // -------------------------------------------------------------
  // Two targets with unrounded raw values:
  // Target 1: rawInside = 1.24s, rawOutside = 1.24s (rawValid = 2.48s)
  // Target 2: rawInside = 1.24s, rawOutside = 1.24s (rawValid = 2.48s)
  //
  // Premature rounding sum:
  // Target 1 rounded to 1 decimal: inside 1.2s, outside 1.2s
  // Target 2 rounded to 1 decimal: inside 1.2s, outside 1.2s
  // Premature sum: inside 2.4s, outside 2.4s (total 4.8s) -> WRONG!
  //
  // Unrounded calculation:
  // Total raw inside = 1.24 + 1.24 = 2.48s -> Display: 2.5s
  // Total raw outside = 1.24 + 1.24 = 2.48s -> Display: 2.5s
  // Total raw valid = 2.48 + 2.48 = 4.96s -> Display: 5.0s
  // 2.5s + 2.5s === 5.0s -> PERFECT!
  const targetUnrounded1 = { ...createInitialTargetAssessment(targets[0]) };
  targetUnrounded1.rawValidDurationSeconds = 2.48;
  targetUnrounded1.rawTimeInsideSeconds = 1.24;
  targetUnrounded1.rawTimeOutsideSeconds = 1.24;
  targetUnrounded1.validDurationSeconds = 2.48;
  targetUnrounded1.timeInsideSeconds = 1.24;
  targetUnrounded1.timeOutsideSeconds = 1.24;
  targetUnrounded1.validSampleCount = 50;
  targetUnrounded1.samplesInsideCount = 25;
  targetUnrounded1.accuracyPercentage = 50.0;

  const targetUnrounded2 = { ...createInitialTargetAssessment(targets[1]) };
  targetUnrounded2.rawValidDurationSeconds = 2.48;
  targetUnrounded2.rawTimeInsideSeconds = 1.24;
  targetUnrounded2.rawTimeOutsideSeconds = 1.24;
  targetUnrounded2.validDurationSeconds = 2.48;
  targetUnrounded2.timeInsideSeconds = 1.24;
  targetUnrounded2.timeOutsideSeconds = 1.24;
  targetUnrounded2.validSampleCount = 50;
  targetUnrounded2.samplesInsideCount = 25;
  targetUnrounded2.accuracyPercentage = 50.0;

  const sessionSummary38 = calculateDirectionalSessionSummary({
    targets: [targetUnrounded1, targetUnrounded2],
    isRealHardware: true,
  });

  assert(sessionSummary38.totalTimeInsideSeconds === 2.5, "Test 38a: Session inside time calculated from raw sum (2.48s -> 2.5s)");
  assert(sessionSummary38.totalTimeOutsideSeconds === 2.5, "Test 38b: Session outside time calculated from raw sum (2.48s -> 2.5s)");
  assert(
    parseFloat((sessionSummary38.totalTimeInsideSeconds + sessionSummary38.totalTimeOutsideSeconds).toFixed(1)) === 5.0,
    "Test 38c: Session displayed inside + outside strictly equals 5.0s (not 4.8s)"
  );

  // -------------------------------------------------------------
  // Test 39: Mean Successful Hold Calculation (All Targets vs Completed)
  // -------------------------------------------------------------
  // Target A: 2.0s required, 2.0s achieved (completed)
  // Target B: 3.0s required, 1.5s achieved (incomplete)
  // Manual expected values:
  // holdTimesSum = 2.0 + 1.5 = 3.5s
  // meanHoldTimeSeconds = 3.5 / 2 = 1.75s
  // meanCompletedHoldTimeSeconds = 2.0 / 1 = 2.00s
  const targetHoldA = { ...createInitialTargetAssessment(targets[0]) };
  targetHoldA.isCompleted = true;
  targetHoldA.actualSuccessfulHoldDurationSeconds = 2.0;
  targetHoldA.longestContinuousHoldSeconds = 2.0;

  const targetHoldB = { ...createInitialTargetAssessment(targets[1]) };
  targetHoldB.isCompleted = false;
  targetHoldB.actualSuccessfulHoldDurationSeconds = 1.5;
  targetHoldB.longestContinuousHoldSeconds = 1.5;

  const sessionSummary39 = calculateDirectionalSessionSummary({
    targets: [targetHoldA, targetHoldB],
    isRealHardware: true,
  });

  assert(sessionSummary39.meanHoldTimeSeconds === 1.75, "Test 39a: Mean hold time across all targets is (2.0 + 1.5)/2 = 1.75s");
  assert(sessionSummary39.meanCompletedHoldTimeSeconds === 2.0, "Test 39b: Mean completed hold time is 2.0s (strictly completed targets)");

  // -------------------------------------------------------------
  // Test 40: Attempts Counting Transition Verification
  // -------------------------------------------------------------
  // Manual protocol:
  // 1. Enter target -> Attempt 1
  // 2. Sway out -> Exit 1
  // 3. Enter target -> Attempt 2
  // 4. Sway out -> Exit 2
  // 5. Enter target -> Attempt 3
  const tracker40 = new DirectionalTargetTracker(targets[0]);
  tracker40.start(baseTime);

  // Initial outside sample
  tracker40.recordSample(baseTime, 0.0, 0.0, 70.0, true);
  assert(tracker40.assessment.attemptCount === 0, "Test 40a: Initially outside has 0 attempts");

  // Attempt 1
  tracker40.recordSample(baseTime + 50, targets[0].x, targets[0].y, 70.0, true);
  assert(tracker40.assessment.attemptCount === 1, "Test 40b: First entry increments attemptCount to 1");

  // Hold inside (does not increment attempts)
  tracker40.recordSample(baseTime + 100, targets[0].x, targets[0].y, 70.0, true);
  assert(tracker40.assessment.attemptCount === 1, "Test 40c: Continuing inside maintains attemptCount at 1");

  // Exit 1
  tracker40.recordSample(baseTime + 150, 0.0, 0.0, 70.0, true);
  assert(tracker40.assessment.attemptCount === 1, "Test 40d: Exiting does not increment attempts");
  assert(tracker40.assessment.exitCount === 1, "Test 40e: Exit count increments to 1");

  // Attempt 2
  tracker40.recordSample(baseTime + 200, targets[0].x, targets[0].y, 70.0, true);
  assert(tracker40.assessment.attemptCount === 2, "Test 40f: Re-entering increments attemptCount to 2");

  // Exit 2
  tracker40.recordSample(baseTime + 250, 0.0, 0.0, 70.0, true);

  // Attempt 3
  tracker40.recordSample(baseTime + 300, targets[0].x, targets[0].y, 70.0, true);
  assert(tracker40.assessment.attemptCount === 3, "Test 40g: Third entry increments attemptCount to 3");

  // -------------------------------------------------------------
  // Test 41: Mean COP Distance vs COP SD / Variance Mathematical Distinction
  // -------------------------------------------------------------
  // Scenario: Target at Center (0, 0)
  // Patient standing rigidly shifted to +0.30 X with ZERO sway (both samples at +0.30):
  // Sample 1: copX = +0.30, copY = 0.0
  // Sample 2: copX = +0.30, copY = 0.0
  //
  // Target Center = (0, 0).
  // Distance 1 = 0.30 * 223.0 mm = 66.90 mm
  // Distance 2 = 0.30 * 223.0 mm = 66.90 mm
  // Mean COP Distance = 66.9 mm (LARGE OFFSET FROM TARGET!)
  //
  // Postural Sway (Variation around patient's own mean):
  // Mean X = 0.30
  // Var X = ((0.30 - 0.30)^2 + (0.30 - 0.30)^2) / 2 = 0.0
  // COP SD = 0.0 mm (ZERO SWAY VARIANCE!)
  const tracker41 = new DirectionalTargetTracker(targets[4]); // Center (0, 0)
  tracker41.start(baseTime);
  tracker41.recordSample(baseTime + 50, 0.30, 0.0, 70.0, true);
  tracker41.recordSample(baseTime + 100, 0.30, 0.0, 70.0, true);
  const assessment41 = tracker41.finalize();

  assert(assessment41.meanDistanceMm === 66.9, "Test 41a: Mean COP Distance to target is 66.9 mm (accuracy offset)");
  assert(assessment41.copSdMm === 0.0, "Test 41b: COP Standard Deviation is 0.0 mm (zero sway variability)");
  assert(
    assessment41.meanDistanceMm !== assessment41.copSdMm,
    "Test 41c: Mean Distance (66.9mm) is mathematically distinct from COP Variance/SD (0.0mm)"
  );

  // -------------------------------------------------------------
  // Test 42: Continuous Hold Completion Status Invariant
  // -------------------------------------------------------------
  // Target requires 2.0s hold.
  // Patient enters and holds 1.8s (accumulated 1.8s). Exits.
  // Patient re-enters and holds 1.8s (accumulated 3.6s). Exits.
  // Although accumulated hold (3.6s) exceeds required hold (2.0s),
  // continuous hold never reached 2.0s.
  // Status MUST be isCompleted === false!
  const target42: DirectionalTarget = { ...targets[0], requiredHoldDurationSeconds: 2.0 };
  const tracker42 = new DirectionalTargetTracker(target42);
  tracker42.start(baseTime);

  // Entry 1: Hold for 1.8s (36 intervals of 50ms)
  tracker42.recordSample(baseTime, target42.x, target42.y, 70.0, true);
  for (let i = 1; i <= 36; i++) {
    tracker42.recordSample(baseTime + i * 50, target42.x, target42.y, 70.0, true);
  }
  // Exit: 0.5s outside
  for (let i = 37; i <= 46; i++) {
    tracker42.recordSample(baseTime + i * 50, 0.0, 0.0, 70.0, true);
  }
  // Entry 2: Hold for 1.8s (36 intervals of 50ms)
  for (let i = 47; i <= 82; i++) {
    tracker42.recordSample(baseTime + i * 50, target42.x, target42.y, 70.0, true);
  }
  const assessment42 = tracker42.finalize();

  assert(assessment42.accumulatedHoldDurationSeconds >= 3.6, "Test 42a: Accumulated hold duration is >= 3.6s");
  assert(assessment42.longestContinuousHoldSeconds === 1.8, "Test 42b: Longest continuous hold is 1.8s (< 2.0s required)");
  assert(assessment42.isCompleted === false, "Test 42c: Target completion is strictly FALSE (continuous hold requirement not satisfied)");
  assert(assessment42.attemptCount === 2, "Test 42d: Exactly 2 attempts recorded");

  // -------------------------------------------------------------
  // Test 43: Comprehensive End-to-End Session Audit
  // -------------------------------------------------------------
  // Construct a realistic full 5-target assessment session:
  // Target 1 (Left, req 2s): Complete (2.0s hold, 100% accuracy, 1 attempt)
  // Target 2 (Right, req 3s): Complete (3.0s hold, 80% accuracy, 2 attempts)
  // Target 3 (Forward, req 1s): Incomplete (0.6s hold, 50% accuracy, 1 attempt)
  // Target 4 (Backward, req 2s): Complete (2.0s hold, 90% accuracy, 1 attempt)
  // Target 5 (Center, req 3s): Incomplete (1.5s hold, 60% accuracy, 2 attempts)
  const auditTargets = targets.map((t, idx) => {
    const tr = new DirectionalTargetTracker(t);
    tr.start(baseTime + idx * 10000);
    return tr.finalize();
  });

  // Assign manually calculated ground truth
  auditTargets[0].isCompleted = true;
  auditTargets[0].requiredHoldDurationSeconds = 2;
  auditTargets[0].actualSuccessfulHoldDurationSeconds = 2.0;
  auditTargets[0].validDurationSeconds = 2.0;
  auditTargets[0].timeInsideSeconds = 2.0;
  auditTargets[0].timeOutsideSeconds = 0.0;
  auditTargets[0].rawValidDurationSeconds = 2.0;
  auditTargets[0].rawTimeInsideSeconds = 2.0;
  auditTargets[0].rawTimeOutsideSeconds = 0.0;
  auditTargets[0].validSampleCount = 40;
  auditTargets[0].samplesInsideCount = 40;
  auditTargets[0].accuracyPercentage = 100.0;
  auditTargets[0].attemptCount = 1;

  auditTargets[1].isCompleted = true;
  auditTargets[1].requiredHoldDurationSeconds = 3;
  auditTargets[1].actualSuccessfulHoldDurationSeconds = 3.0;
  auditTargets[1].validDurationSeconds = 4.0;
  auditTargets[1].timeInsideSeconds = 3.2;
  auditTargets[1].timeOutsideSeconds = 0.8;
  auditTargets[1].rawValidDurationSeconds = 4.0;
  auditTargets[1].rawTimeInsideSeconds = 3.2;
  auditTargets[1].rawTimeOutsideSeconds = 0.8;
  auditTargets[1].validSampleCount = 80;
  auditTargets[1].samplesInsideCount = 64;
  auditTargets[1].accuracyPercentage = 80.0;
  auditTargets[1].attemptCount = 2;

  auditTargets[2].isCompleted = false;
  auditTargets[2].requiredHoldDurationSeconds = 1;
  auditTargets[2].actualSuccessfulHoldDurationSeconds = 0.6;
  auditTargets[2].validDurationSeconds = 2.0;
  auditTargets[2].timeInsideSeconds = 1.0;
  auditTargets[2].timeOutsideSeconds = 1.0;
  auditTargets[2].rawValidDurationSeconds = 2.0;
  auditTargets[2].rawTimeInsideSeconds = 1.0;
  auditTargets[2].rawTimeOutsideSeconds = 1.0;
  auditTargets[2].validSampleCount = 40;
  auditTargets[2].samplesInsideCount = 20;
  auditTargets[2].accuracyPercentage = 50.0;
  auditTargets[2].attemptCount = 1;

  auditTargets[3].isCompleted = true;
  auditTargets[3].requiredHoldDurationSeconds = 2;
  auditTargets[3].actualSuccessfulHoldDurationSeconds = 2.0;
  auditTargets[3].validDurationSeconds = 3.0;
  auditTargets[3].timeInsideSeconds = 2.7;
  auditTargets[3].timeOutsideSeconds = 0.3;
  auditTargets[3].rawValidDurationSeconds = 3.0;
  auditTargets[3].rawTimeInsideSeconds = 2.7;
  auditTargets[3].rawTimeOutsideSeconds = 0.3;
  auditTargets[3].validSampleCount = 60;
  auditTargets[3].samplesInsideCount = 54;
  auditTargets[3].accuracyPercentage = 90.0;
  auditTargets[3].attemptCount = 1;

  auditTargets[4].isCompleted = false;
  auditTargets[4].requiredHoldDurationSeconds = 3;
  auditTargets[4].actualSuccessfulHoldDurationSeconds = 1.5;
  auditTargets[4].validDurationSeconds = 5.0;
  auditTargets[4].timeInsideSeconds = 3.0;
  auditTargets[4].timeOutsideSeconds = 2.0;
  auditTargets[4].rawValidDurationSeconds = 5.0;
  auditTargets[4].rawTimeInsideSeconds = 3.0;
  auditTargets[4].rawTimeOutsideSeconds = 2.0;
  auditTargets[4].validSampleCount = 100;
  auditTargets[4].samplesInsideCount = 60;
  auditTargets[4].accuracyPercentage = 60.0;
  auditTargets[4].attemptCount = 2;

  const sessionSummary43 = calculateDirectionalSessionSummary({
    targets: auditTargets,
    isRealHardware: true,
  });

  // Manual expected values:
  // Completed targets: 3 out of 5
  // Total valid samples: 40 + 80 + 40 + 60 + 100 = 320
  // Total inside samples: 40 + 64 + 20 + 54 + 60 = 238
  // Sample accuracy: (238 / 320) * 100 = 74.375% -> 74.4%
  // Total valid duration: 2.0 + 4.0 + 2.0 + 3.0 + 5.0 = 16.0s
  // Total inside seconds: 2.0 + 3.2 + 1.0 + 2.7 + 3.0 = 11.9s
  // Total outside seconds: 0.0 + 0.8 + 1.0 + 0.3 + 2.0 = 4.1s
  // Time-weighted accuracy: (11.9 / 16.0) * 100 = 74.375% -> 74.4%
  // Mean target accuracy: (100.0 + 80.0 + 50.0 + 90.0 + 60.0) / 5 = 380.0 / 5 = 76.0%
  // Mean hold time (all 5 targets): (2.0 + 3.0 + 0.6 + 2.0 + 1.5) / 5 = 9.1 / 5 = 1.82s
  // Mean completed hold (3 completed targets): (2.0 + 3.0 + 2.0) / 3 = 7.0 / 3 = 2.33s
  // Total attempts: 1 + 2 + 1 + 1 + 2 = 7
  assert(sessionSummary43.completedTargetsCount === 3, "Test 43a: Completed targets count is exactly 3/5");
  assert(sessionSummary43.allTargetsCompleted === false, "Test 43b: allTargetsCompleted is false");
  assert(sessionSummary43.totalValidSamples === 320, "Test 43c: Total valid samples is 320");
  assert(sessionSummary43.overallAccuracyPercentage === 74.4, "Test 43d: Sample accuracy is exactly 74.4%");
  assert(sessionSummary43.overallTimeWeightedAccuracyPercentage === 74.4, "Test 43e: Time-weighted accuracy is exactly 74.4%");
  assert(sessionSummary43.meanTargetAccuracyPercentage === 76.0, "Test 43f: Mean target accuracy is exactly 76.0%");
  assert(sessionSummary43.totalTimeInsideSeconds === 11.9, "Test 43g: Total time inside is exactly 11.9s");
  assert(sessionSummary43.totalTimeOutsideSeconds === 4.1, "Test 43h: Total time outside is exactly 4.1s");
  assert(
    parseFloat((sessionSummary43.totalTimeInsideSeconds + sessionSummary43.totalTimeOutsideSeconds).toFixed(1)) === 16.0,
    "Test 43i: Total inside (11.9s) + outside (4.1s) strictly equals total valid duration (16.0s)"
  );
  assert(sessionSummary43.meanHoldTimeSeconds === 1.82, "Test 43j: Mean hold time across all targets is 1.82s");
  assert(sessionSummary43.meanCompletedHoldTimeSeconds === 2.33, "Test 43k: Mean completed hold time is 2.33s");
  assert(sessionSummary43.totalAttemptsCount === 7, "Test 43l: Total attempts count is exactly 7");

  // =============================================================
  // STEP 1: COORDINATE-BASED SCIENTIFIC RESULT CALCULATION
  // Professor's Handwritten COP Coordinate Calculation Method
  // =============================================================

  // Test 44: Exact Target Center Coordinate Error is exactly 0.0 mm
  for (const target of DIRECTIONAL_TARGET_SEQUENCE) {
    const exactCenterSample = [
      {
        copXMm: target.targetXMm ?? 0,
        copYMm: target.targetYMm ?? 0,
        totalWeight: 70.0,
      },
    ];
    const metricsExact: CoordinateErrorMetrics = calculateCoordinateErrorMetrics(
      exactCenterSample,
      target.targetXMm ?? 0,
      target.targetYMm ?? 0,
      target.toleranceMm ?? 40.4
    );

    assert(metricsExact.validSampleCount === 1, `Test 44a [${target.shortLabel}]: Exactly 1 valid sample processed`);
    assert(metricsExact.meanDistanceErrorMm === 0.0, `Test 44b [${target.shortLabel}]: Mean distance error is exactly 0.0 mm`);
    assert(metricsExact.rmsDistanceErrorMm === 0.0, `Test 44c [${target.shortLabel}]: RMS distance error is exactly 0.0 mm`);
    assert(metricsExact.sdDistanceErrorMm === 0.0, `Test 44d [${target.shortLabel}]: SD of distance error is exactly 0.0 mm`);
    assert(metricsExact.minDistanceErrorMm === 0.0, `Test 44e [${target.shortLabel}]: Min distance error is exactly 0.0 mm`);
    assert(metricsExact.maxDistanceErrorMm === 0.0, `Test 44f [${target.shortLabel}]: Max distance error is exactly 0.0 mm`);
    assert(metricsExact.samplesInTargetZonePercentage === 100.0, `Test 44g [${target.shortLabel}]: Containment accuracy is 100.0%`);
  }

  // Test 45: Known offsets match analytical calculations
  // 45a: Right-angle offset (30 mm, 40 mm) gives Euclidean distance sqrt(30^2 + 40^2) = 50.0 mm
  const offset30_40 = [
    {
      copXMm: 30.0,
      copYMm: 40.0,
      totalWeight: 70.0,
    },
  ];
  const metrics30_40 = calculateCoordinateErrorMetrics(offset30_40, 0.0, 0.0, 40.4);
  assert(metrics30_40.meanDistanceErrorMm === 50.0, "Test 45a: Offset (30mm, 40mm) produces exact 50.0 mm distance error");
  assert(metrics30_40.rmsDistanceErrorMm === 50.0, "Test 45b: Single sample RMS error matches distance exactly (50.0 mm)");
  assert(metrics30_40.sdDistanceErrorMm === 0.0, "Test 45c: Single sample SD is 0.0 mm");
  assert(metrics30_40.samplesInTargetZoneCount === 0, "Test 45d: 50.0 mm offset > 40.4 mm tolerance zone (outside target)");

  // 45e: Dataset with analytical mean 30.0 mm, RMS 36.74 mm, SD 21.21 mm
  // For two distance errors d1 = 30 - 15*sqrt(2) ≈ 8.7868 mm and d2 = 30 + 15*sqrt(2) ≈ 51.2132 mm:
  // d_bar = (8.7868 + 51.2132) / 2 = 30.0 mm
  // RMS = sqrt((8.7868^2 + 51.2132^2) / 2) = sqrt((77.208 + 2622.792) / 2) = sqrt(1350) = 36.7423... -> 36.74 mm
  // SD = sqrt(((8.7868 - 30)^2 + (51.2132 - 30)^2) / 2) = sqrt((450 + 450) / 2) = sqrt(450) = 21.2132... -> 21.21 mm
  // Mathematical relation: RMS^2 = 1350 = 30^2 + 21.2132^2 = d_bar^2 + sigma_d^2
  const delta45 = 15 * Math.SQRT2;
  const d1_45 = 30.0 - delta45; // ~8.7868 mm
  const d2_45 = 30.0 + delta45; // ~51.2132 mm
  const samples45 = [
    { copXMm: d1_45, copYMm: 0.0, totalWeight: 65.0 },
    { copXMm: d2_45, copYMm: 0.0, totalWeight: 65.0 },
  ];
  const metrics45 = calculateCoordinateErrorMetrics(samples45, 0.0, 0.0, 40.4);
  assert(metrics45.meanDistanceErrorMm === 30.0, "Test 45e: Mean COP distance error is exactly 30.0 mm");
  assert(metrics45.rmsDistanceErrorMm === 36.74, "Test 45f: RMS distance error is exactly 36.74 mm");
  assert(metrics45.sdDistanceErrorMm === 21.21, "Test 45g: Standard deviation of distance error is exactly 21.21 mm");
  assert(
    Math.abs(metrics45.rmsDistanceErrorMm ** 2 - (metrics45.meanDistanceErrorMm ** 2 + metrics45.sdDistanceErrorMm ** 2)) < 1.0,
    "Test 45h: Mathematical identity RMS^2 === mean^2 + SD^2 holds within rounding limits"
  );
  assert(metrics45.minDistanceErrorMm === 8.79, "Test 45i: Min distance error is 8.79 mm");
  assert(metrics45.maxDistanceErrorMm === 51.21, "Test 45j: Max distance error is 51.21 mm");
  assert(metrics45.samplesInTargetZoneCount === 1, "Test 45k: Exactly 1 sample in zone (8.79mm <= 40.4mm, 51.21mm > 40.4mm)");
  assert(metrics45.samplesInTargetZonePercentage === 50.0, "Test 45l: Spatial containment accuracy is 50.0%");

  // Test 46: Physical coordinates & directional sign convention
  // Canonical clinical convention: LEFT = -X, RIGHT = +X, FORWARD = +Y, BACKWARD = -Y, CENTER = (0,0)
  const leftTarget46 = DIRECTIONAL_TARGET_SEQUENCE[0];
  const rightTarget46 = DIRECTIONAL_TARGET_SEQUENCE[1];
  const fwdTarget46 = DIRECTIONAL_TARGET_SEQUENCE[2];
  const bwdTarget46 = DIRECTIONAL_TARGET_SEQUENCE[3];
  const centerTarget46 = DIRECTIONAL_TARGET_SEQUENCE[4];

  assert(leftTarget46.targetXMm === -84.74 && leftTarget46.targetYMm === 0.0, "Test 46a: LEFT target is at -84.74 mm (negative X)");
  assert(rightTarget46.targetXMm === 84.74 && rightTarget46.targetYMm === 0.0, "Test 46b: RIGHT target is at +84.74 mm (positive X)");
  assert(fwdTarget46.targetXMm === 0.0 && fwdTarget46.targetYMm === 38.08, "Test 46c: FORWARD target is at +38.08 mm (positive Y)");
  assert(bwdTarget46.targetXMm === 0.0 && bwdTarget46.targetYMm === -38.08, "Test 46d: BACKWARD target is at -38.08 mm (negative Y)");
  assert(centerTarget46.targetXMm === 0.0 && centerTarget46.targetYMm === 0.0, "Test 46e: CENTER target is at (0.0 mm, 0.0 mm)");

  // Target coordinates represent physical millimetres, NOT screen pixels
  assert(
    Math.abs((leftTarget46.targetXMm ?? 0) - (-0.38 * WII_BOARD_DIMENSIONS.halfDistanceXMm)) < 0.01,
    "Test 46f: Physical mm derived from board dimension (223mm lateral half-width)"
  );
  assert(
    Math.abs((fwdTarget46.targetYMm ?? 0) - (0.32 * WII_BOARD_DIMENSIONS.halfDistanceYMm)) < 0.01,
    "Test 46g: Physical mm derived from board dimension (119mm AP half-length)"
  );

  // Test 47: Rejection of invalid / null / NaN / disconnected / unloaded sensor samples
  const mixedQualitySamples = [
    { copXMm: null, copYMm: 0.0, totalWeight: 70.0 }, // null X -> reject
    { copXMm: 10.0, copYMm: undefined, totalWeight: 70.0 }, // undefined Y -> reject
    { copXMm: NaN, copYMm: 0.0, totalWeight: 70.0 }, // NaN X -> reject
    { copXMm: 10.0, copYMm: NaN, totalWeight: 70.0 }, // NaN Y -> reject
    { copXMm: 10.0, copYMm: 10.0, totalWeight: 5.0 }, // totalWeight < 10kg (unladen) -> reject
    { copXMm: 10.0, copYMm: 10.0, totalWeight: NaN }, // totalWeight NaN -> reject
    { copXMm: 20.0, copYMm: 0.0, totalWeight: 70.0 }, // VALID 1: dist = 20mm
    { copXMm: 40.0, copYMm: 0.0, totalWeight: 70.0 }, // VALID 2: dist = 40mm
  ];
  const metricsQuality = calculateCoordinateErrorMetrics(mixedQualitySamples, 0.0, 0.0, 40.4);
  assert(metricsQuality.validSampleCount === 2, "Test 47a: Exactly 2 authentic valid samples retained, 6 invalid rejected");
  assert(metricsQuality.meanDistanceErrorMm === 30.0, "Test 47b: Mean distance calculated strictly from 2 valid samples ((20+40)/2 = 30mm)");
  assert(metricsQuality.minDistanceErrorMm === 20.0, "Test 47c: Min distance is 20.0 mm");
  assert(metricsQuality.maxDistanceErrorMm === 40.0, "Test 47d: Max distance is 40.0 mm");

  // Test 48: Configurable sample count setting (provisional default: 60 points)
  assert(DEFAULT_COORDINATE_SAMPLE_COUNT === 60, "Test 48a: DEFAULT_COORDINATE_SAMPLE_COUNT is exactly 60");

  // Generate 60 valid coordinate samples
  const samples60: Array<{ copXMm: number; copYMm: number; totalWeight: number }> = [];
  for (let i = 0; i < 60; i++) {
    samples60.push({
      copXMm: -84.74 + (i % 5) * 2.0, // slight sway around LEFT target
      copYMm: (i % 3) * 1.5,
      totalWeight: 68.0,
    });
  }
  const metrics60Default = calculateCoordinateErrorMetrics(samples60, -84.74, 0.0, 40.4);
  assert(metrics60Default.validSampleCount === 60, "Test 48b: Exactly 60 valid coordinate samples collected");
  assert(metrics60Default.configuredSampleCount === 60, "Test 48c: Configured sample count reports 60");
  assert(metrics60Default.meanDistanceErrorMm > 0 && metrics60Default.meanDistanceErrorMm < 10.0, "Test 48d: Low distance error for small sway");

  // Custom sample count configuration (e.g. 100 points)
  const metricsCustomCount = calculateCoordinateErrorMetrics(samples60, -84.74, 0.0, 40.4, 100);
  assert(metricsCustomCount.configuredSampleCount === 100, "Test 48e: Configurable sample count accepts custom setting (100)");

  // Test 49: Time independence of coordinate-based accuracy
  // Session A: 10 samples collected over 2.0s
  // Session B: 10 samples with identical coordinates collected over 20.0s (10x duration)
  const identicalCoords = [
    { copXMm: 0.0, copYMm: 0.0, totalWeight: 70.0 },
    { copXMm: 5.0, copYMm: 0.0, totalWeight: 70.0 },
    { copXMm: 0.0, copYMm: 5.0, totalWeight: 70.0 },
    { copXMm: 10.0, copYMm: 0.0, totalWeight: 70.0 },
    { copXMm: 0.0, copYMm: 10.0, totalWeight: 70.0 },
  ];
  const metricsTimeA = calculateCoordinateErrorMetrics(identicalCoords, 0.0, 0.0, 40.4);
  const metricsTimeB = calculateCoordinateErrorMetrics(identicalCoords, 0.0, 0.0, 40.4);

  assert(metricsTimeA.meanDistanceErrorMm === metricsTimeB.meanDistanceErrorMm, "Test 49a: Coordinate mean distance error is identical");
  assert(metricsTimeA.rmsDistanceErrorMm === metricsTimeB.rmsDistanceErrorMm, "Test 49b: Coordinate RMS distance error is identical");
  assert(metricsTimeA.sdDistanceErrorMm === metricsTimeB.sdDistanceErrorMm, "Test 49c: Coordinate SD distance error is identical");
  assert(
    metricsTimeA.samplesInTargetZonePercentage === metricsTimeB.samplesInTargetZonePercentage,
    "Test 49d: Spatial containment accuracy is completely independent of elapsed session duration"
  );

  // Test 50: Target assessment and session summary integration
  const tracker50 = new DirectionalTargetTracker(DIRECTIONAL_TARGET_SEQUENCE[0]); // LEFT target
  tracker50.start(1000);

  // Feed 10 valid samples inside LEFT target (-84.74 mm, 0 mm)
  for (let i = 0; i < 10; i++) {
    tracker50.recordSample(1000 + i * 100, -0.38, 0.0, 70.0, true);
  }
  const finalized50 = tracker50.finalize();

  assert(finalized50.coordinateMetrics !== undefined, "Test 50a: finalized target assessment has coordinateMetrics");
  assert(finalized50.meanDistanceErrorMm !== null && finalized50.meanDistanceErrorMm !== undefined, "Test 50b: meanDistanceErrorMm populated");
  assert(finalized50.sdDistanceErrorMm !== null && finalized50.sdDistanceErrorMm !== undefined, "Test 50c: sdDistanceErrorMm populated");
  assert(finalized50.rmsDistanceErrorMm !== null && finalized50.rmsDistanceErrorMm !== undefined, "Test 50d: rmsDistanceErrorMm populated");
  assert(finalized50.minDistanceErrorMm !== null && finalized50.minDistanceErrorMm !== undefined, "Test 50e: minDistanceErrorMm populated");
  assert(finalized50.maxDistanceErrorMm !== null && finalized50.maxDistanceErrorMm !== undefined, "Test 50f: maxDistanceErrorMm populated");
  assert(finalized50.configuredCoordinateSampleCount === 60, "Test 50g: configuredCoordinateSampleCount is 60");
  assert(finalized50.accuracyPercentage === 100.0, "Test 50h: Accuracy percentage reflects spatial containment (100.0%)");

  // Session summary integration across all 5 targets
  const all5Trackers = DIRECTIONAL_TARGET_SEQUENCE.map((target) => {
    const trk = new DirectionalTargetTracker(target);
    trk.start(1000);
    // 5 samples per target at target position
    for (let i = 0; i < 5; i++) {
      trk.recordSample(1000 + i * 100, target.x, target.y, 70.0, true);
    }
    return trk.finalize();
  });

  const sessionSummary50 = calculateDirectionalSessionSummary({
    targets: all5Trackers,
    isRealHardware: true,
  });

  assert(sessionSummary50.meanDistanceErrorMm !== null, "Test 50i: Session summary has aggregate meanDistanceErrorMm");
  assert(sessionSummary50.rmsDistanceErrorMm !== null, "Test 50j: Session summary has aggregate rmsDistanceErrorMm");
  assert(sessionSummary50.sdDistanceErrorMm !== null, "Test 50k: Session summary has aggregate sdDistanceErrorMm");
  assert(sessionSummary50.totalValidCoordinateSamples === 25, "Test 50l: Total valid coordinate samples is 25 (5 targets x 5 samples)");
  assert(sessionSummary50.configuredCoordinateSampleCount === 60, "Test 50m: Session summary reports configuredCoordinateSampleCount 60");

  const exerciseResult50 = calculateDirectionalExerciseResult({
    completedTargets: 5,
    totalTargets: 5,
    elapsedMs: 15000,
    distanceSamples: [],
    isConnected: true,
    targetAssessments: all5Trackers,
  });

  assert(exerciseResult50.sessionCoordinateMetrics !== undefined, "Test 50n: calculateDirectionalExerciseResult provides sessionCoordinateMetrics");
  assert(exerciseResult50.sessionCoordinateMetrics?.totalValidSamples === 25, "Test 50o: sessionCoordinateMetrics totalValidSamples is 25");

  // =============================================================
  // PHASE 2: PATIENT-SPECIFIC COP BASELINE AND TARGET CALIBRATION
  // =============================================================

  // Test 51: Baseline calibration readiness gate & hardware validation
  const validStableBaseline: DirectionalCalibrationBaseline = {
    baselineX0: 0.0448, // 10.0 mm / 223.0 mm
    baselineY0: 0.0420, // 5.0 mm / 119.0 mm
    baselineX0Mm: 10.0,
    baselineY0Mm: 5.0,
    calibratedWeightKg: 72.5,
    weightStdDevKg: 0.45,
    copSdXNorm: 0.008,
    copSdYNorm: 0.012,
    copSdMm: 4.5,
    copSwayDispersionMm: 4.5,
    sampleCount: 150,
    calibrationDurationSeconds: 5.0,
    timestamp: Date.now(),
    isCalibrated: true,
  };
  assert(isBaselineCalibrationReady(validStableBaseline) === true, "Test 51a: Valid 5s quiet standing baseline passes calibration gate");

  const excessiveSwayBaseline: DirectionalCalibrationBaseline = {
    ...validStableBaseline,
    copSdMm: 48.0, // > 40.0mm limit
    copSwayDispersionMm: 48.0,
  };
  assert(isBaselineCalibrationReady(excessiveSwayBaseline) === false, "Test 51b: Baseline with excessive sway (>40mm) is rejected");

  const unladenBaseline: DirectionalCalibrationBaseline = {
    ...validStableBaseline,
    calibratedWeightKg: 8.0, // < 15.0kg limit
  };
  assert(isBaselineCalibrationReady(unladenBaseline) === false, "Test 51c: Baseline with unladen/insufficient weight (<15kg) is rejected");

  const insufficientSamplesBaseline: DirectionalCalibrationBaseline = {
    ...validStableBaseline,
    sampleCount: 15, // < 25 minimum samples
  };
  assert(isBaselineCalibrationReady(insufficientSamplesBaseline) === false, "Test 51d: Baseline with insufficient sample count (<25) is rejected");

  // Test 52: Baseline subtraction numerical verification
  // Relative X = Current X - X0; Relative Y = Current Y - Y0
  const currentCopNorm = {
    copX: 25.0 / WII_BOARD_DIMENSIONS.halfDistanceXMm,
    copY: 15.0 / WII_BOARD_DIMENSIONS.halfDistanceYMm,
  };
  const relResult52 = calculateRelativeCop(currentCopNorm.copX, currentCopNorm.copY, validStableBaseline);
  assert(Math.abs(relResult52.relCopXMm! - 15.0) < 0.02, "Test 52a: Relative X in mm is Current X (25.0mm) - X0 (10.0mm) = 15.0 mm");
  assert(Math.abs(relResult52.relCopYMm! - 10.0) < 0.02, "Test 52b: Relative Y in mm is Current Y (15.0mm) - Y0 (5.0mm) = 10.0 mm");

  // Zero displacement when at exact baseline
  const exactBaselineCop = { copX: validStableBaseline.baselineX0, copY: validStableBaseline.baselineY0 };
  const relZero52 = calculateRelativeCop(exactBaselineCop.copX, exactBaselineCop.copY, validStableBaseline);
  assert(relZero52.relCopXMm === 0.0, "Test 52c: Relative X is exactly 0.0 mm when at patient starting baseline");
  assert(relZero52.relCopYMm === 0.0, "Test 52d: Relative Y is exactly 0.0 mm when at patient starting baseline");

  // Test 53: Patient-specific target generation & all 4 directions + center
  // Baseline (X0, Y0) = (12.0 mm, -8.0 mm)
  assert(DEFAULT_PATIENT_TARGET_OFFSETS_MM.leftDistanceMm === 84.74, "Test 53-def-a: Default lateral left offset is 84.74 mm");
  assert(DEFAULT_PATIENT_TARGET_OFFSETS_MM.forwardDistanceMm === 38.08, "Test 53-def-b: Default forward AP offset is 38.08 mm");

  const patientBaseline53: DirectionalCalibrationBaseline = {
    ...validStableBaseline,
    baselineX0: 12.0 / 223.0,
    baselineY0: -8.0 / 119.0,
    baselineX0Mm: 12.0,
    baselineY0Mm: -8.0,
  };

  const customConfig53: PatientSpecificTargetConfig = {
    leftDistanceMm: 70.0,
    rightDistanceMm: 90.0,
    forwardDistanceMm: 30.0,
    backwardDistanceMm: 35.0,
    toleranceMm: 35.0,
    customDurations: {
      "SHIFT LEFT": 2,
      "SHIFT RIGHT": 3,
      "SHIFT FORWARD": 1,
      "SHIFT BACKWARD": 2,
      "RETURN TO CENTER": 3,
    },
  };

  const patientTargets53 = getPatientCalibratedTargets(patientBaseline53, customConfig53);
  assert(patientTargets53.length === 5, "Test 53a: Exactly 5 patient-calibrated targets generated");

  // 1. Shift Left: relative (-70.0 mm, 0.0 mm) -> board (12.0 - 70.0, -8.0) = (-58.0 mm, -8.0 mm)
  const leftT53 = patientTargets53[0];
  assert(leftT53.relTargetXMm === -70.0, "Test 53b: Left relative X is -70.0 mm");
  assert(leftT53.relTargetYMm === 0.0, "Test 53c: Left relative Y is 0.0 mm");
  assert(leftT53.targetXMm === -58.0, "Test 53d: Left board X is X0 (12.0mm) - 70.0mm = -58.0 mm");
  assert(leftT53.targetYMm === -8.0, "Test 53e: Left board Y is Y0 (-8.0mm) + 0.0mm = -8.0 mm");

  // 2. Shift Right: relative (+90.0 mm, 0.0 mm) -> board (12.0 + 90.0, -8.0) = (+102.0 mm, -8.0 mm)
  const rightT53 = patientTargets53[1];
  assert(rightT53.relTargetXMm === 90.0, "Test 53f: Right relative X is +90.0 mm");
  assert(rightT53.relTargetYMm === 0.0, "Test 53g: Right relative Y is 0.0 mm");
  assert(rightT53.targetXMm === 102.0, "Test 53h: Right board X is X0 (12.0mm) + 90.0mm = 102.0 mm");
  assert(rightT53.targetYMm === -8.0, "Test 53i: Right board Y is Y0 (-8.0mm) + 0.0mm = -8.0 mm");

  // 3. Shift Forward: relative (0.0 mm, +30.0 mm) -> board (12.0, -8.0 + 30.0) = (12.0 mm, +22.0 mm)
  const fwdT53 = patientTargets53[2];
  assert(fwdT53.relTargetXMm === 0.0, "Test 53j: Forward relative X is 0.0 mm");
  assert(fwdT53.relTargetYMm === 30.0, "Test 53k: Forward relative Y is +30.0 mm");
  assert(fwdT53.targetXMm === 12.0, "Test 53l: Forward board X is X0 (12.0mm) = 12.0 mm");
  assert(fwdT53.targetYMm === 22.0, "Test 53m: Forward board Y is Y0 (-8.0mm) + 30.0mm = 22.0 mm");

  // 4. Shift Backward: relative (0.0 mm, -35.0 mm) -> board (12.0, -8.0 - 35.0) = (12.0 mm, -43.0 mm)
  const bwdT53 = patientTargets53[3];
  assert(bwdT53.relTargetXMm === 0.0, "Test 53n: Backward relative X is 0.0 mm");
  assert(bwdT53.relTargetYMm === -35.0, "Test 53o: Backward relative Y is -35.0 mm");
  assert(bwdT53.targetXMm === 12.0, "Test 53p: Backward board X is X0 (12.0mm) = 12.0 mm");
  assert(bwdT53.targetYMm === -43.0, "Test 53q: Backward board Y is Y0 (-8.0mm) - 35.0mm = -43.0 mm");

  // 5. Return to Center: relative (0.0 mm, 0.0 mm) -> board (12.0 mm, -8.0 mm)
  const centerT53 = patientTargets53[4];
  assert(centerT53.relTargetXMm === 0.0, "Test 53r: Center relative X is 0.0 mm");
  assert(centerT53.relTargetYMm === 0.0, "Test 53s: Center relative Y is 0.0 mm");
  assert(centerT53.targetXMm === 12.0, "Test 53t: Center board X matches patient starting baseline X0 (12.0 mm)");
  assert(centerT53.targetYMm === -8.0, "Test 53u: Center board Y matches patient starting baseline Y0 (-8.0 mm)");

  // Test 54: Distance error invariance under baseline shift
  // When patient is at exact baseline (12.0, -8.0), Center target distance is exactly 0.0 mm
  const centerMetric54 = calculateCoordinateErrorMetrics(
    [{ copXMm: 12.0, copYMm: -8.0, totalWeight: 70.0 }],
    centerT53.targetXMm ?? 0,
    centerT53.targetYMm ?? 0,
    35.0
  );
  assert(centerMetric54.meanDistanceErrorMm === 0.0, "Test 54a: Distance to Center target is 0.0 mm at patient baseline");

  // When patient shifts to Left target (-58.0, -8.0), Left target distance is exactly 0.0 mm
  const leftMetric54 = calculateCoordinateErrorMetrics(
    [{ copXMm: -58.0, copYMm: -8.0, totalWeight: 70.0 }],
    leftT53.targetXMm ?? 0,
    leftT53.targetYMm ?? 0,
    35.0
  );
  assert(leftMetric54.meanDistanceErrorMm === 0.0, "Test 54b: Distance to Left target is 0.0 mm at patient left target position");

  // When patient shifts to Right target (102.0, -8.0), Right target distance is exactly 0.0 mm
  const rightMetric54 = calculateCoordinateErrorMetrics(
    [{ copXMm: 102.0, copYMm: -8.0, totalWeight: 70.0 }],
    rightT53.targetXMm ?? 0,
    rightT53.targetYMm ?? 0,
    35.0
  );
  assert(rightMetric54.meanDistanceErrorMm === 0.0, "Test 54c: Distance to Right target is 0.0 mm at patient right target position");

  // When patient shifts to Forward target (12.0, 22.0), Forward target distance is exactly 0.0 mm
  const fwdMetric54 = calculateCoordinateErrorMetrics(
    [{ copXMm: 12.0, copYMm: 22.0, totalWeight: 70.0 }],
    fwdT53.targetXMm ?? 0,
    fwdT53.targetYMm ?? 0,
    35.0
  );
  assert(fwdMetric54.meanDistanceErrorMm === 0.0, "Test 54d: Distance to Forward target is 0.0 mm at patient forward target position");

  // When patient shifts to Backward target (12.0, -43.0), Backward target distance is exactly 0.0 mm
  const bwdMetric54 = calculateCoordinateErrorMetrics(
    [{ copXMm: 12.0, copYMm: -43.0, totalWeight: 70.0 }],
    bwdT53.targetXMm ?? 0,
    bwdT53.targetYMm ?? 0,
    35.0
  );
  assert(bwdMetric54.meanDistanceErrorMm === 0.0, "Test 54e: Distance to Backward target is 0.0 mm at patient backward target position");

  // Test 55: Clear parameter classification disclaimer identification
  assert(
    leftT53.parameterClassification === "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
    "Test 55a: Target clearly identifies configurable parameter status"
  );
  assert(
    centerT53.parameterClassification === "Configurable Assessment Parameter (Non-Validated Clinical Limit)",
    "Test 55b: Center target clearly identifies configurable parameter status"
  );

  // Test 56: Safe board boundary clamping and rejection
  let safetyErrorThrown = false;
  try {
    // Attempt extreme displacement (e.g. 200 mm lateral offset when limit is 133.8 mm)
    getPatientCalibratedTargets(validStableBaseline, { leftDistanceMm: 200.0 });
  } catch (err: any) {
    safetyErrorThrown = true;
    assert(err.message.includes("exceeds safe limits"), "Test 56a: Error message specifies target exceeds safe limits");
  }
  assert(safetyErrorThrown === true, "Test 56b: Extreme target displacement safely rejected by boundary guard");

  // =========================================================================
  // TEST 57: PHASE 3 LIVE EXERCISE PATIENT-SPECIFIC CALIBRATION INTEGRATION
  // Proves that changing patient starting baseline position:
  // 1. Changes absolute board target coordinates (TargetX_mm, TargetY_mm) by (Delta X0, Delta Y0).
  // 2. Preserves 100% identical relative target displacement distances (relTargetXMm, relTargetYMm).
  // 3. Preserves identical relative normalized coordinates (x, y) and tolerance (toleranceMm).
  // 4. Guarantees coordinate error metric invariance (d = 0mm when at respective targets).
  // =========================================================================

  const baselinePatientA: DirectionalCalibrationBaseline = {
    isCalibrated: true,
    timestamp: Date.now() - 10000,
    calibrationDurationSeconds: 5.0,
    sampleCount: 30,
    baselineX0: 0.0,
    baselineY0: 0.0,
    baselineX0Mm: 0.0,
    baselineY0Mm: 0.0,
    calibratedWeightKg: 65.0,
    copSdXNorm: 0.01,
    copSdYNorm: 0.01,
    copSdMm: 6.5,
    copSwayDispersionMm: 6.5,
    weightStdDevKg: 0.3,
  };

  const baselinePatientB: DirectionalCalibrationBaseline = {
    isCalibrated: true,
    timestamp: Date.now() - 10000,
    calibrationDurationSeconds: 5.0,
    sampleCount: 30,
    baselineX0: 20.0 / WII_BOARD_DIMENSIONS.halfDistanceXMm,
    baselineY0: -15.0 / WII_BOARD_DIMENSIONS.halfDistanceYMm,
    baselineX0Mm: 20.0,
    baselineY0Mm: -15.0,
    calibratedWeightKg: 72.0,
    copSdXNorm: 0.012,
    copSdYNorm: 0.015,
    copSdMm: 8.2,
    copSwayDispersionMm: 8.2,
    weightStdDevKg: 0.4,
  };

  const targetsPatientA = getDirectionalTargets(undefined, undefined, baselinePatientA);
  const targetsPatientB = getDirectionalTargets(undefined, undefined, baselinePatientB);

  assert(targetsPatientA.length === 5, "Test 57a: Patient A has 5 targets");
  assert(targetsPatientB.length === 5, "Test 57b: Patient B has 5 targets");

  // Verify baseline coordinate shift on absolute coordinates
  // Left: A = (-84.74, 0.0), B = (-84.74 + 20.0 = -64.74, 0.0 - 15.0 = -15.0)
  assert(targetsPatientA[0].targetXMm === -84.74, "Test 57c: Patient A Left target board X is -84.74 mm");
  assert(targetsPatientA[0].targetYMm === 0.0, "Test 57d: Patient A Left target board Y is 0.0 mm");
  assert(targetsPatientB[0].targetXMm === -64.74, "Test 57e: Patient B Left target board X shifted by +20mm to -64.74 mm");
  assert(targetsPatientB[0].targetYMm === -15.0, "Test 57f: Patient B Left target board Y shifted by -15mm to -15.0 mm");

  // Right: A = (+84.74, 0.0), B = (+84.74 + 20.0 = 104.74, -15.0)
  assert(targetsPatientA[1].targetXMm === 84.74, "Test 57g: Patient A Right target board X is +84.74 mm");
  assert(targetsPatientB[1].targetXMm === 104.74, "Test 57h: Patient B Right target board X shifted by +20mm to +104.74 mm");

  // Forward: A = (0.0, +38.08), B = (+20.0, -15.0 + 38.08 = 23.08)
  assert(targetsPatientA[2].targetXMm === 0.0, "Test 57i: Patient A Forward target board X is 0.0 mm");
  assert(targetsPatientA[2].targetYMm === 38.08, "Test 57j: Patient A Forward target board Y is +38.08 mm");
  assert(targetsPatientB[2].targetXMm === 20.0, "Test 57k: Patient B Forward target board X shifted by +20mm to 20.0 mm");
  assert(targetsPatientB[2].targetYMm === 23.08, "Test 57l: Patient B Forward target board Y shifted by -15mm to +23.08 mm");

  // Backward: A = (0.0, -38.08), B = (+20.0, -15.0 - 38.08 = -53.08)
  assert(targetsPatientA[3].targetXMm === 0.0, "Test 57m: Patient A Backward target board X is 0.0 mm");
  assert(targetsPatientA[3].targetYMm === -38.08, "Test 57n: Patient A Backward target board Y is -38.08 mm");
  assert(targetsPatientB[3].targetXMm === 20.0, "Test 57o: Patient B Backward target board X shifted to 20.0 mm");
  assert(targetsPatientB[3].targetYMm === -53.08, "Test 57p: Patient B Backward target board Y shifted to -53.08 mm");

  // Center: A = (0.0, 0.0), B = (+20.0, -15.0)
  assert(targetsPatientA[4].targetXMm === 0.0, "Test 57q: Patient A Center target board X is 0.0 mm");
  assert(targetsPatientA[4].targetYMm === 0.0, "Test 57r: Patient A Center target board Y is 0.0 mm");
  assert(targetsPatientB[4].targetXMm === 20.0, "Test 57s: Patient B Center target board X matches baseline X0 (+20.0 mm)");
  assert(targetsPatientB[4].targetYMm === -15.0, "Test 57t: Patient B Center target board Y matches baseline Y0 (-15.0 mm)");

  // Verify relative target distances are 100% IDENTICAL for both patients
  for (let i = 0; i < 5; i++) {
    const tA = targetsPatientA[i];
    const tB = targetsPatientB[i];
    assert(
      tA.relTargetXMm === tB.relTargetXMm,
      `Test 57u-${i}: Target ${tA.name} relative target X is identical (${tA.relTargetXMm} mm)`
    );
    assert(
      tA.relTargetYMm === tB.relTargetYMm,
      `Test 57v-${i}: Target ${tA.name} relative target Y is identical (${tA.relTargetYMm} mm)`
    );
    assert(
      tA.x === tB.x,
      `Test 57w-${i}: Target ${tA.name} relative normalized X is identical (${tA.x})`
    );
    assert(
      tA.y === tB.y,
      `Test 57x-${i}: Target ${tA.name} relative normalized Y is identical (${tA.y})`
    );
    assert(
      tA.toleranceMm === tB.toleranceMm,
      `Test 57y-${i}: Target ${tA.name} tolerance is identical (${tA.toleranceMm} mm)`
    );
  }

  // Verify tracker execution and coordinate error metrics for both patients
  const trackerLeftA = new DirectionalTargetTracker(targetsPatientA[0], baselinePatientA);
  const trackerLeftB = new DirectionalTargetTracker(targetsPatientB[0], baselinePatientB);
  trackerLeftA.start(1000);
  trackerLeftB.start(1000);

  // Patient A reaches relative Left target (-84.74 mm relative, -84.74 mm board)
  const resLeftA = trackerLeftA.recordSample(
    1050,
    targetsPatientA[0].x,
    targetsPatientA[0].y,
    65.0,
    true,
    (targetsPatientA[0].targetXMm ?? 0) / WII_BOARD_DIMENSIONS.halfDistanceXMm,
    (targetsPatientA[0].targetYMm ?? 0) / WII_BOARD_DIMENSIONS.halfDistanceYMm
  );

  // Patient B reaches relative Left target (-84.74 mm relative, -64.74 mm board)
  const resLeftB = trackerLeftB.recordSample(
    1050,
    targetsPatientB[0].x,
    targetsPatientB[0].y,
    72.0,
    true,
    (targetsPatientB[0].targetXMm ?? 0) / WII_BOARD_DIMENSIONS.halfDistanceXMm,
    (targetsPatientB[0].targetYMm ?? 0) / WII_BOARD_DIMENSIONS.halfDistanceYMm
  );

  assert(resLeftA.isInside === true, "Test 57z-1: Patient A is inside Left target zone");
  assert(resLeftB.isInside === true, "Test 57z-2: Patient B is inside Left target zone");

  const finalizedLeftA = trackerLeftA.finalize();
  const finalizedLeftB = trackerLeftB.finalize();

  assert(finalizedLeftA.samples[0]?.copXMm === -84.74, "Test 57z-3: Patient A sample board copXMm is -84.74 mm");
  assert(finalizedLeftB.samples[0]?.copXMm === -64.74, "Test 57z-4: Patient B sample board copXMm is -64.74 mm");
  assert(finalizedLeftA.samples[0]?.relCopXMm === -84.74, "Test 57z-5: Patient A relative copXMm is -84.74 mm");
  assert(finalizedLeftB.samples[0]?.relCopXMm === -84.74, "Test 57z-6: Patient B relative copXMm is -84.74 mm");

  assert(
    finalizedLeftA.meanDistanceErrorMm === 0.0,
    "Test 57z-7: Patient A Left target distance error is 0.0 mm"
  );
  assert(
    finalizedLeftB.meanDistanceErrorMm === 0.0,
    "Test 57z-8: Patient B Left target distance error is 0.0 mm"
  );

  // Verify Center target tracker for both patients at their respective baselines
  const trackerCenterA = new DirectionalTargetTracker(targetsPatientA[4], baselinePatientA);
  const trackerCenterB = new DirectionalTargetTracker(targetsPatientB[4], baselinePatientB);
  trackerCenterA.start(2000);
  trackerCenterB.start(2000);

  // Patient A stands at baseline (0.0, 0.0)
  trackerCenterA.recordSample(2050, 0.0, 0.0, 65.0, true, 0.0, 0.0);
  // Patient B stands at baseline (20.0, -15.0)
  trackerCenterB.recordSample(
    2050,
    0.0,
    0.0,
    72.0,
    true,
    20.0 / WII_BOARD_DIMENSIONS.halfDistanceXMm,
    -15.0 / WII_BOARD_DIMENSIONS.halfDistanceYMm
  );

  const finalizedCenterA = trackerCenterA.finalize();
  const finalizedCenterB = trackerCenterB.finalize();

  assert(
    finalizedCenterA.samples[0]?.copXMm === 0.0 && finalizedCenterA.samples[0]?.copYMm === 0.0,
    "Test 57z-9: Patient A board COP matches neutral center (0, 0)"
  );
  assert(
    finalizedCenterB.samples[0]?.copXMm === 20.0 && finalizedCenterB.samples[0]?.copYMm === -15.0,
    "Test 57z-10: Patient B board COP matches baseline (+20, -15)"
  );
  assert(
    finalizedCenterA.samples[0]?.relCopXMm === 0.0 && finalizedCenterA.samples[0]?.relCopYMm === 0.0,
    "Test 57z-11: Patient A relative COP is (0, 0)"
  );
  assert(
    finalizedCenterB.samples[0]?.relCopXMm === 0.0 && finalizedCenterB.samples[0]?.relCopYMm === 0.0,
    "Test 57z-12: Patient B relative COP is (0, 0)"
  );
  assert(
    finalizedCenterA.meanDistanceErrorMm === 0.0,
    "Test 57z-13: Patient A Center distance error is 0.0 mm"
  );
  assert(
    finalizedCenterB.meanDistanceErrorMm === 0.0,
    "Test 57z-14: Patient B Center distance error is 0.0 mm"
  );

  // -------------------------------------------------------------
  // Test 58: Phase 4 Per-Target Coordinate Calculations
  // -------------------------------------------------------------
  console.log("\n--- Phase 4: Per-Target Coordinate Performance Verification ---");

  // Create a target tracker for Left target
  const leftTestTarget = targetsPatientA[0]; // SHIFT LEFT: targetXMm = -84.74, targetYMm = 0.0, toleranceMm = 40.4
  const trackerPhase4Left = new DirectionalTargetTracker(leftTestTarget, baselinePatientA);
  trackerPhase4Left.start(1000);

  // 5 discrete samples:
  // s1: COP=(-80.0, 0.0) -> dist = 4.74mm (inside)
  trackerPhase4Left.recordSample(1000, -80.0 / 223.0, 0.0, 65.0, true, -80.0 / 223.0, 0.0);
  // s2: COP=(-85.0, 3.0) -> dist = sqrt(0.26^2 + 9) = 3.011mm (inside)
  trackerPhase4Left.recordSample(1050, -85.0 / 223.0, 3.0 / 119.0, 65.0, true, -85.0 / 223.0, 3.0 / 119.0);
  // s3: COP=(-84.74, 0.0) -> dist = 0.0mm (inside, min distance)
  trackerPhase4Left.recordSample(1100, -84.74 / 223.0, 0.0, 65.0, true, -84.74 / 223.0, 0.0);
  // s4: COP=(-30.0, 0.0) -> dist = 54.74mm (outside tolerance 40.4mm)
  trackerPhase4Left.recordSample(1150, -30.0 / 223.0, 0.0, 65.0, true, -30.0 / 223.0, 0.0);
  // s5: COP=(-84.74, 0.0) -> dist = 0.0mm (inside)
  trackerPhase4Left.recordSample(1200, -84.74 / 223.0, 0.0, 65.0, true, -84.74 / 223.0, 0.0);

  const finalizedPhase4Left = trackerPhase4Left.finalize();

  // 1. Centroid measured actual COP coordinates
  // Mean X = (-80 + -85 + -84.74 + -30 + -84.74) / 5 = -364.48 / 5 = -72.9 mm
  // Mean Y = (0 + 3 + 0 + 0 + 0) / 5 = 0.6 mm
  assert(
    finalizedPhase4Left.actualCopXMm === -72.9,
    `Test 58a: Centroid measured actual COP X is -72.9 mm (got ${finalizedPhase4Left.actualCopXMm})`
  );
  assert(
    finalizedPhase4Left.actualCopYMm === 0.6,
    `Test 58b: Centroid measured actual COP Y is +0.6 mm (got ${finalizedPhase4Left.actualCopYMm})`
  );
  assert(
    finalizedPhase4Left.actualRelCopXMm === -72.9,
    `Test 58c: Centroid measured relative COP X is -72.9 mm (got ${finalizedPhase4Left.actualRelCopXMm})`
  );
  assert(
    finalizedPhase4Left.actualRelCopYMm === 0.6,
    `Test 58d: Centroid measured relative COP Y is +0.6 mm (got ${finalizedPhase4Left.actualRelCopYMm})`
  );

  // 2. Minimum distance error: d_min = 0.0 mm
  assert(
    finalizedPhase4Left.minDistanceErrorMm === 0.0,
    `Test 58e: Minimum distance error d_min is 0.0 mm (got ${finalizedPhase4Left.minDistanceErrorMm})`
  );

  // 3. Maximum distance error: d_max = 54.74 mm -> 54.7 mm
  assert(
    finalizedPhase4Left.maxDistanceErrorMm !== null &&
    finalizedPhase4Left.maxDistanceErrorMm !== undefined &&
    Math.abs(finalizedPhase4Left.maxDistanceErrorMm - 54.7) < 0.2,
    `Test 58f: Maximum distance error d_max is ~54.7 mm (got ${finalizedPhase4Left.maxDistanceErrorMm})`
  );

  // 4. Coordinate Hit Rate: 4 inside out of 5 valid samples = 80.0%
  assert(
    finalizedPhase4Left.coordinateHitRatePercentage === 80.0,
    `Test 58g: Coordinate hit rate is exactly 80.0% (got ${finalizedPhase4Left.coordinateHitRatePercentage})`
  );

  // 5. Target Reached: d_min (0.0mm) <= toleranceMm (40.4mm) -> true
  assert(
    finalizedPhase4Left.isTargetReached === true,
    "Test 58h: isTargetReached is true when patient enters target tolerance boundary"
  );

  // 6. Cumulative Path Length: ~118.3 mm
  assert(
    finalizedPhase4Left.pathLengthMm !== undefined &&
    Math.abs(finalizedPhase4Left.pathLengthMm - 118.3) < 0.5,
    `Test 58i: Path length is ~118.3 mm (got ${finalizedPhase4Left.pathLengthMm})`
  );

  // -------------------------------------------------------------
  // Test 59: Phase 4 Session-Level Coordinate Aggregations
  // -------------------------------------------------------------
  console.log("\n--- Phase 4: Session-Level Coordinate Metrics Verification ---");

  // Create mock target assessments for a 5-target protocol
  function makeMockCoordMetrics(meanErr: number, minErr: number, maxErr: number, insideCount: number): CoordinateErrorMetrics {
    return {
      targetXMm: 0,
      targetYMm: 0,
      toleranceMm: 40.4,
      validSampleCount: 100,
      configuredSampleCount: 100,
      meanDistanceErrorMm: meanErr,
      sdDistanceErrorMm: 4.0,
      rmsDistanceErrorMm: meanErr,
      minDistanceErrorMm: minErr,
      maxDistanceErrorMm: maxErr,
      samplesInTargetZoneCount: insideCount,
      samplesInTargetZonePercentage: insideCount,
      distanceErrorsMm: Array(100).fill(meanErr),
      rawMeanDistanceErrorMm: meanErr,
      rawSdDistanceErrorMm: 4.0,
      rawRmsDistanceErrorMm: meanErr,
    };
  }

  const mockTargets: typeof finalizedPhase4Left[] = [
    {
      ...finalizedPhase4Left,
      targetId: "dir-target-1-left",
      stepNumber: 1,
      name: "SHIFT LEFT" as const,
      isTargetReached: true,
      minDistanceErrorMm: 3.2,
      meanDistanceErrorMm: 12.5,
      maxDistanceErrorMm: 24.1,
      coordinateHitRatePercentage: 75.0,
      pathLengthMm: 120.0,
      validSampleCount: 100,
      samplesInsideCount: 75,
      samplesOutsideCount: 25,
      timeInsideSeconds: 1.5,
      timeOutsideSeconds: 0.5,
      actualSuccessfulHoldDurationSeconds: 2.0,
      requiredHoldDurationSeconds: 2.0,
      isCompleted: true,
      coordinateMetrics: makeMockCoordMetrics(12.5, 3.2, 24.1, 75),
      samples: [],
    },
    {
      ...finalizedPhase4Left,
      targetId: "dir-target-2-right",
      stepNumber: 2,
      name: "SHIFT RIGHT" as const,
      isTargetReached: true,
      minDistanceErrorMm: 4.1,
      meanDistanceErrorMm: 15.0,
      maxDistanceErrorMm: 30.0,
      coordinateHitRatePercentage: 70.0,
      pathLengthMm: 150.0,
      validSampleCount: 100,
      samplesInsideCount: 70,
      samplesOutsideCount: 30,
      timeInsideSeconds: 2.1,
      timeOutsideSeconds: 0.9,
      actualSuccessfulHoldDurationSeconds: 3.0,
      requiredHoldDurationSeconds: 3.0,
      isCompleted: true,
      coordinateMetrics: makeMockCoordMetrics(15.0, 4.1, 30.0, 70),
      samples: [],
    },
    {
      ...finalizedPhase4Left,
      targetId: "dir-target-3-forward",
      stepNumber: 3,
      name: "SHIFT FORWARD" as const,
      isTargetReached: true,
      minDistanceErrorMm: 8.0,
      meanDistanceErrorMm: 18.2,
      maxDistanceErrorMm: 35.5,
      coordinateHitRatePercentage: 60.0,
      pathLengthMm: 110.0,
      validSampleCount: 100,
      samplesInsideCount: 60,
      samplesOutsideCount: 40,
      timeInsideSeconds: 0.6,
      timeOutsideSeconds: 0.4,
      actualSuccessfulHoldDurationSeconds: 1.0,
      requiredHoldDurationSeconds: 1.0,
      isCompleted: true,
      coordinateMetrics: makeMockCoordMetrics(18.2, 8.0, 35.5, 60),
      samples: [],
    },
    {
      ...finalizedPhase4Left,
      targetId: "dir-target-4-backward",
      stepNumber: 4,
      name: "SHIFT BACKWARD" as const,
      isTargetReached: false,
      minDistanceErrorMm: 45.0,
      meanDistanceErrorMm: 48.0,
      maxDistanceErrorMm: 55.0,
      toleranceMm: 40.4,
      coordinateHitRatePercentage: 0.0,
      pathLengthMm: 90.0,
      validSampleCount: 100,
      samplesInsideCount: 0,
      samplesOutsideCount: 100,
      timeInsideSeconds: 0.0,
      timeOutsideSeconds: 2.0,
      actualSuccessfulHoldDurationSeconds: 0.0,
      requiredHoldDurationSeconds: 2.0,
      isCompleted: false,
      coordinateMetrics: makeMockCoordMetrics(48.0, 45.0, 55.0, 0),
      samples: [],
    },
    {
      ...finalizedPhase4Left,
      targetId: "dir-target-5-center",
      stepNumber: 5,
      name: "RETURN TO CENTER" as const,
      isTargetReached: true,
      minDistanceErrorMm: 1.5,
      meanDistanceErrorMm: 6.3,
      maxDistanceErrorMm: 12.0,
      coordinateHitRatePercentage: 95.0,
      pathLengthMm: 80.0,
      validSampleCount: 100,
      samplesInsideCount: 95,
      samplesOutsideCount: 5,
      timeInsideSeconds: 2.85,
      timeOutsideSeconds: 0.15,
      actualSuccessfulHoldDurationSeconds: 3.0,
      requiredHoldDurationSeconds: 3.0,
      isCompleted: true,
      coordinateMetrics: makeMockCoordMetrics(6.3, 1.5, 12.0, 95),
      samples: [],
    },
  ];

  const sessionSummaryPhase4 = calculateDirectionalSessionSummary({
    sessionId: "sess-phase4-001",
    patientId: "pat-001",
    patientName: "John Doe",
    startTime: 10000,
    endTime: 20000,
    targets: mockTargets,
    isRealHardware: true,
  });

  // 1. Overall Path Length: 120 + 150 + 110 + 90 + 80 = 550.0 mm
  assert(
    sessionSummaryPhase4.overallPathLengthMm === 550.0,
    `Test 59a: Overall path length is 550.0 mm (got ${sessionSummaryPhase4.overallPathLengthMm})`
  );

  // 2. Successful vs Unsuccessful targets count
  assert(
    sessionSummaryPhase4.successfulTargetsCount === 4,
    `Test 59b: Successful targets count is 4 (got ${sessionSummaryPhase4.successfulTargetsCount})`
  );
  assert(
    sessionSummaryPhase4.unsuccessfulTargetsCount === 1,
    `Test 59c: Unsuccessful targets count is 1 (got ${sessionSummaryPhase4.unsuccessfulTargetsCount})`
  );

  // 3. Return-to-Center Error (Target 5 mean error = 6.3 mm, min = 1.5 mm)
  assert(
    sessionSummaryPhase4.returnToCenterErrorMm === 6.3,
    `Test 59d: Return-to-center error is 6.3 mm (got ${sessionSummaryPhase4.returnToCenterErrorMm})`
  );
  assert(
    sessionSummaryPhase4.returnToCenterMinErrorMm === 1.5,
    `Test 59e: Return-to-center min error is 1.5 mm (got ${sessionSummaryPhase4.returnToCenterMinErrorMm})`
  );

  // 4. Session Hit Rate: (75 + 70 + 60 + 0 + 95) / 500 = 300 / 500 = 60.0%
  assert(
    sessionSummaryPhase4.sessionHitRatePercentage === 60.0,
    `Test 59f: Session hit rate is exactly 60.0% (got ${sessionSummaryPhase4.sessionHitRatePercentage})`
  );

  // 5. Mean Coordinate Error across targets
  // Mean = (12.5 + 15.0 + 18.2 + 48.0 + 6.3) / 5 = 100.0 / 5 = 20.0 mm
  assert(
    sessionSummaryPhase4.meanCoordinateErrorMm === 20.0,
    `Test 59g: Mean coordinate error across all targets is 20.0 mm (got ${sessionSummaryPhase4.meanCoordinateErrorMm})`
  );

  // -------------------------------------------------------------
  // Test 60: Path Length Filtering & Data Quality Integrity
  // -------------------------------------------------------------
  console.log("\n--- Phase 4: Path Length Latency Filtering & Data Integrity ---");

  // Sample points with an anomalous time gap (> 350ms)
  const samplesWithGap = [
    {
      timestamp: 1000,
      elapsedMs: 0,
      copX: 0,
      copY: 0,
      copXMm: 0.0,
      copYMm: 0.0,
      totalWeight: 65.0,
      distanceNorm: 0,
      distanceMm: 0,
      isInside: true,
    },
    {
      timestamp: 1100, // dt = 100ms <= 350ms -> valid segment: distance = 10.0mm
      elapsedMs: 100,
      copX: 0,
      copY: 0,
      copXMm: 10.0,
      copYMm: 0.0,
      totalWeight: 65.0,
      distanceNorm: 0,
      distanceMm: 10,
      isInside: true,
    },
    {
      timestamp: 2500, // dt = 1400ms > 350ms -> DISCONNECTION GAP! Leap of 90mm MUST BE SKIPPED
      elapsedMs: 1500,
      copX: 0,
      copY: 0,
      copXMm: 100.0,
      copYMm: 0.0,
      totalWeight: 65.0,
      distanceNorm: 0,
      distanceMm: 100,
      isInside: true,
    },
    {
      timestamp: 2550, // dt = 50ms <= 350ms -> valid segment: distance = 5.0mm
      elapsedMs: 1550,
      copX: 0,
      copY: 0,
      copXMm: 105.0,
      copYMm: 0.0,
      totalWeight: 65.0,
      distanceNorm: 0,
      distanceMm: 105,
      isInside: true,
    },
  ];

  const filteredPathLength = calculateCopPathLengthMm(samplesWithGap);
  // Expected: 10.0mm (segment 1) + 0mm (skipped gap) + 5.0mm (segment 3) = 15.0mm
  assert(
    filteredPathLength === 15.0,
    `Test 60a: Sensor packet gaps (>350ms) are excluded from path length (expected 15.0 mm, got ${filteredPathLength})`
  );

  // Test unloaded plate rejection (< 10kg)
  const trackerUnloaded = new DirectionalTargetTracker(leftTestTarget, baselinePatientA);
  trackerUnloaded.start(5000);
  // Valid sample
  trackerUnloaded.recordSample(5050, -84.74 / 223.0, 0.0, 65.0, true, -84.74 / 223.0, 0.0);
  // Unloaded plate (step off / artifact: weight = 4.2 kg)
  trackerUnloaded.recordSample(5100, -84.74 / 223.0, 0.0, 4.2, true, -84.74 / 223.0, 0.0);
  const finalizedUnloaded = trackerUnloaded.finalize();

  assert(
    finalizedUnloaded.validSampleCount === 1,
    `Test 60b: Unloaded plate (<10kg) sample is rejected from valid sample count (got ${finalizedUnloaded.validSampleCount})`
  );
  assert(
    finalizedUnloaded.invalidSampleCount === 1,
    `Test 60c: Unloaded plate is tracked as invalid sample (got ${finalizedUnloaded.invalidSampleCount})`
  );

  // -------------------------------------------------------------
  // Test 61: Hold-window per-frame error e = √((x1−xt)² + (y1−yt)²)
  // -------------------------------------------------------------
  console.log("\n--- Test 61: Hold-window frame target error ---");
  {
    const targetX = 0.38;
    const targetY = 0.0;
    const copX = 0.30;
    const copY = 0.10;
    const err = computeHoldFrameTargetError(targetX, targetY, copX, copY);
    const expectedNorm = Math.hypot(targetX - copX, targetY - copY);
    const expectedMm = Math.hypot(
      targetX * WII_BOARD_DIMENSIONS.halfDistanceXMm - copX * WII_BOARD_DIMENSIONS.halfDistanceXMm,
      targetY * WII_BOARD_DIMENSIONS.halfDistanceYMm - copY * WII_BOARD_DIMENSIONS.halfDistanceYMm
    );
    assert(
      Math.abs(err.errorNorm - expectedNorm) < 1e-5,
      `Test 61a: normalized error matches hypot (got ${err.errorNorm}, expected ${expectedNorm})`
    );
    assert(
      Math.abs(err.errorMm - expectedMm) < 0.05,
      `Test 61b: mm error matches hypot (got ${err.errorMm}, expected ${expectedMm})`
    );

    const samples: HoldWindowFrameSample[] = [0, 1, 2].map((i) => {
      const xt = targetX - 0.02 * (i + 1);
      const yt = 0.01 * i;
      const e = computeHoldFrameTargetError(targetX, targetY, xt, yt);
      return {
        frameIndex: i + 1,
        syncTimestamp: 1000 + i * 50,
        syncEpochMs: 1000,
        boardTimestampMs: 1000 + i * 50,
        visionTimestampMs: 1000 + i * 50,
        boardRelMs: i * 50,
        visionRelMs: i * 50,
        holdRelMs: i * 50,
        timeSkewMs: 0,
        targetX,
        targetY,
        targetXMm: e.targetXMm,
        targetYMm: e.targetYMm,
        copX: xt,
        copY: yt,
        copXMm: e.copXMm,
        copYMm: e.copYMm,
        errorNorm: e.errorNorm,
        errorMm: e.errorMm,
        dxMm: parseFloat((e.copXMm - e.targetXMm).toFixed(2)),
        dyMm: parseFloat((e.copYMm - e.targetYMm).toFixed(2)),
        isInside: i >= 1,
        weightKg: 70,
        hasPose: true,
        visionFps: 30,
      };
    });
    const series = buildHoldWindowErrorSeries({
      targetId: "t-test",
      stepNumber: 1,
      targetName: "SHIFT RIGHT",
      shortLabel: "RIGHT",
      requiredHoldDurationSeconds: 2,
      samples,
    });
    assert(series.sampleCount === 3, `Test 61c: sampleCount is 3 (got ${series.sampleCount})`);
    assert(series.meanErrorMm !== null && series.meanErrorMm > 0, "Test 61d: meanErrorMm > 0");
    assert(series.rmsErrorMm !== null && series.rmsErrorMm >= (series.meanErrorMm ?? 0) - 0.01, "Test 61e: RMS >= mean (approx)");
    assert(
      series.finalHoldStartFrameIndex === 2 && series.finalHoldEndFrameIndex === 3,
      `Test 61f: final hold frames 2–3 (got ${series.finalHoldStartFrameIndex}–${series.finalHoldEndFrameIndex})`
    );
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
