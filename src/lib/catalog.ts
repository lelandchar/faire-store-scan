import raw from "../../data/catalog.json";
import type { Product } from "./types";

export const CATALOG: Product[] = raw as Product[];

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
