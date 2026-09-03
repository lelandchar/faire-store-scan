import { z } from "zod";
import { CATEGORIES, STYLES } from "./types";

// Property order matters: the model emits JSON in schema order, and the UI
// reveals signals progressively as they stream in. Cheap per-frame notes
// come first so the user sees something within a few seconds.
export const AnalysisSchema = z.object({
  frame_notes: z
    .array(
      z.object({
        frame_id: z.string(),
        what_we_saw: z
          .string()
          .describe("One short, concrete phrase (max 8 words) naming the merchandise visible in this frame."),
      }),
    )
    .describe("One note per frame, in frame order."),
  categories: z
    .array(
      z.object({
        name: z.enum(CATEGORIES),
        share: z
          .enum(["dominant", "strong", "present", "trace"])
          .describe("How much of the visible assortment this category represents."),
        confidence: z.enum(["high", "medium", "low"]),
        evidence_frames: z.array(z.string()).describe("Frame ids where this category is visible."),
        examples: z
          .array(z.string())
          .max(4)
          .describe("Specific product types seen, e.g. 'hardcover fiction', 'greeting cards'."),
      }),
    )
    .max(6)
    .describe("Categories actually visible on the shelves, most prominent first. Only include categories with real visual evidence."),
  styles: z
    .array(
      z.object({
        name: z.enum(STYLES),
        confidence: z.enum(["high", "medium", "low"]),
        evidence_frames: z.array(z.string()),
      }),
    )
    .max(4)
    .describe("The store's merchandising aesthetic, strongest first."),
  materials: z
    .array(z.object({ name: z.string(), evidence_frames: z.array(z.string()) }))
    .max(6)
    .describe("Dominant materials in the assortment: e.g. stoneware, paper, linen, brass, wood, glass."),
  palette: z
    .array(z.object({ name: z.string(), hex: z.string() }))
    .max(5)
    .describe("Dominant colors of the merchandise and fixtures, as a simple name plus hex."),
  price_position: z.object({
    tier: z.enum(["value", "mid", "premium", "unknown"]),
    confidence: z.enum(["high", "medium", "low"]),
    rationale: z.string().describe("One sentence citing visible cues (price tags, packaging, fixtures). Say 'unknown' if there are no cues."),
  }),
  visible_brands: z
    .array(z.object({ name: z.string(), evidence_frames: z.array(z.string()) }))
    .max(5)
    .describe("Only brand names that are clearly legible in a frame. Never guess."),
  merchandising_notes: z
    .array(z.string())
    .max(4)
    .describe("Short observations about how the store merchandises: front tables, seasonal displays, gift corner, etc."),
  suggested_complements: z
    .array(z.object({ category: z.enum(CATEGORIES), reason: z.string() }))
    .max(3)
    .describe("Categories that are NOT well represented but would pair naturally with what is stocked."),
  store_read: z.object({
    store_type_guess: z.string().describe("Best short label for the store, e.g. 'Independent bookshop with a stationery corner'."),
    vibe_words: z.array(z.string()).max(4).describe("2-4 evocative single words, e.g. 'warm', 'literary', 'tactile'."),
    summary: z
      .string()
      .describe("Two warm, specific sentences addressed to the store owner about what their shelves say about their store. No hedging, no mention of frames or AI."),
  }),
});

export type AnalysisOutput = z.infer<typeof AnalysisSchema>;

/**
 * Models occasionally overshoot a max-items constraint or invent an enum value.
 * Rather than failing the whole run, clamp what we can and drop what we can't,
 * then validate again. Returns null only when the shape is truly unusable.
 */
export function coerceAnalysis(raw: unknown): { data: AnalysisOutput | null; issues: string[] } {
  const first = AnalysisSchema.safeParse(raw);
  if (first.success) return { data: first.data, issues: [] };
  const issues = first.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (!raw || typeof raw !== "object") return { data: null, issues };
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  const strArr = (v: unknown, max: number) => arr(v).filter((x): x is string => typeof x === "string").slice(0, max);
  const cats = new Set<string>(CATEGORIES);
  const styles = new Set<string>(STYLES);
  const conf = (v: unknown) => (v === "high" || v === "medium" || v === "low" ? v : "medium");
  const share = (v: unknown) => (v === "dominant" || v === "strong" || v === "present" || v === "trace" ? v : "present");
  const pp = (r.price_position ?? {}) as Record<string, unknown>;
  const sr = (r.store_read ?? {}) as Record<string, unknown>;
  const fixed = {
    frame_notes: arr(r.frame_notes)
      .map((n) => n as Record<string, unknown>)
      .filter((n) => typeof n?.frame_id === "string")
      .map((n) => ({ frame_id: str(n.frame_id), what_we_saw: str(n.what_we_saw).slice(0, 80) })),
    categories: arr(r.categories)
      .map((c) => c as Record<string, unknown>)
      .filter((c) => cats.has(str(c?.name)))
      .slice(0, 6)
      .map((c) => ({
        name: str(c.name),
        share: share(c.share),
        confidence: conf(c.confidence),
        evidence_frames: strArr(c.evidence_frames, 12),
        examples: strArr(c.examples, 4),
      })),
    styles: arr(r.styles)
      .map((s) => s as Record<string, unknown>)
      .filter((s) => styles.has(str(s?.name)))
      .slice(0, 4)
      .map((s) => ({ name: str(s.name), confidence: conf(s.confidence), evidence_frames: strArr(s.evidence_frames, 12) })),
    materials: arr(r.materials)
      .map((m) => m as Record<string, unknown>)
      .filter((m) => typeof m?.name === "string")
      .slice(0, 6)
      .map((m) => ({ name: str(m.name), evidence_frames: strArr(m.evidence_frames, 12) })),
    palette: arr(r.palette)
      .map((p) => p as Record<string, unknown>)
      .filter((p) => typeof p?.hex === "string")
      .slice(0, 5)
      .map((p) => ({ name: str(p.name, "color"), hex: str(p.hex) })),
    price_position: {
      tier: ["value", "mid", "premium", "unknown"].includes(str(pp.tier)) ? str(pp.tier) : "unknown",
      confidence: conf(pp.confidence),
      rationale: str(pp.rationale, "No clear price cues were visible."),
    },
    visible_brands: arr(r.visible_brands)
      .map((b) => b as Record<string, unknown>)
      .filter((b) => typeof b?.name === "string")
      .slice(0, 5)
      .map((b) => ({ name: str(b.name), evidence_frames: strArr(b.evidence_frames, 12) })),
    merchandising_notes: strArr(r.merchandising_notes, 4),
    suggested_complements: arr(r.suggested_complements)
      .map((c) => c as Record<string, unknown>)
      .filter((c) => cats.has(str(c?.category)))
      .slice(0, 3)
      .map((c) => ({ category: str(c.category), reason: str(c.reason) })),
    store_read: {
      store_type_guess: str(sr.store_type_guess, "Independent retailer"),
      vibe_words: strArr(sr.vibe_words, 4),
      summary: str(sr.summary, "Your shelves gave us a clear read on your store."),
    },
  };
  const second = AnalysisSchema.safeParse(fixed);
  return { data: second.success ? second.data : null, issues };
}
