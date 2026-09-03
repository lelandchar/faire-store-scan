import rawSynthetic from "../../data/catalog.json";
import rawPublic from "../../data/catalog-public.json";
import rawShopify from "../../data/catalog-shopify.json";
import type { CatalogSource } from "./retrieval";
import type { Product } from "./types";

export const CATALOG: Product[] = rawSynthetic as Product[];
export const CATALOG_PUBLIC: Product[] = rawPublic as Product[];
export const CATALOG_SHOPIFY: Product[] = rawShopify as Product[];

export function getCatalog(source: CatalogSource): Product[] {
  if (source === "public" && CATALOG_PUBLIC.length > 0) return CATALOG_PUBLIC;
  if (source === "shopify" && CATALOG_SHOPIFY.length > 0) return CATALOG_SHOPIFY;
  return CATALOG;
}

export const CATALOG_LABEL: Record<CatalogSource, string> = {
  shopify: "Shopify merchant catalog (public, default)",
  synthetic: "Synthetic Faire-style catalog",
  public: "Amazon Berkeley Objects (public)",
};

/** Curated tile art per category: clean generated product photos, independent of the active catalog. */
export const CATEGORY_TILE_IMAGE: Record<string, string> = {
  "Home decor": "/catalog/hd-03.jpg",
  "Kitchen & tabletop": "/catalog/kt-01.jpg",
  "Candles & fragrance": "/catalog/cf-01.jpg",
  "Stationery & paper": "/catalog/sp-01.jpg",
  "Books & journals": "/catalog/bj-01.jpg",
  Apparel: "/catalog/ap-04.jpg",
  "Jewelry & accessories": "/catalog/ja-01.jpg",
  "Bath & body": "/catalog/bb-01.jpg",
  "Food & drink": "/catalog/fd-02.jpg",
  "Kids & baby": "/catalog/kb-02.jpg",
  Pets: "/catalog/pt-03.jpg",
  "Garden & outdoor": "/catalog/go-01.jpg",
};

export const STORE_CATEGORIES = [
  "Apparel Boutique",
  "Book Store",
  "Cafe or Restaurant",
  "Fitness or Yoga Studio",
  "Florist or Garden Store",
  "Furniture Store",
  "General Store",
  "Gift Store",
  "Grocery or Liquor Store",
  "Home Decor Store",
  "Kids or Toy Store",
  "Pet Store",
  "Spa or Salon",
  "Other",
] as const;

export function formatPrice(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
