import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";

export interface ExerciseRegionRecorderOptions {
  /** Encode canvas scale vs CSS pixels. */
  scale?: number;
  /** Target frames per second for smooth playback. */
  fps?: number;
}

type MediaSlot = {
  el: HTMLVideoElement | HTMLCanvasElement;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  mirrored: boolean;
  kind: "instructions" | "board" | "camera";
};

/**
 * Silent Full-HD session recorder (H.264 MP4).
 *
 * Instructions, board, and camera are all live canvases/video every encode frame
 * — no html2canvas (that made the instruction panel lag in the MP4).
 */
export class ExerciseRegionRecorder {
  private root: HTMLElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private scale: number;
  private fps: number;
  private frameIndex = 0;
  private encoding = false;
  private startedAtMs = 0;

  private mediaSlots: MediaSlot[] = [];
  private lastLayoutMs = 0;
  private readonly layoutRefreshMs = 250;

  private output: Output<Mp4OutputFormat, BufferTarget> | null = null;
  private videoSource: CanvasSource | null = null;
  private target: BufferTarget | null = null;

  constructor(options: ExerciseRegionRecorderOptions = {}) {
    this.scale = Math.max(0.85, Math.min(1.25, options.scale ?? 1));
    this.fps = Math.max(15, Math.min(30, options.fps ?? 20));
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    });
  }

  public get isRecording(): boolean {
    return this.running;
  }

  public async start(root: HTMLElement): Promise<boolean> {
    if (this.running) {
      await this.stop({ save: false });
    }
    if (!root || !this.ctx) return false;
    if (typeof VideoEncoder === "undefined") {
      console.warn("WebCodecs VideoEncoder unavailable — cannot record HD MP4");
      return false;
    }

    this.root = root;
    this.frameIndex = 0;
    this.encoding = false;
    this.startedAtMs = 0;
    this.mediaSlots = [];
    this.lastLayoutMs = 0;

    const rect = root.getBoundingClientRect();
    const cssLong = Math.max(rect.width, rect.height, 1);
    const hdScale = 1920 / cssLong;
    const outScale = Math.min(2, Math.max(this.scale, hdScale));
    const { w, h } = evenSize(rect.width * outScale, rect.height * outScale);
    this.canvas.width = w;
    this.canvas.height = h;

    try {
      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target,
      });
      const videoSource = new CanvasSource(this.canvas, {
        codec: "avc",
        quality: QUALITY_HIGH,
        keyFrameInterval: 1.5,
        latencyMode: "realtime",
        sizeChangeBehavior: "fill",
      });
      output.addVideoTrack(videoSource, { frameRate: this.fps });
      await output.start();

      this.target = target;
      this.output = output;
      this.videoSource = videoSource;
    } catch (err) {
      console.warn("Failed to start H.264 MP4 recorder:", err);
      this.cleanupEncoder();
      return false;
    }

    this.running = true;
    this.startedAtMs = performance.now();
    this.refreshMediaLayout(true);

    const intervalMs = Math.round(1000 / this.fps);
    this.timer = setInterval(() => {
      void this.encodeTick();
    }, intervalMs);
    void this.encodeTick();
    return true;
  }

  public async stop(options: { save: boolean; filename?: string }): Promise<string | null> {
    if (!this.running && !this.output) return null;

    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;

    const deadline = performance.now() + 3000;
    while (this.encoding && performance.now() < deadline) {
      await sleep(30);
    }

    let blob: Blob | null = null;
    try {
      if (this.output) {
        await this.output.finalize();
        const buf = this.target?.buffer;
        if (buf && buf.byteLength > 64) {
          blob = new Blob([buf], { type: "video/mp4" });
        }
      }
    } catch (err) {
      console.warn("MP4 finalize failed:", err);
    }

    this.cleanupEncoder();
    this.root = null;
    this.mediaSlots = [];

    if (!options.save || !blob) return null;

    const base = (options.filename ?? `PatientBalanceAI_Exercise_${stamp()}`).replace(
      /\.(webm|mp4)$/i,
      ""
    );
    return saveVideoBlob(blob, `${base}.mp4`);
  }

  /** No-op kept for call sites — instructions are live-painted now. */
  public invalidateChrome(): void {
    // live instruction canvas updates every RAF
  }

  private cleanupEncoder(): void {
    this.output = null;
    this.videoSource = null;
    this.target = null;
  }

  private async encodeTick(): Promise<void> {
    if (!this.running || this.encoding || !this.ctx || !this.videoSource) return;
    this.encoding = true;
    try {
      const duration = 1 / this.fps;
      const timestamp = Math.max(
        this.frameIndex * duration,
        (performance.now() - this.startedAtMs) / 1000
      );
      this.composeFrame();
      await this.videoSource.add(timestamp, duration);
      this.frameIndex += 1;
    } catch {
      // keep clock going
    } finally {
      this.encoding = false;
    }
  }

  private refreshMediaLayout(force = false): void {
    const root = this.root;
    if (!root) return;
    const now = performance.now();
    if (!force && now - this.lastLayoutMs < this.layoutRefreshMs) return;
    this.lastLayoutMs = now;

    const rect = root.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      this.mediaSlots = [];
      return;
    }
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const slots: MediaSlot[] = [];

    root.querySelectorAll("video, canvas").forEach((node) => {
      if (!(node instanceof HTMLVideoElement) && !(node instanceof HTMLCanvasElement)) return;
      if (node === this.canvas) return;

      const live = node instanceof HTMLCanvasElement ? node.dataset.recordLive : undefined;
      const isLiveBoard = live === "board";
      const isLiveInstructions = live === "instructions";
      const inCamera = node.closest('[data-record-snap="camera"]') != null;

      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return;
      if (!isLiveBoard && !isLiveInstructions && style.opacity === "0") return;

      const er = node.getBoundingClientRect();
      if (er.width < 2 || er.height < 2) return;

      if (node instanceof HTMLVideoElement) {
        const siblingCanvas = node.parentElement?.querySelector("canvas");
        if (
          siblingCanvas instanceof HTMLCanvasElement &&
          siblingCanvas !== this.canvas &&
          siblingCanvas.width > 0 &&
          getComputedStyle(siblingCanvas).display !== "none" &&
          getComputedStyle(siblingCanvas).opacity !== "0"
        ) {
          return;
        }
        if (node.readyState < 2) return;
      } else if (
        !isLiveBoard &&
        !isLiveInstructions &&
        (node.width < 2 || node.height < 2)
      ) {
        return;
      }

      if (!isLiveBoard && !isLiveInstructions && !inCamera) return;

      slots.push({
        el: node,
        dx: (er.left - rect.left) * scaleX,
        dy: (er.top - rect.top) * scaleY,
        dw: er.width * scaleX,
        dh: er.height * scaleY,
        mirrored: /scaleX\s*\(\s*-1\s*\)/.test(style.transform),
        kind: isLiveInstructions ? "instructions" : isLiveBoard ? "board" : "camera",
      });
    });

    const rank = (k: MediaSlot["kind"]) =>
      k === "instructions" ? 0 : k === "board" ? 1 : 2;
    slots.sort((a, b) => rank(a.kind) - rank(b.kind));
    this.mediaSlots = slots;
  }

  /** Live instructions + board + camera every frame. */
  private composeFrame(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, w, h);

    this.refreshMediaLayout(false);
    for (const slot of this.mediaSlots) {
      try {
        if (slot.el instanceof HTMLCanvasElement && slot.el.width < 2) continue;
        if (slot.mirrored) {
          ctx.save();
          ctx.translate(slot.dx + slot.dw, slot.dy);
          ctx.scale(-1, 1);
          ctx.drawImage(slot.el, 0, 0, slot.dw, slot.dh);
          ctx.restore();
        } else {
          ctx.drawImage(slot.el, slot.dx, slot.dy, slot.dw, slot.dh);
        }
      } catch {
        // ignore
      }
    }
  }
}

function evenSize(width: number, height: number): { w: number; h: number } {
  const w = Math.max(2, Math.round(width) & ~1);
  const h = Math.max(2, Math.round(height) & ~1);
  return { w, h };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveVideoBlob(blob: Blob, filename: string): Promise<string> {
  const safeName = filename.endsWith(".mp4") ? filename : `${filename}.mp4`;

  if (isTauri() && blob.size > 0 && blob.size <= 80_000_000) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const buf = new Uint8Array(await blob.arrayBuffer());
      const savedPath = await invoke<string>("save_download_file", {
        filename: safeName,
        fileBytes: Array.from(buf),
      });
      return savedPath;
    } catch (err) {
      console.warn("Tauri save_download_file failed, using browser download:", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return safeName;
}
