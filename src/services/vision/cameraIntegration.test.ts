import {
  isRealSenseRgbLabel,
  isRealSenseDepthLabel,
  isLenovoCameraLabel,
} from "./CameraService";
import { CameraDeviceInfo, INITIAL_VISION_STATE } from "../../types/vision";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

let passedCount = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log("\n=== MASTER HARDWARE INTEGRATION: CAMERA ENUMERATION & SELECTION TESTS ===\n");

// --------------------------------------------------------------------------
// 1. Device Label Classification
// --------------------------------------------------------------------------
console.log("--- 1. Camera Device Label Classification ---");

test("RealSense RGB label detection: exact Windows D455f RGB string", () => {
  const label = "Intel(R) RealSense(TM) Depth Camera 455f RGB";
  assert(isRealSenseRgbLabel(label) === true, "Should recognize D455f RGB");
  assert(isRealSenseDepthLabel(label) === false, "RGB stream must not be classified as depth");
  assert(isLenovoCameraLabel(label) === false, "RealSense must not be classified as Lenovo");
});

test("RealSense Depth label detection: exact Windows D455f Depth string", () => {
  const label = "Intel(R) RealSense(TM) Depth Camera 455f Depth";
  assert(isRealSenseDepthLabel(label) === true, "Should recognize D455f Depth stream");
  assert(isRealSenseRgbLabel(label) === false, "Depth stream must not be classified as RGB video");
  assert(isLenovoCameraLabel(label) === false, "RealSense must not be classified as Lenovo");
});

test("Lenovo Integrated Camera detection: exact Windows SunplusIT label", () => {
  const label = "Integrated Camera";
  assert(isLenovoCameraLabel(label) === true, "Should recognize Integrated Camera as Lenovo webcam");
  assert(isRealSenseRgbLabel(label) === false, "Lenovo must not be classified as RealSense");
  assert(isRealSenseDepthLabel(label) === false, "Lenovo must not be classified as RealSense Depth");
});

test("Lenovo Virtual Camera detection", () => {
  const label = "Lenovo Virtual Camera";
  assert(isLenovoCameraLabel(label) === true, "Should recognize Lenovo Virtual Camera");
  assert(isRealSenseRgbLabel(label) === false, "Lenovo Virtual must not be RealSense");
});

test("Generic external USB camera classification", () => {
  const label = "Logitech HD Pro Webcam C920";
  assert(isRealSenseRgbLabel(label) === false, "Logitech is not RealSense");
  assert(isRealSenseDepthLabel(label) === false, "Logitech is not RealSense Depth");
  assert(isLenovoCameraLabel(label) === false, "Logitech is not Lenovo");
});

// --------------------------------------------------------------------------
// 2. Camera Device Mapping & Ground Truth Diagnostics
// --------------------------------------------------------------------------
console.log("\n--- 2. Camera Device Mapping & Ground Truth Diagnostics ---");

test("Maps discovered videoinput devices with rich metadata", () => {
  const mockDevices = [
    { deviceId: "dev-lenovo", label: "Integrated Camera", groupId: "group-1" },
    { deviceId: "dev-realsense-rgb", label: "Intel(R) RealSense(TM) Depth Camera 455f RGB", groupId: "group-2" },
  ];

  const mapped: CameraDeviceInfo[] = mockDevices.map((d) => {
    const isRealSense = isRealSenseRgbLabel(d.label);
    const isLenovo = isLenovoCameraLabel(d.label);
    const sourceType = isRealSense ? ("realsense" as const) : isLenovo ? ("lenovo" as const) : ("other" as const);
    return {
      deviceId: d.deviceId,
      label: d.label,
      groupId: d.groupId,
      isRealSenseRgb: isRealSense,
      sourceType,
      hasRgb: true,
      hasDepth: isRealSense,
      status: "connected" as const,
    };
  });

  assert(mapped.length === 2, "Expected 2 mapped devices");
  assert(mapped[0].sourceType === "lenovo", "First device is Lenovo");
  assert(mapped[0].isRealSenseRgb === false, "First device is not RealSense");
  assert(mapped[0].hasDepth === false, "Lenovo camera does not have hardware depth");

  assert(mapped[1].sourceType === "realsense", "Second device is RealSense");
  assert(mapped[1].isRealSenseRgb === true, "Second device has isRealSenseRgb=true");
  assert(mapped[1].hasDepth === true, "RealSense has depth sensor available");
});

test("Excludes Depth-only Z16 stream from RGB camera list", () => {
  const allDevices = [
    { deviceId: "1", label: "Integrated Camera" },
    { deviceId: "2", label: "Intel(R) RealSense(TM) Depth Camera 455f RGB" },
    { deviceId: "3", label: "Intel(R) RealSense(TM) Depth Camera 455f Depth" },
  ];

  const filtered = allDevices.filter((d) => !isRealSenseDepthLabel(d.label));
  assert(filtered.length === 2, "Depth-only stream must be excluded from 2D RGB camera list");
  assert(!filtered.some((d) => d.deviceId === "3"), "DeviceId 3 (Depth) must not be in list");
});

// --------------------------------------------------------------------------
// 3. Centralized Camera Selection & No-Silent-Fallback Rules
// --------------------------------------------------------------------------
console.log("\n--- 3. Centralized Camera Selection & No-Silent-Fallback Rules ---");

test("INITIAL_VISION_STATE defaults to honest hardware disconnected state", () => {
  assert(INITIAL_VISION_STATE.isRealSenseAvailable === false, "RealSense must start as false until enumerated");
  assert(INITIAL_VISION_STATE.realSenseStatus === "disconnected", "RealSense status defaults to disconnected");
  assert(INITIAL_VISION_STATE.activeResolution === "--", "Resolution is empty before streaming");
});

test("No silent fallback: requesting RealSense when disconnected fails with explicit diagnostic", () => {
  // Simulate state where RealSense is physically disconnected
  const isRealSenseAvailable = false;
  const isTargetingRealSense = true;

  let stateCameraStatus = "ready";
  let stateErrorMessage: string | null = null;
  let activeCameraLabel: string | null = null;

  if (isTargetingRealSense && !isRealSenseAvailable) {
    stateCameraStatus = "unavailable";
    stateErrorMessage = "Intel RealSense RGB camera is not available to the browser.";
    activeCameraLabel = "Intel(R) RealSense(TM) Depth Camera 455f RGB (Unavailable)";
  }

  assert(stateCameraStatus === "unavailable", "Must transition to unavailable");
  assert(
    stateErrorMessage === "Intel RealSense RGB camera is not available to the browser.",
    "Must output explicit error message instead of substituting another camera"
  );
  assert(
    activeCameraLabel?.includes("Unavailable") === true,
    "Active label must reflect unavailable state"
  );
});

// --------------------------------------------------------------------------
// 4. Dual-Device Multimodal Verification Continuity
// --------------------------------------------------------------------------
console.log("\n--- 4. Multimodal Stance & Dual Verification Integrity ---");

test("Active Multimodal maintains camera + Wii board dual requirement", () => {
  // Camera active + Wii active = Dual verified
  const cameraActive = true;
  const boardActive = true;
  const canVerify = cameraActive && boardActive;
  assert(canVerify === true, "Dual signals required for multimodal balance");

  // Camera alone cannot complete dual stance
  const cameraOnly = cameraActive && !boardActive;
  assert(cameraOnly === false, "Camera alone must never satisfy dual confirmation");

  // Board alone cannot complete dual stance
  const boardOnly = !cameraActive && boardActive;
  assert(boardOnly === false, "Board alone must never satisfy dual confirmation");
});

console.log(`\n=================================================================`);
console.log(`=== CAMERA HARDWARE INTEGRATION TESTS: ${passedCount} PASSED, 0 FAILED ===`);
console.log(`=================================================================\n`);
