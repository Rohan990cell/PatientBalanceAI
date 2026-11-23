import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALLOON_TARGET_SPECS,
  DEFAULT_TARGET_TOLERANCE_MM,
  DEFAULT_CONFIRMATION_DURATION_MS,
  DEFAULT_CENTER_TOLERANCE_MM,
  DEFAULT_CENTER_HOLD_DURATION_MS,
  calculatePhysicalCopDistance,
  BalloonTargetDetector,
  CenterPositionDetector,
  computeGameSessionSummary,
  TargetAttemptResult,
  RecordedCopPoint,
} from "./targetAchievingGame";
import { PdfReportGenerator } from "../services/pdfReportGenerator";

describe("Target Achieving Game — 2-Second Target Hold & Real COP Detection", () => {
  const target1 = BALLOON_TARGET_SPECS[0]; // Target 1 (Left): X = -133.8 mm, Y = +5.95 mm

  it("Test 1: COP outside target region — no success and countdown is at 2", () => {
    const copXMm = 0.0;
    const copYMm = 0.0;
    const dist = calculatePhysicalCopDistance(copXMm, copYMm, target1.targetXMm, target1.targetYMm);
    assert.ok(dist !== null && dist > DEFAULT_TARGET_TOLERANCE_MM);

    const detector = new BalloonTargetDetector(); // Defaults to 35mm tolerance, 2000ms hold, 10000ms limit
    assert.equal(DEFAULT_CONFIRMATION_DURATION_MS, 2000);
    assert.equal(detector.getConfirmationDurationMs(), 2000);
    detector.setTarget(target1.id, 1000);

    const res = detector.update(copXMm, copYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(res.isInTolerance, false);
    assert.equal(res.isAchieved, false);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdSecondsCountdown, 2);
    assert.equal(res.holdTimeRemainingMs, 2000);
  });

  it("Test 2: Entering target starts 2-second countdown (countdown = 2)", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(target1.id, 1000);

    const res = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(res.isInTolerance, true);
    assert.equal(res.isAchieved, false);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdSecondsCountdown, 2);
    assert.equal(res.holdTimeRemainingMs, 2000);
  });

  it("Test 3: Holding for less than 2 seconds does NOT achieve the target (shows 2, 1)", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(target1.id, 1000);

    // Initial enter at t = 1000 (countdown = 2)
    const r0 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(r0.isAchieved, false);
    assert.equal(r0.holdSecondsCountdown, 2);

    // After 1.2s at t = 2200 (800ms remaining -> countdown = 1)
    const r1 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2200, true, false);
    assert.equal(r1.isAchieved, false);
    assert.equal(r1.holdSecondsCountdown, 1);
    assert.equal(r1.holdTimeRemainingMs, 800);
    assert.ok(r1.holdProgress > 0.55 && r1.holdProgress < 0.65);

    // At 1.95s at t = 2950 (50ms remaining -> countdown = 1, still not achieved!)
    const r2 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2950, true, false);
    assert.equal(r2.isAchieved, false);
    assert.equal(r2.holdSecondsCountdown, 1);
    assert.equal(r2.holdTimeRemainingMs, 50);

    // At 1.99s at t = 2990 (10ms remaining -> still not achieved!)
    const r3 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2990, true, false);
    assert.equal(r3.isAchieved, false);
    assert.equal(r3.holdSecondsCountdown, 1);
  });

  it("Test 4: Leaving target resets countdown to 2s — interrupted holding time is discarded", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(target1.id, 1000);

    // Enter and hold for 1.4s (countdown reaches 1)
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const rHold = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2400, true, false);
    assert.equal(rHold.isAchieved, false);
    assert.equal(rHold.holdSecondsCountdown, 1);

    // Patient slips outside tolerance at t = 2500
    const rOut = detector.update(0.0, 0.0, target1.targetXMm, target1.targetYMm, 2500, true, false);
    assert.equal(rOut.isInTolerance, false);
    assert.equal(rOut.isAchieved, false);
    assert.equal(rOut.holdProgress, 0.0);
    assert.equal(rOut.holdSecondsCountdown, 2); // Resets to 2!
    assert.equal(rOut.holdTimeRemainingMs, 2000);

    // Patient re-enters at t = 3000 — must start a completely fresh 2-second hold
    const rReenter = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);
    assert.equal(rReenter.isInTolerance, true);
    assert.equal(rReenter.isAchieved, false);
    assert.equal(rReenter.holdSecondsCountdown, 2);
    assert.equal(rReenter.holdProgress, 0.0);

    // Holding for only 1 second after re-entry (t = 4000) does NOT achieve
    const rFreshHold = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 4000, true, false);
    assert.equal(rFreshHold.isAchieved, false);
    assert.equal(rFreshHold.holdSecondsCountdown, 1);
  });

  it("Test 5: Holding continuously for the full 2 seconds achieves the target", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(target1.id, 1000);

    // Enter at t = 1000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    // Hold at t = 2000 (1.0s elapsed)
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2000, true, false);
    // Exactly 2.0 seconds continuous hold at t = 3000
    const resDone = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);

    assert.equal(resDone.isInTolerance, true);
    assert.equal(resDone.isAchieved, true);
    assert.equal(resDone.status, "completed");
    assert.equal(resDone.holdProgress, 1.0);
    assert.equal(resDone.holdSecondsCountdown, 0);
    assert.equal(resDone.holdTimeRemainingMs, 0);
  });

  it("Test 6: Invalid or null COP reading resets the 2-second hold timer", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(target1.id, 1000);

    // Hold for 1.5s
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2500, true, false);

    // Sensor returns null
    const rNull = detector.update(null, null, target1.targetXMm, target1.targetYMm, 2600, true, false);
    assert.equal(rNull.isValid, false);
    assert.equal(rNull.isAchieved, false);
    assert.equal(rNull.holdProgress, 0.0);
    assert.equal(rNull.holdSecondsCountdown, 2);
  });
});

describe("Target Achieving Game — Phase 7: Timeout & Failed Target Handling", () => {
  const target1 = BALLOON_TARGET_SPECS[0];
  const target2 = BALLOON_TARGET_SPECS[1];

  it("Test 1: Balloon times out when not reached within time limit", () => {
    const timeLimitMs = 5000;
    const detector = new BalloonTargetDetector(35.0, 3000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Initial update at t = 1000
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);

    // Mid-way at t = 3500 (2.5s elapsed, 2.5s remaining)
    const mid = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 3500, true, false);
    assert.equal(mid.isTimedOut, false);
    assert.equal(mid.status, "active");
    assert.equal(mid.timeRemainingMs, 2500);

    // Timeout exceeded at t = 6100 (5.1s elapsed)
    const timedOut = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 6100, true, false);
    assert.equal(timedOut.isTimedOut, true);
    assert.equal(timedOut.status, "missed");
    assert.equal(timedOut.isAchieved, false);
    assert.equal(timedOut.timeRemainingMs, 0);
  });

  it("Test 2: Missed balloon transitions cleanly to next balloon", () => {
    const timeLimitMs = 4000;
    const detector = new BalloonTargetDetector(35.0, 2000, timeLimitMs);

    // Target 1 times out
    detector.setTarget(target1.id, 1000);
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const miss = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 5500, true, false);
    assert.equal(miss.status, "missed");

    // Activate Target 2 with fresh timer and 2s hold requirement
    detector.setTarget(target2.id, 5600);
    const t2Res = detector.update(0, 0, target2.targetXMm, target2.targetYMm, 5600, true, false);
    assert.equal(t2Res.status, "active");
    assert.equal(t2Res.isTimedOut, false);
    assert.equal(t2Res.timeRemainingMs, timeLimitMs);
    assert.equal(t2Res.holdSecondsCountdown, 2);
  });

  it("Test 3: Successful balloon does not get marked missed", () => {
    const timeLimitMs = 8000;
    const detector = new BalloonTargetDetector(35.0, 2000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Enter at 2000, hold for full 2s and achieve at 4000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2000, true, false);
    const succ = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 4000, true, false);
    assert.equal(succ.isAchieved, true);
    assert.equal(succ.status, "completed");

    // Later at t = 10000 (after 9s total), status remains strictly completed
    const late = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 10000, true, false);
    assert.equal(late.status, "completed");
    assert.equal(late.isTimedOut, false);
  });

  it("Test 4: Success takes priority over timeout if hold completes at the timeout boundary", () => {
    const timeLimitMs = 5000;
    const confirmationDurationMs = 2000;
    const detector = new BalloonTargetDetector(35.0, confirmationDurationMs, timeLimitMs);

    // Active at t = 1000, enter tolerance at t = 3000 (2.0s in)
    detector.setTarget(target1.id, 1000);
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);

    // At t = 5000 (exactly 4000ms elapsed since start, and 2000ms dwell completed)
    const boundaryRes = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 5000, true, false);

    // Must be 'completed', NOT 'missed'
    assert.equal(boundaryRes.isAchieved, true);
    assert.equal(boundaryRes.status, "completed");
    assert.equal(boundaryRes.isTimedOut, false);
  });

  it("Test 5: Timer pauses during hardware disconnection and game pause", () => {
    const timeLimitMs = 10000;
    const detector = new BalloonTargetDetector(35.0, 2000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Active for 3 seconds (t = 1000 to 4000)
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const r1 = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 4000, true, false);
    assert.equal(r1.timeRemainingMs, 7000);

    // Disconnected for 6 seconds (t = 4000 to 10000)
    const rDis = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 10000, false, false);
    assert.equal(rDis.isValid, false);
    assert.equal(rDis.timeRemainingMs, 7000); // Remaining time preserved!
    assert.equal(rDis.holdSecondsCountdown, 2); // Hold timer reset/cleared during disconnection!

    // Clinician pause for 4 seconds (t = 10000 to 14000)
    const rPause = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 14000, true, true);
    assert.equal(rPause.isValid, false);
    assert.equal(rPause.timeRemainingMs, 7000); // Still 7000 ms!
  });

  it("Test 6: Timer resumes with the correct remaining time after reconnection", () => {
    const timeLimitMs = 10000;
    const detector = new BalloonTargetDetector(35.0, 3000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Run 3 seconds: remaining = 7000ms
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 4000, true, false);

    // Disconnected from t = 4000 to 12000 (8s offline)
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 12000, false, false);

    // Reconnected at t = 12000 (resumes)
    const rResume = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 12000, true, false);
    assert.equal(rResume.timeRemainingMs, 7000);

    // 2 seconds active later (t = 14000): remaining should be 5000ms
    const rLater = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 14000, true, false);
    assert.equal(rLater.timeRemainingMs, 5000);
    assert.equal(rLater.status, "active");
  });

  it("Test 7: No duplicate transitions occur after terminal status", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 3000);
    detector.setTarget(target1.id, 1000);

    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const miss1 = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 5000, true, false);
    assert.equal(miss1.status, "missed");

    // Repeated updates remain strictly 'missed' without secondary transitions
    const miss2 = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 6000, true, false);
    assert.equal(miss2.status, "missed");
    assert.equal(miss2.isTimedOut, true);
  });

  it("Test 8: Session ends correctly after four balloons with completed or missed status", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 6000);
    const sequence = [1, 2, 3, 4];
    const outcomes: string[] = [];
    let time = 1000;

    for (const bId of sequence) {
      const target = BALLOON_TARGET_SPECS.find((b) => b.id === bId)!;
      detector.setTarget(target.id, time);

      if (bId % 2 === 1) {
        // Odd targets (1, 3): Patient completes target after 2s continuous hold
        detector.update(target.targetXMm, target.targetYMm, target.targetXMm, target.targetYMm, time, true, false);
        time += 2000;
        const res = detector.update(target.targetXMm, target.targetYMm, target.targetXMm, target.targetYMm, time, true, false);
        outcomes.push(res.status);
      } else {
        // Even targets (2, 4): Patient misses target (times out at 6s)
        detector.update(0, 0, target.targetXMm, target.targetYMm, time, true, false);
        time += 6500;
        const res = detector.update(0, 0, target.targetXMm, target.targetYMm, time, true, false);
        outcomes.push(res.status);
      }
      time += 600; // Time buffer for blast/deflate transition
    }

    assert.equal(outcomes.length, 4);
    assert.deepEqual(outcomes, ["completed", "missed", "completed", "missed"]);
  });
});

describe("Target Achieving Game — Phase 9: Session Results Dashboard Calculations", () => {
  it("Test 1: All 4 targets completed — 100% achievement and valid average time", () => {
    const attempts: TargetAttemptResult[] = [
      { targetIndex: 0, balloonId: 1, number: 1, name: "Target 1", directionLabel: "Left", color: "#EF4444", status: "completed", durationMs: 4000, finalDistanceMm: 12.5 },
      { targetIndex: 1, balloonId: 2, number: 2, name: "Target 2", directionLabel: "Upper-Right", color: "#0284C7", status: "completed", durationMs: 4500, finalDistanceMm: 15.0 },
      { targetIndex: 2, balloonId: 3, number: 3, name: "Target 3", directionLabel: "Forward", color: "#059669", status: "completed", durationMs: 3500, finalDistanceMm: 10.0 },
      { targetIndex: 3, balloonId: 4, number: 4, name: "Target 4", directionLabel: "Lower-Right", color: "#D97706", status: "completed", durationMs: 5000, finalDistanceMm: 18.5 },
    ];

    const summary = computeGameSessionSummary(attempts, [], 17000);
    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 4);
    assert.equal(summary.missedTargets, 0);
    assert.equal(summary.achievementPercentage, 100);
    // (4000 + 4500 + 3500 + 5000) / 4 = 17000 / 4 = 4250 ms
    assert.equal(summary.averageAchievementTimeMs, 4250);
    assert.equal(summary.totalSessionDurationMs, 17000);
  });

  it("Test 2: All 4 targets missed — 0% achievement and average time is null", () => {
    const attempts: TargetAttemptResult[] = [
      { targetIndex: 0, balloonId: 1, number: 1, name: "Target 1", directionLabel: "Left", color: "#EF4444", status: "missed", durationMs: 10000, finalDistanceMm: 65.0 },
      { targetIndex: 1, balloonId: 2, number: 2, name: "Target 2", directionLabel: "Upper-Right", color: "#0284C7", status: "missed", durationMs: 10000, finalDistanceMm: 80.0 },
      { targetIndex: 2, balloonId: 3, number: 3, name: "Target 3", directionLabel: "Forward", color: "#059669", status: "missed", durationMs: 10000, finalDistanceMm: 50.0 },
      { targetIndex: 3, balloonId: 4, number: 4, name: "Target 4", directionLabel: "Lower-Right", color: "#D97706", status: "missed", durationMs: 10000, finalDistanceMm: 95.0 },
    ];

    const summary = computeGameSessionSummary(attempts, [], 40000);
    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 0);
    assert.equal(summary.missedTargets, 4);
    assert.equal(summary.achievementPercentage, 0);
    assert.equal(summary.averageAchievementTimeMs, null); // Must be null (renders as --)
  });

  it("Test 3: Mixed outcome (2 completed, 2 missed) — 50% achievement and average time strictly excludes missed", () => {
    const attempts: TargetAttemptResult[] = [
      { targetIndex: 0, balloonId: 1, number: 1, name: "Target 1", directionLabel: "Left", color: "#EF4444", status: "completed", durationMs: 4000, finalDistanceMm: 14.0 },
      { targetIndex: 1, balloonId: 2, number: 2, name: "Target 2", directionLabel: "Upper-Right", color: "#0284C7", status: "missed", durationMs: 10000, finalDistanceMm: 72.0 },
      { targetIndex: 2, balloonId: 3, number: 3, name: "Target 3", directionLabel: "Forward", color: "#059669", status: "completed", durationMs: 5000, finalDistanceMm: 18.0 },
      { targetIndex: 3, balloonId: 4, number: 4, name: "Target 4", directionLabel: "Lower-Right", color: "#D97706", status: "missed", durationMs: 10000, finalDistanceMm: 60.0 },
    ];

    const summary = computeGameSessionSummary(attempts, [], 29000);
    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 2);
    assert.equal(summary.missedTargets, 2);
    assert.equal(summary.achievementPercentage, 50);
    // Strictly (4000 + 5000) / 2 = 4500 ms (10000ms misses excluded!)
    assert.equal(summary.averageAchievementTimeMs, 4500);
    assert.equal(summary.completedTargets + summary.missedTargets, 4);
  });
});

describe("Target Achieving Game — Step 2: Centre Start Position Logic", () => {
  it("Test 1: Patient starts outside center zone — countdown is at 2s and isConfirmed is false", () => {
    const detector = new CenterPositionDetector(); // 40mm tolerance, 2000ms hold duration
    assert.equal(DEFAULT_CENTER_TOLERANCE_MM, 40.0);
    assert.equal(DEFAULT_CENTER_HOLD_DURATION_MS, 2000);

    // COP at (100, 50) is well outside 40mm radius
    const res = detector.update(100.0, 50.0, 1000, true, false);
    assert.equal(res.isInCenterZone, false);
    assert.equal(res.isConfirmed, false);
    assert.equal(res.holdSecondsCountdown, 2);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdTimeRemainingMs, 2000);
    assert.ok(res.distanceMm !== null && res.distanceMm > 40.0);
  });

  it("Test 2: Entering center tolerance starts 2-second countdown (countdown = 2)", () => {
    const detector = new CenterPositionDetector(40.0, 2000);

    // COP at (10, -10) is within 40mm radius (distance = ~14.14 mm)
    const res = detector.update(10.0, -10.0, 1000, true, false);
    assert.equal(res.isInCenterZone, true);
    assert.equal(res.isConfirmed, false);
    assert.equal(res.holdSecondsCountdown, 2);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdTimeRemainingMs, 2000);
  });

  it("Test 3: Holding in center for < 2s does not confirm (counts down 2, 1)", () => {
    const detector = new CenterPositionDetector(40.0, 2000);

    // Enter at t = 1000 (countdown = 2)
    const r0 = detector.update(0.0, 0.0, 1000, true, false);
    assert.equal(r0.isConfirmed, false);
    assert.equal(r0.holdSecondsCountdown, 2);

    // After 1200ms at t = 2200 (800ms remaining -> countdown = 1)
    const r1 = detector.update(5.0, 5.0, 2200, true, false);
    assert.equal(r1.isConfirmed, false);
    assert.equal(r1.holdSecondsCountdown, 1);
    assert.equal(r1.holdTimeRemainingMs, 800);
    assert.ok(r1.holdProgress > 0.55 && r1.holdProgress < 0.65);

    // At 1950ms at t = 2950 (50ms remaining -> still not confirmed!)
    const r2 = detector.update(0.0, 0.0, 2950, true, false);
    assert.equal(r2.isConfirmed, false);
    assert.equal(r2.holdSecondsCountdown, 1);
    assert.equal(r2.holdTimeRemainingMs, 50);
  });

  it("Test 4: Leaving center zone resets countdown to 2s — interrupted holding time discarded", () => {
    const detector = new CenterPositionDetector(40.0, 2000);

    // Enter and hold for 1.5s
    detector.update(0.0, 0.0, 1000, true, false);
    const rHold = detector.update(0.0, 0.0, 2500, true, false);
    assert.equal(rHold.isConfirmed, false);
    assert.equal(rHold.holdSecondsCountdown, 1);

    // Moves outside center tolerance at t = 2600
    const rOut = detector.update(55.0, 0.0, 2600, true, false);
    assert.equal(rOut.isInCenterZone, false);
    assert.equal(rOut.isConfirmed, false);
    assert.equal(rOut.holdSecondsCountdown, 2); // Resets back to 2!
    assert.equal(rOut.holdProgress, 0.0);
    assert.equal(rOut.holdTimeRemainingMs, 2000);

    // Re-enters center at t = 3000 — fresh 2-second hold required
    const rReenter = detector.update(0.0, 0.0, 3000, true, false);
    assert.equal(rReenter.isInCenterZone, true);
    assert.equal(rReenter.isConfirmed, false);
    assert.equal(rReenter.holdSecondsCountdown, 2);
    assert.equal(rReenter.holdProgress, 0.0);
  });

  it("Test 5: Continuous 2.0s hold confirms centre position and stays confirmed", () => {
    const detector = new CenterPositionDetector(40.0, 2000);

    detector.update(0.0, 0.0, 1000, true, false);
    detector.update(0.0, 0.0, 2000, true, false);
    const rFinish = detector.update(0.0, 0.0, 3000, true, false); // 2000ms elapsed

    assert.equal(rFinish.isConfirmed, true);
    assert.equal(rFinish.holdProgress, 1.0);
    assert.equal(rFinish.holdSecondsCountdown, 0);
    assert.equal(rFinish.holdTimeRemainingMs, 0);

    // Subsequent updates stay confirmed
    const rNext = detector.update(50.0, 50.0, 3500, true, false);
    assert.equal(rNext.isConfirmed, true);
  });

  it("Test 6: Invalid or missing COP readings never confirm centre and reset hold timer", () => {
    const detector = new CenterPositionDetector(40.0, 2000);

    // Hold for 1 second
    detector.update(0.0, 0.0, 1000, true, false);
    detector.update(0.0, 0.0, 2000, true, false);

    // Missing / null COP readings (e.g. board returned null or NaN)
    const rNull = detector.update(null as any, null as any, 2500, true, false);
    assert.equal(rNull.isInCenterZone, false);
    assert.equal(rNull.isConfirmed, false);
    assert.equal(rNull.holdProgress, 0.0);
    assert.equal(rNull.holdSecondsCountdown, 2);

    // Disconnect pauses and preserves state if connected was false
    const rDc = detector.update(0.0, 0.0, 3000, false, false);
    assert.equal(rDc.isConfirmed, false);
  });
});

describe("Target Achieving Game — Step 3: Strictly Sequential Balloon Display & Progression", () => {
  const t1 = BALLOON_TARGET_SPECS[0];
  const t2 = BALLOON_TARGET_SPECS[1];
  const t3 = BALLOON_TARGET_SPECS[2];
  const t4 = BALLOON_TARGET_SPECS[3];

  it("Test 1: Only Balloon 1 is active initially after centre confirmation", () => {
    const centerDetector = new CenterPositionDetector(40.0, 2000);
    const targetDetector = new BalloonTargetDetector(35.0, 2000, 10000);

    // Initial state: center not confirmed, no target is active
    assert.equal(centerDetector.getIsConfirmed(), false);
    assert.equal(targetDetector.getTerminalStatus(), "pending");

    // Centre confirmed after 2 seconds
    centerDetector.update(0.0, 0.0, 1000, true, false);
    const centerDone = centerDetector.update(0.0, 0.0, 3000, true, false);
    assert.equal(centerDone.isConfirmed, true);

    // Only now Balloon 1 is activated
    targetDetector.setTarget(t1.id, 3000);
    assert.equal(targetDetector.getTerminalStatus(), "active");
    assert.equal(targetDetector.getTimeRemainingMs(), 10000);
  });

  it("Test 2: Balloon 1 completion triggers blast, and Balloon 2 is NOT active during blast animation delay", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(t1.id, 1000);

    // Patient holds Balloon 1 for 2 continuous seconds (1000ms to 3000ms)
    detector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, 1000, true, false);
    const achieved = detector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, 3000, true, false);
    assert.equal(achieved.isAchieved, true);
    assert.equal(achieved.status, "completed");

    // During 600ms blast animation (t = 3000 to 3600), Balloon 1 stays completed and Balloon 2 has NOT started
    const duringBlast = detector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, 3400, true, false);
    assert.equal(duringBlast.status, "completed");
    assert.equal(duringBlast.isAchieved, true);
  });

  it("Test 3: Balloon 2 activates only after blast animation completes, with fresh 10s timer and 2s hold", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);

    // After 600ms blast delay at t = 3600, Balloon 2 is activated
    detector.setTarget(t2.id, 3600);
    assert.equal(detector.getTerminalStatus(), "active");
    assert.equal(detector.getTimeRemainingMs(), 10000);

    // Target 2 requires a fresh 2-second hold
    const initialT2 = detector.update(0, 0, t2.targetXMm, t2.targetYMm, 3600, true, false);
    assert.equal(initialT2.isInTolerance, false);
    assert.equal(initialT2.holdSecondsCountdown, 2);
    assert.equal(initialT2.isAchieved, false);
  });

  it("Test 4: Balloon 2 timeout triggers failure deflation, and Balloon 3 is NOT active during deflation delay", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    detector.setTarget(t2.id, 3600);

    // 10s timer expires at t = 13600
    const timeoutRes = detector.update(0, 0, t2.targetXMm, t2.targetYMm, 13600, true, false);
    assert.equal(timeoutRes.isTimedOut, true);
    assert.equal(timeoutRes.status, "missed");

    // During 700ms deflation animation (t = 13600 to 14300), Balloon 2 is locked as missed
    const duringDeflate = detector.update(0, 0, t2.targetXMm, t2.targetYMm, 14000, true, false);
    assert.equal(duringDeflate.status, "missed");
    assert.equal(duringDeflate.timeRemainingMs, 0);

    // Only after deflation delay at t = 14300 does Balloon 3 activate
    detector.setTarget(t3.id, 14300);
    assert.equal(detector.getTerminalStatus(), "active");
    assert.equal(detector.getTimeRemainingMs(), 10000);
  });

  it("Test 5: Full 4-balloon progression in sequence completes session and calculates summary correctly", () => {
    const detector = new BalloonTargetDetector(35.0, 2000, 10000);
    const sequence = [t1, t2, t3, t4];
    const attempts: TargetAttemptResult[] = [];
    let currentTime = 1000;

    sequence.forEach((balloon, index) => {
      detector.setTarget(balloon.id, currentTime);

      if (index % 2 === 0) {
        // Targets 0 (t1) and 2 (t3): Completed with 2s hold
        detector.update(balloon.targetXMm, balloon.targetYMm, balloon.targetXMm, balloon.targetYMm, currentTime, true, false);
        currentTime += 2000;
        const res = detector.update(balloon.targetXMm, balloon.targetYMm, balloon.targetXMm, balloon.targetYMm, currentTime, true, false);
        assert.equal(res.status, "completed");

        attempts.push({
          targetIndex: index,
          balloonId: balloon.id,
          number: balloon.number,
          name: balloon.name,
          directionLabel: balloon.directionLabel,
          color: balloon.color,
          status: "completed",
          durationMs: 2000,
          finalDistanceMm: 12.0,
        });

        currentTime += 600; // Blast animation delay before next target
      } else {
        // Targets 1 (t2) and 3 (t4): Missed on 10s timeout
        currentTime += 10000;
        const res = detector.update(0, 0, balloon.targetXMm, balloon.targetYMm, currentTime, true, false);
        assert.equal(res.status, "missed");

        attempts.push({
          targetIndex: index,
          balloonId: balloon.id,
          number: balloon.number,
          name: balloon.name,
          directionLabel: balloon.directionLabel,
          color: balloon.color,
          status: "missed",
          durationMs: 10000,
          finalDistanceMm: 60.0,
        });

        currentTime += 700; // Deflation animation delay before next target
      }
    });

    assert.equal(attempts.length, 4);
    const summary = computeGameSessionSummary(attempts, [], currentTime - 1000);
    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 2);
    assert.equal(summary.missedTargets, 2);
    assert.equal(summary.achievementPercentage, 50);
    // Average time of completed targets only: (2000 + 2000) / 2 = 2000ms
    assert.equal(summary.averageAchievementTimeMs, 2000);
  });

  it("Test 6: Full Patient Workflow E2E — Centre Start (2s) -> Target 1 (2s hold) -> Pop -> Target 2 with Disconnect/Reconnect -> Complete Session", () => {
    // 1. Session begins: Centre detector initialized, target detector pending
    const centerDetector = new CenterPositionDetector(40.0, 2000);
    const targetDetector = new BalloonTargetDetector(35.0, 2000, 10000);

    let sessionTime = 1000;
    assert.equal(centerDetector.getIsConfirmed(), false);

    // Patient outside centre at t=1000 (distance = 80mm)
    const c0 = centerDetector.update(80.0, 0.0, sessionTime, true, false);
    assert.equal(c0.isInCenterZone, false);
    assert.equal(c0.isConfirmed, false);
    assert.equal(c0.holdSecondsCountdown, 2);

    // Patient enters centre at t=1500 (distance = 5mm)
    sessionTime = 1500;
    const cEnter = centerDetector.update(5.0, 0.0, sessionTime, true, false);
    assert.equal(cEnter.isInCenterZone, true);
    assert.equal(cEnter.isConfirmed, false);
    assert.equal(cEnter.holdSecondsCountdown, 2);

    // Patient holds centre for 1.2s at t=2700 (countdown = 1)
    sessionTime = 2700;
    const c1 = centerDetector.update(0.0, 0.0, sessionTime, true, false);
    assert.equal(c1.isConfirmed, false);
    assert.equal(c1.holdSecondsCountdown, 1);

    // Completes 2.0s continuous centre hold at t=3500
    sessionTime = 3500;
    const cDone = centerDetector.update(0.0, 0.0, sessionTime, true, false);
    assert.equal(cDone.isConfirmed, true);

    // 2. Centre confirmed! Activate Balloon 1
    targetDetector.setTarget(t1.id, sessionTime);
    assert.equal(targetDetector.getTerminalStatus(), "active");
    assert.equal(targetDetector.getTimeRemainingMs(), 10000);

    // Patient moves COP into Balloon 1 at t=4000
    sessionTime = 4000;
    const b1Enter = targetDetector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, sessionTime, true, false);
    assert.equal(b1Enter.isInTolerance, true);
    assert.equal(b1Enter.isAchieved, false);
    assert.equal(b1Enter.holdSecondsCountdown, 2);

    // Patient continuously holds Balloon 1 for 2 seconds (t=4000 to t=6000)
    sessionTime = 6000;
    const b1Achieved = targetDetector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, sessionTime, true, false);
    assert.equal(b1Achieved.isAchieved, true);
    assert.equal(b1Achieved.status, "completed");

    // 3. Blast animation delay (600ms) from t=6000 to t=6600
    // During this time, Balloon 1 is popping, and Balloon 2 is NOT active yet
    sessionTime = 6300;
    const duringBlast = targetDetector.update(t1.targetXMm, t1.targetYMm, t1.targetXMm, t1.targetYMm, sessionTime, true, false);
    assert.equal(duringBlast.status, "completed");

    // 4. At t=6600, Balloon 2 becomes visible & active
    sessionTime = 6600;
    targetDetector.setTarget(t2.id, sessionTime);
    assert.equal(targetDetector.getTerminalStatus(), "active");
    assert.equal(targetDetector.getTimeRemainingMs(), 10000);

    // 5. Hardware disconnect test on Balloon 2:
    // Active for 3 seconds (t=6600 to t=9600)
    sessionTime = 9600;
    const t2Active = targetDetector.update(0, 0, t2.targetXMm, t2.targetYMm, sessionTime, true, false);
    assert.equal(t2Active.timeRemainingMs, 7000);

    // Disconnect board for 5 seconds (t=9600 to t=14600)
    sessionTime = 14600;
    const t2Dc = targetDetector.update(0, 0, t2.targetXMm, t2.targetYMm, sessionTime, false, false);
    assert.equal(t2Dc.isValid, false);
    assert.equal(t2Dc.timeRemainingMs, 7000); // Timer strictly frozen!
    assert.equal(t2Dc.holdSecondsCountdown, 2);

    // Reconnect board at t=14600 and enter Balloon 2 target tolerance
    const t2Rc = targetDetector.update(t2.targetXMm, t2.targetYMm, t2.targetXMm, t2.targetYMm, sessionTime, true, false);
    assert.equal(t2Rc.timeRemainingMs, 7000);
    assert.equal(t2Rc.status, "active");
    assert.equal(t2Rc.isInTolerance, true);
    assert.equal(t2Rc.holdSecondsCountdown, 2);

    // Complete Balloon 2 with 2s continuous hold (t=14600 to t=16600)
    sessionTime = 16600;
    const t2Achieved = targetDetector.update(t2.targetXMm, t2.targetYMm, t2.targetXMm, t2.targetYMm, sessionTime, true, false);
    assert.equal(t2Achieved.isAchieved, true);
    assert.equal(t2Achieved.status, "completed");
  });
});

describe("Step 6 — Target Achieving Game: Session Data & Doctor Report Validation", () => {
  const dummyPatient = {
    id: "PAT-001",
    medicalRecordNumber: "MRN-12345",
    fullName: "John Doe",
    age: 62,
    gender: "Male" as const,
    heightCm: 175,
    baselineWeightKg: 78.5,
    conditionDiagnosis: "Stroke Post-Rehab Balance",
    rehabilitationGoal: "Voluntary Weight Shift Stability",
    assignedDoctor: "Dr. Evelyn Reed, PT",
    lastSessionDate: "2026-11-20",
  };

  it("Scenario 1: Patient completes all 4 targets (100% achievement)", () => {
    const attempts: TargetAttemptResult[] = [
      {
        targetIndex: 0,
        balloonId: 1,
        number: 1,
        name: "Red Balloon",
        directionLabel: "Top-Left",
        color: "#EF4444",
        status: "completed",
        durationMs: 3200,
        finalDistanceMm: 12.4,
      },
      {
        targetIndex: 1,
        balloonId: 2,
        number: 2,
        name: "Blue Balloon",
        directionLabel: "Top-Right",
        color: "#3B82F6",
        status: "completed",
        durationMs: 4100,
        finalDistanceMm: 8.7,
      },
      {
        targetIndex: 2,
        balloonId: 3,
        number: 3,
        name: "Yellow Balloon",
        directionLabel: "Bottom-Left",
        color: "#EAB308",
        status: "completed",
        durationMs: 2900,
        finalDistanceMm: 15.2,
      },
      {
        targetIndex: 3,
        balloonId: 4,
        number: 4,
        name: "Green Balloon",
        directionLabel: "Bottom-Right",
        color: "#10B981",
        status: "completed",
        durationMs: 3800,
        finalDistanceMm: 6.1,
      },
    ];

    const trajectory: RecordedCopPoint[] = [
      { timestamp: 1000, copX: 0, copY: 0, copXMm: 0, copYMm: 0, targetId: 1, stepIndex: 0 },
      { timestamp: 3200, copX: -0.3, copY: 0.25, copXMm: -66.9, copYMm: 29.75, targetId: 1, stepIndex: 0 },
      { timestamp: 7300, copX: 0.3, copY: 0.25, copXMm: 66.9, copYMm: 29.75, targetId: 2, stepIndex: 1 },
      { timestamp: 10200, copX: -0.3, copY: -0.25, copXMm: -66.9, copYMm: -29.75, targetId: 3, stepIndex: 2 },
      { timestamp: 14000, copX: 0.3, copY: -0.25, copXMm: 66.9, copYMm: -29.75, targetId: 4, stepIndex: 3 },
    ];

    const summary = computeGameSessionSummary(attempts, trajectory, 14000, {
      sessionId: "session_scenario_1",
      sessionDate: "2026-11-23T20:00:00.000Z",
      isRealHardware: true,
      patientName: dummyPatient.fullName,
      patientId: dummyPatient.medicalRecordNumber,
    });

    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 4);
    assert.equal(summary.missedTargets, 0);
    assert.equal(summary.achievementPercentage, 100);
    // (3200 + 4100 + 2900 + 3800) / 4 = 14000 / 4 = 3500ms
    assert.equal(summary.averageAchievementTimeMs, 3500);

    // Verify PDF report generation produces valid document
    const doc = PdfReportGenerator.generateTargetAchievingGameReport(summary, dummyPatient, new Date());
    assert.ok(doc);
    assert.equal(doc.getNumberOfPages(), 2);
    const pdfOutput = doc.output("arraybuffer");
    assert.ok(pdfOutput.byteLength > 1000);
  });

  it("Scenario 2: Patient misses all 4 targets via timeouts (0% achievement)", () => {
    const attempts: TargetAttemptResult[] = [
      {
        targetIndex: 0,
        balloonId: 1,
        number: 1,
        name: "Red Balloon",
        directionLabel: "Top-Left",
        color: "#EF4444",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 72.3,
      },
      {
        targetIndex: 1,
        balloonId: 2,
        number: 2,
        name: "Blue Balloon",
        directionLabel: "Top-Right",
        color: "#3B82F6",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 85.0,
      },
      {
        targetIndex: 2,
        balloonId: 3,
        number: 3,
        name: "Yellow Balloon",
        directionLabel: "Bottom-Left",
        color: "#EAB308",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 64.1,
      },
      {
        targetIndex: 3,
        balloonId: 4,
        number: 4,
        name: "Green Balloon",
        directionLabel: "Bottom-Right",
        color: "#10B981",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 90.2,
      },
    ];

    const summary = computeGameSessionSummary(attempts, [], 40000, {
      sessionId: "session_scenario_2",
      isRealHardware: true,
    });

    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 0);
    assert.equal(summary.missedTargets, 4);
    assert.equal(summary.achievementPercentage, 0);
    // When 0 targets are completed, average time must be null (displayed as --, never NaN)
    assert.equal(summary.averageAchievementTimeMs, null);

    // Verify PDF generation handles 0 completed targets without error
    const doc = PdfReportGenerator.generateTargetAchievingGameReport(summary, dummyPatient, new Date());
    assert.ok(doc);
    assert.equal(doc.getNumberOfPages(), 2);
    const pdfOutput = doc.output("arraybuffer");
    assert.ok(pdfOutput.byteLength > 1000);
  });

  it("Scenario 3: Patient completes 2 targets and misses 2 targets (50% achievement)", () => {
    const attempts: TargetAttemptResult[] = [
      {
        targetIndex: 0,
        balloonId: 1,
        number: 1,
        name: "Red Balloon",
        directionLabel: "Top-Left",
        color: "#EF4444",
        status: "completed",
        durationMs: 3000,
        finalDistanceMm: 14.0,
      },
      {
        targetIndex: 1,
        balloonId: 2,
        number: 2,
        name: "Blue Balloon",
        directionLabel: "Top-Right",
        color: "#3B82F6",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 62.0,
      },
      {
        targetIndex: 2,
        balloonId: 3,
        number: 3,
        name: "Yellow Balloon",
        directionLabel: "Bottom-Left",
        color: "#EAB308",
        status: "completed",
        durationMs: 4000,
        finalDistanceMm: 11.5,
      },
      {
        targetIndex: 3,
        balloonId: 4,
        number: 4,
        name: "Green Balloon",
        directionLabel: "Bottom-Right",
        color: "#10B981",
        status: "missed",
        durationMs: 10000,
        finalDistanceMm: 80.0,
      },
    ];

    const summary = computeGameSessionSummary(attempts, [], 27000);

    assert.equal(summary.totalTargets, 4);
    assert.equal(summary.completedTargets, 2);
    assert.equal(summary.missedTargets, 2);
    assert.equal(summary.achievementPercentage, 50);
    // Average achievement time must ONLY include completed targets: (3000 + 4000) / 2 = 3500 ms
    assert.equal(summary.averageAchievementTimeMs, 3500);

    const doc = PdfReportGenerator.generateTargetAchievingGameReport(summary, dummyPatient, new Date());
    assert.ok(doc);
    assert.equal(doc.getNumberOfPages(), 2);
  });

  it("Scenario 4: Hardware disconnect preserves remaining time & resets hold", () => {
    const detector = new BalloonTargetDetector();
    const t = BALLOON_TARGET_SPECS[0];
    detector.setTarget(t.id, 1000);

    // Enter target at t=1000
    const enterRes = detector.update(t.targetXMm, t.targetYMm, t.targetXMm, t.targetYMm, 1000, true, false);
    assert.equal(enterRes.isValid, true);
    assert.equal(enterRes.timeRemainingMs, 10000);
    assert.equal(enterRes.holdSecondsCountdown, 2);

    // Active inside target for 1s (t=1000 to t=2000) -> 1s hold remaining
    const activeRes = detector.update(t.targetXMm, t.targetYMm, t.targetXMm, t.targetYMm, 2000, true, false);
    assert.equal(activeRes.isValid, true);
    assert.equal(activeRes.timeRemainingMs, 9000);
    assert.equal(activeRes.holdSecondsCountdown, 1); // 1000ms inside, 1s remaining

    // Board disconnects at t=2000 for 5s (t=2000 to t=7000)
    const dcRes = detector.update(0, 0, t.targetXMm, t.targetYMm, 7000, false, false);
    assert.equal(dcRes.isValid, false);
    assert.equal(dcRes.timeRemainingMs, 9000); // Remaining time was frozen at 9000
    assert.equal(dcRes.holdSecondsCountdown, 2); // Hold was reset to 2s

    // Reconnected at t=7000, outside target
    const outsideRes = detector.update(0, 0, t.targetXMm, t.targetYMm, 7000, true, false);
    assert.equal(outsideRes.isValid, true);
    assert.equal(outsideRes.timeRemainingMs, 9000);
    assert.equal(outsideRes.holdSecondsCountdown, 2);
  });

  it("Scenario 5: Session restart clears prior attempts and guarantees session isolation", () => {
    // Session 1
    const attemptsS1: TargetAttemptResult[] = [
      { targetIndex: 0, balloonId: 1, number: 1, name: "Red", directionLabel: "TL", color: "red", status: "completed", durationMs: 2500, finalDistanceMm: 10 },
      { targetIndex: 1, balloonId: 2, number: 2, name: "Blue", directionLabel: "TR", color: "blue", status: "completed", durationMs: 3000, finalDistanceMm: 12 },
    ];
    const trajS1: RecordedCopPoint[] = [
      { timestamp: 1000, copX: 0, copY: 0, copXMm: 0, copYMm: 0, targetId: 1, stepIndex: 0 },
    ];
    const s1 = computeGameSessionSummary(attemptsS1, trajS1, 5500, { sessionId: "game_session_1" });
    assert.equal(s1.completedTargets, 2);
    assert.equal(s1.trajectory.length, 1);

    // Session 2 after Restart (Play Again)
    const attemptsS2: TargetAttemptResult[] = [];
    const trajS2: RecordedCopPoint[] = [];
    const s2 = computeGameSessionSummary(attemptsS2, trajS2, 0, { sessionId: "game_session_2" });
    assert.equal(s2.completedTargets, 0);
    assert.equal(s2.missedTargets, 0);
    assert.equal(s2.achievementPercentage, 0);
    assert.equal(s2.averageAchievementTimeMs, null);
    assert.equal(s2.trajectory.length, 0);
    assert.notEqual(s1.sessionId, s2.sessionId);
  });

  it("Scenario 6: Sensor stream gaps and invalid/NaN readings are safely rejected", () => {
    const centerDetector = new CenterPositionDetector();
    centerDetector.reset();

    // Valid readings
    const validRes = centerDetector.update(0.0, 0.0, 1000, true, false);
    assert.equal(validRes.isValid, true);
    assert.equal(validRes.isInCenterZone, true);

    // Invalid null readings
    const nullRes = centerDetector.update(null, null, 2000, true, false);
    assert.equal(nullRes.isValid, false);
    assert.equal(nullRes.isInCenterZone, false);
    assert.equal(nullRes.holdSecondsCountdown, 2); // Reset back to 2

    // Invalid NaN readings
    const nanRes = centerDetector.update(NaN, NaN, 3000, true, false);
    assert.equal(nanRes.isValid, false);
    assert.equal(nanRes.isInCenterZone, false);

    // Target detector with NaN
    const targetDetector = new BalloonTargetDetector();
    targetDetector.setTarget(1, 1000);
    const targetNanRes = targetDetector.update(NaN, NaN, 50, 50, 2000, true, false);
    assert.equal(targetNanRes.isValid, false);
    assert.equal(targetNanRes.isAchieved, false);
    assert.equal(targetNanRes.isInTolerance, false);
    assert.equal(targetNanRes.holdSecondsCountdown, 2);
  });
});
