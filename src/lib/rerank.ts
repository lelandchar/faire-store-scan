// Client contract for the buyer's-eye rerank: a vision LM looks at the top candidates
// from retrieval + fusion and rates how well each fits the confirmed store.
import type { CatalogSource } from "./retrieval";
import type { StoreProfile } from "./types";

/** How many fused-ranking candidates get the LM review. */
export const RERANK_CANDIDATES = 60;

export interface RerankResult {
  catalog: CatalogSource;
  model: string;
  effort: string | null;
  ms: number;
  mock: boolean;
  fallbackReason: string | null;
  count: number;
  /** product id -> fit 1..5 */
  fits: Record<string, number>;
}

export async function runRerank(opts: { catalog: CatalogSource; ids: string[]; profile: StoreProfile; storeType?: string | null; signal?: AbortSignal }): Promise<RerankResult> {
  const res = await fetch("/api/rerank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalog: opts.catalog, ids: opts.ids, profile: opts.profile, storeType: opts.storeType ?? null }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Rerank failed (${res.status})`);
  }
  return (await res.json()) as RerankResult;
}
