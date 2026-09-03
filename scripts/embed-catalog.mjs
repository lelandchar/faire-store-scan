#!/usr/bin/env node
// Precompute CLIP embeddings for the product catalog(s).
//
//   npm run embed
//
// Reads data/catalog.json and, if present, data/catalog-public.json, and writes
// data/embeddings/<catalogName>.json:
//   { model, dim, ids, image (base64 Float32Array), text (base64 Float32Array),
//     styles: { [id]: [top style, second style] } }
//
// Plain Node ESM on purpose (no TS loader needed at Railway build time). Keep the
// model constants in sync with src/lib/embeddings.ts.

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";

const ROOT = process.cwd();
const MODEL = "Xenova/clip-vit-base-patch32";
const DTYPE = "q8";
const DIM = 512;
const IMAGE_BATCH = 8;
const TEXT_BATCH = 32;

env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR ?? path.join(ROOT, ".cache", "transformers");
env.useFSCache = true;
env.allowLocalModels = false;
env.allowRemoteModels = process.env.TRANSFORMERS_OFFLINE !== "1";

const CATALOGS = [
  { name: "catalog", json: "data/catalog.json" },
  { name: "catalog-public", json: "data/catalog-public.json" },
];

// Mirrors STYLES in src/lib/types.ts, with readable phrasing for the prompt.
const STYLES = [
  ["minimalist", "minimalist"],
  ["modern-farmhouse", "modern farmhouse"],
  ["boho", "boho"],
  ["coastal", "coastal"],
  ["cottagecore", "cottagecore"],
  ["playful", "playful"],
  ["luxe", "luxe"],
  ["rustic", "rustic"],
  ["vintage", "vintage"],
  ["scandinavian", "Scandinavian"],
  ["maximalist", "maximalist"],
  ["literary", "literary"],
  ["natural", "natural"],
];
const stylePrompt = (label) => `a product photo in a ${label} style`;
const productText = (p) => `${p.name}. ${p.category}. ${p.subcategory}. ${(p.materials ?? []).join(", ")}`;

const ms = (t) => `${Math.round(t)} ms`;

async function loadClip() {
  const t0 = performance.now();
  const opts = { dtype: DTYPE };
  const [processor, tokenizer, vision, text] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL),
    AutoTokenizer.from_pretrained(MODEL),
    CLIPVisionModelWithProjection.from_pretrained(MODEL, opts),
    CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
  ]);
  console.log(`[embed] loaded ${MODEL} (${DTYPE}) in ${ms(performance.now() - t0)} from ${env.cacheDir}`);
  return { processor, tokenizer, vision, text };
}

function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

function splitRows(tensor, rows) {
  const [n, dim] = tensor.dims;
  if (n !== rows || dim !== DIM) throw new Error(`unexpected shape [${tensor.dims}]`);
  const out = [];
  for (let r = 0; r < n; r++) out.push(normalize(tensor.data.slice(r * dim, (r + 1) * dim)));
  return out;
}

async function embedImageFiles(clip, files) {
  const out = [];
  for (let i = 0; i < files.length; i += IMAGE_BATCH) {
    const chunk = files.slice(i, i + IMAGE_BATCH);
    const images = await Promise.all(chunk.map((f) => RawImage.read(f)));
    const { image_embeds } = await clip.vision(await clip.processor(images));
    out.push(...splitRows(image_embeds, chunk.length));
  }
  return out;
}

async function embedTexts(clip, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += TEXT_BATCH) {
    const chunk = texts.slice(i, i + TEXT_BATCH);
    const inputs = await clip.tokenizer(chunk, { padding: true, truncation: true });
    const { text_embeds } = await clip.text(inputs);
    out.push(...splitRows(text_embeds, chunk.length));
  }
  return out;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function concatBase64(vectors) {
  const flat = new Float32Array(vectors.length * DIM);
  vectors.forEach((v, i) => flat.set(v, i * DIM));
  return Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength).toString("base64");
}

async function buildCatalog(clip, styleVectors, { name, json }) {
  const jsonPath = path.join(ROOT, json);
  if (!existsSync(jsonPath)) {
    console.log(`[embed] ${json} not found, skipping`);
    return;
  }
  const products = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  const kept = [];
  const missing = [];
  for (const p of products) {
    const file = path.join(ROOT, "public", p.image);
    if (existsSync(file)) kept.push({ product: p, file });
    else missing.push(p.id);
  }
  if (missing.length) console.log(`[embed] ${name}: skipping ${missing.length} product(s) with no image file: ${missing.join(" ")}`);
  if (kept.length === 0) {
    console.log(`[embed] ${name}: nothing to embed`);
    return;
  }

  let t = performance.now();
  const imageVecs = await embedImageFiles(clip, kept.map((k) => k.file));
  const imageMs = performance.now() - t;
  t = performance.now();
  const textVecs = await embedTexts(clip, kept.map((k) => productText(k.product)));
  const textMs = performance.now() - t;

  const styles = {};
  kept.forEach(({ product }, i) => {
    const scored = STYLES.map(([key], s) => [key, dot(imageVecs[i], styleVectors[s])]);
    scored.sort((a, b) => b[1] - a[1]);
    styles[product.id] = scored.slice(0, 2).map(([key]) => key);
  });

  const outDir = path.join(ROOT, "data", "embeddings");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.json`);
  const payload = {
    model: MODEL,
    dim: DIM,
    ids: kept.map((k) => k.product.id),
    image: concatBase64(imageVecs),
    text: concatBase64(textVecs),
    styles,
  };
  await fs.writeFile(outPath, JSON.stringify(payload));
  const size = (await fs.stat(outPath)).size;
  console.log(
    `[embed] ${name}: ${kept.length} products -> ${path.relative(ROOT, outPath)} (${(size / 1024).toFixed(0)} KB); ` +
      `images ${ms(imageMs)} (${ms(imageMs / kept.length)}/img), texts ${ms(textMs)} (${ms(textMs / kept.length)}/text)`,
  );
}

async function main() {
  const clip = await loadClip();
  const styleVectors = await embedTexts(clip, STYLES.map(([, label]) => stylePrompt(label)));
  for (const catalog of CATALOGS) await buildCatalog(clip, styleVectors, catalog);
}

main().catch((err) => {
  console.error("[embed] failed:", err);
  process.exit(1);
});
