import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TargetGameAudioService } from "./targetGameAudio";

describe("Target Achieving Game — Phase 8: Sound Effects & Audio Controls", () => {
  it("Test 1: Audio service initializes with sound ON by default", () => {
    const audio = new TargetGameAudioService();
    assert.equal(audio.getIsMuted(), false);
  });

  it("Test 2: Muting suppresses sound playback", () => {
    const audio = new TargetGameAudioService(false);
    audio.setMuted(true);
    assert.equal(audio.getIsMuted(), true);

    // Should return early safely without throwing
    assert.doesNotThrow(() => {
      audio.playBalloonPop();
      audio.playBalloonDeflate();
    });
  });

  it("Test 3: Unmuting restores sound playback during a session", () => {
    const audio = new TargetGameAudioService(true);
    assert.equal(audio.getIsMuted(), true);

    audio.setMuted(false);
    assert.equal(audio.getIsMuted(), false);

    assert.doesNotThrow(() => {
      audio.playBalloonPop();
      audio.playBalloonDeflate();
    });
  });

  it("Test 4: Dispose safely cleans up resources", () => {
    const audio = new TargetGameAudioService();
    assert.doesNotThrow(() => {
      audio.dispose();
    });
  });
});
