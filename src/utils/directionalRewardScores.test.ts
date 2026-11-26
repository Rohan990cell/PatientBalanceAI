import {
  missScoreFromMeanMm,
  pathScoreFromRatio,
} from "./directionalRewardScores";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

console.log("=== directionalRewardScores ===");

assert(pathScoreFromRatio(1) === 10, "shortest path → 10");
assert(pathScoreFromRatio(1.01) >= 9, "tiny excess still high");
assert(pathScoreFromRatio(3) === 1, "3× path → 1");
assert(pathScoreFromRatio(10) === 1, "very long still clamped to 1");

assert(missScoreFromMeanMm(0, 40) === 10, "zero miss → 10");
assert(missScoreFromMeanMm(100, 40) === 1, "large miss → 1");
assert(missScoreFromMeanMm(20, 40) >= 5 && missScoreFromMeanMm(20, 40) <= 9, "mid miss mid score");

console.log("PASS: path + miss 1–10 scoring");
