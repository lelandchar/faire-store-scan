/**
 * Pure vector scoring shared by the retrieval route and the offline evaluation
 * (scripts/eval). No model code here: inputs are L2-normalized vectors.
 */
import type { ProductScores } from "./retrieval";

export interface VectorIndex {
  model: string;
  dim: number;
  ids: string[];
  image: Float32Array[];
  text: Float32Array[];
}

export interface ScoringOptions {
  /** How the store's frames combine: one mean vector, the best single frame, or the mean of the best two. */
  visual?: "mean" | "max" | "top2";
  /** How the text prompts combine: one mean vector, the best single prompt, or the mean of the best two. */
  semantic?: "mean" | "max" | "top2";
  /** Share of the semantic score that compares the product *image* to the prompt (the rest uses the product text). */
  imageShare?: number;
}

export const DEFAULT_SCORING: Required<ScoringOptions> = { visual: "mean", semantic: "mean", imageShare: 0.5 };

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Normalized mean of unit vectors. */
export function meanVector(vs: Float32Array[]): Float32Array {
  const dim = vs[0]?.length ?? 0;
  const out = new Float32Array(dim);
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] += v[i];
  let n = 0;
  for (let i = 0; i < dim; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

/** Base64 of a packed Float32Array -> one vector per `dim` floats. */
export function decodeVectors(b64: string, dim: number): Float32Array[] {
  const buf = Buffer.from(b64, "base64");
  const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const out: Float32Array[] = [];
  for (let i = 0; i + dim <= all.length; i += dim) out.push(all.slice(i, i + dim));
  return out;
}

function combine(values: number[], mode: "mean" | "max" | "top2"): number {
  if (!values.length) return 0;
  if (mode === "max") return Math.max(...values);
  if (mode === "top2") {
    const s = [...values].sort((a, b) => b - a);
    return s.length > 1 ? (s[0] + s[1]) / 2 : s[0];
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Score every product against the store: `visual` compares the product photo with
 * the shelf frames, `semantic` compares the product photo and its listing text with
 * the prompts built from what the retailer confirmed.
 */
export function computeScores(index: VectorIndex, frameVecs: Float32Array[], promptVecs: Float32Array[], opts: ScoringOptions = {}): Record<string, ProductScores> {
  const o = { ...DEFAULT_SCORING, ...opts };
  const frameMean = frameVecs.length ? meanVector(frameVecs) : null;
  const promptMean = promptVecs.length ? meanVector(promptVecs) : null;
  const scores: Record<string, ProductScores> = {};
  for (let i = 0; i < index.ids.length; i++) {
    const img = index.image[i];
    const txt = index.text[i];
    let visual = 0;
    if (frameMean) {
      visual = o.visual === "mean" ? dot(img, frameMean) : combine(frameVecs.map((f) => dot(img, f)), o.visual);
    }
    let semantic: number | null = null;
    if (promptMean) {
      const per = (p: Float32Array) => o.imageShare * dot(img, p) + (1 - o.imageShare) * dot(txt, p);
      semantic = o.semantic === "mean" ? per(promptMean) : combine(promptVecs.map(per), o.semantic);
    }
    scores[index.ids[i]] = { visual, semantic };
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Retrieval v2: nearest neighbours from several store queries, fused by rank.
//
// Every product gets one vector in the joint image-text space (a blend of its
// photo and its listing text). The store is not one vector but a set of queries:
// the shelf frames, the per-category brief, and concrete product ideas (wishlist).
// Each query retrieves its nearest products; reciprocal rank fusion combines the
// lists, so a product that is a close neighbour of several queries rises without
// any channel's scale dominating. The centroid of all queries is the "store
// embedding"; its cosine is a dense prior for products no query reached.

export type QueryKind = "shelf" | "brief" | "wish";
export interface QueryVec {
  kind: QueryKind;
  vec: Float32Array;
}
export interface NNOptions {
  /** neighbours kept per query */
  k?: number;
  /** reciprocal rank fusion constant */
  rrfK?: number;
  kindWeights?: Record<QueryKind, number>;
  /** share of the product photo in the product vector (the rest is the listing text) */
  imageShare?: number;
}
export const DEFAULT_NN: Required<NNOptions> = { k: 150, rrfK: 40, kindWeights: { shelf: 0.6, brief: 1, wish: 1 }, imageShare: 0.6 };

const productVectorCache = new WeakMap<VectorIndex, Map<number, Float32Array[]>>();

/** One vector per product: normalized blend of photo and text embeddings (same joint space). */
export function productVectors(index: VectorIndex, imageShare = DEFAULT_NN.imageShare): Float32Array[] {
  const key = Math.round(imageShare * 100);
  let byShare = productVectorCache.get(index);
  if (!byShare) {
    byShare = new Map();
    productVectorCache.set(index, byShare);
  }
  const cached = byShare.get(key);
  if (cached) return cached;
  const out = index.image.map((img, i) => {
    const txt = index.text[i];
    const v = new Float32Array(img.length);
    let n = 0;
    for (let d = 0; d < v.length; d++) {
      v[d] = imageShare * img[d] + (1 - imageShare) * txt[d];
      n += v[d] * v[d];
    }
    n = Math.sqrt(n) || 1;
    for (let d = 0; d < v.length; d++) v[d] /= n;
    return v;
  });
  byShare.set(key, out);
  return out;
}

export interface NNScores {
  /** fused reciprocal-rank score, min-max normalized to 0..1 across the catalog */
  nn: Record<string, number>;
  /** cosine(product vector, centroid of all queries), min-max normalized */
  centroid: Record<string, number>;
  /** per-kind fused scores before normalization (trace view) */
  perKind: Record<string, Partial<Record<QueryKind, number>>>;
  queries: number;
}

export function nearestNeighborScores(index: VectorIndex, queries: QueryVec[], opts: NNOptions = {}): NNScores {
  const o = { ...DEFAULT_NN, ...opts, kindWeights: { ...DEFAULT_NN.kindWeights, ...(opts.kindWeights ?? {}) } };
  const vecs = productVectors(index, o.imageShare);
  const n = index.ids.length;
  const fused = new Float32Array(n);
  const perKind: Record<string, Partial<Record<QueryKind, number>>> = {};
  const order = new Array<number>(n);
  for (const q of queries) {
    const sims = new Float32Array(n);
    for (let i = 0; i < n; i++) sims[i] = dot(vecs[i], q.vec);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => sims[b] - sims[a]);
    const w = o.kindWeights[q.kind];
    for (let r = 0; r < Math.min(o.k, n); r++) {
      const i = order[r];
      const gain = w / (o.rrfK + r + 1);
      fused[i] += gain;
      const id = index.ids[i];
      (perKind[id] ??= {})[q.kind] = ((perKind[id] ??= {})[q.kind] ?? 0) + gain;
    }
  }
  const centroidVec = queries.length ? meanVector(queries.map((q) => q.vec)) : null;
  const cen = new Float32Array(n);
  if (centroidVec) for (let i = 0; i < n; i++) cen[i] = dot(vecs[i], centroidVec);
  const norm = (arr: Float32Array) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of arr) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    return Array.from(arr, (v) => (v - lo) / span);
  };
  const nnN = norm(fused);
  const cenN = centroidVec ? norm(cen) : null;
  const nn: Record<string, number> = {};
  const centroid: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    nn[index.ids[i]] = nnN[i];
    centroid[index.ids[i]] = cenN ? cenN[i] : 0;
  }
  return { nn, centroid, perKind, queries: queries.length };
}
