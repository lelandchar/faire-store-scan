#!/usr/bin/env node
// Download + initialise the embedding model once so the cache is hot before serving.
//
//   npm run warm-models
//
// Intended for the Railway build step so the weights ship inside the image instead of
// being fetched on first request. The model comes from scripts/lib/encoder.mjs
// (EMBEDDING_MODEL env override), which mirrors src/lib/embeddings.ts.
import { loadEncoder } from "./lib/encoder.mjs";

const enc = await loadEncoder();
const t1 = performance.now();
await Promise.all([enc.embedImages([enc.blank()]), enc.embedTexts(["a product photo"])]);
console.log(`[warm] ${enc.model} (${enc.family}, ${enc.dim}-d) loaded in ${Math.round(enc.loadMs)} ms; first inference ${Math.round(performance.now() - t1)} ms`);
