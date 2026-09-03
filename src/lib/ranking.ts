import { DEFAULT_WEIGHTS, type FusionWeights, type ProductScores } from "./retrieval";
import type { Category, Product, Share, StoreProfile, Style } from "./types";

// Deterministic, explainable re-ranking. This is intentionally a transparent
// weighted score rather than a model: every contribution can be shown to the
// retailer as a "why this moved up" reason.

const SHARE_WEIGHT: Record<Share, number> = {
  dominant: 1,
  strong: 0.8,
  present: 0.55,
  trace: 0.3,
};

// Personalization uses only what the walkthrough and the retailer's own choices
// tell us. No marketplace popularity signal enters the personalized score; the
// popularity prior only orders the generic feed that new retailers see today.
export const WEIGHTS = {
  category: 0.5,
  style: 0.25,
  material: 0.1,
  price: 0.05,
  popularity: 0,
  novelty: 0.1,
} as const;

export type ReasonKind =
  | "category"
  | "complement"
  | "style"
  | "material"
  | "price"
  | "new"
  | "popular"
  | "visual"
  | "semantic"
  | "skip";

export interface Reason {
  kind: ReasonKind;
  text: string;
  weight: number;
}

export interface RankComponents {
  /** deterministic tag score, ~0..1 */
  tag: number;
  /** min-max normalized visual similarity across the catalog, or null without embeddings */
  visual: number | null;
  semantic: number | null;
  fused: number;
}

export interface Ranked {
  product: Product;
  score: number;
  components: RankComponents;
  reasons: Reason[];
  genericRank: number;
  personalizedRank: number;
  /** genericRank - personalizedRank; positive means it moved up. */
  delta: number;
}

/** 0..1 prior used for the generic (non-personalized) feed. */
export function popularityScore(p: Product): number {
  const rating = Math.max(0, Math.min(1, (p.rating - 4.3) / 0.7));
  const reviews = Math.min(1, Math.log10(p.reviewCount + 1) / 3);
  return 0.45 * (p.isBestseller ? 1 : 0) + 0.35 * rating + 0.2 * reviews;
}

function stableSort<T>(arr: T[], key: (t: T) => number, tiebreak: (t: T) => string): T[] {
  return [...arr].sort((a, b) => key(b) - key(a) || tiebreak(a).localeCompare(tiebreak(b)));
}

export function rankGeneric(catalog: Product[]): Product[] {
  return stableSort(catalog, popularityScore, (p) => p.id);
}

function prettyList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const STYLE_LABEL: Record<Style, string> = {
  minimalist: "minimalist",
  "modern-farmhouse": "modern farmhouse",
  boho: "boho",
  coastal: "coastal",
  cottagecore: "cottagecore",
  playful: "playful",
  luxe: "luxe",
  rustic: "rustic",
  vintage: "vintage",
  scandinavian: "Scandinavian",
  maximalist: "maximalist",
  literary: "literary",
  natural: "natural",
};

export function styleLabel(s: Style): string {
  return STYLE_LABEL[s] ?? s;
}

const TIER_ORDER = { value: 0, mid: 1, premium: 2 } as const;

export function scoreProduct(p: Product, profile: StoreProfile): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const cat = profile.categories.find((c) => c.name === p.category);
  const isComplement = profile.complements.includes(p.category);

  // --- Category fit -------------------------------------------------------
  let categoryScore = 0;
  if (cat?.intent === "skip") {
    return {
      score: -1,
      reasons: [{ kind: "skip", text: `You asked us to skip ${p.category.toLowerCase()}`, weight: 1 }],
    };
  }
  if (cat && cat.intent === "more") {
    // Restocking leans harder into the sections the retailer already carries.
    categoryScore = Math.min(1, SHARE_WEIGHT[cat.share] * (profile.mode === "replenish" ? 1.15 : 1));
    reasons.push({
      kind: "category",
      text: `You carry ${p.category.toLowerCase()}`,
      weight: WEIGHTS.category * categoryScore,
    });
  } else if (cat && cat.intent === "stocked") {
    // Already covered: keep a trickle for replenishment, favor complements.
    categoryScore = profile.mode === "replenish" ? 0.6 : 0.2;
    if (profile.mode === "replenish") {
      reasons.push({
        kind: "category",
        text: `Restock for your ${p.category.toLowerCase()} section`,
        weight: WEIGHTS.category * categoryScore,
      });
    }
  }
  if (isComplement) {
    const anchor = profile.categories.find((c) => c.share === "dominant" || c.share === "strong");
    // Complements interleave with the store's own sections; they never outrank a dominant one.
    const complementScore = profile.mode === "complement" ? 0.7 : profile.mode === "replenish" ? 0.35 : 0.6;
    if (complementScore > categoryScore) categoryScore = complementScore;
    reasons.push({
      kind: "complement",
      text: anchor ? `Pairs with your ${anchor.name.toLowerCase()}` : `A natural next category`,
      weight: WEIGHTS.category * complementScore,
    });
  }

  // --- Style fit ----------------------------------------------------------
  const styleHits = p.styles.filter((s) => profile.styles.includes(s));
  const styleScore = p.styles.length ? styleHits.length / p.styles.length : 0;
  if (styleHits.length) {
    reasons.push({
      kind: "style",
      text: `Matches your ${prettyList(styleHits.map(styleLabel))} look`,
      weight: WEIGHTS.style * styleScore,
    });
  }

  // --- Material fit -------------------------------------------------------
  const mats = profile.materials.map((m) => m.toLowerCase());
  const matHits = p.materials.filter((m) => mats.includes(m.toLowerCase()));
  const materialScore = p.materials.length ? matHits.length / p.materials.length : 0;
  if (matHits.length) {
    reasons.push({
      kind: "material",
      text: `You stock ${prettyList(matHits)}`,
      weight: WEIGHTS.material * materialScore,
    });
  }

  // --- Price fit ----------------------------------------------------------
  let priceScore = 0.5;
  if (profile.priceTier !== "unknown") {
    const d = Math.abs(TIER_ORDER[p.priceTier] - TIER_ORDER[profile.priceTier]);
    priceScore = d === 0 ? 1 : d === 1 ? 0.5 : 0.1;
    if (d === 0) {
      reasons.push({ kind: "price", text: `In your ${p.priceTier}-tier price range`, weight: WEIGHTS.price });
    }
  }

  // --- Novelty / mode -----------------------------------------------------
  let noveltyScore = 0;
  if (profile.mode === "discover" && p.isNewBrand) {
    noveltyScore = 1;
    reasons.push({ kind: "new", text: "New on Faire, fits your look", weight: WEIGHTS.novelty });
  }

  const score =
    WEIGHTS.category * categoryScore +
    WEIGHTS.style * styleScore +
    WEIGHTS.material * materialScore +
    WEIGHTS.price * priceScore +
    WEIGHTS.novelty * noveltyScore;

  reasons.sort((a, b) => b.weight - a.weight);
  return { score, reasons: reasons.slice(0, 3) };
}

export interface RankOptions {
  scores?: Record<string, ProductScores>;
  weights?: FusionWeights;
}

function minMax(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return values;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  return values.map((v) => (v === null ? null : (v - lo) / span));
}

export function effectiveWeights(weights: FusionWeights | undefined, hasVisual: boolean, hasSemantic: boolean): FusionWeights {
  const w = { ...(weights ?? DEFAULT_WEIGHTS) };
  if (!hasVisual) w.visual = 0;
  if (!hasSemantic) w.semantic = 0;
  const sum = w.tag + w.visual + w.semantic || 1;
  return { tag: w.tag / sum, visual: w.visual / sum, semantic: w.semantic / sum };
}

export function personalize(catalog: Product[], profile: StoreProfile, opts: RankOptions = {}): Ranked[] {
  const generic = rankGeneric(catalog);
  const genericRank = new Map(generic.map((p, i) => [p.id, i + 1]));
  const tagScored = catalog.map((product) => ({ product, ...scoreProduct(product, profile) }));

  const scores = opts.scores ?? {};
  const visualRaw = catalog.map((p) => scores[p.id]?.visual ?? null);
  const semanticRaw = catalog.map((p) => scores[p.id]?.semantic ?? null);
  const hasVisual = visualRaw.some((v) => v !== null);
  const hasSemantic = semanticRaw.some((v) => v !== null);
  const visualN = minMax(visualRaw);
  const semanticN = minMax(semanticRaw);
  const w = effectiveWeights(opts.weights, hasVisual, hasSemantic);

  const fused = tagScored.map((t, i) => {
    const tag = Math.max(0, t.score);
    const v = visualN[i];
    const sm = semanticN[i];
    const reasons = [...t.reasons];
    if (t.score < 0) {
      return { ...t, reasons, components: { tag: -1, visual: v, semantic: sm, fused: -1 } };
    }
    if (v !== null && v >= 0.72) reasons.push({ kind: "visual", text: "Looks like what's on your shelves", weight: w.visual * v });
    if (sm !== null && sm >= 0.72) reasons.push({ kind: "semantic", text: "Fits how we read your store", weight: w.semantic * sm });
    reasons.sort((a, b) => b.weight - a.weight);
    const fusedScore = w.tag * tag + w.visual * (v ?? 0) + w.semantic * (sm ?? 0);
    // Personalization strength: 1 = fully shaped by the walkthrough, 0 = the generic popularity order.
    const strength = typeof profile.strength === "number" ? Math.max(0, Math.min(1, profile.strength)) : 1;
    const score = strength * fusedScore + (1 - strength) * popularityScore(t.product);
    return { product: t.product, score, reasons: reasons.slice(0, 3), components: { tag, visual: v, semantic: sm, fused: score } };
  });

  const ordered = stableSort(fused, (s) => s.score, (s) => s.product.id);
  return ordered.map((s, i) => ({
    product: s.product,
    score: s.score,
    components: s.components,
    reasons: s.reasons,
    genericRank: genericRank.get(s.product.id) ?? 0,
    personalizedRank: i + 1,
    delta: (genericRank.get(s.product.id) ?? 0) - (i + 1),
  }));
}

/** Order category tiles by affinity, falling back to the default order. */
export function orderCategories(all: readonly Category[], profile: StoreProfile | null): Category[] {
  if (!profile) return [...all];
  const weight = (c: Category) => {
    const sig = profile.categories.find((s) => s.name === c);
    if (sig?.intent === "skip") return -1;
    if (sig?.intent === "more") return 2 + SHARE_WEIGHT[sig.share];
    if (profile.complements.includes(c)) return 1.5;
    if (sig?.intent === "stocked") return 1;
    return 0;
  };
  return [...all].sort((a, b) => weight(b) - weight(a) || all.indexOf(a) - all.indexOf(b));
}

export interface FeedModule {
  id: string;
  title: string;
  subtitle?: string;
  items: Ranked[];
}

/** Personalized modules for the home feed, in Faire's "modular grid" spirit. */
export function buildModules(ranked: Ranked[], profile: StoreProfile): FeedModule[] {
  const modules: FeedModule[] = [];
  const anchor = profile.categories.find((c) => c.intent === "more" && (c.share === "dominant" || c.share === "strong"));
  if (anchor) {
    const items = ranked.filter((r) => r.product.category === anchor.name && r.score > 0).slice(0, 6);
    if (items.length >= 3)
      modules.push({
        id: "anchor",
        title: `More for your ${anchor.name.toLowerCase()} shelves`,
        subtitle: "Because your walkthrough showed a strong section here",
        items,
      });
  }
  const complements = profile.complements.filter((c) => !profile.categories.some((s) => s.name === c && s.intent === "skip"));
  if (complements.length) {
    const items = ranked.filter((r) => complements.includes(r.product.category) && r.score > 0).slice(0, 6);
    if (items.length >= 3)
      modules.push({
        id: "complements",
        title: `Pairs well with what you carry`,
        subtitle: `${prettyList(complements.map((c) => c.toLowerCase()))} for a store like yours`,
        items,
      });
  }
  const fresh = ranked.filter((r) => r.product.isNewBrand && r.score > 0.35).slice(0, 6);
  if (fresh.length >= 3) {
    const style = profile.styles[0];
    modules.push({
      id: "new-brands",
      title: style ? `New brands with a ${styleLabel(style)} feel` : "New brands for your store",
      subtitle: "Fresh on Faire and a fit for your shelves",
      items: fresh,
    });
  }
  return modules;
}
