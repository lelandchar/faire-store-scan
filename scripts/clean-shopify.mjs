#!/usr/bin/env node
// Drop listings that the catalog classifier (scripts/eval/classify-catalog.ts) marked as junk:
// promotional merch, industrial supply, test listings, licensed mass merchandise, gadgets.
//   node scripts/clean-shopify.mjs
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const file = path.join(ROOT, "data/catalog-shopify.json");
const quality = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.quality.json"), "utf8"));
let vision = {};
try {
  vision = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.quality-vision.json"), "utf8"));
} catch {
  /* vision pass not run */
}
const catalog = JSON.parse(await fs.readFile(file, "utf8"));
const kept = catalog.filter((p) => !quality[p.id]?.junk && !vision[p.id]?.junk);
await fs.writeFile(file, JSON.stringify(kept, null, 1));
const by = {};
for (const p of kept) by[p.category] = (by[p.category] ?? 0) + 1;
console.log(`kept ${kept.length} of ${catalog.length}`);
console.log(Object.entries(by).map(([k, v]) => `${k}: ${v}`).join("\n"));
