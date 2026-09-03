import type { ScoringOptions } from "./scoring";
import type { Analysis, Frame, StoreProfile } from "./types";

// Shared contract between the retrieval route, the store, the ranking fusion
// and the admin trace view.

export type CatalogSource = "synthetic" | "public" | "shopify";

/** Which embedding space the retrieval runs in. Both are kept so the two can be compared live. */
export type EmbeddingBackend = "siglip" | "gemini";
export const EMBEDDING_BACKEND_LABEL: Record<EmbeddingBackend, string> = {
  siglip: "SigLIP (local, open source)",
  gemini: "Gemini Embedding 2 (hosted, OpenRouter)",
};
export const DEFAULT_EMBEDDING_BACKEND: EmbeddingBackend = "siglip";

export interface ProductScores {
  /** cosine(product image, mean of frame image embeddings) */
  visual: number;
  /** blend of cosine(product image, store text) and cosine(product text, store text); null when no prompts */
  semantic: number | null;
  /** retrieval v2: reciprocal-rank-fused nearest-neighbour score over shelf, brief and wishlist queries (0..1) */
  nn?: number | null;
  /** retrieval v2: cosine to the centroid of all store queries (0..1, min-max) */
  centroid?: number | null;
}

export interface RetrievalResult {
  catalog: CatalogSource;
  backend?: EmbeddingBackend;
  model: string;
  dim: number;
  count: number;
  timings: { loadMs: number; embedImagesMs: number; embedTextsMs: number; scoreMs: number; totalMs: number };
  storeVectorPreview: number[];
  prompts: string[];
  scoring?: ScoringOptions;
  /** retrieval v2 settings and query counts */
  nn?: { shelves: number; briefs: number; wishes: number; k: number; rrfK: number; imageShare: number; kindWeights: Record<"shelf" | "brief" | "wish", number> };
  scores: Record<string, ProductScores>;
  frameNeighbors: { frameId: string; neighbors: { id: string; score: number }[] }[];
  frameVectorPreviews: { frameId: string; preview: number[] }[];
}

export interface FusionWeights {
  tag: number;
  visual: number;
  semantic: number;
  /** retrieval v2 channels (0 when absent) */
  nn?: number;
  centroid?: number;
}

/**
 * Fusion weights and scoring modes were chosen on the offline evaluation in scripts/eval
 * (six captured demos, Sonnet-judged top 20): semantic matching on per-category prompts
 * carries most of the within-category ordering; the shelf frames are a weaker signal.
 */
export const DEFAULT_WEIGHTS: FusionWeights = { tag: 0.4, visual: 0, semantic: 0, nn: 0.45, centroid: 0.15 };
export const DEFAULT_SCORING_OPTIONS: ScoringOptions = { visual: "top2", semantic: "top2", imageShare: 0.75 };

export interface PromptInput {
  styles: string[];
  storeType?: string | null;
  categories: { name: string; examples?: string[] }[];
  complements: string[];
  /** What the model saw on each shelf (frame notes). */
  seen?: string[];
}

/**
 * Prompts for the text tower, one per category the retailer carries (with the examples the
 * model saw, the look, and the kind of store), then complements, then the shelf notes.
 * Each prompt is matched on its own (best-two average), so a candle can match the candle
 * prompt without being diluted by the apparel prompt.
 */
export function buildPrompts(input: PromptInput): string[] {
  const style = input.styles.slice(0, 2).map((s) => s.replace(/-/g, " ")).join(" ");
  const type = (input.storeType || "independent shop").trim().toLowerCase();
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const c of input.categories.slice(0, 6)) {
    const ex = (c.examples ?? []).filter(Boolean).slice(0, 3).join(", ");
    out.push(tidy(`${ex ? `${ex}, ` : ""}${style} ${c.name.toLowerCase()} sold at a ${type}`));
  }
  for (const c of input.complements.slice(0, 3)) out.push(tidy(`${style} ${c.toLowerCase()} sold at a ${type}`));
  for (const n of (input.seen ?? []).slice(0, 8)) out.push(tidy(`${n}, ${style} style`));
  return out.slice(0, 16);
}

/** Prompts straight from the model's read (trace view, before the retailer confirms anything). */
export function promptsFromAnalysis(a: Partial<Analysis>): string[] {
  return buildPrompts({
    styles: (a.styles ?? []).map((s) => s?.name).filter(Boolean) as string[],
    storeType: a.store_read?.store_type_guess,
    categories: (a.categories ?? []).filter((c) => c?.name).map((c) => ({ name: c.name, examples: c.examples })),
    complements: (a.suggested_complements ?? []).map((c) => c?.category).filter(Boolean) as string[],
    seen: (a.frame_notes ?? []).map((n) => n?.what_we_saw).filter((x): x is string => !!x),
  });
}

/** Prompts from the profile the retailer actually confirmed (their edits win over the raw read). */
export function promptsFromProfile(profile: StoreProfile, a: Partial<Analysis> | null): string[] {
  return buildPrompts({
    styles: profile.styles,
    storeType: a?.store_read?.store_type_guess || profile.storeType,
    categories: profile.categories
      .filter((c) => c.intent !== "skip")
      .map((c) => ({ name: c.name, examples: a?.categories?.find((s) => s?.name === c.name)?.examples })),
    complements: profile.complements,
    seen: (a?.frame_notes ?? []).map((n) => n?.what_we_saw).filter((x): x is string => !!x),
  });
}

export async function runRetrieval(opts: {
  frames: Frame[];
  catalog: CatalogSource;
  prompts: string[];
  scoring?: ScoringOptions;
  backend?: EmbeddingBackend;
  signal?: AbortSignal;
}): Promise<RetrievalResult> {
  const res = await fetch("/api/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      frames: opts.frames.map((f) => ({ id: f.id, dataUrl: f.dataUrl })),
      catalog: opts.catalog,
      backend: opts.backend ?? DEFAULT_EMBEDDING_BACKEND,
      prompts: opts.prompts,
      // Prompts are ordered brief-first by buildPrompts; the rest are concrete things seen on the shelves.
      briefCount: opts.prompts.filter((p) => / sold at a /.test(p)).length,
      scoring: opts.scoring ?? DEFAULT_SCORING_OPTIONS,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Retrieval failed (${res.status})`);
  }
  return (await res.json()) as RetrievalResult;
}
