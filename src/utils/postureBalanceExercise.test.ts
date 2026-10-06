import {
  SKELETON_2D_KEY_JOINTS,
  SKELETON_2D_BONES,
  extractKey2DSkeleton,
  calculatePostureFromLandmarks,
  evaluateMultimodalCorrelation,
  calculatePostureBalanceResult,
  getCopDirection,
} from "./postureBalanceExercise";
import { EXERCISE_LIBRARY, evaluateSensorReadiness } from "../services/exercise/exerciseLibrary";
import { generateSimulatedMeasurement } from "./copMapping";
import { NormalizedLandmark } from "../types/vision";

function createMockLandmarks(overrides?: Partial<Record<number, Partial<NormalizedLandmark>>>): NormalizedLandmark[] {
  // Generate a standard baseline upright human pose with 33 landmarks
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
    });
  }

  // Set standard anatomical positions
  landmarks[0] = { x: 0.50, y: 0.15, z: 0.0, visibility: 0.98 }; // Nose / Head
  landmarks[11] = { x: 0.42, y: 0.30, z: 0.0, visibility: 0.95 }; // Left Shoulder
  landmarks[12] = { x: 0.58, y: 0.30, z: 0.0, visibility: 0.95 }; // Right Shoulder
  landmarks[13] = { x: 0.38, y: 0.45, z: 0.0, visibility: 0.92 }; // Left Elbow
  landmarks[14] = { x: 0.62, y: 0.45, z: 0.0, visibility: 0.92 }; // Right Elbow
  landmarks[15] = { x: 0.36, y: 0.60, z: 0.0, visibility: 0.90 }; // Left Wrist
  landmarks[16] = { x: 0.64, y: 0.60, z: 0.0, visibility: 0.90 }; // Right Wrist
  landmarks[23] = { x: 0.45, y: 0.55, z: 0.0, visibility: 0.95 }; // Left Hip
  landmarks[24] = { x: 0.55, y: 0.55, z: 0.0, visibility: 0.95 }; // Right Hip
  landmarks[25] = { x: 0.45, y: 0.75, z: 0.0, visibility: 0.94 }; // Left Knee
  landmarks[26] = { x: 0.55, y: 0.75, z: 0.0, visibility: 0.94 }; // Right Knee
  landmarks[27] = { x: 0.45, y: 0.92, z: 0.0, visibility: 0.95 }; // Left Ankle
  landmarks[28] = { x: 0.55, y: 0.92, z: 0.0, visibility: 0.95 }; // Right Ankle

  // Apply custom joint overrides if provided
  if (overrides) {
    for (const [idxStr, override] of Object.entries(overrides)) {
      const idx = Number(idxStr);
      landmarks[idx] = { ...landmarks[idx], ...override };
    }
  }

  return landmarks;
}

function runTests() {
  console.log("=================================================================");
  console.log("=== PHASE B: WEDNESDAY DEMO EXERCISE 2 TEST SUITE ===");
  console.log("=== POSTURE + BALANCE (WII BOARD + CAMERA + 2D POSE) ===");
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
  // Test 1: Exercise starts
  // -------------------------------------------------------------
  const exercise = EXERCISE_LIBRARY.find((e) => e.id === "posture-balance-multimodal");
  assert(Boolean(exercise), "Test 1a: Exercise definition 'posture-balance-multimodal' registered in library");
  assert(Boolean(exercise?.name.includes("Posture + Balance")), "Test 1b: Name matches 'Posture + Balance Exercise'");
  assert(exercise?.category === "Multimodal Biofeedback", "Test 1c: Category is Multimodal Biofeedback");
  assert(exercise?.duration === 45, "Test 1d: Exercise duration is calibrated for 45 seconds (30–60s range)");
  assert(exercise?.steps.length === 3, "Test 1e: Defines 3 structured multimodal movement steps");

  // -------------------------------------------------------------
  // Test 2: Camera remains active
  // -------------------------------------------------------------
  assert(exercise?.sensorRequirements.requiresWebcam === true, "Test 2a: Exercise declares requiresWebcam = true");
  assert(exercise?.sensorRequirements.requiresBalanceBoard === true, "Test 2b: Exercise declares requiresBalanceBoard = true");
  assert(Boolean(exercise?.requiredVisionSignals.includes("pose")), "Test 2c: Requires 'pose' vision signal from MediaPipe");

  // Verify readiness when both camera and Wii Board are connected
  const readinessFull = evaluateSensorReadiness(exercise!, {
    webcam: true,
    balanceBoard: true,
    isSimulated: false,
  });
  assert(readinessFull.isReady === true, "Test 2d: Sensor readiness reports isReady = true when both sensors active");
  assert(readinessFull.sessionMode === "FULL_MULTIMODAL", "Test 2e: Session mode resolves to FULL_MULTIMODAL");

  // -------------------------------------------------------------
  // Test 3: MediaPipe landmarks are received
  // -------------------------------------------------------------
  const baselineLandmarks = createMockLandmarks();
  const baselinePosture = calculatePostureFromLandmarks(baselineLandmarks);
  assert(baselinePosture.isTracking === true, "Test 3a: Upright landmarks produce isTracking = true");
  assert(baselinePosture.postureLean === "NEUTRAL", "Test 3b: Upright baseline classifies as NEUTRAL lean");
  assert(Math.abs(baselinePosture.shoulderTiltDeg) < 3, "Test 3c: Symmetrical shoulders have tilt near 0 deg");

  // Test Lean Right (Right shoulder dips lower -> positive shoulder tilt)
  const leanRightLandmarks = createMockLandmarks({
    11: { y: 0.28 }, // Left shoulder raised
    12: { y: 0.34 }, // Right shoulder lowered
  });
  const rightPosture = calculatePostureFromLandmarks(leanRightLandmarks);
  assert(rightPosture.isTracking === true, "Test 3d: Lean right landmarks track successfully");
  assert(rightPosture.shoulderTiltDeg > 5, "Test 3e: Right shoulder dip produces positive tilt degree");
  assert(rightPosture.postureLean === "LEAN_RIGHT", "Test 3f: Classified as LEAN_RIGHT");

  // Test Lean Left (Left shoulder dips lower -> negative shoulder tilt)
  const leanLeftLandmarks = createMockLandmarks({
    11: { y: 0.34 }, // Left shoulder lowered
    12: { y: 0.28 }, // Right shoulder raised
  });
  const leftPosture = calculatePostureFromLandmarks(leanLeftLandmarks);
  assert(leftPosture.shoulderTiltDeg < -5, "Test 3g: Left shoulder dip produces negative tilt degree");
  assert(leftPosture.postureLean === "LEAN_LEFT", "Test 3h: Classified as LEAN_LEFT");

  // Test Lean Forward (Shoulders closer to camera -> negative Z relative to hips)
  const leanForwardLandmarks = createMockLandmarks({
    11: { z: -0.15 }, // Shoulders forward towards camera
    12: { z: -0.15 },
    23: { z: 0.00 },
    24: { z: 0.00 },
  });
  const forwardPosture = calculatePostureFromLandmarks(leanForwardLandmarks);
  assert(forwardPosture.trunkPitchDeg > 5, "Test 3i: Forward torso displacement produces positive trunk pitch");
  assert(forwardPosture.postureLean === "LEAN_FORWARD", "Test 3j: Classified as LEAN_FORWARD");

  // -------------------------------------------------------------
  // Test 4: 2D skeleton mapping works
  // -------------------------------------------------------------
  const joints = SKELETON_2D_KEY_JOINTS;
  assert(joints.NOSE === 0, "Test 4a: Head tracked at Nose (landmark 0)");
  assert(joints.LEFT_SHOULDER === 11 && joints.RIGHT_SHOULDER === 12, "Test 4b: Shoulders tracked at 11, 12");
  assert(joints.LEFT_ELBOW === 13 && joints.RIGHT_ELBOW === 14, "Test 4c: Elbows tracked at 13, 14");
  assert(joints.LEFT_WRIST === 15 && joints.RIGHT_WRIST === 16, "Test 4d: Wrists tracked at 15, 16");
  assert(joints.LEFT_HIP === 23 && joints.RIGHT_HIP === 24, "Test 4e: Hips tracked at 23, 24");
  assert(joints.LEFT_KNEE === 25 && joints.RIGHT_KNEE === 26, "Test 4f: Knees tracked at 25, 26");
  assert(joints.LEFT_ANKLE === 27 && joints.RIGHT_ANKLE === 28, "Test 4g: Ankles tracked at 27, 28");

  // Verify bone connections
  assert(SKELETON_2D_BONES.length === 12, "Test 4h: 12 skeletal kinematic bone pairs defined");
  const extractedSkeleton = extractKey2DSkeleton(baselineLandmarks);
  assert(Boolean(extractedSkeleton), "Test 4i: extractKey2DSkeleton returns valid mapping");
  assert(extractedSkeleton?.LEFT_SHOULDER.x === 0.42, "Test 4j: Left shoulder coordinate preserved exactly");
  assert(extractedSkeleton?.RIGHT_ANKLE.visibility === 0.95, "Test 4k: Landmark visibility score preserved");

  // -------------------------------------------------------------
  // Test 5: Missing camera is handled safely
  // -------------------------------------------------------------
  const nullPosture = calculatePostureFromLandmarks(null);
  assert(nullPosture.isTracking === false, "Test 5a: calculatePostureFromLandmarks(null) returns isTracking = false");
  assert(nullPosture.postureLean === "NEUTRAL", "Test 5b: calculatePostureFromLandmarks(null) defaults to NEUTRAL");
  assert(nullPosture.shoulderTiltDeg === 0, "Test 5c: calculatePostureFromLandmarks(null) defaults to 0 deg tilt");

  const emptyPosture = calculatePostureFromLandmarks([]);
  assert(emptyPosture.isTracking === false, "Test 5d: calculatePostureFromLandmarks([]) returns isTracking = false without error");

  const nullSkeleton = extractKey2DSkeleton(null);
  assert(nullSkeleton === null, "Test 5e: extractKey2DSkeleton(null) safely returns null");

  // -------------------------------------------------------------
  // Test 6: Wii telemetry is consumed from existing HardwareContext
  // -------------------------------------------------------------
  const testReading = generateSimulatedMeasurement(-0.25, 0.15, 72.0);
  assert(testReading.totalWeight === 72.0, "Test 6a: Consumes totalWeight correctly");
  assert(testReading.leftPercent > testReading.rightPercent, "Test 6b: Negative COP X yields leftPercent > rightPercent");
  assert(testReading.anteriorPercent > testReading.posteriorPercent, "Test 6c: Positive COP Y yields anteriorPercent > posteriorPercent");
  assert(testReading.copX === -0.25 && testReading.copY === 0.15, "Test 6d: Preserves raw COP telemetry coordinates");

  // -------------------------------------------------------------
  // Test 7: Missing Wii telemetry displays unavailable state
  // -------------------------------------------------------------
  const missingWiiDirection = getCopDirection(null, null);
  assert(missingWiiDirection.xDirection === "--", "Test 7a: Missing COP X outputs '--'");
  assert(missingWiiDirection.yDirection === "--", "Test 7b: Missing COP Y outputs '--'");
  assert(missingWiiDirection.displayText === "COP: --", "Test 7c: Formatted display text displays 'COP: --'");

  // -------------------------------------------------------------
  // Test 8: COP X direction remains correct
  // -------------------------------------------------------------
  // -X = LEFT
  const leftCopDir = getCopDirection(-0.35, 0.0);
  assert(leftCopDir.xDirection === "LEFT", "Test 8a: Negative COP X (-0.35) maps strictly to LEFT");

  // +X = RIGHT
  const rightCopDir = getCopDirection(0.35, 0.0);
  assert(rightCopDir.xDirection === "RIGHT", "Test 8b: Positive COP X (+0.35) maps strictly to RIGHT");

  // Center deadband
  const centerCopDir = getCopDirection(0.01, 0.0);
  assert(centerCopDir.xDirection === "CENTER", "Test 8c: Near-zero COP X (+0.01) maps to CENTER");

  // -------------------------------------------------------------
  // Test 9: COP Y direction remains correct
  // -------------------------------------------------------------
  // -Y = BACK / POSTERIOR
  const backCopDir = getCopDirection(0.0, -0.30);
  assert(backCopDir.yDirection === "BACK", "Test 9a: Negative COP Y (-0.30) maps strictly to BACK");

  // +Y = FRONT / ANTERIOR
  const frontCopDir = getCopDirection(0.0, 0.30);
  assert(frontCopDir.yDirection === "FRONT", "Test 9b: Positive COP Y (+0.30) maps strictly to FRONT");

  // Center deadband
  const centerCopYDir = getCopDirection(0.0, -0.01);
  assert(centerCopYDir.yDirection === "CENTER", "Test 9c: Near-zero COP Y (-0.01) maps to CENTER");

  // -------------------------------------------------------------
  // Test 10: Camera + Wii state = FULL_MULTIMODAL
  // -------------------------------------------------------------
  // 10.1 Aligned Right: Camera Lean Right + Wii COP Right
  const alignedRight = evaluateMultimodalCorrelation({
    postureLean: "LEAN_RIGHT",
    hasPose: true,
    copX: 0.30,
    copY: 0.00,
    isBoardConnected: true,
  });
  assert(alignedRight.status === "PERFECT_ALIGNED", "Test 10a: Camera Right + Wii Right -> PERFECT_ALIGNED");
  assert(alignedRight.isAligned === true, "Test 10b: isAligned is true for aligned right shift");
  assert(alignedRight.primaryFeedback.includes("aligned to the right"), "Test 10c: Feedback confirms rightward alignment");

  // 10.2 Mismatched Right: Camera Lean Right + Wii COP Left
  const mismatchedRight = evaluateMultimodalCorrelation({
    postureLean: "LEAN_RIGHT",
    hasPose: true,
    copX: -0.30,
    copY: 0.00,
    isBoardConnected: true,
  });
  assert(mismatchedRight.status === "POSTURE_WEIGHT_MISMATCH", "Test 10d: Camera Right + Wii Left -> POSTURE_WEIGHT_MISMATCH");
  assert(mismatchedRight.isAligned === false, "Test 10e: isAligned is false for mismatch");
  assert(mismatchedRight.primaryFeedback.includes("Check your weight distribution"), "Test 10f: Feedback prompts weight distribution check");

  // 10.3 Aligned Left: Camera Lean Left + Wii COP Left
  const alignedLeft = evaluateMultimodalCorrelation({
    postureLean: "LEAN_LEFT",
    hasPose: true,
    copX: -0.30,
    copY: 0.00,
    isBoardConnected: true,
  });
  assert(alignedLeft.status === "PERFECT_ALIGNED", "Test 10g: Camera Left + Wii Left -> PERFECT_ALIGNED");
  assert(alignedLeft.isAligned === true, "Test 10h: isAligned is true for aligned left shift");

  // 10.4 Aligned Upright Neutral: Camera Neutral + Wii Center
  const alignedNeutral = evaluateMultimodalCorrelation({
    postureLean: "NEUTRAL",
    hasPose: true,
    copX: 0.02,
    copY: 0.01,
    isBoardConnected: true,
  });
  assert(alignedNeutral.status === "PERFECT_ALIGNED", "Test 10i: Camera Neutral + Wii Center -> PERFECT_ALIGNED");
  assert(alignedNeutral.isAligned === true, "Test 10j: isAligned is true for upright neutral");

  // -------------------------------------------------------------
  // Test 11: Camera unavailable + Wii available = BALANCE_ONLY
  // -------------------------------------------------------------
  const balanceOnly = evaluateMultimodalCorrelation({
    postureLean: null,
    hasPose: false,
    copX: 0.15,
    copY: -0.10,
    isBoardConnected: true,
  });
  assert(balanceOnly.status === "WEIGHT_SHIFT_ONLY", "Test 11a: Camera missing -> status is WEIGHT_SHIFT_ONLY");
  assert(balanceOnly.cameraPostureText === "Pose: Not detected", "Test 11b: Camera posture text shows 'Pose: Not detected'");
  assert(balanceOnly.isAligned === false, "Test 11c: isAligned is false when multimodal partner is absent");

  // Sensor readiness when Camera is OFF and Wii is ON
  const readinessBalanceOnly = evaluateSensorReadiness(exercise!, {
    webcam: false,
    balanceBoard: true,
    isSimulated: false,
  });
  assert(readinessBalanceOnly.sessionMode === "BALANCE_ONLY", "Test 11d: Sensor readiness reports BALANCE_ONLY mode");

  // -------------------------------------------------------------
  // Test 12: Wii unavailable + camera available = VISION_ONLY
  // -------------------------------------------------------------
  const visionOnly = evaluateMultimodalCorrelation({
    postureLean: "LEAN_RIGHT",
    hasPose: true,
    copX: null,
    copY: null,
    isBoardConnected: false,
  });
  assert(visionOnly.status === "POSTURE_LEAN_ONLY", "Test 12a: Wii missing -> status is POSTURE_LEAN_ONLY");
  assert(visionOnly.balanceShiftText === "COP: --", "Test 12b: Balance text displays 'COP: --' (never 0)");
  assert(visionOnly.isAligned === false, "Test 12c: isAligned is false when balance partner is absent");

  // Sensor readiness when Camera is ON and Wii is OFF
  const readinessVisionOnly = evaluateSensorReadiness(exercise!, {
    webcam: true,
    balanceBoard: false,
    isSimulated: false,
  });
  assert(readinessVisionOnly.sessionMode === "VISION_ONLY", "Test 12d: Sensor readiness reports VISION_ONLY mode");

  // -------------------------------------------------------------
  // Test 13: No fake clinical values are generated
  // -------------------------------------------------------------
  // When simulated: clinicalScore must be strictly null
  const simulatedResult = calculatePostureBalanceResult({
    durationMs: 45000,
    postureSamplesCount: 200,
    balanceSamplesCount: 200,
    alignedSamplesCount: 170,
    isSimulated: true,
    isConnected: false,
  });
  assert(simulatedResult.isSimulated === true, "Test 13a: Simulation flag is true");
  assert(simulatedResult.clinicalScore === null, "Test 13b: clinicalScore is strictly null for simulated sessions");
  assert(simulatedResult.validationNotice.includes("clinical validation pending"), "Test 13c: Disclosure warning attached");

  // When real hardware is connected: clinicalScore is computed
  const realResult = calculatePostureBalanceResult({
    durationMs: 45000,
    postureSamplesCount: 200,
    balanceSamplesCount: 200,
    alignedSamplesCount: 170,
    isSimulated: false,
    isConnected: true,
  });
  assert(realResult.isSimulated === false, "Test 13d: Real hardware flag is false for simulation");
  assert(realResult.clinicalScore === 85, "Test 13e: Real hardware computes legitimate alignment score (85%)");

  // -------------------------------------------------------------
  // Test 14: Exercise stops cleanly
  // -------------------------------------------------------------
  assert(realResult.durationSeconds === 45, "Test 14a: Session summary reports correct elapsed duration");
  assert(realResult.alignmentCompliancePercent === 85, "Test 14b: Session summary calculates alignment compliance");
  assert(realResult.postureSamplesCount === 200 && realResult.balanceSamplesCount === 200, "Test 14c: Sample counts recorded");

  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
