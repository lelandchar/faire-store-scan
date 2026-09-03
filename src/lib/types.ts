// Shared domain types for the Store Scan prototype.

export const CATEGORIES = [
  "Home decor",
  "Kitchen & tabletop",
  "Candles & fragrance",
  "Stationery & paper",
  "Books & journals",
  "Apparel",
  "Jewelry & accessories",
  "Bath & body",
  "Food & drink",
  "Kids & baby",
  "Pets",
  "Garden & outdoor",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STYLES = [
  "minimalist",
  "modern-farmhouse",
  "boho",
  "coastal",
  "cottagecore",
  "playful",
  "luxe",
  "rustic",
  "vintage",
  "scandinavian",
  "maximalist",
  "literary",
  "natural",
] as const;
export type Style = (typeof STYLES)[number];

export type PriceTier = "value" | "mid" | "premium";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: Category;
  subcategory: string;
  wholesalePrice: number;
  msrp: number;
  minOrder: number;
  rating: number;
  reviewCount: number;
  styles: Style[];
  materials: string[];
  colors: string[];
  priceTier: PriceTier;
  isBestseller: boolean;
  isNewBrand: boolean;
  leadTimeDays: number;
  madeIn: string;
  image: string;
  imagePrompt?: string;
}

export type Share = "dominant" | "strong" | "present" | "trace";
export type Confidence = "high" | "medium" | "low";
/** What the retailer wants Faire to do with a category we spotted. */
export type CategoryIntent = "more" | "stocked" | "skip";
export type BuyingMode = "replenish" | "complement" | "discover";

export interface CategorySignal {
  name: Category;
  share: Share;
  confidence: Confidence;
  evidence_frames: string[];
  examples: string[];
}

export interface StyleSignal {
  name: Style;
  confidence: Confidence;
  evidence_frames: string[];
}

export interface FrameNote {
  frame_id: string;
  what_we_saw: string;
}

export interface Analysis {
  frame_notes: FrameNote[];
  categories: CategorySignal[];
  styles: StyleSignal[];
  materials: { name: string; evidence_frames: string[] }[];
  palette: { name: string; hex: string }[];
  price_position: {
    tier: PriceTier | "unknown";
    confidence: Confidence;
    rationale: string;
  };
  visible_brands: { name: string; evidence_frames: string[] }[];
  merchandising_notes: string[];
  suggested_complements: { category: Category; reason: string }[];
  store_read: {
    store_type_guess: string;
    vibe_words: string[];
    summary: string;
  };
}

/** The editable profile the retailer confirms. This is what drives ranking. */
export interface StoreProfile {
  storeName: string;
  storeType: string;
  description: string;
  categories: { name: Category; share: Share; intent: CategoryIntent }[];
  styles: Style[];
  materials: string[];
  palette: { name: string; hex: string }[];
  priceTier: PriceTier | "unknown";
  complements: Category[];
  mode: BuyingMode;
  vibeWords: string[];
  summary: string;
}

export interface Frame {
  id: string;
  /** JPEG data URL */
  dataUrl: string;
  timestampMs: number;
  source: "video" | "photo";
}
