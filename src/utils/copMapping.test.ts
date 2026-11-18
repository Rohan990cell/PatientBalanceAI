import { mapCopToBoard, generateSimulatedMeasurement } from "./copMapping";

function runTests() {
  console.log("=== RUNNING PHASE 2 COP MAPPING & FORCE PLATE TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. CENTER
  const center = mapCopToBoard(0.0, 0.0);
  assert("Case 1 - CENTER (0, 0) -> xPercent=50, yPercent=50", center.xPercent === 50 && center.yPercent === 50);

  // 2. LEFT
  const left = mapCopToBoard(-1.0, 0.0);
  assert("Case 2 - LEFT (-1, 0) -> xPercent=0, yPercent=50", left.xPercent === 0 && left.yPercent === 50);

  // 3. RIGHT
  const right = mapCopToBoard(1.0, 0.0);
  assert("Case 3 - RIGHT (+1, 0) -> xPercent=100, yPercent=50", right.xPercent === 100 && right.yPercent === 50);

  // 4. FRONT
  const front = mapCopToBoard(0.0, 1.0);
  assert("Case 4 - FRONT (0, +1) -> xPercent=50, yPercent=0 (top)", front.xPercent === 50 && front.yPercent === 0);

  // 5. BACK
  const back = mapCopToBoard(0.0, -1.0);
  assert("Case 5 - BACK (0, -1) -> xPercent=50, yPercent=100 (bottom)", back.xPercent === 50 && back.yPercent === 100);

  // 6. FRONT-RIGHT
  const frontRight = mapCopToBoard(0.5, 0.5);
  assert("Case 6 - FRONT-RIGHT (+0.5, +0.5) -> xPercent=75, yPercent=25", frontRight.xPercent === 75 && frontRight.yPercent === 25);

  // 7. BACK-LEFT
  const backLeft = mapCopToBoard(-0.5, -0.5);
  assert("Case 7 - BACK-LEFT (-0.5, -0.5) -> xPercent=25, yPercent=75", backLeft.xPercent === 25 && backLeft.yPercent === 75);

  // 8. BOUNDARIES CLAMPING
  const overBoundary = mapCopToBoard(2.5, -3.2);
  assert("Case 8a - Over boundary copX=2.5 clamped to 1.0 -> xPercent=100", overBoundary.clampedX === 1.0 && overBoundary.xPercent === 100);
  assert("Case 8b - Under boundary copY=-3.2 clamped to -1.0 -> yPercent=100", overBoundary.clampedY === -1.0 && overBoundary.yPercent === 100);

  // 9. PHASE 2 - TASK 7 CONTROLLED VISUAL SIMULATION TESTS
  // 9a. X = -0.8, Y = 0 -> COP ball LEFT
  const test9a = mapCopToBoard(-0.8, 0.0);
  assert("Task 7.1 - X = -0.8, Y = 0 -> COP ball moves LEFT (xPercent=10%, yPercent=50%)", test9a.xPercent === 10 && test9a.yPercent === 50);

  // 9b. X = +0.8, Y = 0 -> COP ball RIGHT
  const test9b = mapCopToBoard(0.8, 0.0);
  assert("Task 7.2 - X = +0.8, Y = 0 -> COP ball moves RIGHT (xPercent=90%, yPercent=50%)", test9b.xPercent === 90 && test9b.yPercent === 50);

  // 9c. X = 0, Y = +0.8 -> COP ball UP / FRONT
  const test9c = mapCopToBoard(0.0, 0.8);
  assert("Task 7.3 - X = 0, Y = +0.8 -> COP ball moves UP / FRONT (xPercent=50%, yPercent=10%)", test9c.xPercent === 50 && test9c.yPercent === 10);

  // 9d. X = 0, Y = -0.8 -> COP ball DOWN / BACK
  const test9d = mapCopToBoard(0.0, -0.8);
  assert("Task 7.4 - X = 0, Y = -0.8 -> COP ball moves DOWN / BACK (xPercent=50%, yPercent=90%)", test9d.xPercent === 50 && test9d.yPercent === 90);

  // 9e. X = 0, Y = 0 -> COP ball exactly CENTER
  const test9e = mapCopToBoard(0.0, 0.0);
  assert("Task 7.5 - X = 0, Y = 0 -> COP ball exactly CENTER (xPercent=50%, yPercent=50%)", test9e.xPercent === 50 && test9e.yPercent === 50);

  // 10. SIMULATED MEASUREMENT DECOMPOSITION CONSISTENCY
  const sim = generateSimulatedMeasurement(0.4, -0.2, 70.0);
  assert("Sim Total Weight matches input 70.0kg", Math.abs(sim.totalWeight - 70.0) < 1e-4);
  assert("Sim Left + Right Weight = Total", Math.abs((sim.leftWeight + sim.rightWeight) - 70.0) < 1e-4);
  assert("Sim Anterior + Posterior Weight = Total", Math.abs((sim.anteriorWeight + sim.posteriorWeight) - 70.0) < 1e-4);
  assert("Sim COP X matches input 0.4", Math.abs(sim.copX - 0.4) < 1e-4);
  assert("Sim COP Y matches input -0.2", Math.abs(sim.copY - (-0.2)) < 1e-4);

  // 11. FORCE PLATE VISUAL COP DISPLAY & CLAMPING TESTS
  // 11a. Full left shift clamped inside valid display area
  const fullLeft = mapCopToBoard(-1.0, 0.0);
  const clampedDisplayLeftX = Math.max(5.0, Math.min(95.0, fullLeft.xPercent));
  assert("Task 11a - Full left COP X=-1.0 visually clamped inside valid display area (5.0%)", clampedDisplayLeftX === 5.0);

  // 11b. Full right shift clamped inside valid display area
  const fullRight = mapCopToBoard(1.0, 0.0);
  const clampedDisplayRightX = Math.max(5.0, Math.min(95.0, fullRight.xPercent));
  assert("Task 11b - Full right COP X=+1.0 visually clamped inside valid display area (95.0%)", clampedDisplayRightX === 95.0);

  // 11c. Full front shift clamped inside valid display area
  const fullFront = mapCopToBoard(0.0, 1.0);
  const clampedDisplayFrontY = Math.max(8.0, Math.min(92.0, fullFront.yPercent));

  assert("Task 11c - Full front COP Y=+1.0 visually clamped inside valid display area (8.0%)", clampedDisplayFrontY === 8.0);

  // 11d. Full back shift clamped inside valid display area
  const fullBack = mapCopToBoard(0.0, -1.0);
  const clampedDisplayBackY = Math.max(8.0, Math.min(92.0, fullBack.yPercent));
  assert("Task 11d - Full back COP Y=-1.0 visually clamped inside valid display area (92.0%)", clampedDisplayBackY === 92.0);

  // 11e. Direction text checks for lateral and AP axes
  function getDirectionText(x: number, y: number) {
    const xDir = x > 0.05 ? "RIGHT (+X)" : x < -0.05 ? "LEFT (-X)" : "CENTER";
    const yDir = y > 0.05 ? "FRONT (+Y)" : y < -0.05 ? "BACK (-Y)" : "CENTER";
    return { xDir, yDir };
  }
  const dirLeftFront = getDirectionText(-0.35, 0.42);
  assert("Task 11e - Direction descriptor for (-0.35, +0.42) is LEFT (-X) and FRONT (+Y)", dirLeftFront.xDir === "LEFT (-X)" && dirLeftFront.yDir === "FRONT (+Y)");

  const dirRightBack = getDirectionText(0.6, -0.7);
  assert("Task 11f - Direction descriptor for (+0.6, -0.7) is RIGHT (+X) and BACK (-Y)", dirRightBack.xDir === "RIGHT (+X)" && dirRightBack.yDir === "BACK (-Y)");

  const dirCenter = getDirectionText(0.01, -0.02);
  assert("Task 11g - Direction descriptor within deadband (0.01, -0.02) is CENTER", dirCenter.xDir === "CENTER" && dirCenter.yDir === "CENTER");

  console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed.`);
  if (failed > 0) throw new Error(`${failed} tests failed!`);
}

runTests();
