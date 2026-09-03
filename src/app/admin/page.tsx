"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RunControls, type SampleMeta } from "@/components/admin/RunControls";
import { StageAnalysis } from "@/components/admin/StageAnalysis";
import { StageEmbeddings } from "@/components/admin/StageEmbeddings";
import { StageFeed } from "@/components/admin/StageFeed";
import { StageFrames } from "@/components/admin/StageFrames";
import { StageFusion } from "@/components/admin/StageFusion";
import { StageRerank } from "@/components/admin/StageRerank";
import { IDLE_PROGRESS, runPipeline, type PipelineInput, type PipelineProgress } from "@/components/admin/runPipeline";
import { Card, Mono } from "@/components/admin/ui";
import { CATALOG_LABEL, getCatalog } from "@/lib/catalog";
import { personalize, rankGeneric } from "@/lib/ranking";
import type { CatalogSource, ProductScores } from "@/lib/retrieval";
import { useOnboarding } from "@/lib/store";
import type { Product } from "@/lib/types";

const STAGES = [
  ["stage-1", "Frames"],
  ["stage-2", "Store read"],
  ["stage-3", "Embeddings"],
  ["stage-4", "Fusion"],
  ["stage-5", "Buyer's eye"],
  ["stage-6", "Feed"],
] as const;

function hasChannel(catalog: Product[], scores: Record<string, ProductScores> | undefined, key: "visual" | "semantic"): boolean {
  if (!scores) return false;
  return catalog.some((p) => {
    const v = scores[p.id]?.[key];
    return v !== null && v !== undefined;
  });
}

export default function AdminPage() {
  const { state, dispatch, hydrated, setCategoryIntent } = useOnboarding();
  const [progress, setProgress] = useState<PipelineProgress>(IDLE_PROGRESS);
  const [busy, setBusy] = useState(false);
  const [inputLabel, setInputLabel] = useState<string | null>(null);

  const catalog = useMemo(() => getCatalog(state.catalogSource), [state.catalogSource]);
  const generic = useMemo(() => rankGeneric(catalog), [catalog]);
  // Same rule as /home: only apply embedding scores computed for the catalog we are ranking.
  const scores = state.retrieval && state.retrieval.catalog === state.catalogSource ? state.retrieval.scores : undefined;
  const rerank = state.rerank && state.rerank.catalog === state.catalogSource ? state.rerank.fits : undefined;
  const rankedBefore = useMemo(
    () => (state.profile ? personalize(catalog, state.profile, { scores, weights: state.weights }) : null),
    [catalog, state.profile, scores, state.weights],
  );
  const ranked = useMemo(
    () => (state.profile ? personalize(catalog, state.profile, { scores, weights: state.weights, rerank }) : null),
    [catalog, state.profile, scores, state.weights, rerank],
  );
  const hasVisual = useMemo(() => hasChannel(catalog, scores, "visual"), [catalog, scores]);
  const hasSemantic = useMemo(() => hasChannel(catalog, scores, "semantic"), [catalog, scores]);

  const run = useCallback(
    async (input: PipelineInput, label: string, sample?: SampleMeta) => {
      if (busy) return;
      setBusy(true);
      setInputLabel(label);
      setProgress({ ...IDLE_PROGRESS, stage: "extracting" });
      let ctx = {
        storeName: state.storeName,
        storeCategory: state.storeCategory,
        description: state.description,
        catalogSource: state.catalogSource,
      };
      if (sample) {
        // Mirror the scan screen in a fresh session: the sample's identity becomes the store's,
        // which is also what the mock analysis keys on.
        dispatch({ type: "setDetails", storeName: sample.name, description: sample.tagline });
        dispatch({ type: "setStoreCategory", value: sample.storeType });
        dispatch({ type: "setSource", source: "sample", sampleSlug: sample.slug });
        ctx = { ...ctx, storeName: sample.name, storeCategory: sample.storeType, description: sample.tagline };
      } else {
        dispatch({ type: "setSource", source: input.kind === "video" ? "video" : "photos" });
      }
      try {
        await runPipeline({ input, ctx, dispatch, onProgress: setProgress });
      } finally {
        setBusy(false);
      }
    },
    [busy, dispatch, state.storeName, state.storeCategory, state.description, state.catalogSource],
  );

  const reset = useCallback(() => {
    dispatch({ type: "resetScan" });
    setProgress(IDLE_PROGRESS);
    setInputLabel(null);
  }, [dispatch]);

  const setCatalog = useCallback((source: CatalogSource) => dispatch({ type: "setCatalogSource", source }), [dispatch]);

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-[0.14em]">Store Scan · pipeline trace</p>
          <h1 className="font-serif text-[36px] leading-[1.15] text-ink">End-to-end trace view</h1>
          <p className="text-body mt-1 max-w-[780px]">
            Every stage of the cold-start pipeline, inspectable: input frames → LM store read → SigLIP retrieval → weighted fusion → a
            buyer&apos;s-eye rerank by the LM → the feed the retailer sees. Re-run it on canned inputs here; the phone views share this state.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 text-[13px]">
          {STAGES.map(([id, label], i) => (
            <a key={id} href={`#${id}`} className="text-ink-2 underline underline-offset-2">
              {i + 1}. {label}
            </a>
          ))}
          <Link href="/" className="text-ink-2 underline underline-offset-2">
            ← phone
          </Link>
        </nav>
      </header>

      {!hydrated && <p className="text-caption mb-3">Loading saved state…</p>}

      <div className="space-y-5">
        <RunControls
          state={state}
          busy={busy}
          progress={progress}
          inputLabel={inputLabel}
          onRun={run}
          onReset={reset}
          onCatalogChange={setCatalog}
        />

        <div id="stage-1" className="scroll-mt-[200px]">
          <StageFrames frames={state.frames} progress={state.extractProgress} />
        </div>

        <div id="stage-2" className="scroll-mt-[200px]">
          <StageAnalysis
            analysis={state.analysis}
            meta={state.analysisMeta}
            status={state.analysisStatus}
            error={state.analysisError}
            frames={state.frames}
            progress={progress.analyze}
            context={{
              storeName: state.storeName,
              storeType: state.storeCategory,
              description: state.description,
              sampleSlug: state.sampleSlug,
            }}
          />
        </div>

        <div id="stage-3" className="scroll-mt-[200px]">
          <StageEmbeddings
            retrieval={state.retrieval}
            status={state.retrievalStatus}
            error={state.retrievalError}
            frames={state.frames}
            catalogSource={state.catalogSource}
          />
        </div>

        <div id="stage-4" className="scroll-mt-[200px]">
          <StageFusion
            weights={state.weights}
            onWeights={(weights) => dispatch({ type: "setWeights", weights })}
            ranked={ranked}
            hasVisual={hasVisual}
            hasSemantic={hasSemantic}
            profile={state.profile}
            onIntent={setCategoryIntent}
            catalogLabel={CATALOG_LABEL[state.catalogSource]}
            catalogCount={catalog.length}
          />
        </div>

        <div id="stage-5" className="scroll-mt-[200px]">
          <StageRerank rerank={state.rerank} status={state.rerankStatus} error={state.rerankError} before={rankedBefore} after={ranked} />
        </div>

        <div id="stage-6" className="scroll-mt-[200px]">
          <StageFeed generic={generic} personalized={ranked} profile={state.profile} />
        </div>

        <Card title="What is real here, and what is simulated">
          <div className="grid gap-5 text-[13px] leading-[1.5] text-ink-2 md:grid-cols-2">
            <div>
              <p className="font-medium text-ink">Real</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Frame extraction, Laplacian sharpness selection and JPEG compression run in the browser (frames.ts); the video never uploads.</li>
                <li>
                  The store read is a live vision-LM call with a zod structured-output schema, streamed as SSE — unless <Mono>MOCK_ANALYSIS=1</Mono>{" "}
                  or no API key, in which case a canned analysis is streamed at model pace
                  {state.analysisMeta ? <> (this run: {state.analysisMeta.mock ? "mock" : "live"})</> : null}.
                </li>
                <li>
                  Embeddings are real SigLIP base vectors (transformers.js, int8 ONNX on CPU). The catalog index is precomputed by{" "}
                  <Mono>scripts/embed-catalog.mjs</Mono>; frame and prompt vectors are computed per run.
                </li>
                <li>The buyer&apos;s-eye rerank is a second live vision-LM call over the top 60 candidates (thumbnails + the confirmed brief).</li>
                <li>Fusion, normalization, reasons and the generic/personalized rank deltas are computed exactly as shown (ranking.ts) and drive the phone feed.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-ink">Simulated</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  The catalog: 2,016 real merchant listings from the public Shopify product-catalogue dataset (12 categories, junk listings removed by
                  an LM pass over titles and photos), plus a 72-product synthetic Faire-style catalog and a public dataset without wholesale semantics.
                  Ratings, review counts, bestseller and new-brand flags are invented, so the popularity prior is a stand-in.
                </li>
                <li>No retailer history, orders or engagement — this is deliberately the cold-start case. The tag scorer is a hand-tuned linear model, not learned.</li>
                <li>Latencies are one laptop CPU handling one request; nothing here is a serving-path benchmark.</li>
              </ul>
              <p className="mt-3">
                At Faire the visual channel would not be CLIP over product photos: it would reuse the product tower’s own vision embeddings from
                the two-tower ranker, and the store read would be an additional retailer sub-tower (frames + confirmed profile → retailer
                embedding) trained against the same objective, so the cold-start signal lands in the space the warm model already ranks in.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
