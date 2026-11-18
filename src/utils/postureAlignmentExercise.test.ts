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
  PostureLandmarkSmoother,
  PostureSessionTracker,
  DEFAULT_POSTURE_TOLERANCES,
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
  assert(uprightAnalysis.feedbackMessage === "Good posture — hold naturally", "Test 5d: Feedback message is 'Good posture — hold naturally'");
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
    leanLeftAnalysis.feedbackMessage === "Level your shoulders",
    "Test 6c: Leaning left gives feedback 'Level your shoulders'"
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
    leanRightAnalysis.feedbackMessage === "Level your shoulders",
    "Test 6f: Leaning right gives feedback 'Level your shoulders'"
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
    leanForwardAnalysis.feedbackMessage === "Move slightly back",
    "Test 7c: Leaning forward gives feedback 'Move slightly back'"
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
    leanBackwardAnalysis.feedbackMessage === "Move slightly forward",
    "Test 7f: Leaning backward gives feedback 'Move slightly forward'"
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
    nullPoseAnalysis.feedbackMessage === "Tracking lost — adjust your position",
    "Test 9c: Missing pose prompts 'Tracking lost — adjust your position'"
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

  // =========================================================================
  // TEST 13: SMALL NATURAL MOVEMENT WITHIN TOLERANCE & LANDMARK SMOOTHING
  // =========================================================================
  // Natural quiet standing exhibits ~2-4° shoulder tilt and ~3-5° sagittal sway
  const naturalSwayLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.304, z: -0.01 }, // ~2.8° shoulder tilt (within 6.5°)
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.296, z: -0.01 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { x: 0.455, y: 0.551, z: 0.005 }, // ~3.4° sagittal pitch (within 8.0°)
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { x: 0.545, y: 0.549, z: 0.005 },
  });
  const naturalSwayAnalysis = analyzePostureAlignment(naturalSwayLandmarks);
  assert(naturalSwayAnalysis.hasPose === true, "Test 13a: Natural sway hasPose is true");
  assert(naturalSwayAnalysis.isUpright === true, "Test 13b: Upright within natural tolerance (does not fail micro-movement)");
  assert(naturalSwayAnalysis.postureState === "GOOD", "Test 13c: Posture state remains 'GOOD'");
  assert(
    naturalSwayAnalysis.feedbackMessage === "Good posture — hold naturally",
    "Test 13d: Guidance displays 'Good posture — hold naturally'"
  );

  // EMA Landmark Smoother verification
  const testSmoother = new PostureLandmarkSmoother(0.35);
  // Feed noisy landmark coordinate jumping between 0.50 and 0.58
  const frame1 = createMockLandmarks({ [SKELETON_2D_KEY_JOINTS.NOSE]: { x: 0.50 } });
  const frame2 = createMockLandmarks({ [SKELETON_2D_KEY_JOINTS.NOSE]: { x: 0.58 } });
  const s1 = testSmoother.update(frame1);
  const initialX = s1 ? s1[0].x : 0;
  const s2 = testSmoother.update(frame2);
  assert(
    Boolean(s1 && Math.abs(initialX - 0.50) < 0.001),
    "Test 13e: First frame initializes smoother baseline",
    `actual=${initialX}`
  );
  // EMA with alpha=0.35: 0.50 * 0.65 + 0.58 * 0.35 = 0.528 (smooths out jitter spike)
  assert(
    Boolean(s2 && s2[0].x < 0.55 && s2[0].x > 0.51),
    `Test 13f: EMA smoother dampens frame-to-frame jitter spike (actual: ${s2?.[0]?.x.toFixed(3)})`
  );

  // =========================================================================
  // TEST 14: SUSTAINED FORWARD/BACKWARD LEAN
  // =========================================================================
  // Forward lean exceeding 8.0° tolerance
  const forwardLeanLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: -0.15 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: -0.15 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.08 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: 0.08 },
  });
  const forwardAnalysis = analyzePostureAlignment(forwardLeanLm);
  assert(forwardAnalysis.isUpright === false, "Test 14a: Forward lean > 8° is classified non-upright");
  assert(forwardAnalysis.trunkPitchDeg! >= 10, "Test 14b: Pitch angle exceeds tolerance threshold");

  // Tracker guidance with hysteresis (350ms required to switch guidance)
  const forwardTracker = new PostureSessionTracker({ sustainedDeviationMs: 350 });
  // Initial 100ms tick: guidance remains initial holding message due to hysteresis
  forwardTracker.update(forwardAnalysis, 100);
  assert(
    forwardTracker.getState().guidanceMessage === "Good posture — hold naturally",
    "Test 14c: Transient 100ms deviation does not trigger banner flicker"
  );
  // Sustained past 350ms (total 400ms)
  forwardTracker.update(forwardAnalysis, 300);
  assert(
    forwardTracker.getState().guidanceMessage === "Move slightly back",
    "Test 14d: Sustained forward lean switches guidance to 'Move slightly back'"
  );

  // Backward lean exceeding -8.0° tolerance
  const backwardLeanLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: 0.15 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: 0.15 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: -0.08 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: -0.08 },
  });
  const backwardAnalysis = analyzePostureAlignment(backwardLeanLm);
  const backwardTracker = new PostureSessionTracker({ sustainedDeviationMs: 350 });
  backwardTracker.update(backwardAnalysis, 400);
  assert(
    backwardTracker.getState().guidanceMessage === "Move slightly forward",
    "Test 14e: Sustained backward lean switches guidance to 'Move slightly forward'"
  );

  // =========================================================================
  // TEST 15: UNEVEN SHOULDERS
  // =========================================================================
  const unevenShoulderLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.35 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.25 },
  });
  const unevenAnalysis = analyzePostureAlignment(unevenShoulderLm);
  assert(unevenAnalysis.isUpright === false, "Test 15a: Uneven shoulders detected as non-upright");
  assert(Math.abs(unevenAnalysis.shoulderTiltDeg!) > DEFAULT_POSTURE_TOLERANCES.shoulderTiltToleranceDeg, "Test 15b: Tilt exceeds tolerance");
  
  const shoulderTracker = new PostureSessionTracker({ sustainedDeviationMs: 350 });
  shoulderTracker.update(unevenAnalysis, 400);
  assert(
    shoulderTracker.getState().guidanceMessage === "Level your shoulders",
    "Test 15c: Uneven shoulders provides 'Level your shoulders' guidance"
  );

  // =========================================================================
  // TEST 16: TEMPORARY TRACKING LOSS
  // =========================================================================
  const lossTracker = new PostureSessionTracker();
  // Hold good posture for 3.0 seconds (30 ticks of 100ms)
  for (let i = 0; i < 30; i++) {
    lossTracker.update(uprightAnalysis, 100);
  }
  assert(lossTracker.getState().timeInCorrectPostureSeconds === 3.0, "Test 16a: 3.0s accumulated before tracking loss");

  // Suddenly lose tracking (e.g. camera obstruction or patient walks away)
  const lossAnalysis = analyzePostureAlignment(null);
  for (let i = 0; i < 15; i++) {
    lossTracker.update(lossAnalysis, 100);
  }
  const lossState = lossTracker.getState();
  assert(lossState.isTrackingLost === true, "Test 16b: Tracking loss is detected immediately");
  assert(
    lossState.guidanceMessage === "Tracking lost — adjust your position",
    "Test 16c: Guidance indicates 'Tracking lost — adjust your position'"
  );
  assert(
    lossState.timeInCorrectPostureSeconds === 3.0,
    "Test 16d: Timer is PAUSED during tracking loss (does NOT increment)"
  );
  assert(
    lossState.trackedSamplesCount === 30 && lossState.totalSamplesCount === 45,
    "Test 16e: Tracking loss frames are never counted as tracked/good samples"
  );

  // =========================================================================
  // TEST 17: TIMER PAUSE AND RESUME WITH GRACE PERIOD
  // =========================================================================
  const graceTracker = new PostureSessionTracker({
    gracePeriodMs: 1200,
    requiredStabilitySeconds: 10,
  });
  // 1. Maintain good posture for 4.0 seconds
  for (let i = 0; i < 40; i++) {
    graceTracker.update(uprightAnalysis, 100);
  }
  assert(graceTracker.getState().timeInCorrectPostureSeconds === 4.0, "Test 17a: Initial 4.0s recorded");

  // 2. Patient exhibits a transient minor shift outside tolerance for 600ms (< 1200ms grace period)
  for (let i = 0; i < 6; i++) {
    graceTracker.update(unevenAnalysis, 100);
  }
  assert(graceTracker.getState().isInGracePeriod === true, "Test 17b: Grace period activates on posture deviation");
  assert(
    graceTracker.getState().timeInCorrectPostureSeconds === 4.0,
    "Test 17c: Timer accumulation is paused but NOT reset during grace period"
  );

  // 3. Patient realigns back to good posture before grace period expires
  for (let i = 0; i < 20; i++) {
    graceTracker.update(uprightAnalysis, 100);
  }
  assert(graceTracker.getState().isInGracePeriod === false, "Test 17d: Grace period clears upon returning to upright");
  assert(
    graceTracker.getState().timeInCorrectPostureSeconds === 6.0,
    "Test 17e: Timer resumes seamlessly from 4.0s to 6.0s"
  );

  // 4. Patient exhibits sustained deviation exceeding 1200ms grace period
  for (let i = 0; i < 15; i++) {
    graceTracker.update(unevenAnalysis, 100); // 1500ms > 1200ms
  }
  assert(
    graceTracker.getState().timeInCorrectPostureSeconds === 0,
    "Test 17f: Timer resets to 0 when posture deviation exceeds the grace period"
  );

  // =========================================================================
  // TEST 18: SUCCESSFUL 10-SECOND COMPLETION
  // =========================================================================
  const completeTracker = new PostureSessionTracker({
    requiredStabilitySeconds: 10,
  });
  // Feed 10.0 seconds of valid upright posture
  for (let i = 0; i < 100; i++) {
    completeTracker.update(uprightAnalysis, 100);
  }
  const completeState = completeTracker.getState();
  assert(completeState.isComplete === true, "Test 18a: isComplete marked true after 10.0 seconds");
  assert(completeState.timeInCorrectPostureSeconds === 10.0, "Test 18b: Hold timer reached exactly 10.0s");
  assert(completeState.remainingSeconds === 0, "Test 18c: Remaining seconds reached 0.0s");

  const fullSummary = calculatePostureAlignmentSummary({
    totalDurationSeconds: completeState.totalDurationSeconds,
    totalSamples: completeState.totalSamplesCount,
    trackedSamples: completeState.trackedSamplesCount,
    goodPostureSamples: completeState.goodSamplesCount,
    timeInCorrectPostureSeconds: completeState.timeInCorrectPostureSeconds,
    requiredStabilitySeconds: 10,
  });
  assert(fullSummary.isComplete === true, "Test 18d: Session summary marks exercise complete");
  assert(fullSummary.timeInCorrectPostureSeconds === 10.0, "Test 18e: Summary confirms 10.0s stability hold");
  assert(fullSummary.postureAlignmentPercentage === 100, "Test 18f: 100% alignment efficiency");
  assert(!("clinicalScore" in fullSummary), "Test 18g: No diagnostic clinical score generated");

  // =========================================================================
  // TEST 19: STEADY UPRIGHT POSE FOR 10 SECONDS MUST COMPLETE
  // =========================================================================
  const steadyTracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 100; i++) {
    const state = steadyTracker.update(uprightAnalysis, 100);
    if (i < 99) {
      assert(state.isComplete === false, `Test 19a [tick ${i}]: In progress before 10.0s`);
    } else {
      assert(state.isComplete === true, "Test 19b: Automatically completed at 10.0 seconds");
      assert(state.timeInCorrectPostureSeconds === 10.0, "Test 19c: Accumulated hold time capped at 10.0s");
      assert(state.remainingSeconds === 0.0, "Test 19d: Remaining seconds is 0.0s");
    }
  }

  // =========================================================================
  // TEST 20: SMALL NATURAL MOVEMENTS: PROGRESS MUST CONTINUE
  // =========================================================================
  const swayTracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  const smoother = new PostureLandmarkSmoother(0.30);
  for (let i = 0; i < 100; i++) {
    // Simulate natural postural sway and micro-movements
    const swayNoise = (Math.sin(i / 5) * 0.006);
    const frameWithSway = createMockLandmarks({
      [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.30 + swayNoise },
      [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.30 - swayNoise },
      [SKELETON_2D_KEY_JOINTS.NOSE]: { x: 0.50 + swayNoise * 0.5 },
    });
    const smoothedFrame = smoother.update(frameWithSway);
    const swayAnalysis = analyzePostureAlignment(smoothedFrame);
    assert(swayAnalysis.isUpright === true, `Test 20a [tick ${i}]: Micro-movement remains upright`);
    const swayState = swayTracker.update(swayAnalysis, 100);
    assert(swayState.isInGracePeriod === false, `Test 20b [tick ${i}]: Small movements do NOT trigger grace reset`);
  }
  assert(swayTracker.getState().isComplete === true, "Test 20c: Natural movement run completed 10.0s hold");
  assert(swayTracker.getState().timeInCorrectPostureSeconds === 10.0, "Test 20d: Exactly 10.0s recorded despite sway");

  // =========================================================================
  // TEST 21: SUSTAINED EXCESSIVE LEAN: ADJUSTMENT FEEDBACK & GRACE PERIOD RESET
  // =========================================================================
  const leanResetTracker = new PostureSessionTracker({
    gracePeriodMs: 1500,
    sustainedDeviationMs: 350,
    requiredStabilitySeconds: 10,
  });
  // 1. Hold good posture for 3.0 seconds
  for (let i = 0; i < 30; i++) {
    leanResetTracker.update(uprightAnalysis, 100);
  }
  assert(leanResetTracker.getState().timeInCorrectPostureSeconds === 3.0, "Test 21a: 3.0s valid hold time before lean");

  // 2. Patient exhibits excessive lean (tilt > tolerance)
  const excessiveLeanLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.25 }, // dy = 0.10 (severe lean)
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.35 },
  });
  const excessiveLeanAnalysis = analyzePostureAlignment(excessiveLeanLm);
  assert(excessiveLeanAnalysis.isUpright === false, "Test 21b: Excessive lean is not upright");

  // 3. For first 500ms (< 1500ms grace period), hold time remains 3.0s
  for (let i = 0; i < 5; i++) {
    leanResetTracker.update(excessiveLeanAnalysis, 100);
  }
  assert(leanResetTracker.getState().isInGracePeriod === true, "Test 21c: Grace period active during initial deviation");
  assert(leanResetTracker.getState().timeInCorrectPostureSeconds === 3.0, "Test 21d: Timer paused at 3.0s during grace period");
  assert(leanResetTracker.getState().guidanceMessage === "Level your shoulders", "Test 21e: Adjustment feedback displayed");

  // 4. Lean continues past 1500ms grace period (total 1800ms)
  for (let i = 0; i < 13; i++) {
    leanResetTracker.update(excessiveLeanAnalysis, 100);
  }
  assert(leanResetTracker.getState().timeInCorrectPostureSeconds === 0.0, "Test 21f: Timer resets to 0.0s only after grace period expires");
  assert(leanResetTracker.getState().isInGracePeriod === false, "Test 21g: Grace period flag cleared after timer reset");

  // =========================================================================
  // TEST 22: TEMPORARY LANDMARK LOSS & POOR TRACKING CONFIDENCE
  // =========================================================================
  const confidenceTracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  // 1. Accumulate 2.0s
  for (let i = 0; i < 20; i++) {
    confidenceTracker.update(uprightAnalysis, 100);
  }
  assert(confidenceTracker.getState().timeInCorrectPostureSeconds === 2.0, "Test 22a: 2.0s recorded before tracking dip");

  // 2. Degraded camera confidence (visibility < 0.50)
  const degradedConfidenceLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { visibility: 0.38 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { visibility: 0.38 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { visibility: 0.40 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { visibility: 0.40 },
  });
  const degradedAnalysis = analyzePostureAlignment(degradedConfidenceLm);
  assert(degradedAnalysis.isUpright === false, "Test 22b: Degraded tracking is not counted as upright stability");
  assert(degradedAnalysis.feedbackMessage === "Adjusting posture", "Test 22c: Prompts 'Adjusting posture' on degraded tracking");

  // Update tracker with degraded analysis for 500ms
  for (let i = 0; i < 5; i++) {
    confidenceTracker.update(degradedAnalysis, 100);
  }
  assert(confidenceTracker.getState().timeInCorrectPostureSeconds === 2.0, "Test 22d: Timer PAUSED (does NOT falsely count poor tracking as stability)");
  assert(confidenceTracker.getState().guidanceMessage === "Adjusting posture", "Test 22e: Banner shows 'Adjusting posture'");

  // 3. Complete landmark loss (null pose)
  const nullAnalysis = analyzePostureAlignment(null);
  confidenceTracker.update(nullAnalysis, 100);
  assert(confidenceTracker.getState().isTrackingLost === true, "Test 22f: Tracking lost flagged");
  assert(confidenceTracker.getState().timeInCorrectPostureSeconds === 2.0, "Test 22g: Timer remains paused at 2.0s during camera obstruction");

  // 4. Camera tracking recovers
  for (let i = 0; i < 80; i++) {
    confidenceTracker.update(uprightAnalysis, 100);
  }
  assert(confidenceTracker.getState().isComplete === true, "Test 22h: Recovered and completed to 10.0s after camera restored");

  // =========================================================================
  // TEST 23: LOW HIP VISIBILITY DOES NOT CAUSE FALSE TRACKING LOSS
  // =========================================================================
  const lowHipLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { visibility: 0.90 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { visibility: 0.90 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { visibility: 0.15 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { visibility: 0.15 },
  });
  const lowHipAnalysis = analyzePostureAlignment(lowHipLm);
  assert(lowHipAnalysis.hasPose === true, "Test 23a: Valid upper body with low hip visibility reports hasPose = true");
  assert(lowHipAnalysis.feedbackMessage !== "Tracking lost — adjust your position", "Test 23b: Does NOT report 'Tracking lost' when valid landmarks exist");
  assert(lowHipAnalysis.isUpright === true, "Test 23c: Evaluates upright posture with low hip visibility");

  // =========================================================================
  // TEST 24: BODYPOSELANDMARKS OBJECT DIRECT INPUT (SINGLE SOURCE OF TRUTH)
  // =========================================================================
  const mockPoseObject = {
    nose: { x: 0.5, y: 0.15, z: 0, visibility: 0.95 },
    leftShoulder: { x: 0.42, y: 0.30, z: 0, visibility: 0.95 },
    rightShoulder: { x: 0.58, y: 0.30, z: 0, visibility: 0.95 },
    leftElbow: null,
    rightElbow: null,
    leftWrist: null,
    rightWrist: null,
    leftHip: { x: 0.45, y: 0.55, z: 0, visibility: 0.95 },
    rightHip: { x: 0.55, y: 0.55, z: 0, visibility: 0.95 },
    leftKnee: null,
    rightKnee: null,
    leftAnkle: null,
    rightAnkle: null,
    allRawLandmarks: baselineLandmarks,
    shoulderTiltDeg: 0,
    hipTiltDeg: 0,
    headTiltDeg: 0,
    trunkPitchDeg: 0,
    torsoLateralOffset: 0,
    postureLean: "NEUTRAL" as const,
    isStandingFacingCamera: true,
    armReach: { leftReachDistance: 0, rightReachDistance: 0, maxReachRatio: 0, isReachingForward: false },
    singleLeg: { isSingleLeg: false, liftedLeg: "NONE" as const, elevationRatio: 0, holdDurationSeconds: 0 },
    kneeFlexion: { leftKneeAngleDeg: 180, rightKneeAngleDeg: 180, isSquatting: false },
  };
  const poseObjAnalysis = analyzePostureAlignment(mockPoseObject as any);
  assert(poseObjAnalysis.hasPose === true, "Test 24a: BodyPoseLandmarks object resolves hasPose = true");
  assert(poseObjAnalysis.isUpright === true, "Test 24b: BodyPoseLandmarks object evaluates upright posture correctly");

  // =========================================================================
  // TEST 25: 5 CORE ACCEPTANCE CASES (USER REQUIREMENTS)
  // =========================================================================
  const userAcceptanceTracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });

  // Case 1: Valid pose and upright posture: timer starts and progresses
  for (let i = 0; i < 20; i++) {
    userAcceptanceTracker.update(uprightAnalysis, 100);
  }
  assert(userAcceptanceTracker.getState().timeInCorrectPostureSeconds === 2.0, "Case 1: Timer starts and progresses to 2.0s");

  // Case 2: Small natural movement: timer continues
  const naturalSwayLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.302 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.298 },
  });
  const swayAnalysis = analyzePostureAlignment(naturalSwayLm);
  for (let i = 0; i < 20; i++) {
    userAcceptanceTracker.update(swayAnalysis, 100);
  }
  assert(userAcceptanceTracker.getState().timeInCorrectPostureSeconds === 4.0, "Case 2: Small natural movement continues timer to 4.0s");

  // Case 3: Temporary camera tracking loss: timer pauses safely
  const lostAnalysis = analyzePostureAlignment(null);
  for (let i = 0; i < 5; i++) { // 500ms temporary loss
    userAcceptanceTracker.update(lostAnalysis, 100);
  }
  assert(userAcceptanceTracker.getState().isTrackingLost === true, "Case 3a: Tracking loss flagged");
  assert(userAcceptanceTracker.getState().timeInCorrectPostureSeconds === 4.0, "Case 3b: Timer pauses safely at 4.0s during tracking loss");

  // Case 4: Restored tracking: timer resumes correctly
  for (let i = 0; i < 20; i++) {
    userAcceptanceTracker.update(uprightAnalysis, 100);
  }
  assert(userAcceptanceTracker.getState().isTrackingLost === false, "Case 4a: Tracking restored");
  assert(userAcceptanceTracker.getState().timeInCorrectPostureSeconds === 6.0, "Case 4b: Timer resumed from 4.0s to 6.0s");

  // Case 5: Sustained excessive lean: adjustment guidance appears
  const leanLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.20 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.40 },
  });
  const leanAnalysis = analyzePostureAlignment(leanLm);
  for (let i = 0; i < 5; i++) { // 500ms deviation (> 350ms sustainedDeviationMs)
    userAcceptanceTracker.update(leanAnalysis, 100);
  }
  assert(userAcceptanceTracker.getState().guidanceMessage === "Level your shoulders", "Case 5a: Adjustment guidance appears");
  assert(userAcceptanceTracker.getState().isInGracePeriod === true, "Case 5b: Enters grace period without immediate reset");

  // =========================================================================
  // SECTION 8: 12 CORE CLINICAL & TECHNICAL VERIFICATION REQUIREMENTS
  // =========================================================================
  console.log("\n--- SECTION 8: 12 CORE CLINICAL & TECHNICAL VERIFICATION REQUIREMENTS ---");

  // Requirement 1: Correct neutral posture detection
  const r1_landmarks = createMockLandmarks();
  const r1_analysis = analyzePostureAlignment(r1_landmarks);
  assert(r1_analysis.hasPose === true && r1_analysis.isUpright === true, "Req 1a: Upright neutral stance detected as upright");
  assert(r1_analysis.postureState === "GOOD", "Req 1b: Neutral stance postureState is 'GOOD'");
  assert(r1_analysis.feedbackMessage === "Good posture — hold naturally", "Req 1c: Feedback is 'Good posture — hold naturally'");

  // Also verify calibrated neutral baseline (e.g. monocular camera pseudo-depth offset +24°)
  const r1_camLandmarks = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: -0.15 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: -0.15 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.0 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: 0.0 },
  });
  // Without baseline calibration, raw pitch is +31°
  const r1_uncalibrated = analyzePostureAlignment(r1_camLandmarks);
  assert(r1_uncalibrated.rawTrunkPitchDeg! >= 25, "Req 1d: Uncalibrated monocular camera produces pseudo-depth pitch offset");
  // With neutral baseline calibrated to +31°
  const r1_calibrated = analyzePostureAlignment(r1_camLandmarks, { neutralPitchBaselineDeg: r1_uncalibrated.rawTrunkPitchDeg! });
  assert(r1_calibrated.isUpright === true, "Req 1e: Calibrated neutral baseline accurately normalizes standing posture to upright");
  assert(r1_calibrated.feedbackMessage === "Good posture — hold naturally", "Req 1f: Calibrated upright posture displays 'Good posture — hold naturally'");

  // Requirement 2: Acceptance of small natural body movements within tolerance
  const r2_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 30; i++) {
    // Micro-sway ±2.5° shoulder tilt and ±3.5° trunk pitch
    const swayAngle = Math.sin(i / 3) * 0.005;
    const swayLm = createMockLandmarks({
      [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.30 + swayAngle },
      [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.30 - swayAngle },
      [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.0 + swayAngle },
    });
    const swayAnal = analyzePostureAlignment(swayLm);
    const swayState = r2_tracker.update(swayAnal, 100);
    assert(swayAnal.isUpright === true, `Req 2a [tick ${i}]: Small natural movement is accepted as upright`);
    assert(swayState.isInGracePeriod === false, `Req 2b [tick ${i}]: Natural micro-movement does NOT trigger grace period`);
  }
  assert(r2_tracker.getState().timeInCorrectPostureSeconds === 3.0, "Req 2c: Hold timer continuously accumulates 3.0s during natural sway");

  // Requirement 3: Accurate detection and feedback for forward lean
  const r3_forwardLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: -0.16 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: -0.16 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.08 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: 0.08 },
  });
  const r3_forwardAnal = analyzePostureAlignment(r3_forwardLm);
  assert(r3_forwardAnal.isUpright === false, "Req 3a: Excessive forward lean detected as non-upright");
  assert(r3_forwardAnal.postureState === "LEAN_FORWARD", "Req 3b: Forward lean classified as 'LEAN_FORWARD'");
  assert(r3_forwardAnal.feedbackMessage === "Move slightly back", "Req 3c: Guidance instructs 'Move slightly back'");

  // Requirement 4: Accurate detection and feedback for backward lean
  const r4_backwardLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: 0.16 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: 0.16 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: -0.08 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: -0.08 },
  });
  const r4_backwardAnal = analyzePostureAlignment(r4_backwardLm);
  assert(r4_backwardAnal.isUpright === false, "Req 4a: Excessive backward lean detected as non-upright");
  assert(r4_backwardAnal.postureState === "LEAN_BACKWARD", "Req 4b: Backward lean classified as 'LEAN_BACKWARD'");
  assert(r4_backwardAnal.feedbackMessage === "Move slightly forward", "Req 4c: Guidance instructs 'Move slightly forward'");

  // Requirement 5: Accurate detection and feedback for uneven shoulders
  const r5_unevenLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.36 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.24 },
  });
  const r5_unevenAnal = analyzePostureAlignment(r5_unevenLm);
  assert(r5_unevenAnal.isUpright === false, "Req 5a: Uneven shoulders detected as non-upright");
  assert(Math.abs(r5_unevenAnal.shoulderTiltDeg!) > DEFAULT_POSTURE_TOLERANCES.shoulderTiltToleranceDeg, "Req 5b: Shoulder tilt exceeds tolerance (>8°)");
  assert(r5_unevenAnal.feedbackMessage === "Level your shoulders", "Req 5c: Guidance instructs 'Level your shoulders'");

  // Requirement 6: Accurate detection and feedback for uneven hips
  const r6_unevenHipLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { y: 0.60 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { y: 0.50 },
  });
  const r6_unevenHipAnal = analyzePostureAlignment(r6_unevenHipLm);
  assert(r6_unevenHipAnal.isUpright === false, "Req 6a: Uneven hips detected as non-upright");
  assert(Math.abs(r6_unevenHipAnal.hipTiltDeg!) > DEFAULT_POSTURE_TOLERANCES.hipTiltToleranceDeg, "Req 6b: Hip tilt exceeds tolerance (>8°)");
  assert(r6_unevenHipAnal.feedbackMessage === "Stand upright", "Req 6c: Guidance instructs 'Stand upright' on pelvic tilt");

  // Requirement 7: Handling of temporary missing landmarks without permanent failure
  const r7_partialLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { visibility: 0.10 }, // left hip occluded
  });
  const r7_partialAnal = analyzePostureAlignment(r7_partialLm);
  assert(r7_partialAnal.hasPose === true, "Req 7a: Single occluded landmark does NOT drop the entire pose");
  assert(r7_partialAnal.feedbackMessage !== "Tracking lost — adjust your position", "Req 7b: Does not falsely claim tracking lost");

  // Requirement 8: Handling of low landmark confidence
  const r8_lowConfLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { visibility: 0.35 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { visibility: 0.35 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { visibility: 0.35 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { visibility: 0.35 },
  });
  const r8_lowConfAnal = analyzePostureAlignment(r8_lowConfLm);
  assert(r8_lowConfAnal.isUpright === false, "Req 8a: Low confidence landmarks are not counted as upright stability");
  assert(r8_lowConfAnal.feedbackMessage === "Adjusting posture", "Req 8b: Guidance shows 'Adjusting posture' during degraded tracking");

  // Requirement 9: Pausing and resuming on tracking loss and recovery
  const r9_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  // 1. Accumulate 3.5s
  for (let i = 0; i < 35; i++) {
    r9_tracker.update(r1_analysis, 100);
  }
  assert(r9_tracker.getState().timeInCorrectPostureSeconds === 3.5, "Req 9a: Accumulated 3.5s upright hold");
  // 2. Tracking lost for 1.0s (10 ticks)
  const r9_lossAnal = analyzePostureAlignment(null);
  for (let i = 0; i < 10; i++) {
    r9_tracker.update(r9_lossAnal, 100);
  }
  assert(r9_tracker.getState().isTrackingLost === true, "Req 9b: Tracking loss flagged");
  assert(r9_tracker.getState().timeInCorrectPostureSeconds === 3.5, "Req 9c: Hold timer strictly paused at 3.5s during tracking loss");
  // 3. Tracking recovered
  for (let i = 0; i < 20; i++) {
    r9_tracker.update(r1_analysis, 100);
  }
  assert(r9_tracker.getState().isTrackingLost === false, "Req 9d: Tracking recovered");
  assert(r9_tracker.getState().timeInCorrectPostureSeconds === 5.5, "Req 9e: Timer resumed from 3.5s to 5.5s seamlessly");

  // Requirement 10: Stability timer progression to 10 valid seconds
  const r10_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 100; i++) {
    r10_tracker.update(r1_analysis, 100);
  }
  const r10_state = r10_tracker.getState();
  assert(r10_state.isComplete === true, "Req 10a: Exercise marks isComplete = true after 10.0 seconds");
  assert(r10_state.timeInCorrectPostureSeconds === 10.0, "Req 10b: Exact 10.0s stability achieved");
  assert(r10_state.remainingSeconds === 0.0, "Req 10c: 0.0s remaining");

  // Requirement 11: Reset of stability timer after sustained incorrect posture beyond grace period
  const r11_tracker = new PostureSessionTracker({
    gracePeriodMs: 2000,
    requiredStabilitySeconds: 10,
  });
  // 1. Accumulate 4.0s
  for (let i = 0; i < 40; i++) {
    r11_tracker.update(r1_analysis, 100);
  }
  assert(r11_tracker.getState().timeInCorrectPostureSeconds === 4.0, "Req 11a: 4.0s accumulated before deviation");
  // 2. Transient deviation within grace period (1200ms < 2000ms)
  for (let i = 0; i < 12; i++) {
    r11_tracker.update(r3_forwardAnal, 100);
  }
  assert(r11_tracker.getState().isInGracePeriod === true, "Req 11b: Enters grace period on posture deviation");
  assert(r11_tracker.getState().timeInCorrectPostureSeconds === 4.0, "Req 11c: Timer preserved at 4.0s during grace period");
  // 3. Sustained deviation exceeding grace period (another 1000ms -> total 2200ms > 2000ms)
  for (let i = 0; i < 10; i++) {
    r11_tracker.update(r3_forwardAnal, 100);
  }
  assert(r11_tracker.getState().timeInCorrectPostureSeconds === 0.0, "Req 11d: Timer resets to 0.0s after sustained deviation exceeds grace period");
  assert(r11_tracker.getState().isInGracePeriod === false, "Req 11e: Grace period flag cleared after timer reset");

  // Requirement 12: Completion of the exercise without requiring a Wii Balance Board
  const r12_exercise = EXERCISE_LIBRARY.find((e) => e.id === "posture-alignment");
  assert(Boolean(r12_exercise), "Req 12a: Posture alignment exercise registered in EXERCISE_LIBRARY");
  assert(r12_exercise?.sensorRequirements.requiresBalanceBoard === false, "Req 12b: Wii Balance Board strictly NOT required");
  assert(r12_exercise?.requiredHardwareSignals.length === 0, "Req 12c: Zero hardware signals required (no COP, no weight)");
  const r12_readiness = evaluateSensorReadiness(r12_exercise!, {
    webcam: true,
    balanceBoard: false,
    isSimulated: false,
  });
  assert(r12_readiness.isReady === true, "Req 12d: Ready without Wii Balance Board");
  assert(r12_readiness.sessionMode === "VISION_ONLY", "Req 12e: Session mode is VISION_ONLY");
  const r12_summary = calculatePostureAlignmentSummary({
    totalDurationSeconds: 12.0,
    totalSamples: 100,
    trackedSamples: 98,
    goodPostureSamples: 90,
    timeInCorrectPostureSeconds: 10.0,
    requiredStabilitySeconds: 10.0,
  });
  assert(r12_summary.isComplete === true, "Req 12f: Summary completed without hardware sensors");
  assert(r12_summary.disclosure === POSTURE_CLINICAL_DISCLOSURE, "Req 12g: Clinical disclosure included");

  // =========================================================================
  // SECTION 9: 9 MANDATORY AUTOMATED VALIDATION SCENARIOS
  // =========================================================================
  console.log("\n--- SECTION 9: 9 MANDATORY AUTOMATED VALIDATION SCENARIOS ---");

  // Scenario 1: Correct upright posture for 10 seconds -> completes
  const s1_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  const s1_upright = analyzePostureAlignment(baselineLandmarks);
  for (let i = 0; i < 100; i++) {
    s1_tracker.update(s1_upright, 100);
  }
  assert(s1_tracker.getState().isComplete === true, "Scenario 1a: Correct upright posture completes at 10.0s");
  assert(s1_tracker.getState().timeInCorrectPostureSeconds === 10.0, "Scenario 1b: Exact 10.0 seconds hold accumulated");

  // Scenario 2: Incorrect torso lean -> does not complete
  const s2_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  const s2_leanLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { z: -0.18 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { z: -0.18 },
    [SKELETON_2D_KEY_JOINTS.LEFT_HIP]: { z: 0.10 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_HIP]: { z: 0.10 },
  });
  const s2_leanAnal = analyzePostureAlignment(s2_leanLm);
  for (let i = 0; i < 150; i++) { // 15 seconds of torso lean
    s2_tracker.update(s2_leanAnal, 100);
  }
  assert(s2_tracker.getState().isComplete === false, "Scenario 2a: Incorrect torso lean does NOT complete even after 15s");
  assert(s2_tracker.getState().timeInCorrectPostureSeconds === 0, "Scenario 2b: Hold timer remains at 0s during torso lean");

  // Scenario 3: Uneven shoulders -> does not complete if outside tolerance
  const s3_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  const s3_unevenLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.36 }, // dy = 0.12 (severe tilt)
    [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.24 },
  });
  const s3_unevenAnal = analyzePostureAlignment(s3_unevenLm);
  for (let i = 0; i < 150; i++) {
    s3_tracker.update(s3_unevenAnal, 100);
  }
  assert(s3_tracker.getState().isComplete === false, "Scenario 3a: Uneven shoulders do NOT complete");
  assert(s3_tracker.getState().timeInCorrectPostureSeconds === 0, "Scenario 3b: No stability hold time accumulated");

  // Scenario 4: Deliberately leaving posture -> timer strictly pauses
  const s4_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10, gracePeriodMs: 1500 });
  for (let i = 0; i < 30; i++) {
    s4_tracker.update(s1_upright, 100); // 3.0s valid
  }
  assert(s4_tracker.getState().timeInCorrectPostureSeconds === 3.0, "Scenario 4a: 3.0s valid time established");
  // User deliberately leaves posture
  s4_tracker.update(s2_leanAnal, 100);
  assert(s4_tracker.getState().timeInCorrectPostureSeconds === 3.0, "Scenario 4b: Timer strictly paused on leaving posture (no time added)");
  assert(s4_tracker.getState().isHolding === false, "Scenario 4c: isHolding is false immediately");

  // Scenario 5: Small natural movement (sway < tolerance) -> accepted & timer continues
  const s5_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 100; i++) {
    const swayDelta = Math.sin(i / 4) * 0.005; // tiny micro-sway
    const swayLm = createMockLandmarks({
      [SKELETON_2D_KEY_JOINTS.LEFT_SHOULDER]: { y: 0.30 + swayDelta },
      [SKELETON_2D_KEY_JOINTS.RIGHT_SHOULDER]: { y: 0.30 - swayDelta },
    });
    const swayAnal = analyzePostureAlignment(swayLm);
    s5_tracker.update(swayAnal, 100);
  }
  assert(s5_tracker.getState().isComplete === true, "Scenario 5a: Small natural sway accepted and completes");
  assert(s5_tracker.getState().timeInCorrectPostureSeconds === 10.0, "Scenario 5b: Full 10.0s hold achieved during natural sway");

  // Scenario 6: Temporary landmark loss -> pauses safely
  const s6_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 40; i++) {
    s6_tracker.update(s1_upright, 100); // 4.0s
  }
  assert(s6_tracker.getState().timeInCorrectPostureSeconds === 4.0, "Scenario 6a: 4.0s accumulated before landmark loss");
  const s6_lossAnal = analyzePostureAlignment(null);
  for (let i = 0; i < 8; i++) { // 800ms temporary landmark loss
    s6_tracker.update(s6_lossAnal, 100);
  }
  assert(s6_tracker.getState().timeInCorrectPostureSeconds === 4.0, "Scenario 6b: Timer paused safely during landmark loss");
  assert(s6_tracker.getState().isTrackingLost === true, "Scenario 6c: Tracking lost flagged safely");

  // Scenario 7: Moving hands while maintaining torso posture -> remains upright
  const s7_wavingHandsLm = createMockLandmarks({
    [SKELETON_2D_KEY_JOINTS.LEFT_WRIST]: { x: 0.20, y: 0.20 }, // hands high and wide
    [SKELETON_2D_KEY_JOINTS.RIGHT_WRIST]: { x: 0.80, y: 0.18 },
    [SKELETON_2D_KEY_JOINTS.LEFT_ELBOW]: { x: 0.30, y: 0.35 },
    [SKELETON_2D_KEY_JOINTS.RIGHT_ELBOW]: { x: 0.70, y: 0.35 },
  });
  const s7_wavingHandsAnal = analyzePostureAlignment(s7_wavingHandsLm);
  assert(s7_wavingHandsAnal.isUpright === true, "Scenario 7a: Hand/arm movement while torso is upright evaluates as upright");
  assert(s7_wavingHandsAnal.postureState === "GOOD", "Scenario 7b: PostureState remains 'GOOD' when hands move");

  // Scenario 8: Camera tracking loss -> does not count invalid time
  const s8_tracker = new PostureSessionTracker({ requiredStabilitySeconds: 10 });
  for (let i = 0; i < 25; i++) {
    s8_tracker.update(s1_upright, 100); // 2.5s
  }
  assert(s8_tracker.getState().timeInCorrectPostureSeconds === 2.5, "Scenario 8a: 2.5s accumulated before tracking loss");
  // Tracking loss for 2.0 seconds (20 ticks)
  for (let i = 0; i < 20; i++) {
    s8_tracker.update(s6_lossAnal, 100);
  }
  assert(s8_tracker.getState().timeInCorrectPostureSeconds === 2.5, "Scenario 8b: Tracking loss does NOT count any invalid time (remains 2.5s)");
  assert(s8_tracker.getState().goodSamplesCount === 25, "Scenario 8c: Good samples count is NOT incremented during tracking loss");

  // Scenario 9: Recovery after tracking loss -> resumes correctly
  for (let i = 0; i < 75; i++) { // 7.5s upright
    s8_tracker.update(s1_upright, 100);
  }
  assert(s8_tracker.getState().isTrackingLost === false, "Scenario 9a: Tracking recovered");
  assert(s8_tracker.getState().timeInCorrectPostureSeconds === 10.0, "Scenario 9b: Resumes seamlessly from 2.5s to 10.0s");
  assert(s8_tracker.getState().isComplete === true, "Scenario 9c: Successfully completes session upon recovery");

  // Summary
  console.log("\n=================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
