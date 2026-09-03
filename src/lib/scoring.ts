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
