import type { Frame } from "./types";

// Browser-side frame extraction. The raw video never leaves the phone: we
// sample candidate frames, drop the blurriest, and upload a handful of
// compressed JPEGs.

export interface ExtractOptions {
  count?: number;
  maxEdge?: number;
  quality?: number;
  onProgress?: (done: number, total: number) => void;
}

const DEFAULTS = { count: 8, maxEdge: 1280, quality: 0.8 };

function once<K extends keyof HTMLVideoElementEventMap>(
  el: HTMLVideoElement,
  event: K,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for video "${event}"`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The video could not be decoded on this device."));
    };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
    };
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

/** Variance of a 3x3 Laplacian over a small grayscale copy: higher = sharper. */
function sharpness(canvas: HTMLCanvasElement): number {
  const w = 96;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Tiny grayscale signature used to detect near-duplicate frames. */
function signature(canvas: HTMLCanvasElement): Float32Array {
  const w = 24;
  const h = 24;
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  const out = new Float32Array(w * h);
  if (!ctx) return out;
  ctx.drawImage(canvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) out[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  return out;
}

/** Mean absolute difference between two signatures, 0 (identical) .. 1. */
function difference(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

const DUPLICATE_THRESHOLD = 0.035;

function fitSize(w: number, h: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.round(w * scale), Math.round(h * scale)];
}

export async function extractFramesFromVideo(file: File, opts: ExtractOptions = {}): Promise<Frame[]> {
  const { count, maxEdge, quality } = { ...DEFAULTS, ...opts };
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Keep it in the DOM but invisible: some mobile browsers refuse to decode
  // detached video elements.
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  try {
    video.load();
    await once(video, "loadedmetadata");
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      // MediaRecorder WebM files report Infinity until you seek to the end.
      video.currentTime = 1e100;
      await once(video, "timeupdate");
      duration = video.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the video length.");

    const candidateCount = Math.min(16, Math.max(count, Math.round(duration * 1.5)));
    const start = Math.min(0.4, duration * 0.05);
    const end = Math.max(start, duration - 0.25);
    const times = Array.from({ length: candidateCount }, (_, i) =>
      candidateCount === 1 ? start : start + ((end - start) * i) / (candidateCount - 1),
    );

    const [w, h] = fitSize(video.videoWidth || 720, video.videoHeight || 1280, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");

    const candidates: { t: number; dataUrl: string; sharp: number; sig: Float32Array }[] = [];
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const seeked = once(video, "seeked", 6000);
      video.currentTime = t;
      await seeked;
      ctx.drawImage(video, 0, 0, w, h);
      candidates.push({ t, dataUrl: canvas.toDataURL("image/jpeg", quality), sharp: sharpness(canvas), sig: signature(canvas) });
      opts.onProgress?.(i + 1, times.length);
    }

    // Keep temporal spread: bucket candidates by time, take the sharpest of each.
    // Keep temporal spread (one frame per bucket), prefer sharp frames, and skip
    // frames that are near-duplicates of ones already kept so a static clip does
    // not produce eight copies of the same shelf.
    const buckets = Math.min(count, candidates.length);
    const chosen: typeof candidates = [];
    const isDuplicate = (c: (typeof candidates)[number]) => chosen.some((k) => difference(k.sig, c.sig) < DUPLICATE_THRESHOLD);
    for (let b = 0; b < buckets; b++) {
      const lo = Math.floor((candidates.length * b) / buckets);
      const hi = Math.floor((candidates.length * (b + 1)) / buckets);
      const slice = candidates.slice(lo, Math.max(lo + 1, hi)).sort((x, y) => y.sharp - x.sharp);
      const fresh = slice.find((c) => !isDuplicate(c));
      if (fresh) chosen.push(fresh);
    }
    // If duplicates collapsed the set, top up with the most different remaining candidates.
    if (chosen.length < Math.min(4, candidates.length)) {
      const rest = candidates.filter((c) => !chosen.includes(c));
      rest.sort((x, y) => y.sharp - x.sharp);
      for (const c of rest) {
        if (chosen.length >= Math.min(count, candidates.length)) break;
        if (!isDuplicate(c)) chosen.push(c);
      }
      if (chosen.length < 3) for (const c of rest) if (!chosen.includes(c) && chosen.length < 3) chosen.push(c);
      chosen.sort((x, y) => x.t - y.t);
    }
    return chosen.map((c, i) => ({
      id: `f${i + 1}`,
      dataUrl: c.dataUrl,
      timestampMs: Math.round(c.t * 1000),
      source: "video" as const,
    }));
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read one of the photos."));
    img.src = src;
  });
}

export async function framesFromImages(files: File[], opts: ExtractOptions = {}): Promise<Frame[]> {
  const { maxEdge, quality, count } = { ...DEFAULTS, ...opts };
  const frames: Frame[] = [];
  const limited = files.slice(0, Math.max(count, 8));
  for (let i = 0; i < limited.length; i++) {
    const url = URL.createObjectURL(limited[i]);
    try {
      const img = await loadImage(url);
      const [w, h] = fitSize(img.naturalWidth, img.naturalHeight, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
      frames.push({ id: `f${i + 1}`, dataUrl: canvas.toDataURL("image/jpeg", quality), timestampMs: 0, source: "photo" });
      opts.onProgress?.(i + 1, limited.length);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return frames;
}

/** Load already-hosted sample photos (same-origin URLs) into frames. */
export async function framesFromUrls(urls: string[], opts: ExtractOptions = {}): Promise<Frame[]> {
  const { maxEdge, quality } = { ...DEFAULTS, ...opts };
  const frames: Frame[] = [];
  for (let i = 0; i < urls.length; i++) {
    const img = await loadImage(urls[i]);
    const [w, h] = fitSize(img.naturalWidth, img.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
    frames.push({ id: `f${i + 1}`, dataUrl: canvas.toDataURL("image/jpeg", quality), timestampMs: 0, source: "photo" });
    opts.onProgress?.(i + 1, urls.length);
  }
  return frames;
}

/** Approximate upload size in bytes for a set of frames. */
export function framesBytes(frames: Frame[]): number {
  return frames.reduce((n, f) => n + Math.round((f.dataUrl.length * 3) / 4), 0);
}
