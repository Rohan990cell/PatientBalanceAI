import {
  SAFE_BOARD_BOUNDS,
  generateSafeTargets,
  calculateCopDistance,
  isCopTargetReached,
  getDirectionGuidance,
  getCurrentCopDirectionText,
  evaluateDataSourceStatus,
  shouldGenerateClinicalScore,
  calculateCopExerciseResult,
  CopTarget,
} from "./copTargetExercise";
import { EXERCISE_LIBRARY, evaluateSensorReadiness } from "../services/exercise/exerciseLibrary";
import { generateSimulatedMeasurement } from "./copMapping";

function runTests() {
  console.log("=================================================================");
  console.log("=== PHASE A: WEDNESDAY DEMO EXERCISE 1 TEST SUITE ===");
  console.log("=== WEIGHT SHIFT — COP TARGET (BALANCE BOARD ONLY) ===");
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
  // Test 1: Exercise starts correctly
  // -------------------------------------------------------------
  const exercise = EXERCISE_LIBRARY.find((e) => e.id === "weight-shift-cop-target");
  assert(Boolean(exercise), "Test 1a: Exercise definition 'weight-shift-cop-target' exists in EXERCISE_LIBRARY");
  assert(exercise?.name === "Weight Shift — COP Target", "Test 1b: Exercise title matches 'Weight Shift — COP Target'");
  assert(exercise?.steps.length === 5, "Test 1c: Exercise contains 5 defined steps for targets");
  const targets = generateSafeTargets();
  assert(targets.length === 5, "Test 1d: Target generator generates 5 targets starting at Center");
  assert(targets[0].name === "CENTER", "Test 1e: First target is CENTER");

  // -------------------------------------------------------------
  // Test 2: Camera is not required
  // -------------------------------------------------------------
  assert(exercise?.sensorRequirements.requiresWebcam === false, "Test 2a: requiresWebcam is strictly false");
  assert(exercise?.requiredVisionSignals.length === 0, "Test 2b: requiredVisionSignals is empty (no pose/face dependency)");

  // Readiness evaluation with Camera OFF and Balance Board ON
  const readinessBoardOnly = evaluateSensorReadiness(exercise!, {
    webcam: false,
    balanceBoard: true,
    isSimulated: false,
  });
  assert(readinessBoardOnly.isReady === true, "Test 2c: Sensor readiness is READY when Camera is OFF and Wii Board is ON");
  assert(readinessBoardOnly.blockerMessage === undefined, "Test 2d: No blocker message generated for disabled camera");
  assert(readinessBoardOnly.sessionMode === "BALANCE_ONLY", "Test 2e: Session mode correctly classified as BALANCE_ONLY");

  // -------------------------------------------------------------
  // Test 3: Target generation stays within safe bounds
  // -------------------------------------------------------------
  let allTargetsWithinSafeBounds = true;
  for (const t of targets) {
    const withinX = t.x >= SAFE_BOARD_BOUNDS.minX && t.x <= SAFE_BOARD_BOUNDS.maxX;
    const withinY = t.y >= SAFE_BOARD_BOUNDS.minY && t.y <= SAFE_BOARD_BOUNDS.maxY;
    const withinPhysical = Math.abs(t.x) <= 1.0 && Math.abs(t.y) <= 1.0;
    if (!withinX || !withinY || !withinPhysical) {
      allTargetsWithinSafeBounds = false;
      break;
    }
  }
  assert(allTargetsWithinSafeBounds, "Test 3a: All targets strictly satisfy conservative boundaries ([-0.6, 0.6], [-0.5, 0.5])");
  assert(SAFE_BOARD_BOUNDS.maxX < 1.0 && SAFE_BOARD_BOUNDS.maxY < 1.0, "Test 3b: Conservative bounds do not touch extreme physical edges (1.0)");

  // -------------------------------------------------------------
  // Test 4: COP left reaches left target
  // -------------------------------------------------------------
  const leftTarget = targets.find((t) => t.name === "LEFT")!;
  assert(leftTarget.x < 0, "Test 4a: Left target has negative X coordinate (-X = LEFT)");

  // Simulate user shifting weight LEFT (copX = -0.40, copY = 0.0)
  const leftMeasurement = generateSimulatedMeasurement(-0.40, 0.0, 70.0);
  const leftDistance = calculateCopDistance(leftMeasurement.copX, leftMeasurement.copY, leftTarget.x, leftTarget.y);
  assert(leftDistance !== null && leftDistance < 0.001, "Test 4b: Distance to Left target is zero at exact coordinates");
  assert(isCopTargetReached(leftMeasurement.copX, leftMeasurement.copY, leftTarget), "Test 4c: COP left reaches left target within tolerance");

  // Guidance confirms in tolerance
  const leftGuidance = getDirectionGuidance(leftMeasurement.copX, leftMeasurement.copY, leftTarget);
  assert(leftGuidance.isInTolerance === true, "Test 4d: Left target guidance reports isInTolerance = true");

  // -------------------------------------------------------------
  // Test 5: COP right reaches right target
  // -------------------------------------------------------------
  const rightTarget = targets.find((t) => t.name === "RIGHT")!;
  assert(rightTarget.x > 0, "Test 5a: Right target has positive X coordinate (+X = RIGHT)");

  // Simulate user shifting weight RIGHT (copX = 0.40, copY = 0.0)
  const rightMeasurement = generateSimulatedMeasurement(0.40, 0.0, 70.0);
  assert(isCopTargetReached(rightMeasurement.copX, rightMeasurement.copY, rightTarget), "Test 5b: COP right reaches right target within tolerance");
  const rightGuidance = getDirectionGuidance(rightMeasurement.copX, rightMeasurement.copY, rightTarget);
  assert(rightGuidance.isInTolerance === true, "Test 5c: Right target guidance reports isInTolerance = true");

  // -------------------------------------------------------------
  // Test 6: COP front reaches front target
  // -------------------------------------------------------------
  const frontTarget = targets.find((t) => t.name === "FRONT")!;
  assert(frontTarget.y > 0, "Test 6a: Front target has positive Y coordinate (+Y = FRONT/ANTERIOR)");

  // Simulate user shifting weight FRONT (copX = 0.0, copY = 0.35)
  const frontMeasurement = generateSimulatedMeasurement(0.0, 0.35, 70.0);
  assert(isCopTargetReached(frontMeasurement.copX, frontMeasurement.copY, frontTarget), "Test 6b: COP front reaches front target within tolerance");
  const frontGuidance = getDirectionGuidance(frontMeasurement.copX, frontMeasurement.copY, frontTarget);
  assert(frontGuidance.isInTolerance === true, "Test 6c: Front target guidance reports isInTolerance = true");

  // -------------------------------------------------------------
  // Test 7: COP back reaches back target
  // -------------------------------------------------------------
  const backTarget = targets.find((t) => t.name === "BACK")!;
  assert(backTarget.y < 0, "Test 7a: Back target has negative Y coordinate (-Y = BACK/POSTERIOR)");

  // Simulate user shifting weight BACK (copX = 0.0, copY = -0.35)
  const backMeasurement = generateSimulatedMeasurement(0.0, -0.35, 70.0);
  assert(isCopTargetReached(backMeasurement.copX, backMeasurement.copY, backTarget), "Test 7b: COP back reaches back target within tolerance");
  const backGuidance = getDirectionGuidance(backMeasurement.copX, backMeasurement.copY, backTarget);
  assert(backGuidance.isInTolerance === true, "Test 7c: Back target guidance reports isInTolerance = true");

  // -------------------------------------------------------------
  // Test 8: Target tolerance works
  // -------------------------------------------------------------
  const testCenterTarget: CopTarget = {
    id: "test-c",
    name: "CENTER",
    label: "Center",
    instruction: "",
    x: 0.0,
    y: 0.0,
    tolerance: 0.15,
  };

  // Inside tolerance (distance = 0.10 <= 0.15)
  assert(isCopTargetReached(0.10, 0.0, testCenterTarget) === true, "Test 8a: Point within tolerance radius (0.10 <= 0.15) is REACHED");
  // Outside tolerance (distance = 0.20 > 0.15)
  assert(isCopTargetReached(0.20, 0.0, testCenterTarget) === false, "Test 8b: Point outside tolerance radius (0.20 > 0.15) is NOT reached");
  // Directional guidance instructs correct direction when outside tolerance
  const guidanceAway = getDirectionGuidance(0.30, 0.0, testCenterTarget);
  assert(guidanceAway.isInTolerance === false, "Test 8c: Guidance correctly reports isInTolerance = false when away");
  assert(guidanceAway.primaryInstruction.includes("Left"), "Test 8d: Guidance instructs 'Left' when COP is to the right of target");

  // -------------------------------------------------------------
  // Test 9: Target progression works
  // -------------------------------------------------------------
  const sequence: string[] = [];
  for (let idx = 0; idx < targets.length; idx++) {
    const current = targets[idx];
    sequence.push(current.name);
    // Simulating reaching target
    const reached = isCopTargetReached(current.x, current.y, current);
    assert(reached, `Test 9-step-${idx + 1}: Target ${idx + 1} (${current.name}) reachable in progression`);
  }
  assert(
    JSON.stringify(sequence) === JSON.stringify(["CENTER", "LEFT", "RIGHT", "FRONT", "BACK"]),
    "Test 9b: Target progression steps strictly through CENTER -> LEFT -> RIGHT -> FRONT -> BACK"
  );

  // -------------------------------------------------------------
  // Test 10: Exercise completion works
  // -------------------------------------------------------------
  const testResult = calculateCopExerciseResult({
    completedTargets: 5,
    totalTargets: 5,
    durationMs: 25400,
    distanceSamples: [0.05, 0.04, 0.06, 0.05, 0.03],
    dataSourceMode: "SIMULATION",
    samplesCount: 120,
  });
  assert(testResult.targetsCompleted === 5, "Test 10a: Result reports 5 targets completed");
  assert(testResult.completionPercentage === 100, "Test 10b: Result reports 100% completion");
  assert(testResult.durationSeconds === 25.4, "Test 10c: Duration correctly calculated as 25.4s");
  assert(testResult.averageDistanceFromTarget !== null && testResult.averageDistanceFromTarget > 0, "Test 10d: Average distance calculated");
  assert(testResult.successfulTargetCount === 5, "Test 10e: Successful target count is 5");
  assert(testResult.validationNotice.includes("clinical validation pending"), "Test 10f: Safety validation notice present");

  // -------------------------------------------------------------
  // Test 11: Simulation is clearly labelled
  // -------------------------------------------------------------
  const simStatus = evaluateDataSourceStatus(false, true);
  assert(simStatus.mode === "SIMULATION", "Test 11a: Simulation mode classified when isSimulated is true and board not connected");
  assert(
    simStatus.badgeLabel === "DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA",
    "Test 11b: Simulation banner strictly matches 'DEVELOPMENT SIMULATION — NOT REAL SENSOR DATA'"
  );

  // -------------------------------------------------------------
  // Test 12: Real hardware telemetry can replace simulation without changing exercise logic
  // -------------------------------------------------------------
  // When real hardware is connected, even if isSimulated is true:
  const liveHardwareStatus = evaluateDataSourceStatus(true, true);
  assert(liveHardwareStatus.mode === "LIVE_WII", "Test 12a: Real hardware takes strict priority over simulation");
  assert(
    liveHardwareStatus.badgeLabel === "Data Source: LIVE WII BALANCE BOARD",
    "Test 12b: Hardware badge displays 'Data Source: LIVE WII BALANCE BOARD'"
  );

  // Same matching function operates on live measurement sample without modification
  const liveMockSample = { copX: -0.40, copY: 0.0 }; // Real sample from live board
  assert(
    isCopTargetReached(liveMockSample.copX, liveMockSample.copY, leftTarget) === true,
    "Test 12c: Exercise matching logic is identical and agnostic to hardware vs simulation source"
  );

  // -------------------------------------------------------------
  // Test 13: Missing telemetry shows unavailable state instead of fake zero
  // -------------------------------------------------------------
  const nullDist = calculateCopDistance(null, null, 0.4, 0.0);
  assert(nullDist === null, "Test 13a: Distance is null when telemetry is missing (NOT 0.0)");
  assert(isCopTargetReached(null, null, leftTarget) === false, "Test 13b: Target reached is false when telemetry is missing");
  assert(getCurrentCopDirectionText(null, null) === "--", "Test 13c: Direction text is '--' when telemetry is missing (NOT 'CENTER')");

  const unavailStatus = evaluateDataSourceStatus(false, false);
  assert(unavailStatus.badgeLabel === "--", "Test 13d: Data source badge is '--' when both hardware and simulation are off");
  assert(unavailStatus.canProceed === false, "Test 13e: cannot proceed when telemetry is completely unavailable");

  // -------------------------------------------------------------
  // Test 14: No fake clinical score is generated from simulation
  // -------------------------------------------------------------
  const canScoreSim = shouldGenerateClinicalScore(true, false);
  assert(canScoreSim === false, "Test 14a: shouldGenerateClinicalScore is strictly false for simulation");
  assert(testResult.clinicalScore === null, "Test 14b: Exercise result clinicalScore is strictly null for simulation");

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
