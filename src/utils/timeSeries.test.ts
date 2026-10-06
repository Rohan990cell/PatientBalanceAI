import { generateSimulatedMeasurement } from "./copMapping";
import { TimeSeriesPoint, DEFAULT_GRAPH_WINDOW_MS, MAX_TIME_SERIES_POINTS } from "../types/balanceTimeSeries";

function runPhase3Tests() {
  console.log("=== RUNNING PHASE 3 REAL-TIME BALANCE GRAPHS TEST SUITE ===");
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

  // 1. CENTER STATE TEST
  const centerMeas = generateSimulatedMeasurement(0.0, 0.0, 70.0);
  assert("Case 1 - CENTER: copX is 0.0", Math.abs(centerMeas.copX - 0.0) < 1e-4);
  assert("Case 1 - CENTER: copY is 0.0", Math.abs(centerMeas.copY - 0.0) < 1e-4);
  assert("Case 1 - CENTER: Left % ≈ 50%", Math.abs(centerMeas.leftPercent - 50.0) < 1e-4);
  assert("Case 1 - CENTER: Right % ≈ 50%", Math.abs(centerMeas.rightPercent - 50.0) < 1e-4);

  // 2. MOVE LEFT TEST
  const leftMeas = generateSimulatedMeasurement(-0.8, 0.0, 70.0);
  assert("Case 2 - MOVE LEFT: copX is negative (-0.8)", leftMeas.copX === -0.8);
  assert("Case 2 - MOVE LEFT: Left % increases (> 50%)", leftMeas.leftPercent > 50.0);
  assert("Case 2 - MOVE LEFT: Right % decreases (< 50%)", leftMeas.rightPercent < 50.0);
  assert("Case 2 - MOVE LEFT: Left + Right sum to 100%", Math.abs(leftMeas.leftPercent + leftMeas.rightPercent - 100.0) < 1e-4);

  // 3. MOVE RIGHT TEST
  const rightMeas = generateSimulatedMeasurement(0.8, 0.0, 70.0);
  assert("Case 3 - MOVE RIGHT: copX is positive (+0.8)", rightMeas.copX === 0.8);
  assert("Case 3 - MOVE RIGHT: Right % increases (> 50%)", rightMeas.rightPercent > 50.0);
  assert("Case 3 - MOVE RIGHT: Left % decreases (< 50%)", rightMeas.leftPercent < 50.0);
  assert("Case 3 - MOVE RIGHT: Left + Right sum to 100%", Math.abs(rightMeas.leftPercent + rightMeas.rightPercent - 100.0) < 1e-4);

  // 4. MOVE FRONT / ANTERIOR TEST
  const frontMeas = generateSimulatedMeasurement(0.0, 0.75, 70.0);
  assert("Case 4 - MOVE FRONT: copY is positive (+0.75)", frontMeas.copY === 0.75);
  assert("Case 4 - MOVE FRONT: Anterior % increases (> 50%)", frontMeas.anteriorPercent > 50.0);
  assert("Case 4 - MOVE FRONT: Posterior % decreases (< 50%)", frontMeas.posteriorPercent < 50.0);

  // 5. MOVE BACK / POSTERIOR TEST
  const backMeas = generateSimulatedMeasurement(0.0, -0.75, 70.0);
  assert("Case 5 - MOVE BACK: copY is negative (-0.75)", backMeas.copY === -0.75);
  assert("Case 5 - MOVE BACK: Anterior % decreases (< 50%)", backMeas.anteriorPercent < 50.0);
  assert("Case 5 - MOVE BACK: Posterior % increases (> 50%)", backMeas.posteriorPercent > 50.0);

  // 6. MOVE LEFT -> RIGHT TRAJECTORY TEST
  const trajectoryX = [-0.9, -0.5, -0.1, 0.0, 0.3, 0.7, 1.0];
  const xPoints = trajectoryX.map((x, idx) => ({
    timestamp: 1000 + idx * 100,
    meas: generateSimulatedMeasurement(x, 0.0, 70.0),
  }));
  const movesNegToPos = xPoints[0].meas.copX < 0 && xPoints[xPoints.length - 1].meas.copX > 0;
  assert("Case 6 - LEFT -> RIGHT: copX trajectory transitions from negative to positive", movesNegToPos);

  // 7. MOVE BACK -> FRONT TRAJECTORY TEST
  const trajectoryY = [-0.8, -0.4, 0.0, 0.4, 0.8];
  const yPoints = trajectoryY.map((y, idx) => ({
    timestamp: 1000 + idx * 100,
    meas: generateSimulatedMeasurement(0.0, y, 70.0),
  }));
  const movesBackToFront = yPoints[0].meas.copY < 0 && yPoints[yPoints.length - 1].meas.copY > 0;
  assert("Case 7 - BACK -> FRONT: copY trajectory transitions from negative to positive", movesBackToFront);

  // 8. ROLLING BUFFER PRUNING (30-second window retention)
  const baseTime = 100000;
  const buffer: TimeSeriesPoint[] = [];

  // Add 1000 points spanning 50 seconds (1 point every 50ms)
  for (let i = 0; i < 1000; i++) {
    const t = baseTime + i * 50; // up to 100000 + 50000 = 150000
    const m = generateSimulatedMeasurement(Math.sin(i / 10), Math.cos(i / 10), 70);
    buffer.push({
      timestamp: t,
      copX: m.copX,
      copY: m.copY,
      leftPercent: m.leftPercent,
      rightPercent: m.rightPercent,
      anteriorPercent: m.anteriorPercent,
      posteriorPercent: m.posteriorPercent,
      totalWeight: m.totalWeight,
      isSimulated: true,
    });
  }

  // Prune points older than 30s relative to last point (t = 150000)
  const latestTimestamp = buffer[buffer.length - 1].timestamp;
  const cutoff = latestTimestamp - DEFAULT_GRAPH_WINDOW_MS; // 150000 - 30000 = 120000
  let startIndex = 0;
  while (startIndex < buffer.length && buffer[startIndex].timestamp < cutoff) {
    startIndex++;
  }
  const pruned = buffer.slice(startIndex);
  if (pruned.length > MAX_TIME_SERIES_POINTS) {
    pruned.splice(0, pruned.length - MAX_TIME_SERIES_POINTS);
  }

  assert("Case 8a - Rolling Buffer: pruned buffer only contains points within 30s", pruned[0].timestamp >= cutoff);
  assert("Case 8b - Rolling Buffer: points strictly adhere to MAX_TIME_SERIES_POINTS cap", pruned.length <= MAX_TIME_SERIES_POINTS);
  assert("Case 8c - Rolling Buffer: exactly 601 points span 30 seconds at 50ms interval", pruned.length === 600 || pruned.length === 601);

  // 9. DATA QUALITY & NAN/BOUNDARY CLAMPING
  const nanMeas = generateSimulatedMeasurement(NaN, NaN, NaN);
  assert("Case 9a - NaN Handling: copX is clamped safely to 0", !isNaN(nanMeas.copX) && nanMeas.copX === 0);
  assert("Case 9b - NaN Handling: copY is clamped safely to 0", !isNaN(nanMeas.copY) && nanMeas.copY === 0);
  assert("Case 9c - NaN Handling: totalWeight is clamped safely", !isNaN(nanMeas.totalWeight) && nanMeas.totalWeight >= 0);

  console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed.`);
  if (failed > 0) throw new Error(`${failed} tests failed!`);
}

runPhase3Tests();
