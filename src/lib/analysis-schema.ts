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
