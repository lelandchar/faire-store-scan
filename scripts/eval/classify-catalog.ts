// Catalog hygiene: ask a text LM whether each Shopify listing is a credible product for an
// independent retailer to buy wholesale (vs. promotional merch, industrial supply, test
// listings, licensed mass-market goods, gadgets...). Text only, ~120 listings per call.
//
//   npx tsx scripts/eval/classify-catalog.ts   -> data/catalog-shopify.quality.json
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Product } from "../../src/lib/types";

const ROOT = process.cwd();
/** --vision: second pass that also looks at the product photo (20 listings per call). */
const VISION = process.argv.includes("--vision");
const OUT = path.join(ROOT, VISION ? "data/catalog-shopify.quality-vision.json" : "data/catalog-shopify.quality.json");
const BATCH = VISION ? 20 : 120;
const PARALLEL = 6;

async function envKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const txt = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
  const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(txt);
  if (!m) throw new Error("OPENROUTER_API_KEY not found");
  return m[1].trim();
}

const INSTRUCTIONS = `You curate the catalog of a wholesale marketplace where independent boutiques, gift shops, home stores, bookshops, general stores and children's stores buy from small brands. For each listing below decide whether it belongs in that catalog.

Mark a listing as JUNK when it is any of: promotional / customizable "your logo here" merchandise; industrial, office, commercial or foodservice supplies and equipment; bulk packs of consumables; test or placeholder listings; replacement parts; licensed-character mass merchandise; consumer electronics and gadgets; medical, automotive, adult or gag items; obvious mass-market products from large national brands; listings whose title is nonsense or a duplicate variant code.

Keep a listing (NOT junk) when an independent retailer could plausibly stock it: apparel and accessories, jewelry, home and kitchen goods, candles, bath and body, stationery and cards, books and journals, food and drink, kids and baby goods, pet goods, garden goods, even if it is ordinary. When unsure, keep it.

Reply with JSON only: {"junk":[<listing numbers>]}`;

async function thumb(p: Product): Promise<string> {
  const buf = await sharp(path.join(ROOT, "public", p.image)).resize({ width: 224, height: 224, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

async function classify(batch: Product[], key: string): Promise<number[]> {
  const list = batch.map((p, i) => `${i + 1}. ${p.name} — ${p.brand} — ${p.category} / ${p.subcategory}`).join("\n");
  let content: unknown = `${INSTRUCTIONS}\n\n${list}`;
  if (VISION) {
    const parts: unknown[] = [{ type: "text", text: `${INSTRUCTIONS}\n\nJudge the photo as well as the title: mark as JUNK when the photo shows a logo placeholder or customization mock-up, a stock render of a mass-market or industrial item, packaging-only or size-chart images, or something an independent boutique would never put on a shelf.` }];
    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      parts.push({ type: "text", text: `${i + 1}. ${p.name} — ${p.brand} — ${p.category} / ${p.subcategory}` });
      parts.push({ type: "image_url", image_url: { url: await thumb(p) } });
    }
    content = parts;
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-5",
      temperature: 0,
      max_tokens: 4000,
      // OpenRouter turns extended thinking on by default for this model; a classification list needs the answer, not the essay.
      reasoning: { enabled: false },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`classify ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { choices: { message: { content: string } }[] };
  const answer = j.choices?.[0]?.message?.content ?? "";
  const m = /\{[\s\S]*\}/.exec(answer);
  if (!m) throw new Error(`no JSON: ${JSON.stringify(j).slice(0, 300)}`);
  const parsed = JSON.parse(m[0]) as { junk: number[] };
  return (parsed.junk ?? []).map(Number).filter((n) => n >= 1 && n <= batch.length);
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.json"), "utf8")) as Product[];
  let existing: Record<string, { junk: boolean }> = {};
  try {
    existing = JSON.parse(await fs.readFile(OUT, "utf8"));
  } catch {
    /* fresh */
  }
  // The vision pass only re-checks listings the text pass kept.
  let textJunk: Record<string, { junk: boolean }> = {};
  if (VISION) textJunk = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.quality.json"), "utf8"));
  const todo = catalog.filter((p) => !(p.id in existing) && !textJunk[p.id]?.junk);
  console.error(`[classify] ${todo.length} listings to classify (${Object.keys(existing).length} cached)`);
  const key = await envKey();
  const batches: Product[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let done = 0;
  const workers = Array.from({ length: PARALLEL }, async () => {
    for (;;) {
      const batch = batches.shift();
      if (!batch) return;
      let junk: number[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          junk = await classify(batch, key);
          break;
        } catch (e) {
          console.error(`[classify] retry ${attempt + 1}: ${(e as Error).message.slice(0, 120)}`);
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      const set = new Set(junk);
      batch.forEach((p, i) => (existing[p.id] = { junk: set.has(i + 1) }));
      done += batch.length;
      console.error(`[classify] ${done}/${todo.length} (${junk.length} junk in this batch)`);
      await fs.writeFile(OUT, JSON.stringify(existing));
    }
  });
  await Promise.all(workers);
  const n = Object.values(existing).filter((v) => v.junk).length;
  console.error(`[classify] done: ${n} junk of ${Object.keys(existing).length}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
