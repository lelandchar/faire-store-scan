/**
 * Server-only CLIP embeddings (image + text) for nearest-neighbour product retrieval.
 *
 * Runs `Xenova/clip-vit-base-patch32` locally through `@huggingface/transformers`
 * (transformers.js v4, ONNX Runtime on CPU) so the prototype needs no external API
 * key. Both towers are loaded once per process (lazy singleton, HMR-safe) and every
 * vector returned from this module is L2-normalized, so `cosine()` is a dot product.
 *
 * Environment:
 *   TRANSFORMERS_CACHE_DIR  where model weights are cached on disk.
 *                           Default: ./.cache/transformers (relative to process.cwd()).
 *                           First run downloads ~150 MB (q8 weights + tokenizer + configs).
 *   TRANSFORMERS_OFFLINE=1  never touch the network; fail fast if the cache is cold.
 *
 * Do not import this from client components: it pulls in onnxruntime-node and sharp.
 * `next.config.ts` lists those packages in `serverExternalPackages`.
 */

import path from "node:path";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
  type Tensor,
} from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/clip-vit-base-patch32";
export const EMBEDDING_DIM = 512;
/** Quantized int8 ONNX weights (`*_quantized.onnx`): ~85 MB vision + ~62 MB text. */
export const EMBEDDING_DTYPE = "q8" as const;
export const EMBEDDING_CACHE_DIR =
  process.env.TRANSFORMERS_CACHE_DIR ?? path.join(process.cwd(), ".cache", "transformers");

/** Images per ONNX call. Bounds peak memory; 8 x 224x224 is ~4.8 MB of float32 input. */
const IMAGE_BATCH = 8;
/** Prompts per ONNX call. */
const TEXT_BATCH = 32;

if (typeof window !== "undefined") {
  throw new Error("src/lib/embeddings.ts is server-only and must not be imported in the browser.");
}

// transformers.js reads no environment variables itself; configure it here, once,
// before the first from_pretrained() call.
env.cacheDir = EMBEDDING_CACHE_DIR;
env.useFSCache = true;
// Skip the "is there a vendored copy under node_modules/.../models/?" probe.
env.allowLocalModels = false;
env.allowRemoteModels = process.env.TRANSFORMERS_OFFLINE !== "1";

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type VisionModel = Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
type TextModel = Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;

export interface ClipBundle {
  processor: Processor;
  tokenizer: Tokenizer;
  vision: VisionModel;
  text: TextModel;
  /** Wall time of the first load in this process (ms). */
  loadMs: number;
}

// Cached on globalThis so `next dev` module re-evaluation (HMR) does not reload
// ~150 MB of weights on every edit.
const GLOBAL_KEY = "__faireClipBundle" as const;
type GlobalWithClip = typeof globalThis & { [GLOBAL_KEY]?: Promise<ClipBundle> };

/** Load (once) and return the CLIP processor, tokenizer and both towers. */
export function loadClip(): Promise<ClipBundle> {
  const g = globalThis as GlobalWithClip;
  if (!g[GLOBAL_KEY]) {
    const started = performance.now();
    g[GLOBAL_KEY] = (async () => {
      const opts = { dtype: EMBEDDING_DTYPE } as const;
      const [processor, tokenizer, vision, text] = await Promise.all([
        AutoProcessor.from_pretrained(EMBEDDING_MODEL),
        AutoTokenizer.from_pretrained(EMBEDDING_MODEL),
        CLIPVisionModelWithProjection.from_pretrained(EMBEDDING_MODEL, opts),
        CLIPTextModelWithProjection.from_pretrained(EMBEDDING_MODEL, opts),
      ]);
      return { processor, tokenizer, vision, text, loadMs: performance.now() - started };
    })().catch((err) => {
      // Let the next caller retry instead of caching a rejected promise forever.
      delete g[GLOBAL_KEY];
      throw err;
    });
  }
  return g[GLOBAL_KEY];
}

/**
 * Load the model and run one tiny image + one prompt through it so ONNX sessions
 * are fully initialised. Call from a build step or a warm-up route.
 */
export async function warmEmbeddings(): Promise<{ loadMs: number; firstInferenceMs: number; cacheDir: string }> {
  const bundle = await loadClip();
  const started = performance.now();
  const blank = new RawImage(new Uint8ClampedArray(224 * 224 * 3), 224, 224, 3);
  await Promise.all([embedRawImages([blank]), embedTexts(["a product photo"])]);
  return { loadMs: bundle.loadMs, firstInferenceMs: performance.now() - started, cacheDir: EMBEDDING_CACHE_DIR };
}

/**
 * Embed images. Accepts JPEG/PNG/WebP `Buffer`s, `data:image/...;base64,...` URLs,
 * absolute file paths, or http(s) URLs. Returns one L2-normalized 512-d vector per
 * input, in input order.
 */
export async function embedImages(inputs: (Buffer | string)[]): Promise<Float32Array[]> {
  if (inputs.length === 0) return [];
  const out: Float32Array[] = [];
  for (let i = 0; i < inputs.length; i += IMAGE_BATCH) {
    const chunk = inputs.slice(i, i + IMAGE_BATCH);
    const images = await Promise.all(chunk.map(toRawImage));
    out.push(...(await embedRawImages(images)));
  }
  return out;
}

/** Embed free-text prompts. Returns one L2-normalized 512-d vector per input, in order. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const { tokenizer, text } = await loadClip();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += TEXT_BATCH) {
    const chunk = texts.slice(i, i + TEXT_BATCH);
    // CLIP's context window is 77 tokens; truncation keeps long product strings safe.
    const inputs = await tokenizer(chunk, { padding: true, truncation: true });
    const { text_embeds } = (await text(inputs)) as { text_embeds: Tensor };
    out.push(...splitRows(text_embeds, chunk.length));
  }
  return out;
}

/** Cosine similarity. Inputs from this module are unit length, so this is a dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error(`cosine: dimension mismatch (${a.length} vs ${b.length})`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Element-wise mean of vectors, re-normalized to unit length. */
export function meanVector(vs: Float32Array[]): Float32Array {
  if (vs.length === 0) throw new Error("meanVector: need at least one vector");
  const dim = vs[0].length;
  const acc = new Float32Array(dim);
  for (const v of vs) {
    if (v.length !== dim) throw new Error(`meanVector: dimension mismatch (${v.length} vs ${dim})`);
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= vs.length;
  return normalize(acc);
}

/** In-place L2 normalization; returns the same array. */
export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ---------------------------------------------------------------------------

async function embedRawImages(images: RawImage[]): Promise<Float32Array[]> {
  const { processor, vision } = await loadClip();
  const pixelInputs = await processor(images);
  const { image_embeds } = (await vision(pixelInputs)) as { image_embeds: Tensor };
  return splitRows(image_embeds, images.length);
}

async function toRawImage(input: Buffer | string): Promise<RawImage> {
  if (Buffer.isBuffer(input)) return RawImage.fromBlob(bufferToBlob(input));
  if (input.startsWith("data:")) {
    const comma = input.indexOf(",");
    if (comma < 0) throw new Error("embedImages: malformed data URL");
    const meta = input.slice(5, comma);
    const payload = input.slice(comma + 1);
    const bytes = meta.endsWith(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "latin1");
    return RawImage.fromBlob(bufferToBlob(bytes));
  }
  // File path or http(s) URL.
  return RawImage.read(input);
}

function bufferToBlob(buf: Buffer): Blob {
  // Copy into a plain Uint8Array so the Blob owns a non-shared ArrayBuffer.
  return new Blob([new Uint8Array(buf)]);
}

/** Split a [rows, EMBEDDING_DIM] tensor into normalized per-row Float32Arrays. */
function splitRows(t: Tensor, rows: number): Float32Array[] {
  const [n, dim] = t.dims;
  if (n !== rows || dim !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape [${t.dims.join(", ")}]; expected [${rows}, ${EMBEDDING_DIM}]`);
  }
  const data = t.data as Float32Array;
  const out: Float32Array[] = [];
  for (let r = 0; r < n; r++) out.push(normalize(data.slice(r * dim, (r + 1) * dim)));
  return out;
}
