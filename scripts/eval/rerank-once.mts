import fs from "node:fs/promises";
import { rerankProducts } from "../../src/lib/rerank-server";
const key = /OPENROUTER_API_KEY=(.+)/.exec(await fs.readFile(".env.local", "utf8"))![1].trim();
process.env.OPENROUTER_API_KEY = key;
process.env.RERANK_MODEL = process.argv[2] ?? "qwen/qwen3.8-flash";
const run = JSON.parse(await fs.readFile("research/eval/runs/home-gift.json", "utf8"));
const catalog = JSON.parse(await fs.readFile("data/catalog-shopify.json", "utf8"));
const products = catalog.filter((p: { category: string }) => p.category === "Home decor").slice(0, Number(process.argv[3] ?? 20));
const t0 = Date.now();
try {
  const r = await rerankProducts({ catalog: "shopify", profile: run.profile, storeType: run.analysis.store_read?.store_type_guess, products });
  console.log(process.env.RERANK_MODEL, "ok", Object.keys(r.fits).length, "rated in", Math.round((Date.now() - t0) / 1000), "s; fallback:", r.fallbackReason, "; hist:", Object.values(r.fits).reduce((a: Record<number, number>, f) => ((a[f] = (a[f] ?? 0) + 1), a), {}));
} catch (e) {
  console.log(process.env.RERANK_MODEL, "FAILED after", Math.round((Date.now() - t0) / 1000), "s:", (e as Error).message);
}
