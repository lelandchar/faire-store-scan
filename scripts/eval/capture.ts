// Capture real end-to-end inputs for the personalization evaluation:
// sample walkthrough -> frames (same selection rules as the browser) -> live store read
// through the running dev server -> default profile. One JSON per demo in research/eval/runs.
//
//   npx tsx scripts/eval/capture.ts [--only <slug>] [--base http://localhost:3011]
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { coerceAnalysis } from "../../src/lib/analysis-schema";
import { SAMPLE_VIDEOS } from "../../src/lib/samples";
import { profileFromAnalysis } from "../../src/lib/store";
import type { Analysis } from "../../src/lib/types";

const exec = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "research", "eval", "runs");
const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const BASE = arg("--base") ?? process.env.EVAL_BASE ?? "http://localhost:3011";
const ONLY = arg("--only");
const FFMPEG = ffmpegPath as unknown as string;

interface Demo {
  slug: string;
  kind: "video" | "photos";
  name: string;
  storeType: string;
  description: string;
  files: string[];
}
interface Cand {
  t: number;
  buf: Buffer;
  sharp: number;
  sig: Float32Array;
}

async function demos(): Promise<Demo[]> {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "public/samples/manifest.json"), "utf8")) as {
    slug: string;
    name: string;
    tagline: string;
    storeType: string;
    photos: { file: string }[];
  }[];
  const videos: Demo[] = SAMPLE_VIDEOS.map((v) => ({
    slug: v.slug,
    kind: "video",
    name: v.name,
    storeType: v.storeType,
    description: v.tagline,
    files: [path.join(ROOT, "public", v.file)],
  }));
  const photos: Demo[] = manifest.map((s) => ({
    slug: s.slug,
    kind: "photos",
    name: s.name,
    storeType: s.storeType,
    description: s.tagline,
    files: s.photos.map((p) => path.join(ROOT, "public/samples", s.slug, p.file)),
  }));
  return [...videos, ...photos];
}

async function duration(file: string): Promise<number> {
  try {
    await exec(FFMPEG, ["-i", file]);
  } catch (e) {
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec((e as { stderr?: string }).stderr ?? "");
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  throw new Error(`Could not read duration of ${file}`);
}

async function grab(file: string, t: number): Promise<Buffer> {
  const { stdout } = await exec(FFMPEG, ["-y", "-loglevel", "error", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout as unknown as Buffer;
}

const toJpeg = (buf: Buffer) => sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();

async function sharpness(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).resize({ width: 96 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let sum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      sum += Math.abs(4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]);
      n++;
    }
  return n ? sum / n : 0;
}
async function signature(buf: Buffer): Promise<Float32Array> {
  const { data } = await sharp(buf).resize(24, 24, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}
const difference = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

/** Mirrors src/lib/frames.ts: 16 candidates, one sharp frame per time bucket, near-duplicates dropped. */
async function videoFrames(file: string, count = 8) {
  const dur = await duration(file);
  const candidateCount = Math.min(16, Math.max(count, Math.round(dur * 1.5)));
  const start = Math.min(0.4, dur * 0.05);
  const end = Math.max(start, dur - 0.25);
  const times = Array.from({ length: candidateCount }, (_, i) => (candidateCount === 1 ? start : start + ((end - start) * i) / (candidateCount - 1)));
  const candidates: Cand[] = [];
  for (const t of times) {
    const buf = await toJpeg(await grab(file, t));
    candidates.push({ t, buf, sharp: await sharpness(buf), sig: await signature(buf) });
  }
  const buckets = Math.min(count, candidates.length);
  const chosen: Cand[] = [];
  const isDup = (c: Cand) => chosen.some((k) => difference(k.sig, c.sig) < 0.035);
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((candidates.length * b) / buckets);
    const hi = Math.floor((candidates.length * (b + 1)) / buckets);
    const slice = candidates.slice(lo, Math.max(lo + 1, hi)).sort((x, y) => y.sharp - x.sharp);
    const fresh = slice.find((c) => !isDup(c));
    if (fresh) chosen.push(fresh);
  }
  chosen.sort((x, y) => x.t - y.t);
  return chosen.map((c, i) => ({ id: `f${i + 1}`, buf: c.buf, timestampMs: Math.round(c.t * 1000) }));
}

async function photoFrames(files: string[]) {
  const out = [];
  for (let i = 0; i < files.length; i++) out.push({ id: `f${i + 1}`, buf: await toJpeg(await fs.readFile(files[i])), timestampMs: 0 });
  return out;
}

async function analyze(frames: { id: string; timestampMs: number; dataUrl: string }[], context: Record<string, string>) {
  const res = await fetch(`${BASE}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frames, context }) });
  if (!res.ok || !res.body) throw new Error(`analyze ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let meta: Record<string, unknown> = {};
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
      if (evt.error) throw new Error(String(evt.error));
      if (typeof evt.delta === "string") text += evt.delta;
      if (typeof evt.replace === "string") text = evt.replace;
      if (evt.done) meta = evt;
    }
  }
  const raw = JSON.parse(text) as unknown;
  const coerced = coerceAnalysis(raw);
  return { analysis: (coerced.data ?? raw) as Analysis, meta, issues: coerced.issues };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  for (const d of await demos()) {
    if (ONLY && d.slug !== ONLY) continue;
    const t0 = Date.now();
    const dir = path.join(OUT, d.slug);
    await fs.mkdir(dir, { recursive: true });
    const frames = d.kind === "video" ? await videoFrames(d.files[0]) : await photoFrames(d.files);
    const frameRecs = [];
    for (const f of frames) {
      await fs.writeFile(path.join(dir, `${f.id}.jpg`), f.buf);
      frameRecs.push({ id: f.id, file: `${d.slug}/${f.id}.jpg`, timestampMs: f.timestampMs });
    }
    console.log(`[${d.slug}] ${frames.length} frames in ${Date.now() - t0} ms; reading the store…`);
    const t1 = Date.now();
    const { analysis, meta, issues } = await analyze(
      frames.map((f) => ({ id: f.id, timestampMs: f.timestampMs, dataUrl: `data:image/jpeg;base64,${f.buf.toString("base64")}` })),
      { storeName: d.name, storeType: d.storeType, description: d.description, sampleSlug: d.slug },
    );
    const profile = profileFromAnalysis(analysis, { storeName: d.name, storeType: d.storeType, description: d.description });
    const record = {
      slug: d.slug,
      kind: d.kind,
      name: d.name,
      storeType: d.storeType,
      description: d.description,
      capturedAt: new Date().toISOString(),
      analysisMs: Date.now() - t1,
      meta,
      issues,
      frames: frameRecs,
      analysis,
      profile,
    };
    await fs.writeFile(path.join(OUT, `${d.slug}.json`), JSON.stringify(record, null, 2));
    console.log(
      `[${d.slug}] read in ${Math.round((Date.now() - t1) / 1000)} s on ${String(meta.model ?? "?")}: ${analysis.categories.map((c) => `${c.name} (${c.share})`).join(", ")}; styles ${analysis.styles.map((s) => s.name).join("/")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
