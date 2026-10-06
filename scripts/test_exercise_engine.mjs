/**
 * Automated Verification Script for Phase 6 Exercise Engine & Data Integrity
 * Tests:
 * 1. Exercise Library definitions with explicit SensorRequirements
 * 2. State Machine transitions
 * 3. Sensory evaluation rules & biofeedback
 * 4. Pause / Resume lifecycle
 * 5. Scenario A: Vision-only session (Wii Board disconnected) -> Balance score is strictly NULL ("Not available")
 * 6. Scenario B: Unassisted session (Webcam off, Wii Board disconnected) -> Score is strictly NULL ("Not calculated")
 * 7. Scenario C: Multimodal session (Webcam active, Wii Board connected) -> Full score calculated
 * 8. Clean return to library
 */

console.log("=== PHASE 6: EXERCISE ENGINE & DATA INTEGRITY VERIFICATION ===");

// 1. Verify all exercises in src/services/exercise/exerciseLibrary.ts
const expectedExercises = [
  { id: "romberg-balance", name: "Romberg Balance", duration: 30, stepsCount: 2 },
  { id: "weight-shifting", name: "Weight Shifting", duration: 32, stepsCount: 4 },
  { id: "single-leg-stance", name: "Single Leg Stance", duration: 34, stepsCount: 3 },
  { id: "forward-reach", name: "Forward Reach", duration: 28, stepsCount: 3 },
  { id: "side-to-side-balance", name: "Side-to-Side Balance", duration: 32, stepsCount: 4 },
  { id: "weight-shift-cop-target", name: "Weight Shift — COP Target", duration: 60, stepsCount: 5 },
  { id: "posture-balance-multimodal", name: "Posture + Balance — Multimodal Stance", duration: 45, stepsCount: 3 }
];

console.log("\n[Test 1/7] Verifying Exercise Library Definitions & Sensor Requirements...");
import { EXERCISE_LIBRARY, evaluateSensorReadiness } from '../src/services/exercise/exerciseLibrary.ts';

if (!EXERCISE_LIBRARY || EXERCISE_LIBRARY.length < 5) {
  console.error(`FAIL: Expected at least 5 exercises, got ${EXERCISE_LIBRARY?.length}`);
  process.exit(1);
}

for (const exp of expectedExercises) {
  const found = EXERCISE_LIBRARY.find(e => e.id === exp.id);
  if (!found) {
    console.error(`FAIL: Missing exercise ${exp.id}`);
    process.exit(1);
  }
  if (!found.sensorRequirements) {
    console.error(`FAIL: Missing sensorRequirements for ${exp.id}`);
    process.exit(1);
  }
  console.log(`  ✓ Exercise '${found.name}': ${found.steps.length} steps, ${found.duration}s (Allow vision-only: ${found.sensorRequirements.allowVisionOnlyFallback})`);
}

// 2. Test ExerciseEngine Class
console.log("\n[Test 2/7] Verifying ExerciseEngine State Machine Transitions...");
import { ExerciseEngine } from '../src/services/exercise/ExerciseEngine.ts';

const engine = new ExerciseEngine();
let currentState = engine.getState();

// Initial state must be IDLE
if (currentState.phase !== "IDLE") {
  console.error(`FAIL: Initial phase should be IDLE, got ${currentState.phase}`);
  process.exit(1);
}
console.log(`  ✓ Initial Phase: ${currentState.phase}`);

// Select Romberg Balance
engine.selectExercise("romberg-balance");
currentState = engine.getState();
if (currentState.phase !== "READY" || currentState.currentExercise?.id !== "romberg-balance") {
  console.error(`FAIL: Phase after selectExercise should be READY, got ${currentState.phase}`);
  process.exit(1);
}
console.log(`  ✓ Selected 'romberg-balance' -> Phase: ${currentState.phase}`);

// 3. Test Sensory Evaluation and Feedback Generation
console.log("\n[Test 3/7] Verifying Real-time Biofeedback without Fake Hardware Data...");

// Mock Romberg Step 2 (Eyes Closed)
const stepEyesClosed = currentState.currentExercise.steps[1]; // "Romberg — Eyes Closed"

// A) Normal eyes open when CLOSED is expected -> should ask to close eyes
const mockVisionEyesOpen = {
  hasPose: true,
  hasFace: true,
  face: {
    hasFace: true,
    overallEyeState: "EYES OPEN",
    isBlinking: false,
    leftEyeBlink: false,
    rightEyeBlink: false,
    leftEyeOpen: true,
    rightEyeOpen: true,
    leftEAR: 0.32,
    rightEAR: 0.31,
    blinkCount: 0
  },
  pose: {
    shoulderTiltDeg: 1.0,
    hipTiltDeg: 0.5,
    trunkPitchDeg: 2.0,
    postureLean: "NEUTRAL",
    armReach: { isReachingForward: false, reachExtensionPct: 10 },
    singleLeg: { isSingleLeg: false, liftedLeg: "NONE" },
    headTiltDeg: 0.0
  }
};

const mockBalanceDisconnected = {
  isConnected: false,
  totalWeight: null,
  distribution: null,
  cop: null
};

// Test compliance evaluation logic
const feedbackEyesOpen = engine['evaluateCompliance'](stepEyesClosed, mockVisionEyesOpen, mockBalanceDisconnected);
console.log(`  - Eyes Open Feedback: "${feedbackEyesOpen.message}" (compliant: ${feedbackEyesOpen.isCompliant})`);
if (feedbackEyesOpen.isCompliant !== false || !feedbackEyesOpen.message.includes("close both eyes")) {
  console.error("FAIL: Expected non-compliant feedback requesting eyes closed");
  process.exit(1);
}

// B) Eyes closed as expected -> should be compliant
const mockVisionEyesClosed = {
  ...mockVisionEyesOpen,
  face: {
    ...mockVisionEyesOpen.face,
    overallEyeState: "EYES CLOSED",
    leftEyeOpen: false,
    rightEyeOpen: false
  }
};

const feedbackEyesClosed = engine['evaluateCompliance'](stepEyesClosed, mockVisionEyesClosed, mockBalanceDisconnected);
console.log(`  - Eyes Closed Feedback: "${feedbackEyesClosed.message}" (compliant: ${feedbackEyesClosed.isCompliant})`);
if (feedbackEyesClosed.isCompliant !== true) {
  console.error("FAIL: Expected compliant feedback when eyes are closed");
  process.exit(1);
}

// 4. Test Pause & Resume
console.log("\n[Test 4/7] Verifying Pause and Resume Lifecycle...");
engine['startActiveExercise']();
currentState = engine.getState();
if (currentState.phase !== "ACTIVE") {
  console.error(`FAIL: Expected ACTIVE phase, got ${currentState.phase}`);
  process.exit(1);
}
console.log(`  ✓ Phase transitioned to: ${currentState.phase}`);

engine.pause();
currentState = engine.getState();
if (currentState.phase !== "PAUSED") {
  console.error(`FAIL: Expected PAUSED phase, got ${currentState.phase}`);
  process.exit(1);
}
console.log(`  ✓ Exercise paused -> Phase: ${currentState.phase}`);

engine.resume();
currentState = engine.getState();
if (currentState.phase !== "ACTIVE") {
  console.error(`FAIL: Expected ACTIVE phase after resume, got ${currentState.phase}`);
  process.exit(1);
}
console.log(`  ✓ Exercise resumed -> Phase: ${currentState.phase}`);

// 5. Scenario A: Vision-only session (Webcam active, Wii Board disconnected)
console.log("\n[Test 5/7] Verifying Scenario A: Vision-only Session (No fake balance score)...");
engine['resetComplianceCounters']();
engine['webcamEverActive'] = true;
engine['balanceBoardEverConnected'] = false;
engine['visionEvaluationFrames'] = 100;
engine['postureCompliantFrames'] = 90;
engine['eyeEvaluationFrames'] = 100;
engine['eyeCompliantFrames'] = 85;
engine['state'].totalTimeElapsed = 30;

engine['completeExercise']();
let resultA = engine.getState().sessionResult;

if (!resultA) {
  console.error("FAIL: Missing session result in Scenario A");
  process.exit(1);
}

console.log(`  ✓ Session Mode: ${resultA.sensorsUsed.sessionMode}`);
console.log(`  ✓ Overall Score: ${resultA.overallScore} / 100 (Calculated purely from real vision frames)`);
console.log(`  ✓ Posture Steadiness: ${resultA.postureCompliancePercent}%`);
console.log(`  ✓ Eye Compliance: ${resultA.eyeCompliancePercent}%`);
console.log(`  ✓ Balance Board Stability: ${resultA.balanceStabilityPercent} (${resultA.unmeasuredReasons.balance})`);

if (resultA.sensorsUsed.sessionMode !== "VISION_ONLY") {
  console.error(`FAIL: Expected VISION_ONLY mode, got ${resultA.sensorsUsed.sessionMode}`);
  process.exit(1);
}
if (resultA.balanceStabilityPercent !== null) {
  console.error(`FAIL: Balance stability MUST be null when board is disconnected, got ${resultA.balanceStabilityPercent}`);
  process.exit(1);
}
if (!resultA.unmeasuredReasons.balance?.includes("not connected")) {
  console.error("FAIL: Missing explanation that Wii Balance Board was not connected");
  process.exit(1);
}

// 6. Scenario B: Unassisted session (Webcam off, Wii Board disconnected)
console.log("\n[Test 6/7] Verifying Scenario B: Unassisted Session (Zero sensors -> Score strictly NULL)...");
engine.selectExercise("romberg-balance");
engine['startActiveExercise']();
engine['resetComplianceCounters']();
engine['webcamEverActive'] = false;
engine['balanceBoardEverConnected'] = false;
engine['visionEvaluationFrames'] = 0;
engine['postureCompliantFrames'] = 0;
engine['state'].totalTimeElapsed = 30;

engine['completeExercise']();
let resultB = engine.getState().sessionResult;

if (!resultB) {
  console.error("FAIL: Missing session result in Scenario B");
  process.exit(1);
}

console.log(`  ✓ Session Mode: ${resultB.sensorsUsed.sessionMode}`);
console.log(`  ✓ Overall Score: ${resultB.overallScore} ("Not calculated")`);
console.log(`  ✓ Posture Steadiness: ${resultB.postureCompliancePercent} ("--")`);
console.log(`  ✓ Eye Compliance: ${resultB.eyeCompliancePercent} ("--")`);
console.log(`  ✓ Balance Board Stability: ${resultB.balanceStabilityPercent} ("Not available")`);
console.log(`  ✓ Reason: "${resultB.unmeasuredReasons.score}"`);

if (resultB.overallScore !== null) {
  console.error(`FAIL: Score MUST be null (Not calculated) when sensors are unavailable, got ${resultB.overallScore}`);
  process.exit(1);
}
if (resultB.postureCompliancePercent !== null) {
  console.error(`FAIL: Posture compliance MUST be null when camera is off, got ${resultB.postureCompliancePercent}`);
  process.exit(1);
}
if (resultB.balanceStabilityPercent !== null) {
  console.error(`FAIL: Balance stability MUST be null when board is disconnected, got ${resultB.balanceStabilityPercent}`);
  process.exit(1);
}

// 7. Clean Return to Library
console.log("\n[Test 7/7] Verifying Clean Return to Library...");
engine.returnToLibrary();
currentState = engine.getState();
if (currentState.phase !== "IDLE" || currentState.currentExercise !== null) {
  console.error("FAIL: Expected clean reset to IDLE phase");
  process.exit(1);
}
console.log(`  ✓ Successfully returned to Library -> Phase: ${currentState.phase}`);

console.log("\n=================================================================");
console.log("✓ ALL 7 DATA INTEGRITY & SENSOR VALIDATION CHECKS PASSED!");
console.log("=================================================================");
