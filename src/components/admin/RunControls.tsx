"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { CATALOG_LABEL, getCatalog } from "@/lib/catalog";
import type { CatalogSource } from "@/lib/retrieval";
import { loadSampleManifest, samplePhotoUrl, SAMPLE_VIDEOS, type SampleStore } from "@/lib/samples";
import type { OnboardingState } from "@/lib/store";
import type { PipelineInput, PipelineProgress } from "./runPipeline";
import { Btn, Card, Mono, fmtMs } from "./ui";

export interface SampleMeta {
  slug: string;
  name: string;
  tagline: string;
  storeType: string;
}

const SOURCES: CatalogSource[] = ["shopify", "synthetic", "public"];

function stageLabel(p: PipelineProgress): string {
  switch (p.stage) {
    case "idle":
      return "idle";
    case "extracting":
      return p.extract ? `extracting ${p.extract.done}/${p.extract.total}` : "extracting";
    case "analyzing":
      return "analyzing";
    case "matching":
      return "matching";
    case "reranking":
      return "reranking";
    case "done":
      return "done";
    case "error":
      return `error: ${p.error ?? "unknown"}`;
  }
}

export function RunControls({
  state,
  busy,
  progress,
  inputLabel,
  onRun,
  onReset,
  onCatalogChange,
}: {
  state: OnboardingState;
  busy: boolean;
  progress: PipelineProgress;
  inputLabel: string | null;
  onRun: (input: PipelineInput, label: string, sample?: SampleMeta) => void;
  onReset: () => void;
  onCatalogChange: (source: CatalogSource) => void;
}) {
  const [samples, setSamples] = useState<SampleStore[]>([]);

  useEffect(() => {
    let alive = true;
    loadSampleManifest().then((s) => {
      if (alive) setSamples(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // getCatalog("public") falls back to the synthetic array when the public
  // dataset is empty, so check both length and identity.
  const publicCatalog = getCatalog("public");
  const publicUnavailable = publicCatalog.length === 0 || publicCatalog === getCatalog("synthetic");
  const shopifyCatalog = getCatalog("shopify");
  const shopifyUnavailable = shopifyCatalog.length === 0 || shopifyCatalog === getCatalog("synthetic");

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const videos = files.filter((f) => f.type.startsWith("video/"));
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (videos.length) onRun({ kind: "video", file: videos[0] }, `Upload · ${videos[0].name}`);
    else if (images.length) onRun({ kind: "photos", files: images }, `Upload · ${images.length} photo${images.length === 1 ? "" : "s"}`);
  };

  const t = progress.timings;
  const stageClass = progress.stage === "error" ? "text-danger" : progress.stage === "done" ? "text-success" : "text-ink";

  return (
    <Card className="sticky top-3 z-20 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-caption uppercase tracking-[0.14em]">Input</span>
        {SAMPLE_VIDEOS.map((v, i) => (
          <Btn
            key={v.slug}
            primary
            disabled={busy}
            title={`${v.tagline} · ${v.file}`}
            onClick={() =>
              onRun({ kind: "sample-video", slug: v.slug, url: v.file }, `Example video ${i + 1} · ${v.name}`, {
                slug: v.slug,
                name: v.name,
                tagline: v.tagline,
                storeType: v.storeType,
              })
            }
          >
            Use example video {i + 1} <span className="opacity-70">· {v.name}</span>
          </Btn>
        ))}
        {samples.map((s, i) => (
          <Btn
            key={s.slug}
            disabled={busy}
            title={s.tagline}
            onClick={() =>
              onRun(
                { kind: "sample-photos", slug: s.slug, urls: s.photos.map((p) => samplePhotoUrl(s, p)) },
                `Example images ${i + 1} · ${s.name}`,
                { slug: s.slug, name: s.name, tagline: s.tagline, storeType: s.storeType },
              )
            }
          >
            Use example images {i + 1}{" "}
            <span className="opacity-70">
              · {s.name} ({s.photos.length} photos)
            </span>
          </Btn>
        ))}
        {samples.length === 0 && <span className="text-caption">Loading sample manifest…</span>}
        <label
          className={`inline-flex h-8 cursor-pointer items-center rounded-[var(--radius)] border border-dashed border-line bg-white px-3 text-[13px] text-ink-2 hover:bg-surface-2 ${
            busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Upload video or photos
          <input type="file" accept="video/*,image/*" multiple className="sr-only" disabled={busy} onChange={onFiles} />
        </label>
        <Btn disabled={busy} onClick={onReset} className="ml-auto" title="dispatch resetScan">
          Reset
        </Btn>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
        <span className="text-caption uppercase tracking-[0.14em]">Catalog</span>
        {SOURCES.map((src) => {
          const disabled = busy || (src === "public" && publicUnavailable) || (src === "shopify" && shopifyUnavailable);
          return (
            <label key={src} className={`inline-flex items-center gap-1.5 text-[13px] text-ink ${disabled ? "opacity-50" : "cursor-pointer"}`}>
              <input
                type="radio"
                name="catalog"
                value={src}
                checked={state.catalogSource === src}
                disabled={disabled}
                onChange={() => onCatalogChange(src)}
                style={{ accentColor: "var(--ink)" }}
              />
              {CATALOG_LABEL[src]} <Mono className="text-muted">({getCatalog(src).length.toLocaleString()})</Mono>
            </label>
          );
        })}
        {(publicUnavailable || shopifyUnavailable) && <span className="text-caption">A public catalog is not loaded in this build.</span>}
        <span className="ml-auto flex flex-wrap gap-x-4 text-[13px]">
          <a href="/home" target="_blank" rel="opener" className="text-ink-2 underline underline-offset-2">
            Open feed in phone (/home) ↗
          </a>
          <a href="/onboarding/profile" target="_blank" rel="opener" className="text-ink-2 underline underline-offset-2">
            Open profile in phone (/onboarding/profile) ↗
          </a>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line pt-3 text-[13px]">
        <span>
          <span className="text-muted">status </span>
          <Mono className={stageClass}>{stageLabel(progress)}</Mono>
        </span>
        <span>
          <span className="text-muted">extract </span>
          <Mono>{fmtMs(t.extractMs)}</Mono>
        </span>
        <span>
          <span className="text-muted">analyze </span>
          <Mono>{fmtMs(t.analyzeMs)}</Mono>
        </span>
        <span>
          <span className="text-muted">match </span>
          <Mono>{fmtMs(t.matchMs)}</Mono>
        </span>
        <span>
          <span className="text-muted">rerank </span>
          <Mono>{fmtMs(t.rerankMs)}</Mono>
        </span>
        <span>
          <span className="text-muted">total </span>
          <Mono>{fmtMs(t.totalMs)}</Mono>
        </span>
        {inputLabel && (
          <span className="text-muted">
            input <span className="text-ink">{inputLabel}</span>
          </span>
        )}
        <span className="text-muted">
          store <Mono>analysis={state.analysisStatus}</Mono> · <Mono>retrieval={state.retrievalStatus}</Mono>
          {state.analysisError && <span className="text-danger"> · {state.analysisError}</span>}
          {state.retrievalError && <span className="text-danger"> · {state.retrievalError}</span>}
        </span>
      </div>
      <p className="text-caption mt-2">
        Sample runs set the store name and type to the sample’s, as the scan screen would in a fresh session. State lives in this tab’s
        sessionStorage; the phone links open with a copy of it. If a catalog has no embedding index, retrieval reports an error and
        ranking falls back to tag-only.
      </p>
    </Card>
  );
}
