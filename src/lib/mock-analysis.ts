import type { AnalysisOutput } from "./analysis-schema";

// Canned analyses used when MOCK_ANALYSIS=1 or no API key is configured, so
// the whole flow can be exercised without spending tokens.

const BOOKSHOP: AnalysisOutput = {
  frame_notes: [
    { frame_id: "f1", what_we_saw: "Wooden shelves of fiction spines" },
    { frame_id: "f2", what_we_saw: "Front table of new hardcovers" },
    { frame_id: "f3", what_we_saw: "Spinning rack of greeting cards" },
    { frame_id: "f4", what_we_saw: "Notebooks, pens and bookmarks" },
    { frame_id: "f5", what_we_saw: "Gift corner with mugs and totes" },
    { frame_id: "f6", what_we_saw: "Kids picture books, low shelf" },
    { frame_id: "f7", what_we_saw: "Reading nook with a lamp" },
    { frame_id: "f8", what_we_saw: "Counter display of small gifts" },
  ],
  categories: [
    { name: "Books & journals", share: "dominant", confidence: "high", evidence_frames: ["f1", "f2", "f6", "f7"], examples: ["literary fiction", "new hardcovers", "picture books"] },
    { name: "Stationery & paper", share: "strong", confidence: "high", evidence_frames: ["f3", "f4"], examples: ["greeting cards", "notebooks", "bookmarks"] },
    { name: "Home decor", share: "present", confidence: "medium", evidence_frames: ["f5", "f8"], examples: ["mugs", "tote bags", "small gifts"] },
    { name: "Kids & baby", share: "trace", confidence: "medium", evidence_frames: ["f6"], examples: ["picture books"] },
  ],
  styles: [
    { name: "literary", confidence: "high", evidence_frames: ["f1", "f2", "f7"] },
    { name: "vintage", confidence: "medium", evidence_frames: ["f7", "f8"] },
    { name: "natural", confidence: "medium", evidence_frames: ["f1", "f5"] },
  ],
  materials: [
    { name: "paper", evidence_frames: ["f1", "f2", "f3", "f4"] },
    { name: "wood", evidence_frames: ["f1", "f7"] },
    { name: "ceramic", evidence_frames: ["f5", "f8"] },
    { name: "cotton", evidence_frames: ["f5"] },
  ],
  palette: [
    { name: "warm oak", hex: "#B8834A" },
    { name: "cream", hex: "#F3EBDD" },
    { name: "forest", hex: "#2F4A3B" },
    { name: "brick", hex: "#9C4A3C" },
  ],
  price_position: { tier: "mid", confidence: "medium", rationale: "Independent-press paperbacks and boxed cards suggest an accessible mid-range gift price point." },
  visible_brands: [],
  merchandising_notes: [
    "New releases are merchandised face-out on a front table",
    "Cards and stationery sit near the register for add-on sales",
    "A small gift corner extends the assortment beyond books",
  ],
  suggested_complements: [
    { category: "Candles & fragrance", reason: "Reading-themed candles sell alongside books and gifts" },
    { category: "Food & drink", reason: "Tea and small-batch chocolate round out a gift corner" },
  ],
  store_read: {
    store_type_guess: "Independent bookshop with a stationery and gift corner",
    vibe_words: ["warm", "literary", "tactile"],
    summary: "Your shelves read as a warm, well-edited bookshop where new releases get the front table and cards and notebooks live near the register. The gift corner is small but deliberate, which tells us you like an assortment that feels curated rather than crowded.",
  },
};

const HOME_GIFT: AnalysisOutput = {
  frame_notes: [
    { frame_id: "f1", what_we_saw: "Stoneware bowls and mugs on oak shelves" },
    { frame_id: "f2", what_we_saw: "Hand-poured candles in amber jars" },
    { frame_id: "f3", what_we_saw: "Folded linen napkins and tea towels" },
    { frame_id: "f4", what_we_saw: "Greeting cards and notebooks" },
    { frame_id: "f5", what_we_saw: "Potted plants and woven baskets" },
    { frame_id: "f6", what_we_saw: "Wooden serving boards" },
    { frame_id: "f7", what_we_saw: "Small-batch soaps at the counter" },
    { frame_id: "f8", what_we_saw: "Neutral table styled for gifting" },
  ],
  categories: [
    { name: "Kitchen & tabletop", share: "dominant", confidence: "high", evidence_frames: ["f1", "f3", "f6"], examples: ["stoneware bowls", "linen napkins", "serving boards"] },
    { name: "Candles & fragrance", share: "strong", confidence: "high", evidence_frames: ["f2"], examples: ["soy candles in amber jars"] },
    { name: "Home decor", share: "strong", confidence: "high", evidence_frames: ["f5", "f8"], examples: ["woven baskets", "small vases"] },
    { name: "Stationery & paper", share: "present", confidence: "medium", evidence_frames: ["f4"], examples: ["greeting cards", "notebooks"] },
    { name: "Bath & body", share: "trace", confidence: "medium", evidence_frames: ["f7"], examples: ["bar soap"] },
  ],
  styles: [
    { name: "minimalist", confidence: "high", evidence_frames: ["f1", "f8"] },
    { name: "natural", confidence: "high", evidence_frames: ["f3", "f5", "f6"] },
    { name: "modern-farmhouse", confidence: "medium", evidence_frames: ["f6", "f8"] },
  ],
  materials: [
    { name: "stoneware", evidence_frames: ["f1"] },
    { name: "linen", evidence_frames: ["f3"] },
    { name: "wood", evidence_frames: ["f1", "f6"] },
    { name: "soy-wax", evidence_frames: ["f2"] },
    { name: "rattan", evidence_frames: ["f5"] },
  ],
  palette: [
    { name: "oat", hex: "#E7DCC8" },
    { name: "clay", hex: "#B9805E" },
    { name: "sage", hex: "#9AA88C" },
    { name: "charcoal", hex: "#3C3A37" },
  ],
  price_position: { tier: "premium", confidence: "medium", rationale: "Handmade stoneware and hand-poured candles with minimal packaging point to a premium gift positioning." },
  visible_brands: [],
  merchandising_notes: [
    "Products are grouped by material and tone rather than by category",
    "A styled center table sets up gifting occasions",
    "Counter-side soaps invite small add-on purchases",
  ],
  suggested_complements: [
    { category: "Food & drink", reason: "Pantry staples and teas complete a tabletop gift" },
    { category: "Garden & outdoor", reason: "Planters and tools extend the natural, plant-forward look" },
  ],
  store_read: {
    store_type_guess: "Modern home and gift boutique with a natural, tactile edit",
    vibe_words: ["calm", "tactile", "considered"],
    summary: "Your store is built around touch: stoneware, linen, wood and wax in a quiet oat-and-sage palette. You merchandise by tone rather than category, which tells us you will value brands that fit the whole table, not just the shelf.",
  },
};

const BOUTIQUE: AnalysisOutput = {
  frame_notes: [
    { frame_id: "f1", what_we_saw: "Rack of flowy dresses and blouses" },
    { frame_id: "f2", what_we_saw: "Jewelry tray with gold hoops" },
    { frame_id: "f3", what_we_saw: "Straw hats and woven bags" },
    { frame_id: "f4", what_we_saw: "Folded knits on a table" },
    { frame_id: "f5", what_we_saw: "Candles and small gifts near register" },
    { frame_id: "f6", what_we_saw: "Denim wall and belts" },
    { frame_id: "f7", what_we_saw: "Mirror with plants and rattan" },
    { frame_id: "f8", what_we_saw: "Scarves and hair accessories" },
  ],
  categories: [
    { name: "Apparel", share: "dominant", confidence: "high", evidence_frames: ["f1", "f4", "f6"], examples: ["dresses", "knits", "denim"] },
    { name: "Jewelry & accessories", share: "strong", confidence: "high", evidence_frames: ["f2", "f3", "f8"], examples: ["gold hoops", "woven bags", "scarves"] },
    { name: "Candles & fragrance", share: "trace", confidence: "medium", evidence_frames: ["f5"], examples: ["candles"] },
    { name: "Home decor", share: "trace", confidence: "low", evidence_frames: ["f7"], examples: ["rattan accents"] },
  ],
  styles: [
    { name: "boho", confidence: "high", evidence_frames: ["f1", "f3", "f7"] },
    { name: "playful", confidence: "medium", evidence_frames: ["f8"] },
    { name: "natural", confidence: "medium", evidence_frames: ["f3", "f7"] },
  ],
  materials: [
    { name: "cotton", evidence_frames: ["f1", "f4"] },
    { name: "rattan", evidence_frames: ["f3", "f7"] },
    { name: "brass", evidence_frames: ["f2"] },
    { name: "leather", evidence_frames: ["f6"] },
  ],
  palette: [
    { name: "terracotta", hex: "#C96F4A" },
    { name: "sand", hex: "#E9D9BF" },
    { name: "olive", hex: "#7C8C5A" },
    { name: "gold", hex: "#C9A24D" },
  ],
  price_position: { tier: "mid", confidence: "medium", rationale: "Contemporary boutique labels and accessible accessories suggest a mid-range positioning." },
  visible_brands: [],
  merchandising_notes: [
    "Outfits are styled together on racks to suggest full looks",
    "Accessories and gifts are clustered near the register",
    "Plants and rattan set a relaxed, sunlit mood",
  ],
  suggested_complements: [
    { category: "Bath & body", reason: "Body oils and hand creams are easy add-ons at the register" },
    { category: "Stationery & paper", reason: "Cards and notebooks fit a gifting-forward boutique" },
  ],
  store_read: {
    store_type_guess: "Sunlit boho apparel boutique with a strong accessories edit",
    vibe_words: ["sunlit", "easy", "playful"],
    summary: "Your racks tell a story of easy, sunlit dressing, with accessories styled to finish every look. The register corner already sells small gifts, so you have room to grow into a gifting destination without changing your vibe.",
  },
};

export function pickMock(context: { storeType?: string; storeName?: string; description?: string; sampleSlug?: string }): AnalysisOutput {
  const hay = `${context.sampleSlug ?? ""} ${context.storeType ?? ""} ${context.storeName ?? ""} ${context.description ?? ""}`.toLowerCase();
  if (/apparel|boutique|clothing|fashion/.test(hay)) return BOUTIQUE;
  if (/book|paper|stationery/.test(hay)) return BOOKSHOP;
  if (/home|gift|kitchen|decor|candle/.test(hay)) return HOME_GIFT;
  return BOOKSHOP;
}
