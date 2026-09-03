// Offline evaluation of the personalized feed on the captured demos.
//
//   npx tsx scripts/eval/evaluate.ts --variants baseline,max,combo [--judge] [--top 40] [--judge-top 20] [--only <slug>]
//
// For each demo (research/eval/runs/*.json) and each variant: embed the frames and
// prompts, score the Shopify catalog, rank with the app's own `personalize`, then
// report (a) how much of the top-N sits in categories the retailer carries, and
// (b) with --judge, how a vision LM rates the fit of each of the top-K products.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getEncoder, type EncoderName } from "./encoders";
import { personalize, rankGeneric, styleLabel, type Ranked, type TagWeights } from "../../src/lib/ranking";
import { DEFAULT_WEIGHTS, promptsFromProfile, type FusionWeights } from "../../src/lib/retrieval";
import { rerankProducts } from "../../src/lib/rerank-server";
import { DEFAULT_SCORING_OPTIONS } from "../../src/lib/retrieval";
import { computeScores, decodeVectors, type ScoringOptions, type VectorIndex } from "../../src/lib/scoring";
import type { Analysis, Product, StoreProfile } from "../../src/lib/types";

const ROOT = process.cwd();
const RUNS = path.join(ROOT, "research/eval/runs");
const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const TOP = Number(arg("--top", "40"));
const JUDGE_TOP = Number(arg("--judge-top", "20"));
const JUDGE = argv.includes("--judge");
const ONLY = arg("--only");
const SHOW = Number(arg("--show", "10"));
const VARIANT_NAMES = (arg("--variants", "baseline") as string).split(",");
/** Drop listings the catalog classifier marked as junk (data/catalog-shopify.quality.json). */
const CLEAN = argv.includes("--clean");

interface Run {
  slug: string;
  kind: string;
  name: string;
  storeType: string;
  frames: { id: string; file: string }[];
  analysis: Analysis;
  profile: StoreProfile;
}
interface Variant {
  name: string;
  encoder: EncoderName;
  scoring: ScoringOptions;
  fusion: FusionWeights;
  tagWeights?: Partial<TagWeights>;
  prompts: "v1" | "v2" | "v3" | "app";
  /** Use the app's own index file (data/embeddings/catalog-shopify.json) instead of the eval's per-encoder file. */
  appIndex?: boolean;
  /** Run the buyer's-eye rerank (src/lib/rerank-server.ts) over the top 60 before judging. */
  rerank?: boolean;
  /** Drop products whose semantic score is in the bottom share of the catalog even when their category matches. */
  floor?: number;
}

const base: Variant = { name: "baseline", encoder: "clip-b32", scoring: { visual: "mean", semantic: "mean", imageShare: 0.5 }, fusion: DEFAULT_WEIGHTS, prompts: "v1" };
const VARIANTS: Record<string, Variant> = {
  baseline: base,
  max: { ...base, name: "max", scoring: { visual: "max", semantic: "max", imageShare: 0.5 } },
  prompts2: { ...base, name: "prompts2", scoring: { visual: "max", semantic: "max", imageShare: 0.5 }, prompts: "v2" },
  weights: { ...base, name: "weights", scoring: { visual: "max", semantic: "max", imageShare: 0.5 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  textonly: { ...base, name: "textonly", scoring: { visual: "max", semantic: "max", imageShare: 0.3 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.1, semantic: 0.5 }, tagWeights: { style: 0.08, category: 0.6 } },
  siglip: { ...base, name: "siglip", encoder: "siglip-b16", scoring: { visual: "max", semantic: "max", imageShare: 0.5 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  siglipmean: { ...base, name: "siglipmean", encoder: "siglip-b16", scoring: { visual: "mean", semantic: "max", imageShare: 0.5 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  clipb16: { ...base, name: "clipb16", encoder: "clip-b16", scoring: { visual: "max", semantic: "max", imageShare: 0.5 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  siglip3: { ...base, name: "siglip3", encoder: "siglip-b16", scoring: { visual: "max", semantic: "max", imageShare: 0.5 }, prompts: "v3", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  siglipimg: { ...base, name: "siglipimg", encoder: "siglip-b16", scoring: { visual: "max", semantic: "max", imageShare: 0.75 }, prompts: "v2", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  siglip3img: { ...base, name: "siglip3img", encoder: "siglip-b16", scoring: { visual: "max", semantic: "max", imageShare: 0.75 }, prompts: "v3", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
  app: { ...base, name: "app", encoder: "siglip-b16", appIndex: true, scoring: DEFAULT_SCORING_OPTIONS, prompts: "app", fusion: DEFAULT_WEIGHTS },
  apprerank: { ...base, name: "apprerank", encoder: "siglip-b16", appIndex: true, scoring: DEFAULT_SCORING_OPTIONS, prompts: "app", fusion: DEFAULT_WEIGHTS, rerank: true },
  siglip3top2: { ...base, name: "siglip3top2", encoder: "siglip-b16", scoring: { visual: "top2", semantic: "top2", imageShare: 0.75 }, prompts: "v3", fusion: { tag: 0.4, visual: 0.15, semantic: 0.45 }, tagWeights: { style: 0.08, category: 0.6 } },
};

/** v2 plus what the model actually saw on each shelf (frame notes) as extra product descriptors. */
function promptsV3(profile: StoreProfile, a: Analysis): string[] {
  const style = profile.styles.slice(0, 2).map(styleLabel).join(" ");
  const seen = (a.frame_notes ?? []).map((n) => n?.what_we_saw).filter((x): x is string => !!x);
  const notes = seen.slice(0, 8).map((n) => `${n}, ${style} style`.replace(/\s+/g, " ").trim());
  return [...promptsV2(profile, a), ...notes].slice(0, 16);
}

/** Per-category prompts that read like a buyer's brief: examples the model saw, the look, the kind of store. */
function promptsV2(profile: StoreProfile, a: Analysis): string[] {
  const style = profile.styles.slice(0, 2).map(styleLabel).join(" ");
  const type = (a.store_read?.store_type_guess || profile.storeType || "independent shop").toLowerCase();
  const out: string[] = [];
  for (const c of profile.categories.filter((c) => c.intent !== "skip").slice(0, 6)) {
    const sig = a.categories?.find((s) => s.name === c.name);
    const ex = (sig?.examples ?? []).slice(0, 3).join(", ");
    out.push(`${ex ? `${ex}, ` : ""}${style} ${c.name.toLowerCase()} sold at a ${type}`.replace(/\s+/g, " ").trim());
  }
  for (const c of profile.complements.slice(0, 3)) out.push(`${style} ${c.toLowerCase()} sold at a ${type}`.replace(/\s+/g, " ").trim());
  return out.slice(0, 10);
}

async function loadIndex(encoder: EncoderName, appIndex = false): Promise<VectorIndex> {
  const file = path.join(ROOT, "data/embeddings", appIndex ? "catalog-shopify.json" : `catalog-shopify.${encoder}.json`);
  const raw = JSON.parse(await fs.readFile(file, "utf8")) as { model: string; dim: number; ids: string[]; image: string; text: string };
  return { model: raw.model, dim: raw.dim, ids: raw.ids, image: decodeVectors(raw.image, raw.dim), text: decodeVectors(raw.text, raw.dim) };
}

// ---------- judge ----------------------------------------------------------
interface Verdict {
  fit: number;
  junk: boolean;
  why: string;
}
const CACHE_FILE = path.join(ROOT, "research/eval/judge-cache.json");
let cache: Record<string, Verdict> = {};
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
async function envKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const txt = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
  const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(txt);
  if (!m) throw new Error("OPENROUTER_API_KEY not found");
  return m[1].trim();
}
async function thumb(p: Product): Promise<string> {
  const buf = await sharp(path.join(ROOT, "public", p.image)).resize({ width: 256, height: 256, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
function storeBrief(run: Run): string {
  const p = run.profile;
  const a = run.analysis;
  return [
    `Store: ${run.name} (${a.store_read?.store_type_guess || run.storeType}).`,
    `Note from the walkthrough: ${p.summary}`,
    `Carries: ${p.categories.filter((c) => c.intent !== "skip").map((c) => `${c.name} (${c.share})`).join("; ")}.`,
    `Look: ${p.styles.map(styleLabel).join(", ")}. Materials: ${p.materials.join(", ")}.`,
    `Would consider adding: ${p.complements.join(", ") || "nothing specific"}.`,
  ].join("\n");
}
async function judgeProducts(run: Run, products: Product[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  const brief = storeBrief(run);
  const keyFor = (p: Product) => `${run.slug}|${hash(brief)}|${p.id}`;
  const todo = products.filter((p) => !cache[keyFor(p)]);
  for (const p of products) if (cache[keyFor(p)]) out.set(p.id, cache[keyFor(p)]);
  if (todo.length) {
    const key = await envKey();
    const batches: Product[][] = [];
    for (let i = 0; i < todo.length; i += 10) batches.push(todo.slice(i, i + 10));
    await Promise.all(
      batches.map(async (batch) => {
        const content: unknown[] = [
          {
            type: "text",
            text: `You are a senior wholesale buyer advising an independent retailer on Faire. Rate how well each product below fits THIS store.\n\n${brief}\n\nFor each product give:\n- fit: 1 (would never stock) to 5 (a natural fit they would likely order)\n- junk: true if it is not a credible boutique wholesale product (promotional/customizable "your logo here" items, bulk industrial supplies, off-brand tech, novelty or adult items, obvious mass-market clones)\n- why: at most 12 words\n\nReply with JSON only: {"ratings":[{"n":1,"fit":3,"junk":false,"why":"..."}]}`,
          },
        ];
        for (let i = 0; i < batch.length; i++) {
          const p = batch[i];
          content.push({ type: "text", text: `#${i + 1}: ${p.name} — ${p.brand} — ${p.category} / ${p.subcategory} — wholesale $${p.wholesalePrice}` });
          content.push({ type: "image_url", image_url: { url: await thumb(p) } });
        }
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "anthropic/claude-sonnet-5", temperature: 0, max_tokens: 3000, reasoning: { enabled: false }, messages: [{ role: "user", content }] }),
        });
        if (!res.ok) throw new Error(`judge ${res.status}: ${await res.text()}`);
        const j = (await res.json()) as { choices: { message: { content: string } }[] };
        const text = j.choices[0].message.content;
        const m = /\{[\s\S]*\}/.exec(text);
        if (!m) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
        const parsed = JSON.parse(m[0]) as { ratings: { n: number; fit: number; junk: boolean; why: string }[] };
        for (const r of parsed.ratings) {
          const p = batch[r.n - 1];
          if (!p) continue;
          const v: Verdict = { fit: Math.max(1, Math.min(5, Number(r.fit) || 1)), junk: !!r.junk, why: String(r.why ?? "") };
          cache[keyFor(p)] = v;
          out.set(p.id, v);
        }
      }),
    );
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 1));
  }
  return out;
}

// ---------- evaluation -----------------------------------------------------
interface RowResult {
  variant: string;
  slug: string;
  carry: number;
  comp: number;
  off: number;
  distinct: string;
  fit: number | null;
  good: number | null;
  junk: number | null;
  top: { rank: number; name: string; category: string; verdict?: Verdict; score: number }[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

async function main() {
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8")) as Record<string, Verdict>;
  } catch {
    cache = {};
  }
  let catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.json"), "utf8")) as Product[];
  if (CLEAN) {
    const quality = JSON.parse(await fs.readFile(path.join(ROOT, "data/catalog-shopify.quality.json"), "utf8")) as Record<string, { junk: boolean }>;
    const before = catalog.length;
    catalog = catalog.filter((p) => !quality[p.id]?.junk);
    console.log(`clean catalog: ${catalog.length} of ${before} listings`);
  }
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const files = (await fs.readdir(RUNS)).filter((f) => f.endsWith(".json"));
  const runs: Run[] = [];
  for (const f of files) {
    const r = JSON.parse(await fs.readFile(path.join(RUNS, f), "utf8")) as Run;
    if (!ONLY || r.slug === ONLY) runs.push(r);
  }
  const results: RowResult[] = [];
  const frameCache = new Map<string, Float32Array[]>();

  for (const vname of VARIANT_NAMES) {
    const isGeneric = vname === "generic";
    const v = isGeneric ? base : VARIANTS[vname];
    if (!v) throw new Error(`unknown variant ${vname}`);
    const index = isGeneric ? null : await loadIndex(v.encoder, v.appIndex);
    const enc = isGeneric ? null : await getEncoder(v.encoder);
    for (const run of runs) {
      let ranked: Ranked[];
      if (isGeneric || !index || !enc) {
        ranked = rankGeneric(catalog).map((p, i) => ({ product: p, score: 1, components: { tag: 0, visual: null, semantic: null, buyer: null, fused: 0 }, reasons: [], genericRank: i + 1, personalizedRank: i + 1, delta: 0 }));
      } else {
        const fkey = `${v.encoder}|${run.slug}`;
        if (!frameCache.has(fkey)) frameCache.set(fkey, await enc.embedImages(run.frames.map((f) => path.join(RUNS, f.file))));
        const frameVecs = frameCache.get(fkey)!;
        const prompts = v.prompts === "v3" ? promptsV3(run.profile, run.analysis) : v.prompts === "v2" ? promptsV2(run.profile, run.analysis) : promptsFromProfile(run.profile, run.analysis);
        const promptVecs = await enc.embedTexts(prompts);
        const scores = computeScores(index, frameVecs, promptVecs, v.scoring);
        ranked = personalize(catalog, run.profile, { scores, weights: v.fusion, tagWeights: v.tagWeights }).filter((r) => r.score >= 0);
        if (v.rerank) {
          process.env.OPENROUTER_API_KEY ??= await envKey();
          process.env.RERANK_MODEL ??= "meta/muse-spark-1.3";
          const rr = await rerankProducts({ catalog: "shopify", profile: run.profile, storeType: run.analysis.store_read?.store_type_guess, products: ranked.slice(0, 60).map((r) => r.product) });
          console.log(`  rerank ${run.slug}: ${rr.model} in ${Math.round(rr.ms / 1000)} s, ${Object.keys(rr.fits).length} rated${rr.fallbackReason ? ` (${rr.fallbackReason})` : ""}`);
          ranked = personalize(catalog, run.profile, { scores, weights: v.fusion, tagWeights: v.tagWeights, rerank: rr.fits }).filter((r) => r.score >= 0);
        }
      }
      const top = ranked.slice(0, TOP);
      const carrying = new Set(run.profile.categories.filter((c) => c.intent !== "skip").map((c) => c.name));
      const comps = new Set(run.profile.complements);
      const carry = top.filter((r) => carrying.has(r.product.category)).length / top.length;
      const comp = top.filter((r) => comps.has(r.product.category)).length / top.length;
      const seen = new Set(top.map((r) => r.product.category).filter((c) => carrying.has(c)));
      let verdicts = new Map<string, Verdict>();
      if (JUDGE) verdicts = await judgeProducts(run, top.slice(0, JUDGE_TOP).map((r) => r.product));
      const judged = top.slice(0, JUDGE_TOP).map((r) => verdicts.get(r.product.id)).filter((x): x is Verdict => !!x);
      const row: RowResult = {
        variant: vname,
        slug: run.slug,
        carry,
        comp,
        off: 1 - carry - comp,
        distinct: `${seen.size}/${carrying.size}`,
        fit: judged.length ? judged.reduce((a, b) => a + b.fit, 0) / judged.length : null,
        good: judged.length ? judged.filter((j) => j.fit >= 4).length / judged.length : null,
        junk: judged.length ? judged.filter((j) => j.junk).length : null,
        top: top.slice(0, Math.max(SHOW, JUDGE_TOP)).map((r) => ({ rank: r.personalizedRank, name: r.product.name, category: r.product.category, verdict: verdicts.get(r.product.id), score: r.score })),
      };
      results.push(row);
      console.log(
        `${vname.padEnd(11)} ${run.slug.padEnd(20)} carry ${pct(carry).padStart(4)}  comp ${pct(comp).padStart(4)}  off ${pct(row.off).padStart(4)}  cats ${row.distinct.padEnd(4)}` +
          (row.fit !== null ? `  fit ${row.fit.toFixed(2)}  fit>=4 ${pct(row.good!)}  junk ${row.junk}/${judged.length}` : ""),
      );
    }
    const mine = results.filter((r) => r.variant === vname);
    const mean = (k: "carry" | "comp" | "off" | "fit" | "good") => {
      const xs = mine.map((r) => r[k]).filter((x): x is number => typeof x === "number");
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const f = mean("fit");
    console.log(`${vname.padEnd(11)} ${"MEAN".padEnd(20)} carry ${pct(mean("carry")!).padStart(4)}  comp ${pct(mean("comp")!).padStart(4)}  off ${pct(mean("off")!).padStart(4)}` + (f !== null ? `  fit ${f.toFixed(2)}  fit>=4 ${pct(mean("good")!)}  junk ${mine.reduce((a, r) => a + (r.junk ?? 0), 0)}` : ""));
  }

  // Markdown report
  const lines: string[] = [`# Personalization evaluation — ${new Date().toISOString()}`, "", `Top ${TOP} of ${catalog.length} Shopify products per demo; judge = Claude Sonnet 5 rating of the top ${JUDGE_TOP} (1–5).`, "", "| variant | demo | carry | comp | off | cats | fit | fit≥4 | junk |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of results) lines.push(`| ${r.variant} | ${r.slug} | ${pct(r.carry)} | ${pct(r.comp)} | ${pct(r.off)} | ${r.distinct} | ${r.fit?.toFixed(2) ?? ""} | ${r.good !== null ? pct(r.good) : ""} | ${r.junk ?? ""} |`);
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.variant} · ${r.slug}`, "");
    for (const t of r.top) lines.push(`${t.rank}. ${t.name} — ${t.category}${t.verdict ? ` — fit ${t.verdict.fit}${t.verdict.junk ? " (junk)" : ""}: ${t.verdict.why}` : ""}`);
    lines.push("");
  }
  const out = path.join(ROOT, "research/eval", `results-${CLEAN ? "clean-" : ""}${VARIANT_NAMES.join("+")}.md`);
  await fs.writeFile(out, lines.join("\n"));
  console.log(`wrote ${out}`);
  void byId;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
