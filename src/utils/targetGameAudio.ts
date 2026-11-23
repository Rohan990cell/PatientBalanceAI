/**
 * Target Achieving Game — Audio Engine
 *
 * PHASE 8:
 * Provides subtle, pleasant, medical-grade sound effects for:
 * 1. Successful balloon pop (satisfying, short, cheerful pop).
 * 2. Missed balloon deflation (gentle descending pitch slide, non-startling).
 *
 * Implemented using Web Audio API for zero network dependency, reliable offline
 * playback in both browser and Tauri environments, and safe memory cleanup.
 */

export class TargetGameAudioService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor(isMuted: boolean = false) {
    this.isMuted = isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Lazily initializes or resumes AudioContext upon user gesture.
   */
  public getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Short, pleasant balloon pop sound played upon successful target achievement.
   */
  public playBalloonPop(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Rubber Pop Snap: Fast exponential downward pitch sweep
      const popOsc = ctx.createOscillator();
      const popGain = ctx.createGain();

      popOsc.type = "sine";
      popOsc.frequency.setValueAtTime(480, now);
      popOsc.frequency.exponentialRampToValueAtTime(75, now + 0.08);

      popGain.gain.setValueAtTime(0.25, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      popOsc.connect(popGain);
      popGain.connect(ctx.destination);

      popOsc.start(now);
      popOsc.stop(now + 0.1);

      // 2. High Sparkle Chime: Light pleasant pop harmonic
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();

      chimeOsc.type = "triangle";
      chimeOsc.frequency.setValueAtTime(640, now);
      chimeOsc.frequency.exponentialRampToValueAtTime(880, now + 0.06);

      chimeGain.gain.setValueAtTime(0.12, now);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);

      chimeOsc.start(now);
      chimeOsc.stop(now + 0.09);
    } catch {
      // Safe fallback if audio hardware is unavailable or restricted
    }
  }

  /**
   * Gentle, soft deflation sound played when a balloon times out.
   */
  public playBalloonDeflate(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Soft descending slide simulating gentle air release
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(105, now + 0.35);

      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Safe fallback
    }
  }

  /**
   * Clean up audio resources when leaving the exercise.
   */
  public dispose(): void {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}
