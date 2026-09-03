import { z } from "zod";
import { getCatalog } from "@/lib/catalog";
import { rerankProducts } from "@/lib/rerank-server";
import type { StoreProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  catalog: z.enum(["synthetic", "public", "shopify"]).default("shopify"),
  ids: z.array(z.string().max(40)).min(1).max(80),
  storeType: z.string().max(120).nullable().optional(),
  profile: z
    .object({
      storeName: z.string().max(120).default(""),
      summary: z.string().max(2000).default(""),
      categories: z.array(z.object({ name: z.string(), share: z.string(), intent: z.string() })).max(16),
      styles: z.array(z.string()).max(8).default([]),
      materials: z.array(z.string()).max(12).default([]),
      complements: z.array(z.string()).max(8).default([]),
      mode: z.string().default("complement"),
    })
    .passthrough(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return Response.json({ error: "Invalid request", detail: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  const catalog = getCatalog(body.catalog);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const products = body.ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  try {
    const result = await rerankProducts({ catalog: body.catalog, profile: body.profile as unknown as StoreProfile, storeType: body.storeType, products });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Rerank failed";
    console.error("[rerank]", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
