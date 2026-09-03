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
import { loadEncoder, MODEL } from "./lib/encoder.mjs";

const ROOT = process.cwd();

const CATALOGS = [
  { name: "catalog", json: "data/catalog.json" },
  { name: "catalog-public", json: "data/catalog-public.json" },
  { name: "catalog-shopify", json: "data/catalog-shopify.json" },
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


const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function concatBase64(vectors) {
  const DIM = vectors[0].length;
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
  const imageVecs = await clip.embedImages(kept.map((k) => k.file));
  const imageMs = performance.now() - t;
  t = performance.now();
  const textVecs = await clip.embedTexts(kept.map((k) => productText(k.product)));
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
    dim: imageVecs[0].length,
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
  const clip = await loadEncoder();
  console.log(`[embed] loaded ${clip.model} (${clip.family}) in ${ms(clip.loadMs)}`);
  const styleVectors = await clip.embedTexts(STYLES.map(([, label]) => stylePrompt(label)));
  for (const catalog of CATALOGS) await buildCatalog(clip, styleVectors, catalog);
}

main().catch((err) => {
  console.error("[embed] failed:", err);
  process.exit(1);
});
