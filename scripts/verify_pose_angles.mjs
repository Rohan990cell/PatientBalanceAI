// scripts/verify_pose_angles.mjs
// Verification of pose angle normalization for PatientBalanceAI

function calculateAngles(landmarks) {
  const { leftShoulder, rightShoulder, leftHip, rightHip, nose } = landmarks;

  // 1. Coronal alignment: Shoulder tilt angle (normalized: 0° = horizontal neutral)
  // Positive angle = lean right (right shoulder drops), Negative angle = lean left (left shoulder drops)
  let shoulderTiltDeg = 0;
  if (leftShoulder && rightShoulder) {
    const shoulderDx = Math.abs(leftShoulder.x - rightShoulder.x);
    const shoulderDy = rightShoulder.y - leftShoulder.y;
    shoulderTiltDeg = Math.round(Math.atan2(shoulderDy, Math.max(0.001, shoulderDx)) * (180 / Math.PI));
  }

  // 2. Pelvic alignment: Hip tilt angle (normalized: 0° = horizontal neutral)
  let hipTiltDeg = 0;
  if (leftHip && rightHip) {
    const hipDx = Math.abs(leftHip.x - rightHip.x);
    const hipDy = rightHip.y - leftHip.y;
    hipTiltDeg = Math.round(Math.atan2(hipDy, Math.max(0.001, hipDx)) * (180 / Math.PI));
  }

  // 3. Head coronal tilt relative to shoulders (normalized: 0° = vertical neutral)
  let headTiltDeg = 0;
  if (nose && leftShoulder && rightShoulder) {
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const headDx = midShoulderX - nose.x;
    const headDy = midShoulderY - nose.y; // Positive upward
    headTiltDeg = Math.round(Math.atan2(headDx, Math.max(0.001, headDy)) * (180 / Math.PI));
  }

  // 4. Sagittal anteroposterior tilt: Trunk Pitch (normalized: 0° = vertical neutral)
  // Positive = lean forward (shoulders closer to camera than hips), Negative = lean backward
  let trunkPitchDeg = 0;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const midShoulderZ = (leftShoulder.z + rightShoulder.z) / 2;
    const midHipY = (leftHip.y + rightHip.y) / 2;
    const midHipZ = (leftHip.z + rightHip.z) / 2;
    const torsoDy = midHipY - midShoulderY; // Positive (vertical height down torso)
    const torsoDz = midHipZ - midShoulderZ; // In MediaPipe, smaller z = closer to camera
    trunkPitchDeg = Math.round(Math.atan2(torsoDz, Math.max(0.01, torsoDy)) * (180 / Math.PI));
  }

  // 5. Posture Lean Direction Classification
  let postureLean = "NEUTRAL";
  const absShoulderTilt = Math.abs(shoulderTiltDeg);
  const absPitch = Math.abs(trunkPitchDeg);

  if (absShoulderTilt >= 5 && absShoulderTilt >= absPitch) {
    postureLean = shoulderTiltDeg > 0 ? "LEAN_RIGHT" : "LEAN_LEFT";
  } else if (absPitch >= 6) {
    postureLean = trunkPitchDeg > 0 ? "LEAN_FORWARD" : "LEAN_BACKWARD";
  } else {
    postureLean = "NEUTRAL";
  }

  return { shoulderTiltDeg, hipTiltDeg, headTiltDeg, trunkPitchDeg, postureLean };
}

// Test cases
console.log("=== POSE ANGLE CALCULATIONS VERIFICATION ===");

// 1. Neutral posture: perfectly level shoulders and hips, upright torso
const neutralPose = {
  leftShoulder:  { x: 0.60, y: 0.30, z: 0.00 },
  rightShoulder: { x: 0.40, y: 0.30, z: 0.00 },
  leftHip:       { x: 0.56, y: 0.62, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.62, z: 0.00 },
  nose:          { x: 0.50, y: 0.18, z: -0.02 },
};
const resNeutral = calculateAngles(neutralPose);
console.log("1. Neutral Posture:", resNeutral);

// 1b. Realistic slight asymmetry (1-2° natural tilt)
const neutralSlightAsymmetry = {
  leftShoulder:  { x: 0.60, y: 0.300, z: 0.00 },
  rightShoulder: { x: 0.40, y: 0.305, z: 0.00 }, // right shoulder 0.005 lower
  leftHip:       { x: 0.56, y: 0.620, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.622, z: 0.00 }, // right hip 0.002 lower
  nose:          { x: 0.50, y: 0.180, z: -0.02 },
};
const resSlight = calculateAngles(neutralSlightAsymmetry);
console.log("1b. Slight natural asymmetry:", resSlight);

// 2. Lean Left: Left shoulder drops (y increases), right shoulder elevates (y decreases)
const leanLeftPose = {
  leftShoulder:  { x: 0.59, y: 0.33, z: 0.00 },
  rightShoulder: { x: 0.39, y: 0.27, z: 0.00 },
  leftHip:       { x: 0.56, y: 0.63, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.60, z: 0.00 },
  nose:          { x: 0.53, y: 0.19, z: 0.00 },
};
const resLeft = calculateAngles(leanLeftPose);
console.log("2. Lean Left:", resLeft);

// 3. Lean Right: Right shoulder drops (y increases), left shoulder elevates (y decreases)
const leanRightPose = {
  leftShoulder:  { x: 0.61, y: 0.27, z: 0.00 },
  rightShoulder: { x: 0.41, y: 0.33, z: 0.00 },
  leftHip:       { x: 0.56, y: 0.60, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.63, z: 0.00 },
  nose:          { x: 0.47, y: 0.19, z: 0.00 },
};
const resRight = calculateAngles(leanRightPose);
console.log("3. Lean Right:", resRight);

// 4. Lean Forward: Shoulders pitch forward closer to camera (z becomes more negative)
const leanForwardPose = {
  leftShoulder:  { x: 0.60, y: 0.31, z: -0.10 },
  rightShoulder: { x: 0.40, y: 0.31, z: -0.10 },
  leftHip:       { x: 0.56, y: 0.62, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.62, z: 0.00 },
  nose:          { x: 0.50, y: 0.20, z: -0.14 },
};
const resForward = calculateAngles(leanForwardPose);
console.log("4. Lean Forward:", resForward);

// 5. Lean Backward: Shoulders pitch backward away from camera (z becomes more positive)
const leanBackwardPose = {
  leftShoulder:  { x: 0.60, y: 0.29, z: 0.09 },
  rightShoulder: { x: 0.40, y: 0.29, z: 0.09 },
  leftHip:       { x: 0.56, y: 0.62, z: 0.00 },
  rightHip:      { x: 0.44, y: 0.62, z: 0.00 },
  nose:          { x: 0.50, y: 0.17, z: 0.08 },
};
const resBackward = calculateAngles(leanBackwardPose);
console.log("5. Lean Backward:", resBackward);
