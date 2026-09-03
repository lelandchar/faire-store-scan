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
  synthetic: "Synthetic Faire-style catalog",
  public: "Amazon Berkeley Objects (public)",
  shopify: "Shopify merchant catalog (public)",
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
