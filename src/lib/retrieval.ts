import type { Analysis, Frame } from "./types";

// Shared contract between the retrieval route, the store, the ranking fusion
// and the admin trace view.

export type CatalogSource = "synthetic" | "public" | "shopify";

export interface ProductScores {
  /** cosine(product image, mean of frame image embeddings) */
  visual: number;
  /** blend of cosine(product image, store text) and cosine(product text, store text); null when no prompts */
  semantic: number | null;
}

export interface RetrievalResult {
  catalog: CatalogSource;
  model: string;
  dim: number;
  count: number;
  timings: { loadMs: number; embedImagesMs: number; embedTextsMs: number; scoreMs: number; totalMs: number };
  storeVectorPreview: number[];
  prompts: string[];
  scores: Record<string, ProductScores>;
  frameNeighbors: { frameId: string; neighbors: { id: string; score: number }[] }[];
  frameVectorPreviews: { frameId: string; preview: number[] }[];
}

export interface FusionWeights {
  tag: number;
  visual: number;
  semantic: number;
}

export const DEFAULT_WEIGHTS: FusionWeights = { tag: 0.5, visual: 0.3, semantic: 0.2 };

/** Turn the LM's structured read into a few short text prompts for the CLIP text tower. */
export function promptsFromAnalysis(a: Partial<Analysis>): string[] {
  const prompts: string[] = [];
  const styles = (a.styles ?? []).slice(0, 2).map((s) => s.name.replace("-", " "));
  const styleWords = styles.join(" ");
  const storeType = a.store_read?.store_type_guess?.trim();
  if (storeType) prompts.push(`a product sold at ${storeType.toLowerCase()}`);
  for (const c of (a.categories ?? []).slice(0, 4)) {
    if (!c?.name) continue;
    const ex = (c.examples ?? []).slice(0, 3).join(", ");
    prompts.push(`${ex || c.name.toLowerCase()}${styleWords ? `, ${styleWords} style` : ""}`);
  }
  for (const s of (a.suggested_complements ?? []).slice(0, 2)) {
    if (s?.category) prompts.push(`${s.category.toLowerCase()}${styleWords ? `, ${styleWords} style` : ""}`);
  }
  const mats = (a.materials ?? []).slice(0, 3).map((m) => m.name).join(", ");
  if (mats) prompts.push(`products made of ${mats}`);
  return prompts.slice(0, 8);
}

export async function runRetrieval(opts: {
  frames: Frame[];
  catalog: CatalogSource;
  prompts: string[];
  signal?: AbortSignal;
}): Promise<RetrievalResult> {
  const res = await fetch("/api/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      frames: opts.frames.map((f) => ({ id: f.id, dataUrl: f.dataUrl })),
      catalog: opts.catalog,
      prompts: opts.prompts,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Retrieval failed (${res.status})`);
  }
  return (await res.json()) as RetrievalResult;
}
