#!/usr/bin/env node
// Download + initialise the CLIP model once so the cache is hot before serving.
//
//   npm run warm-models
//
// Intended for a Railway build step (Dockerfile RUN / nixpacks build phase) so the
// ~150 MB of weights ship inside the image instead of being fetched on first request.
// Keep the model constants in sync with src/lib/embeddings.ts.

import path from "node:path";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";
const DTYPE = "q8";

env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR ?? path.join(process.cwd(), ".cache", "transformers");
env.useFSCache = true;
env.allowLocalModels = false;

const t0 = performance.now();
const opts = { dtype: DTYPE };
const [processor, tokenizer, vision, text] = await Promise.all([
  AutoProcessor.from_pretrained(MODEL),
  AutoTokenizer.from_pretrained(MODEL),
  CLIPVisionModelWithProjection.from_pretrained(MODEL, opts),
  CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
]);
const loadMs = performance.now() - t0;

// One tiny forward pass per tower so the ONNX sessions are fully initialised.
const t1 = performance.now();
const blank = new RawImage(new Uint8ClampedArray(224 * 224 * 3), 224, 224, 3);
await vision(await processor(blank));
await text(await tokenizer(["a product photo"], { padding: true, truncation: true }));
const inferMs = performance.now() - t1;

const rss = process.memoryUsage().rss / 1024 / 1024;
console.log(
  `[warm-models] ${MODEL} (${DTYPE}) ready: load ${Math.round(loadMs)} ms, first inference ${Math.round(inferMs)} ms, ` +
    `rss ${rss.toFixed(0)} MB, cache ${env.cacheDir}`,
);
