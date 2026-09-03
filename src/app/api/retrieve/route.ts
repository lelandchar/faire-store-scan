import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cosine, embedImages, embedTexts, EMBEDDING_DIM, EMBEDDING_MODEL, meanVector } from "@/lib/embeddings";
import type { CatalogSource, ProductScores, RetrievalResult } from "@/lib/retrieval";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z.object({
  frames: z.array(z.object({ id: z.string().regex(/^f\d{1,2}$/), dataUrl: z.string().startsWith("data:image/jpeg;base64,") })).min(1).max(12),
  catalog: z.enum(["synthetic", "public"]).default("synthetic"),
  prompts: z.array(z.string().max(200)).max(12).default([]),
});

interface Index {
  model: string;
  dim: number;
  ids: string[];
  image: Float32Array[];
  text: Float32Array[];
}

const FILES: Record<CatalogSource, string> = {
  synthetic: "catalog.json",
  public: "catalog-public.json",
};

function decode(b64: string, dim: number): Float32Array[] {
  const buf = Buffer.from(b64, "base64");
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  const all = new Float32Array(copy);
  const out: Float32Array[] = [];
  for (let i = 0; i + dim <= all.length; i += dim) out.push(all.subarray(i, i + dim));
  return out;
}

const g = globalThis as unknown as { __indexCache?: Map<CatalogSource, Promise<Index>> };
g.__indexCache ??= new Map();

async function loadIndex(source: CatalogSource): Promise<Index> {
  const cached = g.__indexCache!.get(source);
  if (cached) return cached;
  const p = (async () => {
    const file = path.join(process.cwd(), "data", "embeddings", FILES[source]);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as { model: string; dim: number; ids: string[]; image: string; text: string };
    const image = decode(raw.image, raw.dim);
    const text = decode(raw.text, raw.dim);
    if (image.length !== raw.ids.length) throw new Error(`Embedding index ${file} is inconsistent (${image.length} vectors for ${raw.ids.length} ids)`);
    return { model: raw.model, dim: raw.dim, ids: raw.ids, image, text };
  })();
  g.__indexCache!.set(source, p);
  p.catch(() => g.__indexCache!.delete(source));
  return p;
}

export async function POST(req: Request) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return Response.json({ error: "Invalid request", detail: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  const t0 = performance.now();
  try {
    const index = await loadIndex(body.catalog);
    if (index.ids.length === 0) return Response.json({ error: `The ${body.catalog} catalog has no embeddings yet.` }, { status: 503 });
    const tLoad = performance.now();

    const frameVecs = await embedImages(body.frames.map((f) => f.dataUrl));
    const tImg = performance.now();
    const storeVisual = meanVector(frameVecs);

    let storeText: Float32Array | null = null;
    if (body.prompts.length) {
      const textVecs = await embedTexts(body.prompts);
      storeText = meanVector(textVecs);
    }
    const tTxt = performance.now();

    const scores: Record<string, ProductScores> = {};
    for (let i = 0; i < index.ids.length; i++) {
      const visual = cosine(index.image[i], storeVisual);
      const semantic = storeText ? 0.5 * cosine(index.image[i], storeText) + 0.5 * cosine(index.text[i], storeText) : null;
      scores[index.ids[i]] = { visual, semantic };
    }
    const frameNeighbors = body.frames.map((f, fi) => {
      const sims = index.ids.map((id, i) => ({ id, score: cosine(index.image[i], frameVecs[fi]) }));
      sims.sort((a, b) => b.score - a.score);
      return { frameId: f.id, neighbors: sims.slice(0, 5) };
    });
    const tScore = performance.now();

    const result: RetrievalResult = {
      catalog: body.catalog,
      model: index.model || EMBEDDING_MODEL,
      dim: index.dim || EMBEDDING_DIM,
      count: index.ids.length,
      timings: {
        loadMs: Math.round(tLoad - t0),
        embedImagesMs: Math.round(tImg - tLoad),
        embedTextsMs: Math.round(tTxt - tImg),
        scoreMs: Math.round(tScore - tTxt),
        totalMs: Math.round(tScore - t0),
      },
      storeVectorPreview: Array.from(storeVisual.subarray(0, 8)).map((x) => Number(x.toFixed(4))),
      prompts: body.prompts,
      scores,
      frameNeighbors,
      frameVectorPreviews: body.frames.map((f, i) => ({ frameId: f.id, preview: Array.from(frameVecs[i].subarray(0, 8)).map((x) => Number(x.toFixed(4))) })),
    };
    return Response.json(result);
  } catch (err) {
    console.error("[retrieve] error", err);
    return Response.json({ error: err instanceof Error ? err.message : "Retrieval failed" }, { status: 500 });
  }
}
