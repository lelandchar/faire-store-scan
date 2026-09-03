import type { Product } from "./types";

// A deliberately simple lexical relevance score so the demo can show query
// protection: only products that match the query are eligible, and
// personalization re-orders within that set.

/** Tiny synonym table so obvious retail vocabulary matches the catalog's wording. */
const SYNONYMS: Record<string, string[]> = {
  notebook: ["journal", "notepad", "sketchbook", "planner"],
  journal: ["notebook", "diary"],
  candle: ["candle", "votive", "taper", "wax"],
  mug: ["cup", "tumbler"],
  cup: ["mug", "tumbler"],
  soap: ["bar soap", "wash", "cleanser"],
  planter: ["pot", "plant", "vase"],
  pot: ["planter"],
  towel: ["tea towel", "napkin", "linen"],
  earring: ["hoop", "stud"],
  treat: ["chew", "biscuit", "snack"],
  toy: ["plush", "puzzle", "game"],
  card: ["greeting", "stationery"],
  bowl: ["dish", "serveware"],
  blanket: ["throw", "quilt"],
  bag: ["tote", "pouch", "clutch"],
};

export function tokenize(q: string): string[] {
  const base = q
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/(ies)$/, "y").replace(/(s)$/, ""))
    .filter((t) => t.length > 1);
  const expanded = new Set(base);
  for (const t of base) for (const syn of SYNONYMS[t] ?? []) expanded.add(syn);
  return Array.from(expanded);
}

function fieldHits(field: string, tokens: string[]): number {
  const f = field.toLowerCase();
  let n = 0;
  for (const t of tokens) if (f.includes(t)) n++;
  return n;
}

export function relevance(p: Product, query: string): number {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;
  const q = query.toLowerCase().trim();
  let score = 0;
  if (q && p.name.toLowerCase().includes(q)) score += 4;
  if (q && p.subcategory.toLowerCase().includes(q)) score += 3;
  score += 3 * fieldHits(p.name, tokens);
  score += 2.5 * fieldHits(p.subcategory, tokens);
  score += 1.5 * fieldHits(p.category, tokens);
  score += 1 * fieldHits(p.materials.join(" "), tokens);
  score += 0.75 * fieldHits(p.colors.join(" "), tokens);
  score += 0.5 * fieldHits(p.brand, tokens);
  score += 0.5 * fieldHits(p.styles.join(" "), tokens);
  return score;
}

export const SUGGESTED_QUERIES = ["notebooks", "candles", "ceramic mugs", "soap", "planters", "dog treats", "earrings", "tea towels"];
