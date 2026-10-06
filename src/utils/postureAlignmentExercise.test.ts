/**
 * PHASE C TEST SUITE: CAMERA-ONLY REHABILITATION EXERCISE
 * Exercise: "Posture Alignment Exercise"
 *
 * Verifies all 12 core requirements:
 * 1. Exercise starts without Wii Board.
 * 2. Camera starts correctly.
 * 3. MediaPipe 2D pose is displayed.
 * 4. Skeleton landmarks update.
 * 5. Upright posture is detected.
 * 6. Left/right leaning feedback works.
 * 7. Forward/back feedback works.
 * 8. Missing camera is handled safely.
 * 9. Missing pose is handled safely.
 * 10. Exercise completes correctly.
 * 11. Phase A remains unaffected.
 * 12. Phase B remains unaffected.
 */

import {
  SKELETON_2D_KEY_JOINTS,
  SKELETON_2D_BONES,
  extractKey2DSkeleton,
  analyzePostureAlignment,
  calculatePostureAlignmentSummary,
  POSTURE_CLINICAL_DISCLOSURE,
} from "./postureAlignmentExercise";
import { EXERCISE_LIBRARY, evaluateSensorReadiness } from "../services/exercise/exerciseLibrary";
import { NormalizedLandmark } from "../types/vision";

function createMockLandmarks(overrides?: Partial<Record<number, Partial<NormalizedLandmark>>>): NormalizedLandmark[] {
  // Standard baseline upright human pose with 33 landmarks
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
    });
  }

  // Set anatomical positions matching standard MediaPipe topology
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
  console.log("=== PHASE C: CAMERA-ONLY REHABILITATION EXERCISE TEST SUITE ===");
  console.log("=== POSTURE ALIGNMENT EXERCISE (VISION ONLY, NO WII BOARD) ===");
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

  // =========================================================================
  // TEST 1: EXERCISE STARTS WITHOUT WII BOARD
  // =========================================================================
  const exercise = EXERCISE_LIBRARY.find((e) => e.id === "posture-alignment");
  assert(Boolean(exercise), "Test 1a: Exercise definition 'posture-alignment' registered in EXERCISE_LIBRARY");
  assert(exercise?.name === "Posture Alignment Exercise", "Test 1b: Exercise name is 'Posture Alignment Exercise'");
  assert(exercise?.sensorRequirements.requiresBalanceBoard === false, "Test 1c: Wii Balance Board is NOT required");
  assert(exercise?.requiredHardwareSignals.length === 0, "Test 1d: No hardware signals required (no COP, no weight)");

  // Readiness without Wii Board: Must be ready in VISION_ONLY mode
  const readinessNoBoard = evaluateSensorReadiness(exercise!, {
    webcam: true,
    balanceBoard: false,
    isSimulated: false,
  });
  assert(readinessNoBoard.isReady === true, "Test 1e: Exercise is ready when Wii Balance Board is disconnected");
  assert(readinessNoBoard.sessionMode === "VISION_ONLY", "Test 1f: Session resolves to VISION_ONLY");
  assert(readinessNoBoard.blockerMessage === undefined, "Test 1g: No blocker message without Wii Board");

  // =========================================================================
  // TEST 2: CAMERA STARTS CORRECTLY
  // =========================================================================
  assert(exercise?.sensorRequirements.requiresWebcam === true, "Test 2a: Exercise declares requiresWebcam = true");
  assert(Boolean(exercise?.requiredVisionSignals.includes("pose")), "Test 2b: Exercise requires 'pose' vision signal");
  assert(exercise?.sensorRequirements.allowVisionOnlyFallback === true, "Test 2c: Allows vision-only fallback / safe start");

  // =========================================================================
  // TEST 3: MEDIAPIPE 2D POSE IS DISPLAYED
  // =========================================================================
  const baselineLandmarks = createMockLandmarks();
  const skeleton = extractKey2DSkeleton(baselineLandmarks);
  assert(Boolean(skeleton), "Test 3a: 2D Skeleton extracted from MediaPipe landmarks");
  assert(Boolean(skeleton?.NOSE), "Test 3b: Head (Nose) joint present in skeleton");
  assert(Boolean(skeleton?.LEFT_SHOULDER && skeleton?.RIGHT_SHOULDER), "Test 3c: Shoulders present in skeleton");
  assert(Boolean(skeleton?.LEFT_ELBOW && skeleton?.RIGHT_ELBOW), "Test 3d: Elbows present in skeleton");
  assert(Boolean(skeleton?.LEFT_WRIST && skeleton?.RIGHT_WRIST), "Test 3e: Wrists present in skeleton");
  assert(Boolean(skeleton?.LEFT_HIP && skeleton?.RIGHT_HIP), "Test 3f: Hips present in skeleton");
  assert(Boolean(skeleton?.LEFT_KNEE && skeleton?.RIGHT_KNEE), "Test 3g: Knees present in skeleton");
  assert(Boolean(skeleton?.LEFT_ANKLE && skeleton?.RIGHT_ANKLE), "Test 3h: Ankles present in skeleton");
  assert(SKELETON_2D_BONES.length >= 10, "Test 3i: Kinematic 2D bones defined for canvas overlay");

  // =========================================================================
  // TEST 4: SKELETON LANDMARKS UPDATE
  // =========================================================================
  const shiftedLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { x: 0.40, y: 0.32 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { x: 0.56, y: 0.28 },
  });
  const shiftedSkeleton = extractKey2DSkeleton(shiftedLandmarks);
  assert(shiftedSkeleton?.LEFT_SHOULDER.x === 0.40, "Test 4a: Left shoulder coordinate updates in real-time");
  assert(shiftedSkeleton?.RIGHT_SHOULDER.y === 0.28, "Test 4b: Right shoulder coordinate updates in real-time");

  // =========================================================================
  // TEST 5: UPRIGHT POSTURE IS DETECTED
  // =========================================================================
  const uprightAnalysis = analyzePostureAlignment(baselineLandmarks);
  assert(uprightAnalysis.hasPose === true, "Test 5a: Upright posture hasPose is true");
  assert(uprightAnalysis.isUpright === true, "Test 5b: Upright posture isUpright is true");
  assert(uprightAnalysis.postureState === "GOOD", "Test 5c: Upright posture postureState is 'GOOD'");
  assert(uprightAnalysis.feedbackMessage === "✓ Good Posture", "Test 5d: Feedback message is '✓ Good Posture'");
  assert(Math.abs(uprightAnalysis.shoulderTiltDeg ?? 99) <= 4, "Test 5e: Shoulder tilt is within ±4°");
  assert(Math.abs(uprightAnalysis.hipTiltDeg ?? 99) <= 5, "Test 5f: Hip tilt is within ±5°");
  assert(uprightAnalysis.disclosure === POSTURE_CLINICAL_DISCLOSURE, "Test 5g: Clinical disclaimer attached");

  // =========================================================================
  // TEST 6: LEFT/RIGHT LEANING FEEDBACK WORKS
  // =========================================================================
  // Leaning Left: Left shoulder dips down (y is higher), dy < 0, shoulderTiltDeg < 0
  const leanLeftLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.35 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.25 },
  });
  const leanLeftAnalysis = analyzePostureAlignment(leanLeftLandmarks);
  assert((leanLeftAnalysis.shoulderTiltDeg ?? 0) < -4, "Test 6a: Left tilt produces negative shoulder tilt deg");
  assert(leanLeftAnalysis.postureState === "LEAN_LEFT", "Test 6b: Classified as LEAN_LEFT");
  assert(
    leanLeftAnalysis.feedbackMessage === "Adjust slightly to the RIGHT",
    "Test 6c: Leaning left gives feedback 'Adjust slightly to the RIGHT'"
  );

  // Leaning Right: Right shoulder dips down (y is higher), dy > 0, shoulderTiltDeg > 0
  const leanRightLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.25 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.35 },
  });
  const leanRightAnalysis = analyzePostureAlignment(leanRightLandmarks);
  assert((leanRightAnalysis.shoulderTiltDeg ?? 0) > 4, "Test 6d: Right tilt produces positive shoulder tilt deg");
  assert(leanRightAnalysis.postureState === "LEAN_RIGHT", "Test 6e: Classified as LEAN_RIGHT");
  assert(
    leanRightAnalysis.feedbackMessage === "Adjust slightly to the LEFT",
    "Test 6f: Leaning right gives feedback 'Adjust slightly to the LEFT'"
  );

  // =========================================================================
  // TEST 7: FORWARD/BACK FEEDBACK WORKS
  // =========================================================================
  // Leaning Forward: Torso pitch > 0 (torso z forward relative to hips)
  const leanForwardLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: -0.12 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: -0.12 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.05 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: 0.05 },
  });
  const leanForwardAnalysis = analyzePostureAlignment(leanForwardLandmarks);
  assert((leanForwardAnalysis.trunkPitchDeg ?? 0) >= 6, "Test 7a: Forward trunk displacement produces pitch >= 6°");
  assert(leanForwardAnalysis.postureState === "LEAN_FORWARD", "Test 7b: Classified as LEAN_FORWARD");
  assert(
    leanForwardAnalysis.feedbackMessage === "Move slightly BACK",
    "Test 7c: Leaning forward gives feedback 'Move slightly BACK'"
  );

  // Leaning Backward: Torso pitch < 0 (torso z backward relative to hips)
  const leanBackwardLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: 0.12 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: 0.12 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: -0.05 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: -0.05 },
  });
  const leanBackwardAnalysis = analyzePostureAlignment(leanBackwardLandmarks);
  assert((leanBackwardAnalysis.trunkPitchDeg ?? 0) <= -6, "Test 7d: Backward trunk displacement produces pitch <= -6°");
  assert(leanBackwardAnalysis.postureState === "LEAN_BACKWARD", "Test 7e: Classified as LEAN_BACKWARD");
  assert(
    leanBackwardAnalysis.feedbackMessage === "Move slightly FORWARD",
    "Test 7f: Leaning backward gives feedback 'Move slightly FORWARD'"
  );

  // =========================================================================
  // TEST 8: MISSING CAMERA IS HANDLED SAFELY
  // =========================================================================
  const readinessNoCamera = evaluateSensorReadiness(exercise!, {
    webcam: false,
    balanceBoard: false,
    isSimulated: false,
  });
  // Does not crash, produces warning/readiness without throwing
  assert(Boolean(readinessNoCamera), "Test 8a: Sensor readiness handles camera off safely");
  assert(
    readinessNoCamera.warnings.some((w) => w.toLowerCase().includes("camera")),
    "Test 8b: Provides descriptive warning for missing camera"
  );

  // =========================================================================
  // TEST 9: MISSING POSE IS HANDLED SAFELY (NO ZERO REPLACEMENT)
  // =========================================================================
  const nullPoseAnalysis = analyzePostureAlignment(null);
  assert(nullPoseAnalysis.hasPose === false, "Test 9a: Missing pose reports hasPose = false");
  assert(nullPoseAnalysis.postureState === "NO_POSE", "Test 9b: Missing pose postureState is 'NO_POSE'");
  assert(
    nullPoseAnalysis.feedbackMessage === "Step into camera view",
    "Test 9c: Missing pose prompts 'Step into camera view'"
  );
  assert(nullPoseAnalysis.shoulderTiltDeg === null, "Test 9d: Missing shoulder tilt is null (NOT replaced with 0)");
  assert(nullPoseAnalysis.hipTiltDeg === null, "Test 9e: Missing hip tilt is null (NOT replaced with 0)");
  assert(nullPoseAnalysis.trunkPitchDeg === null, "Test 9f: Missing trunk pitch is null (NOT replaced with 0)");
  assert(nullPoseAnalysis.bodyVerticalOffset === null, "Test 9g: Missing vertical offset is null (NOT replaced with 0)");

  const emptyArrayAnalysis = analyzePostureAlignment([]);
  assert(emptyArrayAnalysis.hasPose === false, "Test 9h: Empty landmarks safely reports hasPose = false");
  assert(extractKey2DSkeleton(null) === null, "Test 9i: extractKey2DSkeleton(null) safely returns null");

  // =========================================================================
  // TEST 10: EXERCISE COMPLETES CORRECTLY
  // =========================================================================
  const completedSummary = calculatePostureAlignmentSummary({
    totalDurationSeconds: 12.5,
    totalSamples: 100,
    trackedSamples: 95,
    goodPostureSamples: 80,
    timeInCorrectPostureSeconds: 10.0,
    requiredStabilitySeconds: 10.0,
  });
  assert(completedSummary.isComplete === true, "Test 10a: Exercise marks complete when 10 seconds maintained");
  assert(completedSummary.durationSeconds === 12.5, "Test 10b: Summary includes total duration");
  assert(completedSummary.formattedDuration === "00:12", "Test 10c: Formatted duration mm:ss matches");
  assert(
    completedSummary.poseTrackingAvailabilityPercent === 95,
    "Test 10d: Pose tracking availability is 95%"
  );
  assert(
    completedSummary.timeInCorrectPostureSeconds === 10.0,
    "Test 10e: Time in correct posture recorded as 10.0s"
  );
  assert(
    completedSummary.postureAlignmentPercentage === 84, // 80/95 = 84%
    "Test 10f: Posture alignment percentage calculated (84%)"
  );
  // Verify no clinical score property exists
  assert(!("clinicalScore" in completedSummary), "Test 10g: Strictly does NOT generate a clinical medical score");

  // Incomplete session check
  const incompleteSummary = calculatePostureAlignmentSummary({
    totalDurationSeconds: 6.0,
    totalSamples: 50,
    trackedSamples: 48,
    goodPostureSamples: 20,
    timeInCorrectPostureSeconds: 4.5,
    requiredStabilitySeconds: 10.0,
  });
  assert(incompleteSummary.isComplete === false, "Test 10h: Incomplete when < 10 seconds maintained");

  // =========================================================================
  // TEST 11: PHASE A REMAINS UNAFFECTED
  // =========================================================================
  const phaseA = EXERCISE_LIBRARY.find((e) => e.id === "weight-shift-cop-target");
  assert(Boolean(phaseA), "Test 11a: Phase A 'weight-shift-cop-target' exists in library");
  assert(phaseA?.sensorRequirements.requiresBalanceBoard === true, "Test 11b: Phase A still requires balance board");
  assert(phaseA?.sensorRequirements.requiresWebcam === false, "Test 11c: Phase A does NOT require webcam");
  assert(Boolean(phaseA?.requiredHardwareSignals.includes("cop")), "Test 11d: Phase A still requires COP");

  // =========================================================================
  // TEST 12: PHASE B REMAINS UNAFFECTED
  // =========================================================================
  const phaseB = EXERCISE_LIBRARY.find((e) => e.id === "posture-balance-multimodal");
  assert(Boolean(phaseB), "Test 12a: Phase B 'posture-balance-multimodal' exists in library");
  assert(phaseB?.sensorRequirements.requiresBalanceBoard === true, "Test 12b: Phase B still requires balance board");
  assert(phaseB?.sensorRequirements.requiresWebcam === true, "Test 12c: Phase B still requires webcam");
  assert(Boolean(phaseB?.requiredHardwareSignals.includes("cop")), "Test 12d: Phase B still requires COP");
  assert(Boolean(phaseB?.requiredVisionSignals.includes("pose")), "Test 12e: Phase B still requires pose");

  // Summary
  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
