import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BALLOON_TARGET_SPECS,
  DEFAULT_TARGET_TOLERANCE_MM,
  DEFAULT_CONFIRMATION_DURATION_MS,
  calculatePhysicalCopDistance,
  BalloonTargetDetector,
  computeGameSessionSummary,
  TargetAttemptResult,
} from "./targetAchievingGame";

describe("Target Achieving Game — 3-Second Target Hold & Real COP Detection", () => {
  const target1 = BALLOON_TARGET_SPECS[0]; // Target 1 (Left): X = -133.8 mm, Y = +5.95 mm

  it("Test 1: COP outside target region — no success and countdown is at 3", () => {
    const copXMm = 0.0;
    const copYMm = 0.0;
    const dist = calculatePhysicalCopDistance(copXMm, copYMm, target1.targetXMm, target1.targetYMm);
    assert.ok(dist !== null && dist > DEFAULT_TARGET_TOLERANCE_MM);

    const detector = new BalloonTargetDetector(); // Defaults to 35mm tolerance, 3000ms hold, 10000ms limit
    assert.equal(DEFAULT_CONFIRMATION_DURATION_MS, 3000);
    assert.equal(detector.getConfirmationDurationMs(), 3000);
    detector.setTarget(target1.id, 1000);

    const res = detector.update(copXMm, copYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(res.isInTolerance, false);
    assert.equal(res.isAchieved, false);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdSecondsCountdown, 3);
    assert.equal(res.holdTimeRemainingMs, 3000);
  });

  it("Test 2: Entering target starts 3-second countdown (countdown = 3)", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 10000);
    detector.setTarget(target1.id, 1000);

    const res = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(res.isInTolerance, true);
    assert.equal(res.isAchieved, false);
    assert.equal(res.holdProgress, 0.0);
    assert.equal(res.holdSecondsCountdown, 3);
    assert.equal(res.holdTimeRemainingMs, 3000);
  });

  it("Test 3: Holding for less than 3 seconds does NOT achieve the target (shows 3, 2, 1)", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 10000);
    detector.setTarget(target1.id, 1000);

    // Initial enter at t = 1000 (countdown = 3)
    const r0 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    assert.equal(r0.isAchieved, false);
    assert.equal(r0.holdSecondsCountdown, 3);

    // After 1.2s at t = 2200 (1.8s remaining -> countdown = 2)
    const r1 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2200, true, false);
    assert.equal(r1.isAchieved, false);
    assert.equal(r1.holdSecondsCountdown, 2);
    assert.equal(r1.holdTimeRemainingMs, 1800);
    assert.ok(r1.holdProgress > 0.35 && r1.holdProgress < 0.45);

    // After 2.5s at t = 3500 (0.5s remaining -> countdown = 1)
    const r2 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3500, true, false);
    assert.equal(r2.isAchieved, false);
    assert.equal(r2.holdSecondsCountdown, 1);
    assert.equal(r2.holdTimeRemainingMs, 500);

    // At 2.99s at t = 3990 (10ms remaining -> still not achieved!)
    const r3 = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3990, true, false);
    assert.equal(r3.isAchieved, false);
    assert.equal(r3.holdSecondsCountdown, 1);
  });

  it("Test 4: Leaving target resets countdown to 3s — interrupted holding time is discarded", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 10000);
    detector.setTarget(target1.id, 1000);

    // Enter and hold for 2.4s (countdown reaches 1)
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const rHold = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3400, true, false);
    assert.equal(rHold.isAchieved, false);
    assert.equal(rHold.holdSecondsCountdown, 1);

    // Patient slips outside tolerance at t = 3500
    const rOut = detector.update(0.0, 0.0, target1.targetXMm, target1.targetYMm, 3500, true, false);
    assert.equal(rOut.isInTolerance, false);
    assert.equal(rOut.isAchieved, false);
    assert.equal(rOut.holdProgress, 0.0);
    assert.equal(rOut.holdSecondsCountdown, 3); // Resets to 3!
    assert.equal(rOut.holdTimeRemainingMs, 3000);

    // Patient re-enters at t = 4000 — must start a completely fresh 3-second hold
    const rReenter = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 4000, true, false);
    assert.equal(rReenter.isInTolerance, true);
    assert.equal(rReenter.isAchieved, false);
    assert.equal(rReenter.holdSecondsCountdown, 3);
    assert.equal(rReenter.holdProgress, 0.0);

    // Holding for only 1 second after re-entry (t = 5000) does NOT achieve
    const rFreshHold = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 5000, true, false);
    assert.equal(rFreshHold.isAchieved, false);
    assert.equal(rFreshHold.holdSecondsCountdown, 2);
  });

  it("Test 5: Holding continuously for the full 3 seconds achieves the target", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 10000);
    detector.setTarget(target1.id, 1000);

    // Enter at t = 1000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    // Hold at t = 2000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2000, true, false);
    // Hold at t = 3000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);
    // Exactly 3.0 seconds continuous hold at t = 4000
    const resDone = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 4000, true, false);

    assert.equal(resDone.isInTolerance, true);
    assert.equal(resDone.isAchieved, true);
    assert.equal(resDone.status, "completed");
    assert.equal(resDone.holdProgress, 1.0);
    assert.equal(resDone.holdSecondsCountdown, 0);
    assert.equal(resDone.holdTimeRemainingMs, 0);
  });

  it("Test 6: Invalid or null COP reading resets the 3-second hold timer", () => {
    const detector = new BalloonTargetDetector(35.0, 3000, 10000);
    detector.setTarget(target1.id, 1000);

    // Hold for 2.0s
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 1000, true, false);
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);

    // Sensor returns null
    const rNull = detector.update(null, null, target1.targetXMm, target1.targetYMm, 3100, true, false);
    assert.equal(rNull.isValid, false);
    assert.equal(rNull.isAchieved, false);
    assert.equal(rNull.holdProgress, 0.0);
    assert.equal(rNull.holdSecondsCountdown, 3);
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
    const detector = new BalloonTargetDetector(35.0, 3000, timeLimitMs);

    // Target 1 times out
    detector.setTarget(target1.id, 1000);
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const miss = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 5500, true, false);
    assert.equal(miss.status, "missed");

    // Activate Target 2 with fresh timer and 3s hold requirement
    detector.setTarget(target2.id, 5600);
    const t2Res = detector.update(0, 0, target2.targetXMm, target2.targetYMm, 5600, true, false);
    assert.equal(t2Res.status, "active");
    assert.equal(t2Res.isTimedOut, false);
    assert.equal(t2Res.timeRemainingMs, timeLimitMs);
    assert.equal(t2Res.holdSecondsCountdown, 3);
  });

  it("Test 3: Successful balloon does not get marked missed", () => {
    const timeLimitMs = 8000;
    const detector = new BalloonTargetDetector(35.0, 3000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Enter at 2000, hold for full 3s and achieve at 5000
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 2000, true, false);
    const succ = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 5000, true, false);
    assert.equal(succ.isAchieved, true);
    assert.equal(succ.status, "completed");

    // Later at t = 10000 (after 9s total), status remains strictly completed
    const late = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 10000, true, false);
    assert.equal(late.status, "completed");
    assert.equal(late.isTimedOut, false);
  });

  it("Test 4: Success takes priority over timeout if hold completes at the timeout boundary", () => {
    const timeLimitMs = 5000;
    const confirmationDurationMs = 3000;
    const detector = new BalloonTargetDetector(35.0, confirmationDurationMs, timeLimitMs);

    // Active at t = 1000, enter tolerance at t = 3000 (2.0s in)
    detector.setTarget(target1.id, 1000);
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 3000, true, false);

    // At t = 6000 (exactly 5000ms elapsed since start, and 3000ms dwell completed)
    const boundaryRes = detector.update(target1.targetXMm, target1.targetYMm, target1.targetXMm, target1.targetYMm, 6000, true, false);

    // Must be 'completed', NOT 'missed'
    assert.equal(boundaryRes.isAchieved, true);
    assert.equal(boundaryRes.status, "completed");
    assert.equal(boundaryRes.isTimedOut, false);
  });

  it("Test 5: Timer pauses during hardware disconnection and game pause", () => {
    const timeLimitMs = 10000;
    const detector = new BalloonTargetDetector(35.0, 3000, timeLimitMs);
    detector.setTarget(target1.id, 1000);

    // Active for 3 seconds (t = 1000 to 4000)
    detector.update(0, 0, target1.targetXMm, target1.targetYMm, 1000, true, false);
    const r1 = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 4000, true, false);
    assert.equal(r1.timeRemainingMs, 7000);

    // Disconnected for 6 seconds (t = 4000 to 10000)
    const rDis = detector.update(0, 0, target1.targetXMm, target1.targetYMm, 10000, false, false);
    assert.equal(rDis.isValid, false);
    assert.equal(rDis.timeRemainingMs, 7000); // Remaining time preserved!
    assert.equal(rDis.holdSecondsCountdown, 3); // Hold timer reset/cleared during disconnection!

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
    const detector = new BalloonTargetDetector(35.0, 3000, 6000);
    const sequence = [1, 2, 3, 4];
    const outcomes: string[] = [];
    let time = 1000;

    for (const bId of sequence) {
      const target = BALLOON_TARGET_SPECS.find((b) => b.id === bId)!;
      detector.setTarget(target.id, time);

      if (bId % 2 === 1) {
        // Odd targets (1, 3): Patient completes target after 3s continuous hold
        detector.update(target.targetXMm, target.targetYMm, target.targetXMm, target.targetYMm, time, true, false);
        time += 3000;
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
