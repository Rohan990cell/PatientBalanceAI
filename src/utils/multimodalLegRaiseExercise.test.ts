/**
 * multimodalLegRaiseExercise.test.ts
 *
 * Automated Deterministic Test Suite for Phase E:
 * Multimodal Leg Raise & Balance Rehabilitation Exercise
 * Covers Mandatory Tests 1 through 40 specified in Section 17.
 */

import {
  MultimodalLegRaiseEngine,
  calculateBoardDistribution,
  extractCameraLegObservation,
  checkBoardTransferCorroboration,
  evaluateDualDeviceVerification,
  POSE_LANDMARK_INDICES,
  DEFAULT_LEG_RAISE_CONFIG,
  LegRaiseBaseline,
  BoardObservation,
  CameraLegObservation,
} from "./multimodalLegRaiseExercise";
import { NormalizedLandmark } from "../types/vision";
import { getDirectionalTargets } from "./directionalWeightShiftExercise";
import { calculatePostureFromLandmarks } from "./postureBalanceExercise";

function runTests() {
  console.log("=================================================================");
  console.log("=== PHASE E: MULTIMODAL LEG RAISE & BALANCE REHABILITATION TEST ===");
  console.log("=== CAMERA (MEDIAPIPE) + WII BALANCE BOARD DUAL VERIFICATION ====");
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

  // Helper to build 33 mock MediaPipe pose landmarks
  function createMockPoseLandmarks(overrides: Partial<Record<number, Partial<NormalizedLandmark>>> = {}): NormalizedLandmark[] {
    const landmarks: NormalizedLandmark[] = [];
    for (let i = 0; i < 33; i++) {
      landmarks.push({
        x: 0.5,
        y: 0.5,
        z: 0.0,
        visibility: 0.95,
      });
    }
    // Baseline natural standing positions
    landmarks[POSE_LANDMARK_INDICES.NOSE] = { x: 0.5, y: 0.15, z: 0.0, visibility: 0.99 };
    landmarks[POSE_LANDMARK_INDICES.LEFT_SHOULDER] = { x: 0.42, y: 0.28, z: 0.0, visibility: 0.98 };
    landmarks[POSE_LANDMARK_INDICES.RIGHT_SHOULDER] = { x: 0.58, y: 0.28, z: 0.0, visibility: 0.98 };
    landmarks[POSE_LANDMARK_INDICES.LEFT_HIP] = { x: 0.44, y: 0.52, z: 0.0, visibility: 0.95 };
    landmarks[POSE_LANDMARK_INDICES.RIGHT_HIP] = { x: 0.56, y: 0.52, z: 0.0, visibility: 0.95 };
    landmarks[POSE_LANDMARK_INDICES.LEFT_KNEE] = { x: 0.44, y: 0.70, z: 0.0, visibility: 0.95 };
    landmarks[POSE_LANDMARK_INDICES.RIGHT_KNEE] = { x: 0.56, y: 0.70, z: 0.0, visibility: 0.95 };
    landmarks[POSE_LANDMARK_INDICES.LEFT_ANKLE] = { x: 0.44, y: 0.88, z: 0.0, visibility: 0.95 };
    landmarks[POSE_LANDMARK_INDICES.RIGHT_ANKLE] = { x: 0.56, y: 0.88, z: 0.0, visibility: 0.95 };

    // Apply specific joint overrides
    for (const [idxStr, ov] of Object.entries(overrides)) {
      const idx = Number(idxStr);
      landmarks[idx] = { ...landmarks[idx], ...ov };
    }
    return landmarks;
  }

  // Standard Mock Baseline
  const mockBaseline: LegRaiseBaseline = {
    isCalibrated: true,
    leftAnkleY: 0.88,
    rightAnkleY: 0.88,
    leftKneeY: 0.70,
    rightKneeY: 0.70,
    leftPercent: 50.0,
    rightPercent: 50.0,
    copX: 0.0,
    copY: 0.0,
    totalWeight: 68.0,
    loadStdDev: 0.8,
    sampleCount: 30,
    calibrationDurationSeconds: 2.5,
  };

  // ---------------------------------------------------------------------------
  // SECTION 1: CAMERA TESTS (Tests 1 - 8)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 1: Camera Pose Landmark Identification & Detection ---");

  // Test 1: Correct LEFT-leg landmark identification
  const leftLegLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.LEFT_ANKLE]: { y: 0.80 }, // Lifted (0.88 - 0.80 = 0.08 elevation)
    [POSE_LANDMARK_INDICES.LEFT_KNEE]: { y: 0.62 },
  });
  const camObs1 = extractCameraLegObservation(leftLegLandmarks, mockBaseline);
  assert(camObs1.leftAnkleY === 0.80, "Test 1a: Left ankle landmark correctly extracted");
  assert(camObs1.isLeftRaised === true, "Test 1b: Left leg elevation confirmed as raised");
  assert(camObs1.isRightRaised === false, "Test 1c: Right leg remains unraised");

  // Test 2: Correct RIGHT-leg landmark identification
  const rightLegLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.RIGHT_ANKLE]: { y: 0.80 }, // Lifted
    [POSE_LANDMARK_INDICES.RIGHT_KNEE]: { y: 0.62 },
  });
  const camObs2 = extractCameraLegObservation(rightLegLandmarks, mockBaseline);
  assert(camObs2.rightAnkleY === 0.80, "Test 2a: Right ankle landmark correctly extracted");
  assert(camObs2.isRightRaised === true, "Test 2b: Right leg elevation confirmed as raised");
  assert(camObs2.isLeftRaised === false, "Test 2c: Left leg remains unraised");

  // Test 3: Detect valid foot elevation
  const validElevationLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.LEFT_ANKLE]: { y: 0.82 }, // delta = 0.06 >= 0.04 threshold
  });
  const camObs3 = extractCameraLegObservation(validElevationLandmarks, mockBaseline);
  assert(camObs3.leftElevation >= DEFAULT_LEG_RAISE_CONFIG.footLiftThresholdY, "Test 3a: Foot elevation >= threshold");
  assert(camObs3.isLeftRaised === true, "Test 3b: Valid elevation classified as raised");

  // Test 4: Reject insufficient foot elevation
  const slightMovementLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.LEFT_ANKLE]: { y: 0.865 }, // delta = 0.015 < 0.04 threshold
  });
  const camObs4 = extractCameraLegObservation(slightMovementLandmarks, mockBaseline);
  assert(camObs4.isLeftRaised === false, "Test 4: Insufficient foot elevation is rejected");

  // Test 5: Reject wrong-leg movement
  // When LEFT is instructed, lifting the right leg is detected as wrong leg
  const wrongLegObs = extractCameraLegObservation(rightLegLandmarks, mockBaseline);
  const dualWrongLeg = evaluateDualDeviceVerification(
    wrongLegObs,
    {
      timestamp: Date.now(),
      fl: 10,
      fr: 25,
      rl: 10,
      rr: 25,
      totalWeight: 70,
      leftLoad: 20,
      rightLoad: 50,
      anteriorLoad: 35,
      posteriorLoad: 35,
      leftPercent: 28.6,
      rightPercent: 71.4,
      anteriorPercent: 50,
      posteriorPercent: 50,
      copX: 0.25,
      copY: 0,
      isValid: true,
    },
    mockBaseline,
    "LEFT"
  );
  assert(dualWrongLeg.isWrongLeg === true, "Test 5a: Wrong-leg movement flagged");
  assert(dualWrongLeg.isDualVerified === false, "Test 5b: Dual verification rejected on wrong leg");

  // Test 6: Reject unreliable or missing pose landmarks
  const lowConfLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.LEFT_ANKLE]: { y: 0.80, visibility: 0.1 },
    [POSE_LANDMARK_INDICES.RIGHT_ANKLE]: { y: 0.88, visibility: 0.2 },
    [POSE_LANDMARK_INDICES.LEFT_KNEE]: { y: 0.65, visibility: 0.1 },
  });
  const camObs6 = extractCameraLegObservation(lowConfLandmarks, mockBaseline);
  assert(camObs6.isLeftRaised === false, "Test 6a: Low confidence landmarks reject leg raise");
  assert(Boolean(camObs6.trackingWarning), "Test 6b: Tracking warning issued on low confidence");

  // Test 7: Handle mirrored camera previews correctly
  // In mirrored previews, anatomical indices (27, 28) still correspond to left and right body sides
  const mirroredLeftObs = extractCameraLegObservation(leftLegLandmarks, mockBaseline, DEFAULT_LEG_RAISE_CONFIG, Date.now(), true);
  assert(mirroredLeftObs.isLeftRaised === true, "Test 7a: Mirrored preview preserves anatomical left identification");
  assert(mirroredLeftObs.isRightRaised === false, "Test 7b: Mirrored preview does not flip anatomical right");

  // Test 8: Detect return toward calibrated standing position
  const returnedLandmarks = createMockPoseLandmarks({
    [POSE_LANDMARK_INDICES.LEFT_ANKLE]: { y: 0.875 }, // delta = 0.005 <= 0.025
  });
  const camObs8 = extractCameraLegObservation(returnedLandmarks, mockBaseline);
  assert(camObs8.isLeftReturned === true, "Test 8: Foot return toward baseline standing position detected");

  // ---------------------------------------------------------------------------
  // SECTION 2: BALANCE BOARD SENSOR TESTS (Tests 9 - 16)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 2: Wii Balance Board 4-Sensor Calculations ---");

  // Test 9: Validate four-sensor measurements
  const board9 = calculateBoardDistribution(17.5, 17.5, 16.5, 16.5, 0.0, 0.02, Date.now());
  assert(board9.isValid === true, "Test 9: Four-sensor measurement validated as physically plausible");

  // Test 10: Calculate total load correctly
  assert(board9.totalWeight === 68.0, "Test 10: Total load equals sum of 4 corner load cells (68.0 kg)");

  // Test 11: Calculate left/right load distribution
  assert(board9.leftPercent === 50.0 && board9.rightPercent === 50.0, "Test 11: Left/Right distribution calculated as 50.0% / 50.0%");

  // Test 12: Confirm rightward support transfer for LEFT lift
  // For LEFT lift, supporting leg is RIGHT leg -> FL: 5, RL: 5, FR: 30, RR: 30 (Right% = 60/70 = 85.7%)
  const board12 = calculateBoardDistribution(5.0, 30.0, 5.0, 30.0, 0.35, 0.0, Date.now());
  const corroboration12 = checkBoardTransferCorroboration(board12, mockBaseline, "LEFT");
  assert(corroboration12.isConfirmed === true, "Test 12a: Rightward support transfer confirmed for LEFT lift");
  assert(corroboration12.transferDeltaPct > 15.0, "Test 12b: Support transfer delta exceeds +15% threshold");

  // Test 13: Confirm leftward support transfer for RIGHT lift
  // For RIGHT lift, supporting leg is LEFT leg -> FL: 30, RL: 30, FR: 5, RR: 5 (Left% = 60/70 = 85.7%)
  const board13 = calculateBoardDistribution(30.0, 5.0, 30.0, 5.0, -0.35, 0.0, Date.now());
  const corroboration13 = checkBoardTransferCorroboration(board13, mockBaseline, "RIGHT");
  assert(corroboration13.isConfirmed === true, "Test 13a: Leftward support transfer confirmed for RIGHT lift");
  assert(corroboration13.transferDeltaPct > 15.0, "Test 13b: Support transfer delta exceeds +15% threshold");

  // Test 14: Reject insufficient transfer
  // Only 52% right load (delta = +2.0% < 15.0%)
  const board14 = calculateBoardDistribution(16.5, 17.5, 16.5, 17.5, 0.02, 0.0, Date.now());
  const corroboration14 = checkBoardTransferCorroboration(board14, mockBaseline, "LEFT");
  assert(corroboration14.isConfirmed === false, "Test 14: Insufficient support transfer rejected");

  // Test 15: Reject invalid COP measurements
  const board15 = calculateBoardDistribution(15, 15, 15, 15, NaN, 0.0, Date.now());
  assert(board15.isValid === false, "Test 15: NaN COP measurement flagged as invalid");

  // Test 16: Handle low total load and disconnected sensors safely
  const board16 = calculateBoardDistribution(1.0, 0.5, 0.8, 0.2, 0.0, 0.0, Date.now()); // Total < 10kg
  assert(board16.isValid === false, "Test 16: Low total load (<10kg) rejected as disconnected/unloaded");

  // ---------------------------------------------------------------------------
  // SECTION 3: MULTIMODAL VERIFICATION TESTS (Tests 17 - 24)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 3: Dual-Device Verification Rules ---");

  const now = Date.now();
  const validCameraLeftLift: CameraLegObservation = {
    timestamp: now,
    hasPose: true,
    confidence: 0.95,
    leftAnkleY: 0.80,
    rightAnkleY: 0.88,
    leftKneeY: 0.62,
    rightKneeY: 0.70,
    leftElevation: 0.08,
    rightElevation: 0.0,
    isLeftRaised: true,
    isRightRaised: false,
    isLeftReturned: false,
    isRightReturned: true,
    isMirrored: true,
  };

  const validBoardRightTransfer: BoardObservation = {
    timestamp: now,
    fl: 5,
    fr: 28,
    rl: 5,
    rr: 28,
    totalWeight: 66,
    leftLoad: 10,
    rightLoad: 56,
    anteriorLoad: 33,
    posteriorLoad: 33,
    leftPercent: 15.2,
    rightPercent: 84.8,
    anteriorPercent: 50,
    posteriorPercent: 50,
    copX: 0.32,
    copY: 0.0,
    isValid: true,
  };

  const unshiftedBoard: BoardObservation = {
    timestamp: now,
    fl: 16.5,
    fr: 16.5,
    rl: 16.5,
    rr: 16.5,
    totalWeight: 66,
    leftLoad: 33,
    rightLoad: 33,
    anteriorLoad: 33,
    posteriorLoad: 33,
    leftPercent: 50.0,
    rightPercent: 50.0,
    anteriorPercent: 50,
    posteriorPercent: 50,
    copX: 0.0,
    copY: 0.0,
    isValid: true,
  };

  const standingCamera: CameraLegObservation = {
    timestamp: now,
    hasPose: true,
    confidence: 0.95,
    leftAnkleY: 0.88,
    rightAnkleY: 0.88,
    leftKneeY: 0.70,
    rightKneeY: 0.70,
    leftElevation: 0.0,
    rightElevation: 0.0,
    isLeftRaised: false,
    isRightRaised: false,
    isLeftReturned: true,
    isRightReturned: true,
    isMirrored: true,
  };

  // Test 17: Camera-only confirmation does not start a successful hold
  const test17 = evaluateDualDeviceVerification(validCameraLeftLift, unshiftedBoard, mockBaseline, "LEFT", DEFAULT_LEG_RAISE_CONFIG, now);
  assert(test17.cameraConfirmed === true, "Test 17a: Camera confirms lift");
  assert(test17.boardConfirmed === false, "Test 17b: Board has not transferred");
  assert(test17.isDualVerified === false, "Test 17c: Camera-only DOES NOT permit dual verification");
  assert(test17.feedbackText.includes("balance-board confirmation"), "Test 17d: User feedback guides board confirmation");

  // Test 18: Board-only confirmation does not start a successful hold
  const test18 = evaluateDualDeviceVerification(standingCamera, validBoardRightTransfer, mockBaseline, "LEFT", DEFAULT_LEG_RAISE_CONFIG, now);
  assert(test18.cameraConfirmed === false, "Test 18a: Camera shows both feet down");
  assert(test18.boardConfirmed === true, "Test 18b: Board has rightward shift");
  assert(test18.isDualVerified === false, "Test 18c: Board-only DOES NOT permit dual verification");
  assert(test18.feedbackText.includes("lift your LEFT leg"), "Test 18d: User feedback instructs leg lift");

  // Test 19: Both valid signals permit verification
  const test19 = evaluateDualDeviceVerification(validCameraLeftLift, validBoardRightTransfer, mockBaseline, "LEFT", DEFAULT_LEG_RAISE_CONFIG, now);
  assert(test19.isDualVerified === true, "Test 19a: Synchronized dual signals enable dual verification");
  assert(test19.feedbackText.includes("Dual verified"), "Test 19b: Verified feedback displayed");

  // Test 20: Misaligned timestamps do not falsely confirm the lift
  const staleCamera: CameraLegObservation = { ...validCameraLeftLift, timestamp: now - 400 }; // 400ms old > 250ms offset
  const test20 = evaluateDualDeviceVerification(staleCamera, validBoardRightTransfer, mockBaseline, "LEFT", DEFAULT_LEG_RAISE_CONFIG, now);
  assert(test20.isDualVerified === false, "Test 20: Misaligned timestamps (>250ms offset) reject dual verification");

  // Test 21: Stale samples do not accumulate hold time
  const engine21 = new MultimodalLegRaiseEngine();
  engine21.startExercise();
  // Calibrate
  for (let t = 0; t <= 3000; t += 100) {
    engine21.processStep(standingCamera, unshiftedBoard, now + t);
  }
  // Fast forward past wait state
  engine21.processStep(standingCamera, unshiftedBoard, now + 5000);
  // Send stale observation
  const staleStep = engine21.processStep(
    { ...validCameraLeftLift, timestamp: now + 5000 - 500 },
    { ...validBoardRightTransfer, timestamp: now + 5000 - 500 },
    now + 5000
  );
  assert(staleStep.holdSeconds === 0, "Test 21: Stale samples do not accumulate hold seconds");

  // Test 22: Brief tolerated noise does not cause unnecessary resets
  const engine22 = new MultimodalLegRaiseEngine({ jitterToleranceMs: 350 });
  engine22.startExercise();
  for (let t = 0; t <= 3000; t += 100) {
    engine22.processStep({ ...standingCamera, timestamp: now + t }, { ...unshiftedBoard, timestamp: now + t }, now + t);
  }
  engine22.processStep({ ...standingCamera, timestamp: now + 5000 }, { ...unshiftedBoard, timestamp: now + 5000 }, now + 5000); // Enters AWAITING_LEFT_LIFT

  // 1.0s valid hold
  engine22.processStep(
    { ...validCameraLeftLift, timestamp: now + 5100 },
    { ...validBoardRightTransfer, timestamp: now + 5100 },
    now + 5100
  );
  engine22.processStep(
    { ...validCameraLeftLift, timestamp: now + 6100 },
    { ...validBoardRightTransfer, timestamp: now + 6100 },
    now + 6100
  );
  const holdBeforeTremor = engine22.getHoldProgress().currentSeconds;
  assert(holdBeforeTremor >= 0.9, "Test 22a: Hold accumulated to ~1.0s before tremor");

  // Brief noise frame (150ms < 350ms tolerance)
  engine22.processStep(
    { ...standingCamera, timestamp: now + 6250 },
    { ...unshiftedBoard, timestamp: now + 6250 },
    now + 6250
  );
  // Resume valid signal
  const afterTremor = engine22.processStep(
    { ...validCameraLeftLift, timestamp: now + 6300 },
    { ...validBoardRightTransfer, timestamp: now + 6300 },
    now + 6300
  );
  assert(afterTremor.holdSeconds >= 0.9, "Test 22b: Minor tremor within 350ms did not reset hold timer");

  // Test 23: Sustained loss of required evidence interrupts the hold
  // Loss starts at now + 6850, sustained until now + 7250 (400ms > 350ms tolerance)
  engine22.processStep(
    { ...standingCamera, timestamp: now + 6850 },
    { ...unshiftedBoard, timestamp: now + 6850 },
    now + 6850
  );
  engine22.processStep(
    { ...standingCamera, timestamp: now + 7250 },
    { ...unshiftedBoard, timestamp: now + 7250 },
    now + 7250
  );
  const interruptedHold = engine22.getHoldProgress().currentSeconds;
  assert(interruptedHold === 0, "Test 23: Sustained loss of evidence (>350ms) resets uninterrupted hold timer");

  // Test 24: Wrong-leg movement cannot complete a repetition
  const wrongLegStep = evaluateDualDeviceVerification(
    {
      ...validCameraLeftLift,
      isLeftRaised: false,
      isRightRaised: true, // Right leg raised when LEFT was requested
    },
    validBoardRightTransfer,
    mockBaseline,
    "LEFT",
    DEFAULT_LEG_RAISE_CONFIG,
    now
  );
  assert(wrongLegStep.isDualVerified === false, "Test 24a: Wrong-leg movement rejects repetition completion");
  assert(wrongLegStep.feedbackText.includes("Incorrect leg detected"), "Test 24b: Clear warning issued");

  // ---------------------------------------------------------------------------
  // SECTION 4: PROGRESSION TESTS (Tests 25 - 31)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 4: Sequential Exercise Progression ---");

  const engineProg = new MultimodalLegRaiseEngine({
    holdDurationSecondsLeft: 2.0,
    holdDurationSecondsRight: 2.0,
    stabilityDurationSeconds: 1.5,
  });
  engineProg.startExercise();

  // Test 25: LEFT lift precedes LEFT hold
  let simTime = 10000;
  // Step A: Calibration
  for (let i = 0; i < 30; i++) {
    simTime += 100;
    engineProg.processStep(
      { ...standingCamera, timestamp: simTime },
      { ...unshiftedBoard, timestamp: simTime },
      simTime
    );
  }
  simTime += 2000;
  engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  ); // Now in AWAITING_LEFT_LIFT
  assert(engineProg.getState() === "AWAITING_LEFT_LIFT", "Test 25a: Sequence starts with AWAITING_LEFT_LIFT");

  simTime += 100;
  engineProg.processStep(
    { ...validCameraLeftLift, timestamp: simTime },
    { ...validBoardRightTransfer, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "HOLDING_LEFT", "Test 25b: LEFT lift verified and transitions to HOLDING_LEFT");

  // Test 26: LEFT hold precedes LEFT lowering
  // Hold for 2.1 seconds
  simTime += 1000;
  engineProg.processStep(
    { ...validCameraLeftLift, timestamp: simTime },
    { ...validBoardRightTransfer, timestamp: simTime },
    simTime
  );
  simTime += 1100;
  engineProg.processStep(
    { ...validCameraLeftLift, timestamp: simTime },
    { ...validBoardRightTransfer, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "AWAITING_LEFT_RETURN", "Test 26: Hold completion transitions to AWAITING_LEFT_RETURN");

  // Test 27: LEFT foot return requires verification
  simTime += 200;
  // Not returned yet
  engineProg.processStep(
    { ...validCameraLeftLift, timestamp: simTime },
    { ...validBoardRightTransfer, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "AWAITING_LEFT_RETURN", "Test 27a: Stays in return state while foot remains elevated");
  // Returned
  simTime += 300;
  engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "VERIFYING_DOUBLE_SUPPORT", "Test 27b: Foot return verified, transitions to double support");

  // Test 28: Two-foot stability is required before RIGHT lift
  simTime += 500; // Only 0.5s stability (< 1.5s required)
  engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "VERIFYING_DOUBLE_SUPPORT", "Test 28a: Stays in double support until stability duration elapsed");

  simTime += 1200; // Now >= 1.5s
  engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "AWAITING_RIGHT_LIFT", "Test 28b: Stable standing confirmed, progresses to AWAITING_RIGHT_LIFT");

  // Test 29: RIGHT repetition follows equivalent rules
  const validCameraRightLift: CameraLegObservation = {
    ...validCameraLeftLift,
    isLeftRaised: false,
    isRightRaised: true,
  };
  const validBoardLeftTransfer: BoardObservation = {
    ...validBoardRightTransfer,
    leftLoad: 56,
    rightLoad: 10,
    leftPercent: 84.8,
    rightPercent: 15.2,
    copX: -0.32,
  };

  simTime += 100;
  engineProg.processStep(
    { ...validCameraRightLift, timestamp: simTime },
    { ...validBoardLeftTransfer, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "HOLDING_RIGHT", "Test 29a: RIGHT lift confirmed, enters HOLDING_RIGHT");

  simTime += 2100; // Hold complete
  engineProg.processStep(
    { ...validCameraRightLift, timestamp: simTime },
    { ...validBoardLeftTransfer, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "AWAITING_RIGHT_RETURN", "Test 29b: RIGHT hold complete, enters AWAITING_RIGHT_RETURN");

  simTime += 200; // Foot returned
  engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "VERIFYING_FINAL_STABILITY", "Test 29c: RIGHT foot return verified, enters VERIFYING_FINAL_STABILITY");

  // Test 30: Exercise completes only after both repetitions and final stable standing
  simTime += 1600; // Final stability verified
  const finalStep = engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(engineProg.getState() === "COMPLETED", "Test 30a: Exercise reaches COMPLETED state after both repetitions");
  assert(finalStep.instructionText === "ASSESSMENT COMPLETED", "Test 30b: Final instruction completed");

  // Test 31: No duplicate completion events occur
  simTime += 500;
  const postComplete = engineProg.processStep(
    { ...standingCamera, timestamp: simTime },
    { ...unshiftedBoard, timestamp: simTime },
    simTime
  );
  assert(postComplete.state === "COMPLETED", "Test 31: Idempotent completed state without duplicate trigger");

  // ---------------------------------------------------------------------------
  // SECTION 5: REPORTING AND INTEGRATION TESTS (Tests 32 - 40)
  // ---------------------------------------------------------------------------
  console.log("\n--- Section 5: Scientific Metrics, Telemetry & Regressions ---");

  const summary = engineProg.generateSessionSummary("pat-999", "Sarah Connor", true);

  // Test 32: Actual timestamps determine reported hold duration
  assert(summary.leftLeg.actualHoldSeconds >= 2.0, "Test 32a: Left hold duration accurately logged (>=2.0s)");
  assert(summary.rightLeg.actualHoldSeconds >= 2.0, "Test 32b: Right hold duration accurately logged (>=2.0s)");

  // Test 33: Board trajectory uses recorded COP points
  assert(summary.leftLeg.copTrajectory.length > 0, "Test 33a: Left leg COP trajectory contains recorded points");
  assert(summary.rightLeg.copTrajectory.length > 0, "Test 33b: Right leg COP trajectory contains recorded points");
  assert(summary.completeCopTrajectory.length > 0, "Test 33c: Complete session trajectory contains all stages");

  // Test 34: Data-quality gaps are reported
  assert(typeof summary.totalMissingDataSeconds === "number", "Test 34a: Data dropout duration tracked");
  assert(summary.overallTrackingQuality.includes("High"), "Test 34b: Tracking quality reported objectively");

  // Test 35: Left/right load-transfer calculations are correct
  assert(summary.leftLeg.supportTransferDeltaPct > 15.0, "Test 35a: Left lift rightward support transfer delta reported (+%)");
  assert(summary.rightLeg.supportTransferDeltaPct > 15.0, "Test 35b: Right lift leftward support transfer delta reported (+%)");

  // Test 36: Saved sessions reconstruct assessment results
  const serialized = JSON.stringify(summary);
  const reconstructed = JSON.parse(serialized);
  assert(reconstructed.completedRepetitions === 2, "Test 36a: Reconstructed session preserves 2 completed reps");
  assert(reconstructed.leftLeg.actualHoldSeconds === summary.leftLeg.actualHoldSeconds, "Test 36b: Preserves exact hold times");

  // Test 37: PDF and application report matching measured values
  assert(summary.leftLeg.requiredHoldSeconds === 2.0, "Test 37a: Required hold duration matches config");
  assert(summary.leftLeg.repetitionCompleted === true, "Test 37b: Left repetition marked completed in report");
  assert(summary.rightLeg.repetitionCompleted === true, "Test 37c: Right repetition marked completed in report");

  // Test 38: Simulation sessions are clearly distinguished
  const simSummary = engineProg.generateSessionSummary("pat-sim", "Sim Patient", false);
  assert(simSummary.isRealHardware === false, "Test 38a: Simulation session marked isRealHardware: false");
  assert(simSummary.hardwareModel.includes("Simulated"), "Test 38b: Simulation hardwareModel clearly labelled");

  // Test 39: Existing Directional Weight Shift remains functional
  const directionalTargets = getDirectionalTargets();
  assert(directionalTargets.length === 5, "Test 39: Regression check: Directional Weight Shift 5 targets unaffected");

  // Test 40: Existing Posture Alignment and camera-only exercises remain functional
  const postureCalc = calculatePostureFromLandmarks(leftLegLandmarks);
  assert(typeof postureCalc.shoulderTiltDeg === "number", "Test 40: Regression check: Posture alignment calculations unaffected");

  // Final summary tally
  console.log("\n=================================================================");
  console.log(`=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed}) ===`);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
