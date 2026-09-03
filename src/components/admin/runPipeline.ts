import { runAnalysis } from "@/lib/analyze-client";
import { extractFramesFromVideo, framesFromImages, framesFromUrls } from "@/lib/frames";
import { personalize } from "@/lib/ranking";
import { RERANK_CANDIDATES, runRerank } from "@/lib/rerank";
import { promptsFromAnalysis, runRetrieval, type CatalogSource } from "@/lib/retrieval";
import { getCatalog } from "@/lib/catalog";
import { profileFromAnalysis, type useOnboarding } from "@/lib/store";
import type { Frame } from "@/lib/types";

// Runs the whole Store Scan pipeline inline, with the same dispatch sequence as
// src/app/onboarding/analyzing/page.tsx, so the shared store is populated and
// the phone views reflect the run.

export type PipelineInput =
  | { kind: "video"; file: File }
  | { kind: "photos"; files: File[] }
  | { kind: "sample-photos"; slug: string; urls: string[] }
  | { kind: "sample-video"; slug: string; url: string };

export type PipelineStage = "idle" | "extracting" | "analyzing" | "matching" | "reranking" | "done" | "error";

export interface PipelineTimings {
  extractMs?: number;
  analyzeMs?: number;
  matchMs?: number;
  rerankMs?: number;
  totalMs?: number;
}

export interface PipelineProgress {
  stage: PipelineStage;
  extract: { done: number; total: number } | null;
  /** Set while the store read streams: when it started and the median time it takes on this deployment. */
  analyze: { startedAt: number; expectedMs: number } | null;
  error: string | null;
  timings: PipelineTimings;
}

export const IDLE_PROGRESS: PipelineProgress = { stage: "idle", extract: null, analyze: null, error: null, timings: {} };
const DEFAULT_ANALYZE_MS = 52_000;

export type StoreDispatch = ReturnType<typeof useOnboarding>["dispatch"];

export interface PipelineContext {
  storeName: string;
  storeCategory: string | null;
  description: string;
  catalogSource: CatalogSource;
}

export async function runPipeline(opts: {
  input: PipelineInput;
  ctx: PipelineContext;
  dispatch: StoreDispatch;
  onProgress: (p: PipelineProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { input, ctx, dispatch, onProgress, signal } = opts;
  const timings: PipelineTimings = {};
  let extract: PipelineProgress["extract"] = null;
  let analyze: PipelineProgress["analyze"] = null;
  const emit = (stage: PipelineStage, error: string | null = null) => onProgress({ stage, extract, analyze, error, timings: { ...timings } });
  const tStart = performance.now();

  try {
    // --- Stage 1: frames ----------------------------------------------------
    emit("extracting");
    dispatch({ type: "setAnalysisStatus", status: "extracting" });
    dispatch({ type: "setAnalysisMeta", meta: null });
    dispatch({ type: "setAnalysis", analysis: null });
    dispatch({ type: "setProfile", profile: null });
    const onExtract = (done: number, total: number) => {
      extract = { done, total };
      dispatch({ type: "setExtractProgress", progress: { done, total } });
      emit("extracting");
    };
    let frames: Frame[] = [];
    if (input.kind === "video") frames = await extractFramesFromVideo(input.file, { onProgress: onExtract });
    else if (input.kind === "photos") frames = await framesFromImages(input.files, { onProgress: onExtract });
    else if (input.kind === "sample-photos") frames = await framesFromUrls(input.urls, { onProgress: onExtract });
    else {
      const blob = await (await fetch(input.url, { signal })).blob();
      const file = new File([blob], "sample.mp4", { type: blob.type || "video/mp4" });
      frames = await extractFramesFromVideo(file, { onProgress: onExtract });
    }
    if (!frames.length) throw new Error("No usable frames were found in that input.");
    dispatch({ type: "setFrames", frames });
    dispatch({ type: "setExtractProgress", progress: null });
    extract = null;
    timings.extractMs = Math.round(performance.now() - tStart);

    // --- Stage 2: LM store read ---------------------------------------------
    const t0 = performance.now();
    analyze = { startedAt: t0, expectedMs: DEFAULT_ANALYZE_MS };
    emit("analyzing");
    dispatch({ type: "setAnalysisStatus", status: "analyzing" });
    const analysis = await runAnalysis({
      frames,
      context: {
        storeName: ctx.storeName || undefined,
        storeType: ctx.storeCategory || undefined,
        description: ctx.description || undefined,
        sampleSlug: "slug" in input ? input.slug : undefined,
      },
      onPartial: (p) => dispatch({ type: "setAnalysis", analysis: p }),
      onMeta: (m) => {
        dispatch({ type: "setAnalysisMeta", meta: { ...m, ms: Math.round(performance.now() - t0) } });
        if (m.p50Ms) {
          analyze = { startedAt: t0, expectedMs: m.p50Ms };
          emit("analyzing");
        }
      },
      signal,
    });
    analyze = null;
    dispatch({ type: "setAnalysis", analysis });
    const profile = profileFromAnalysis(analysis, { storeName: ctx.storeName, storeType: ctx.storeCategory ?? "", description: ctx.description });
    dispatch({ type: "setProfile", profile });
    dispatch({ type: "setAnalysisStatus", status: "done" });
    timings.analyzeMs = Math.round(performance.now() - t0);

    // --- Stage 3: embedding retrieval ---------------------------------------
    emit("matching");
    dispatch({ type: "setRetrievalStatus", status: "running" });
    const t1 = performance.now();
    dispatch({ type: "setRerank", rerank: null });
    let retrieval: Awaited<ReturnType<typeof runRetrieval>> | null = null;
    try {
      retrieval = await runRetrieval({ frames, catalog: ctx.catalogSource, prompts: promptsFromAnalysis(analysis), signal });
      dispatch({ type: "setRetrieval", retrieval });
      dispatch({ type: "setRetrievalStatus", status: "done" });
    } catch (e) {
      // Tag-based ranking still works without embeddings; mirror the phone flow.
      dispatch({ type: "setRetrieval", retrieval: null });
      dispatch({ type: "setRetrievalStatus", status: "error", error: e instanceof Error ? e.message : "Retrieval failed" });
    }
    timings.matchMs = Math.round(performance.now() - t1);

    // --- Stage 4: buyer's-eye rerank of the top candidates --------------------
    emit("reranking");
    dispatch({ type: "setRerankStatus", status: "running" });
    const t2 = performance.now();
    try {
      const catalog = getCatalog(ctx.catalogSource);
      const ids = personalize(catalog, profile, { scores: retrieval?.scores })
        .filter((r) => r.score >= 0)
        .slice(0, RERANK_CANDIDATES)
        .map((r) => r.product.id);
      const rerank = await runRerank({ catalog: ctx.catalogSource, ids, profile, storeType: analysis.store_read?.store_type_guess, signal });
      dispatch({ type: "setRerank", rerank });
      dispatch({ type: "setRerankStatus", status: "done" });
    } catch (e) {
      dispatch({ type: "setRerankStatus", status: "error", error: e instanceof Error ? e.message : "Rerank failed" });
    }
    timings.rerankMs = Math.round(performance.now() - t2);
    timings.totalMs = Math.round(performance.now() - tStart);
    emit("done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    dispatch({ type: "setAnalysisStatus", status: "error", error: msg });
    timings.totalMs = Math.round(performance.now() - tStart);
    emit("error", msg);
  }
}
