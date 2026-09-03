import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { embedImages, embedTexts, EMBEDDING_DIM, EMBEDDING_MODEL } from "@/lib/embeddings";
import { DEFAULT_SCORING_OPTIONS, type CatalogSource, type RetrievalResult } from "@/lib/retrieval";
import { computeScores, DEFAULT_NN, decodeVectors, dot, meanVector, nearestNeighborScores, type QueryVec, type VectorIndex } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 120;

const RequestSchema = z.object({
  frames: z.array(z.object({ id: z.string().regex(/^f\d{1,2}$/), dataUrl: z.string().startsWith("data:image/jpeg;base64,") })).min(1).max(16),
  catalog: z.enum(["synthetic", "public", "shopify"]).default("synthetic"),
  prompts: z.array(z.string().max(200)).max(16).default([]),
  briefCount: z.number().int().min(0).max(16).optional(),
  scoring: z
    .object({
      visual: z.enum(["mean", "max", "top2"]).optional(),
      semantic: z.enum(["mean", "max", "top2"]).optional(),
      imageShare: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

type Index = VectorIndex;

const FILES: Record<CatalogSource, string> = {
  synthetic: "catalog.json",
  public: "catalog-public.json",
  shopify: "catalog-shopify.json",
};

const g = globalThis as unknown as { __indexCache?: Map<CatalogSource, { mtime: number; index: Promise<Index> }> };
g.__indexCache ??= new Map();

async function loadIndex(source: CatalogSource): Promise<Index> {
  const file = path.join(process.cwd(), "data", "embeddings", FILES[source]);
  const mtime = (await fs.stat(file)).mtimeMs;
  const cached = g.__indexCache!.get(source);
  if (cached && cached.mtime === mtime) return cached.index;
  const p = (async () => {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as { model: string; dim: number; ids: string[]; image: string; text: string };
    const image = decodeVectors(raw.image, raw.dim);
    const text = decodeVectors(raw.text, raw.dim);
    if (image.length !== raw.ids.length) throw new Error(`Embedding index ${file} is inconsistent (${image.length} vectors for ${raw.ids.length} ids)`);
    return { model: raw.model, dim: raw.dim, ids: raw.ids, image, text };
  })();
  g.__indexCache!.set(source, { mtime, index: p });
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

    const promptVecs = body.prompts.length ? await embedTexts(body.prompts) : [];
    const tTxt = performance.now();

    const scoring = { ...DEFAULT_SCORING_OPTIONS, ...(body.scoring ?? {}) };
    const scores = computeScores(index, frameVecs, promptVecs, scoring);
    // Retrieval v2: every frame and prompt is its own nearest-neighbour query; reciprocal rank
    // fusion combines them, and the centroid of all queries is the store embedding.
    const briefCount = body.briefCount ?? promptVecs.length;
    const queries: QueryVec[] = [
      ...frameVecs.map((vec) => ({ kind: "shelf" as const, vec })),
      ...promptVecs.map((vec, i) => ({ kind: i < briefCount ? ("brief" as const) : ("wish" as const), vec })),
    ];
    const nnOpts = { imageShare: 0.8 };
    const nnScores = nearestNeighborScores(index, queries, nnOpts);
    for (const id of index.ids) {
      const s = scores[id];
      if (s) {
        s.nn = nnScores.nn[id];
        s.centroid = nnScores.centroid[id];
      }
    }
    const frameNeighbors = body.frames.map((f, fi) => {
      const sims = index.ids.map((id, i) => ({ id, score: dot(index.image[i], frameVecs[fi]) }));
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
      scoring,
      nn: {
        shelves: frameVecs.length,
        briefs: Math.min(briefCount, promptVecs.length),
        wishes: Math.max(0, promptVecs.length - briefCount),
        k: DEFAULT_NN.k,
        rrfK: DEFAULT_NN.rrfK,
        imageShare: nnOpts.imageShare,
        kindWeights: DEFAULT_NN.kindWeights,
      },
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
