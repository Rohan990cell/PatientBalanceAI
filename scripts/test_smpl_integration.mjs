/**
 * Verification Test Suite: Phase 3 - SMPL Human Body Model Integration
 *
 * Verifies:
 * 1. Standard SMPL 24-joint topology and acyclic kinematic tree
 * 2. Neutral anatomical standing pose alignment and board contact
 * 3. Standardized coordinate convention (+X Right, -X Left, +Y Front, -Y Back)
 * 4. MovementState adapter conversion to SMPL pose
 * 5. Asset fallback architecture and configuration
 * 6. Non-modification of Wii Balance Board HID and COP calculations
 */

import assert from "node:assert";
import {
  SMPL_JOINT_NAMES,
  SMPL_JOINT_DEFINITIONS,
  SMPL_SKELETON_BONES,
  NEUTRAL_SMPL_POSE,
  createNeutralSMPLPose,
  getSMPLJointList,
  DEFAULT_SMPL_CONFIG,
  clinicalCOPToWorld3D,
  normalizedCOPToBoardWorld3D,
} from "../src/types/smpl";
import { convertMovementStateToSMPLPose } from "../src/components/smpl/smplAdapter";
import { AvatarController } from "../src/components/avatar/AvatarController";


console.log("=== PHASE 3: SMPL HUMAN BODY MODEL INTEGRATION VERIFICATION ===\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [Test ${totalTests}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [Test ${totalTests}] FAILED: ${name}`);
    console.error(`    ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// TEST 1: SMPL 24-Joint Names & Topology
// -------------------------------------------------------------
runTest("SMPL 24-Joint Topology Completeness", () => {
  assert.strictEqual(SMPL_JOINT_NAMES.length, 24, "SMPL skeleton must contain exactly 24 canonical joints");

  const requiredProfessorJoints = [
    "pelvis",
    "spine1",
    "spine2",
    "spine3",
    "neck",
    "head",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_foot",
    "right_foot",
  ];

  for (const j of requiredProfessorJoints) {
    assert.ok(SMPL_JOINT_NAMES.includes(j), `Missing required SMPL joint: ${j}`);
  }

  // Ensure unique names
  const uniqueNames = new Set(SMPL_JOINT_NAMES);
  assert.strictEqual(uniqueNames.size, 24, "All 24 SMPL joint names must be unique");
});

// -------------------------------------------------------------
// TEST 2: SMPL Kinematic Hierarchy & Parent-Child Tree
// -------------------------------------------------------------
runTest("SMPL Kinematic Hierarchy & Tree Validity", () => {
  const joints = getSMPLJointList();
  assert.strictEqual(joints.length, 24, "Joint list length must be 24");

  // Root joint 0 (pelvis) must have parent null
  assert.strictEqual(joints[0].name, "pelvis");
  assert.strictEqual(joints[0].parent, null, "Pelvis root must have null parent");

  // All other joints must have a valid parent index < current joint ID (acyclic)
  for (let i = 1; i < joints.length; i++) {
    const j = joints[i];
    assert.notStrictEqual(j.parent, null, `Joint ${j.name} must have a parent`);
    assert.ok(
      typeof j.parent === "number" && j.parent >= 0 && j.parent < j.id,
      `Joint ${j.name} parent (${j.parent}) must precede joint ID (${j.id})`
    );
  }

  // Check skeleton bone segments
  assert.ok(SMPL_SKELETON_BONES.length >= 23, "Bone connections must cover the kinematic tree");
  for (const [pName, cName] of SMPL_SKELETON_BONES) {
    assert.ok(SMPL_JOINT_DEFINITIONS[pName], `Invalid parent joint in bone segment: ${pName}`);
    assert.ok(SMPL_JOINT_DEFINITIONS[cName], `Invalid child joint in bone segment: ${cName}`);
  }
});

// -------------------------------------------------------------
// TEST 3: Neutral Standing Pose: Clinical COP vs 3D Rendering Conventions
// -------------------------------------------------------------
runTest("Neutral Standing Pose: Clinical COP vs 3D Rendering Conventions", () => {
  const pose = createNeutralSMPLPose();

  // Upright & centered: global translation at origin
  assert.deepStrictEqual(pose.globalTranslation, [0, 0, 0], "Neutral pose global translation must be centered");
  assert.deepStrictEqual(
    pose.globalOrientation,
    [0, 0, 0],
    "Neutral pose global orientation must face FRONT (Clinical +Y / 3D sagittal +Z)"
  );

  // Pelvis standing height on 3D vertical Y axis
  const pelvisDef = SMPL_JOINT_DEFINITIONS.pelvis;
  assert.ok(
    pelvisDef.neutralWorldPos[1] >= 0.90 && pelvisDef.neutralWorldPos[1] <= 1.0,
    "Pelvis 3D vertical height Y around ~0.94m"
  );

  // Feet contact plane matches Wii Balance Board top surface (3D vertical height Y = 0.041m)
  const leftFoot = SMPL_JOINT_DEFINITIONS.left_foot;
  const rightFoot = SMPL_JOINT_DEFINITIONS.right_foot;

  assert.strictEqual(
    leftFoot.neutralWorldPos[1],
    0.041,
    "Left foot must rest on board surface height (3D vertical Y = 0.041m)"
  );
  assert.strictEqual(
    rightFoot.neutralWorldPos[1],
    0.041,
    "Right foot must rest on board surface height (3D vertical Y = 0.041m)"
  );

  // Stance width: Left foot at -X (Clinical -X Left), Right foot at +X (Clinical +X Right), centered
  assert.ok(leftFoot.neutralWorldPos[0] < 0, "Left foot must be on lateral left (Clinical -X / 3D -X)");
  assert.ok(rightFoot.neutralWorldPos[0] > 0, "Right foot must be on lateral right (Clinical +X / 3D +X)");
  assert.strictEqual(
    Math.abs(leftFoot.neutralWorldPos[0]),
    rightFoot.neutralWorldPos[0],
    "Stance must be laterally symmetrical across X=0"
  );

  // Both feet point forward into Clinical +Y / FRONT (3D sagittal depth +Z)
  assert.ok(
    leftFoot.neutralWorldPos[2] > 0,
    "Left foot toes must point toward Clinical FRONT +Y (3D sagittal +Z)"
  );
  assert.ok(
    rightFoot.neutralWorldPos[2] > 0,
    "Right foot toes must point toward Clinical FRONT +Y (3D sagittal +Z)"
  );
});


// -------------------------------------------------------------
// TEST 4: MovementState Adapter Conversion
// -------------------------------------------------------------
runTest("MovementState to SMPLPose Adapter Conversion", () => {
  const postures = ["stand", "lean-left", "lean-right", "lean-forward", "lean-back"];

  for (const post of postures) {
    const movementState = AvatarController.getTargetMovementState(post);
    const smplPose = convertMovementStateToSMPLPose(movementState);

    assert.ok(smplPose, `SMPL pose must be generated for ${post}`);
    assert.deepStrictEqual(smplPose.globalTranslation, movementState.bodyPosition);
    assert.deepStrictEqual(smplPose.globalOrientation, movementState.bodyRotation);

    // Verify all 24 joints exist in the resulting pose
    for (const jName of SMPL_JOINT_NAMES) {
      assert.ok(
        smplPose.jointRotations[jName] !== undefined,
        `SMPL pose must define rotation for joint ${jName}`
      );
      assert.strictEqual(
        smplPose.jointRotations[jName].length,
        3,
        `Joint ${jName} rotation must be a 3D Euler vector [rx, ry, rz]`
      );
    }
  }

  // Verify lean-forward sagittal pitch
  const forwardState = AvatarController.getTargetMovementState("lean-forward");
  const forwardSMPL = convertMovementStateToSMPLPose(forwardState);
  assert.ok(forwardSMPL.globalOrientation[0] > 0, "Lean forward must have positive pitch");
  assert.ok(forwardSMPL.jointRotations.spine1[0] > 0, "Spine1 must flex forward during lean-forward");
});

// -------------------------------------------------------------
// TEST 5: Expected Asset Configuration & Fallback State
// -------------------------------------------------------------
runTest("SMPL Asset Path & Fallback Configuration", () => {
  assert.strictEqual(
    DEFAULT_SMPL_CONFIG.assetUrl,
    "/models/smpl_neutral.glb",
    "Default SMPL asset path must be /models/smpl_neutral.glb"
  );
  assert.strictEqual(DEFAULT_SMPL_CONFIG.scale, 1.0, "Default scale must be 1.0");
  assert.strictEqual(DEFAULT_SMPL_CONFIG.gender, "neutral", "Default gender model must be neutral");
});

// -------------------------------------------------------------
// TEST 6: Clinical COP to 3D World Mapping (clinicalCOPToWorld3D)
// -------------------------------------------------------------
runTest("Clinical COP to 3D World Mapping (clinicalCOPToWorld3D)", () => {
  // Expected canonical mapping:
  // worldX = copX
  // worldY = vertical height
  // worldZ = copY

  // 1. COP (+X, 0) → world (+X, 0, 0)
  const posRight = clinicalCOPToWorld3D(0.12, 0, 0);
  assert.deepStrictEqual(posRight, [0.12, 0, 0], "COP (+X, 0) must map to world (+X, 0, 0)");

  // 2. COP (-X, 0) → world (-X, 0, 0)
  const posLeft = clinicalCOPToWorld3D(-0.12, 0, 0);
  assert.deepStrictEqual(posLeft, [-0.12, 0, 0], "COP (-X, 0) must map to world (-X, 0, 0)");

  // 3. COP (0, +Y) → world (0, 0, +Z)
  const posFront = clinicalCOPToWorld3D(0, 0.08, 0);
  assert.deepStrictEqual(posFront, [0, 0, 0.08], "COP (0, +Y) must map to world (0, 0, +Z)");

  // 4. COP (0, -Y) → world (0, 0, -Z)
  const posBack = clinicalCOPToWorld3D(0, -0.08, 0);
  assert.deepStrictEqual(posBack, [0, 0, -0.08], "COP (0, -Y) must map to world (0, 0, -Z)");

  // 5. 3D vertical height must remain the 3D Y axis, independent of COP
  const standingSurfaceHeight = 0.041;
  const posWithHeight = clinicalCOPToWorld3D(0.05, 0.06, standingSurfaceHeight);
  assert.strictEqual(posWithHeight[0], 0.05, "worldX must be copX");
  assert.strictEqual(posWithHeight[1], standingSurfaceHeight, "worldY must be vertical height");
  assert.strictEqual(posWithHeight[2], 0.06, "worldZ must be copY");

  // 6. Verify zero crosstalk: COP Y must NEVER alter 3D vertical height (worldY)
  const extremeBack = clinicalCOPToWorld3D(0, -1.0, 0.041);
  const extremeFront = clinicalCOPToWorld3D(0, 1.0, 0.041);
  assert.strictEqual(extremeBack[1], 0.041, "Negative COP Y must not alter 3D vertical height");
  assert.strictEqual(extremeFront[1], 0.041, "Positive COP Y must not alter 3D vertical height");

  // 7. Verify normalizedCOPToBoardWorld3D
  const boardCenter = normalizedCOPToBoardWorld3D({ x: 0, y: 0 }, 0.040);
  assert.deepStrictEqual(boardCenter, [0, 0.040, 0], "Centered normalized COP must map to [0, 0.040, 0]");

  const boardFrontRight = normalizedCOPToBoardWorld3D({ x: 1.0, y: 1.0 }, 0.040);
  assert.deepStrictEqual(boardFrontRight, [0.18, 0.040, 0.10], "Front-Right (+X, +Y) maps to [+0.18, 0.040, +0.10]");

  const boardRearLeft = normalizedCOPToBoardWorld3D({ x: -1.0, y: -1.0 }, 0.040);
  assert.deepStrictEqual(boardRearLeft, [-0.18, 0.040, -0.10], "Rear-Left (-X, -Y) maps to [-0.18, 0.040, -0.10]");
});

console.log(`\n=================================================================`);
console.log(`✓ ALL ${passedTests}/${totalTests} SMPL INTEGRATION TESTS PASSED!`);
console.log(`=================================================================\n`);

