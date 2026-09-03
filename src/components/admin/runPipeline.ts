import { runAnalysis } from "@/lib/analyze-client";
import { extractFramesFromVideo, framesFromImages, framesFromUrls } from "@/lib/frames";
import { promptsFromAnalysis, runRetrieval, type CatalogSource } from "@/lib/retrieval";
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

export type PipelineStage = "idle" | "extracting" | "analyzing" | "matching" | "done" | "error";

export interface PipelineTimings {
  extractMs?: number;
  analyzeMs?: number;
  matchMs?: number;
  totalMs?: number;
}

export interface PipelineProgress {
  stage: PipelineStage;
  extract: { done: number; total: number } | null;
  error: string | null;
  timings: PipelineTimings;
}

export const IDLE_PROGRESS: PipelineProgress = { stage: "idle", extract: null, error: null, timings: {} };

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
  const emit = (stage: PipelineStage, error: string | null = null) => onProgress({ stage, extract, error, timings: { ...timings } });
  const tStart = performance.now();

  try {
    // --- Stage 1: frames ----------------------------------------------------
    emit("extracting");
    dispatch({ type: "setAnalysisStatus", status: "extracting" });
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
    emit("analyzing");
    dispatch({ type: "setAnalysisStatus", status: "analyzing" });
    const t0 = performance.now();
    const analysis = await runAnalysis({
      frames,
      context: {
        storeName: ctx.storeName || undefined,
        storeType: ctx.storeCategory || undefined,
        description: ctx.description || undefined,
        sampleSlug: "slug" in input ? input.slug : undefined,
      },
      onPartial: (p) => dispatch({ type: "setAnalysis", analysis: p }),
      onMeta: (m) => dispatch({ type: "setAnalysisMeta", meta: { ...m, ms: Math.round(performance.now() - t0) } }),
      signal,
    });
    dispatch({ type: "setAnalysis", analysis });
    dispatch({
      type: "setProfile",
      profile: profileFromAnalysis(analysis, {
        storeName: ctx.storeName,
        storeType: ctx.storeCategory ?? "",
        description: ctx.description,
      }),
    });
    dispatch({ type: "setAnalysisStatus", status: "done" });
    timings.analyzeMs = Math.round(performance.now() - t0);

    // --- Stage 3: embedding retrieval ---------------------------------------
    emit("matching");
    dispatch({ type: "setRetrievalStatus", status: "running" });
    const t1 = performance.now();
    try {
      const retrieval = await runRetrieval({ frames, catalog: ctx.catalogSource, prompts: promptsFromAnalysis(analysis), signal });
      dispatch({ type: "setRetrieval", retrieval });
      dispatch({ type: "setRetrievalStatus", status: "done" });
    } catch (e) {
      // Tag-based ranking still works without embeddings; mirror the phone flow.
      dispatch({ type: "setRetrieval", retrieval: null });
      dispatch({ type: "setRetrievalStatus", status: "error", error: e instanceof Error ? e.message : "Retrieval failed" });
    }
    timings.matchMs = Math.round(performance.now() - t1);
    timings.totalMs = Math.round(performance.now() - tStart);
    emit("done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    dispatch({ type: "setAnalysisStatus", status: "error", error: msg });
    timings.totalMs = Math.round(performance.now() - tStart);
    emit("error", msg);
  }
}
