// Embed the Shopify catalog with a candidate encoder:
//   npx tsx scripts/eval/embed-variant.ts siglip-b16
// Writes data/embeddings/catalog-shopify.<encoder>.json in the same format as `npm run embed`.
import fs from "node:fs/promises";
import path from "node:path";
import { getEncoder, type EncoderName } from "./encoders";
import type { Product } from "../../src/lib/types";

const name = process.argv[2] as EncoderName;
if (!name) throw new Error("usage: embed-variant.ts <encoder>");
const ROOT = process.cwd();
const productText = (p: Product) => `${p.name}. ${p.category}. ${p.subcategory}. ${(p.materials ?? []).join(", ")}`;
const b64 = (vs: Float32Array[]) => {
  const dim = vs[0].length;
  const all = new Float32Array(vs.length * dim);
  vs.forEach((v, i) => all.set(v, i * dim));
  return Buffer.from(all.buffer).toString("base64");
};

async function main() {
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.json"), "utf8")) as Product[];
  const enc = await getEncoder(name);
  const t0 = performance.now();
  const image: Float32Array[] = [];
  const STEP = 64;
  for (let i = 0; i < catalog.length; i += STEP) {
    const chunk = catalog.slice(i, i + STEP);
    image.push(...(await enc.embedImages(chunk.map((p) => path.join(ROOT, "public", p.image)))));
    if ((i / STEP) % 5 === 0) console.error(`[embed ${name}] ${Math.min(i + STEP, catalog.length)}/${catalog.length} images, ${Math.round((performance.now() - t0) / 1000)} s`);
  }
  const text = await enc.embedTexts(catalog.map(productText));
  const dim = image[0].length;
  const out = { model: enc.model, dim, ids: catalog.map((p) => p.id), image: b64(image), text: b64(text), createdAt: new Date().toISOString() };
  const file = path.join(ROOT, "data/embeddings", `catalog-shopify.${name}.json`);
  await fs.writeFile(file, JSON.stringify(out));
  console.error(`[embed ${name}] wrote ${file} (${catalog.length} x ${dim}) in ${Math.round((performance.now() - t0) / 1000)} s`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
