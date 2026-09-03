/**
 * Server side of the LLM rerank. The top candidates (thumbnail + listing line)
 * and a brief of the confirmed store go to a vision LM, which rates each product's fit
 * 1..5. Same provider rules as /api/analyze: OpenRouter when a key is present, the
 * Anthropic SDK when only that key is present, otherwise a deterministic mock.
 */
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { CatalogSource } from "./retrieval";
import type { RerankResult } from "./rerank";
import type { Product, StoreProfile } from "./types";

if (typeof window !== "undefined") throw new Error("rerank-server.ts is server-only");

const THUMB_PX = 192;
const thumbCache = new Map<string, Promise<string>>();

async function thumb(p: Product): Promise<string> {
  if (!thumbCache.has(p.id)) {
    thumbCache.set(
      p.id,
      (async () => {
        const file = path.join(process.cwd(), "public", p.image);
        const buf = await sharp(await fs.readFile(file)).resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
        return `data:image/jpeg;base64,${buf.toString("base64")}`;
      })().catch((e) => {
        thumbCache.delete(p.id);
        throw e;
      }),
    );
  }
  return thumbCache.get(p.id)!;
}

export function rerankBrief(profile: StoreProfile, storeType?: string | null): string {
  const carries = profile.categories.filter((c) => c.intent !== "skip").map((c) => `${c.name} (${c.share})`);
  const skipped = profile.categories.filter((c) => c.intent === "skip").map((c) => c.name);
  return [
    `Store: ${profile.storeName || "an independent retailer"}${storeType ? ` (${storeType})` : ""}.`,
    profile.summary ? `Note from the walkthrough: ${profile.summary}` : null,
    `Carries: ${carries.join("; ") || "unknown"}.`,
    skipped.length ? `Not interested in: ${skipped.join(", ")}.` : null,
    profile.styles.length ? `Look: ${profile.styles.map((s) => s.replace(/-/g, " ")).join(", ")}.` : null,
    profile.materials.length ? `Materials on the shelves: ${profile.materials.join(", ")}.` : null,
    profile.complements.length ? `Would consider adding: ${profile.complements.join(", ")}.` : null,
    `Buying goal: ${profile.mode === "replenish" ? "restock what already sells" : profile.mode === "discover" ? "discover new brands" : "fill gaps around what they carry"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const INSTRUCTIONS = (n: number) =>
  `You are a senior wholesale buyer advising an independent retailer. Rate how well each of the ${n} products below fits THIS store, from 1 (would never stock it) to 5 (a natural fit they would likely order). Weigh category, style and materials, price sensibility, and whether it is a credible boutique wholesale product: promotional, industrial, mass-market, licensed or novelty items rate 1 even when the category matches. Reply with JSON only: {"ratings":[{"n":1,"fit":4}]} with exactly one entry per product, in order.`;

function hashFit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const u = (h >>> 0) / 4294967296;
  return u < 0.25 ? 5 : u < 0.5 ? 4 : u < 0.8 ? 3 : u < 0.92 ? 2 : 1;
}

function parseRatings(text: string, products: Product[]): Record<string, number> {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error(`The reviewer returned no JSON: ${JSON.stringify(text.slice(0, 240))}`);
  const parsed = JSON.parse(m[0]) as { ratings?: { n: number; fit: number }[] };
  const fits: Record<string, number> = {};
  for (const r of parsed.ratings ?? []) {
    const p = products[Number(r.n) - 1];
    if (p) fits[p.id] = Math.max(1, Math.min(5, Math.round(Number(r.fit) || 0)));
  }
  return fits;
}

type Provider = "mock" | "openrouter" | "anthropic";
function pickProvider(): Provider {
  if (process.env.MOCK_ANALYSIS === "1") return "mock";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export async function rerankProducts(opts: { catalog: CatalogSource; profile: StoreProfile; storeType?: string | null; products: Product[]; signal?: AbortSignal }): Promise<RerankResult> {
  const { products, profile, catalog } = opts;
  const t0 = performance.now();
  const provider = pickProvider();
  const base = { catalog, count: products.length, fallbackReason: null as string | null };
  // RERANK_MODEL=off skips the review entirely (the fused ranking stands on its own).
  if (process.env.RERANK_MODEL === "off") return { ...base, count: 0, model: "off", effort: null, mock: false, ms: 0, fits: {} };
  if (provider === "mock" || products.length === 0) {
    const fits: Record<string, number> = {};
    for (const p of products) fits[p.id] = hashFit(`${profile.summary.length}:${p.id}`);
    return { ...base, model: "mock", effort: null, mock: true, ms: Math.round(performance.now() - t0), fits };
  }
  const brief = rerankBrief(profile, opts.storeType);
  const lines = products.map((p) => `${p.name} — ${p.brand} — ${p.category} / ${p.subcategory} — wholesale $${p.wholesalePrice}`);
  const thumbs = await Promise.all(products.map(thumb));

  if (provider === "anthropic") {
    const client = new Anthropic();
    const model = process.env.RERANK_MODEL || "claude-sonnet-5";
    const content: Anthropic.MessageParam["content"] = [{ type: "text", text: `${INSTRUCTIONS(products.length)}\n\n${brief}` }];
    products.forEach((p, i) => {
      content.push({ type: "text", text: `#${i + 1}: ${lines[i]}` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: thumbs[i].split(",")[1] } });
    });
    const res = await client.messages.create({ model, max_tokens: 3000, messages: [{ role: "user", content }] });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    return { ...base, model, effort: null, mock: false, ms: Math.round(performance.now() - t0), fits: parseRatings(text, products) };
  }

  const key = process.env.OPENROUTER_API_KEY!;
  // Default reviewer: Qwen3.8-Flash with thinking off (a 20-image batch answers in ~7 s, versus
  // ~5 s for Sonnet 5 and ~23 s for Muse Spark at low effort). RERANK_MODEL overrides.
  const configured = process.env.RERANK_MODEL || "qwen/qwen3.8-flash";
  const effort = process.env.RERANK_EFFORT || "low";
  const fallback = process.env.ANALYSIS_FALLBACK_MODEL || "qwen/qwen3.8-flash";
  // Providers cap images per request (Muse Spark: 50) and the smaller the batch the faster
  // the answer, so the candidates go out as parallel batches of 12.
  const BATCH = 12;
  const batches: { products: Product[]; lines: string[]; thumbs: string[] }[] = [];
  for (let i = 0; i < products.length; i += BATCH) {
    batches.push({ products: products.slice(i, i + BATCH), lines: lines.slice(i, i + BATCH), thumbs: thumbs.slice(i, i + BATCH) });
  }
  const call = async (model: string, b: (typeof batches)[number]) => {
    // Only Muse Spark benefits from a thinking budget here; Claude and Qwen answer best with thinking off.
    const claude = !/muse/i.test(model);
    const content: unknown[] = [{ type: "text", text: `${INSTRUCTIONS(b.products.length)}\n\n${brief}` }];
    b.products.forEach((p, i) => {
      // Numbered within the batch: the answer's "n" indexes this batch, not the full list.
      content.push({ type: "text", text: `#${i + 1}: ${b.lines[i]}` });
      content.push({ type: "image_url", image_url: { url: b.thumbs[i] } });
    });
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://faire-store-scan.local", "X-Title": "Faire Store Scan rerank" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4000,
        // Sonnet answers best without extended thinking here; reasoning models get a light budget.
        reasoning: claude ? { enabled: false } : { effort },
        messages: [{ role: "user", content }],
      }),
      signal: opts.signal ?? AbortSignal.timeout(90_000),
    });
  };
  let fallbackReason: string | null = null;
  let servedModel = configured;
  const runBatch = async (b: (typeof batches)[number]): Promise<Record<string, number>> => {
    let model = configured;
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await call(model, b);
      if (res.ok) {
        const j = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string | null; reasoning?: string | null } }[] };
        servedModel = model;
        const choice = j.choices?.[0];
        const content = choice?.message?.content ?? "";
        if (!content.trim()) throw new Error(`The reviewer returned no answer (finish=${choice?.finish_reason ?? "?"}, reasoning=${(choice?.message?.reasoning ?? "").length} chars).`);
        return parseRatings(content, b.products);
      }
      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");
      const gated = res.status === 403 || res.status === 404;
      const busy = res.status === 429 || res.status >= 500;
      if ((gated || (busy && attempt >= 1)) && model !== fallback) {
        fallbackReason = `${model} unavailable (${res.status}); used ${fallback}`;
        model = fallback;
        continue;
      }
      if (busy) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      break;
    }
    throw new Error(`The LLM rerank failed (${lastStatus}): ${lastBody.slice(0, 200)}`);
  };
  const parts = await Promise.all(batches.map(runBatch));
  const fits: Record<string, number> = Object.assign({}, ...parts);
  return {
    ...base,
    model: servedModel,
    effort: /claude/i.test(servedModel) ? null : effort,
    mock: false,
    fallbackReason,
    ms: Math.round(performance.now() - t0),
    fits,
  };
}
