"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { runAnalysis } from "@/lib/analyze-client";
import { extractFramesFromVideo, framesFromImages, framesFromUrls } from "@/lib/frames";
import { takePendingInput, type PendingInput } from "@/lib/pending";
import { styleLabel } from "@/lib/ranking";
import { promptsFromAnalysis, runRetrieval } from "@/lib/retrieval";
import { getCatalog } from "@/lib/catalog";
import { profileFromAnalysis, useOnboarding } from "@/lib/store";
import type { Analysis, Frame } from "@/lib/types";

type Phase = "extracting" | "analyzing" | "matching" | "done" | "error";

function statusFor(a: Partial<Analysis> | null, phase: Phase, extract: { done: number; total: number } | null, catalogSize: number): string {
  if (phase === "extracting") return extract ? `Picking the sharpest frames · ${extract.done}/${extract.total}` : "Picking the sharpest frames";
  if (phase === "matching") return `Matching your shelves to ${catalogSize.toLocaleString()} products`;
  if (phase === "done") return "Got it.";
  if (phase === "error") return "Hmm.";
  if (!a) return "Looking at your shelves";
  if (a.store_read) return "Almost there";
  if (a.visible_brands) return "Spotting brands you already carry";
  if (a.price_position) return "Reading the price tags";
  if (a.palette) return "Picking out your palette";
  if (a.styles || a.materials) return "Noticing your style and materials";
  if (a.categories) return "Sorting your assortment";
  if (a.frame_notes) return "Noting what's on each shelf";
  return "Looking at your shelves";
}

export default function AnalyzingPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const [phase, setPhase] = useState<Phase>("extracting");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const input = takePendingInput();
    if (!input) {
      router.replace(state.analysisStatus === "done" && state.profile ? "/onboarding/profile" : "/onboarding/scan");
      return;
    }
    void run(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(input: PendingInput) {
    try {
      setPhase("extracting");
      dispatch({ type: "setAnalysisStatus", status: "extracting" });
      dispatch({ type: "setAnalysis", analysis: null });
      dispatch({ type: "setProfile", profile: null });
      const onProgress = (done: number, total: number) => dispatch({ type: "setExtractProgress", progress: { done, total } });
      let frames: Frame[] = [];
      if (input.kind === "video") frames = await extractFramesFromVideo(input.file, { onProgress });
      else if (input.kind === "photos") frames = await framesFromImages(input.files, { onProgress });
      else if (input.kind === "sample-photos") frames = await framesFromUrls(input.urls, { onProgress });
      else {
        const blob = await (await fetch(input.url)).blob();
        const file = new File([blob], "sample.mp4", { type: blob.type || "video/mp4" });
        frames = await extractFramesFromVideo(file, { onProgress });
      }
      if (!frames.length) throw new Error("We couldn't find usable frames in that walkthrough.");
      dispatch({ type: "setFrames", frames });
      dispatch({ type: "setExtractProgress", progress: null });

      setPhase("analyzing");
      dispatch({ type: "setAnalysisStatus", status: "analyzing" });
      const t0 = performance.now();
      const ctx = {
        storeName: state.storeName || undefined,
        storeType: state.storeCategory || undefined,
        description: state.description || undefined,
        sampleSlug: state.sampleSlug || undefined,
      };
      const analysis = await runAnalysis({
        frames,
        context: ctx,
        onPartial: (p) => dispatch({ type: "setAnalysis", analysis: p }),
        onMeta: (m) => dispatch({ type: "setAnalysisMeta", meta: { ...m, ms: Math.round(performance.now() - t0) } }),
      });
      dispatch({ type: "setAnalysis", analysis });
      dispatch({
        type: "setProfile",
        profile: profileFromAnalysis(analysis, {
          storeName: state.storeName,
          storeType: state.storeCategory ?? "",
          description: state.description,
        }),
      });
      dispatch({ type: "setAnalysisStatus", status: "done" });

      // Embedding retrieval: frames + the LM's read → nearest catalog products.
      setPhase("matching");
      dispatch({ type: "setRetrievalStatus", status: "running" });
      try {
        const retrieval = await runRetrieval({ frames, catalog: state.catalogSource, prompts: promptsFromAnalysis(analysis) });
        dispatch({ type: "setRetrieval", retrieval });
        dispatch({ type: "setRetrievalStatus", status: "done" });
      } catch (e) {
        // The tag-based ranking still works without embeddings; don't block the retailer.
        dispatch({ type: "setRetrieval", retrieval: null });
        dispatch({ type: "setRetrievalStatus", status: "error", error: e instanceof Error ? e.message : "Retrieval failed" });
      }
      setPhase("done");
      setTimeout(() => router.replace("/onboarding/profile"), 1300);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setPhase("error");
      dispatch({ type: "setAnalysisStatus", status: "error", error: msg });
    }
  }

  const a = state.analysis;
  const frames = state.frames;
  const notes = useMemo(() => new Map((a?.frame_notes ?? []).filter((n) => n?.frame_id && n?.what_we_saw).map((n) => [n.frame_id, n.what_we_saw])), [a?.frame_notes]);
  const noted = frames.filter((f) => notes.has(f.id));
  const hero = noted.length ? noted[noted.length - 1] : frames[0];
  const status = statusFor(a, phase, state.extractProgress, getCatalog(state.catalogSource).length);

  const chips: { key: string; label: string; kind: "category" | "style" | "material" | "brand" | "price" }[] = [];
  for (const c of a?.categories ?? []) if (c?.name) chips.push({ key: `c-${c.name}`, label: c.name, kind: "category" });
  for (const s of a?.styles ?? []) if (s?.name) chips.push({ key: `s-${s.name}`, label: styleLabel(s.name), kind: "style" });
  for (const m of a?.materials ?? []) if (m?.name) chips.push({ key: `m-${m.name}`, label: m.name, kind: "material" });
  if (a?.price_position?.tier && a.price_position.tier !== "unknown") chips.push({ key: "price", label: `${a.price_position.tier} price point`, kind: "price" });
  for (const b of a?.visible_brands ?? []) if (b?.name) chips.push({ key: `b-${b.name}`, label: b.name, kind: "brand" });

  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-8 pt-8">
      <p className="text-caption uppercase tracking-[0.14em]">{phase === "extracting" ? "Step 1 of 2" : "Step 2 of 2"}</p>
      <h1 className="text-display-sm mt-2">Reading your shelves</h1>
      <div className="mt-2 flex h-6 items-center gap-2 text-body">
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className={phase === "done" ? "text-ink" : "text-muted"}
          >
            {status}
            {phase === "analyzing" || phase === "extracting" || phase === "matching" ? <span className="pulse-soft">…</span> : null}
          </motion.span>
        </AnimatePresence>
        {phase === "done" && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </div>

      {/* Hero frame */}
      <div className="relative mt-6 overflow-hidden rounded-[var(--radius-lg)] bg-surface-2" style={{ aspectRatio: "4 / 3" }}>
        <AnimatePresence mode="popLayout">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <motion.img
              key={hero.id}
              src={hero.dataUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            />
          ) : (
            <div key="empty" className="absolute inset-0 flex items-center justify-center">
              <ExtractRing progress={state.extractProgress} />
            </div>
          )}
        </AnimatePresence>
        {phase === "analyzing" && hero && !notes.has(hero.id) && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 h-[18%] bg-gradient-to-b from-transparent via-white/45 to-transparent" style={{ animation: "scanline 2.2s ease-in-out infinite" }} />
          </div>
        )}
        <AnimatePresence>
          {hero && notes.get(hero.id) && (
            <motion.div
              key={`note-${hero.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1.5 text-[13px] font-medium text-ink shadow-sm"
            >
              {notes.get(hero.id)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Filmstrip */}
      {frames.length > 0 && (
        <div className="mt-3 grid grid-cols-8 gap-1.5">
          {frames.map((f) => {
            const done = notes.has(f.id);
            const active = hero?.id === f.id;
            return (
              <div key={f.id} className={`relative overflow-hidden rounded-[6px] transition-all duration-300 ${active ? "ring-2 ring-ink" : ""}`} style={{ aspectRatio: "1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.dataUrl} alt="" className={`h-full w-full object-cover transition-opacity duration-300 ${done || active ? "opacity-100" : "opacity-40"}`} />
                {done && !active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Signals tray */}
      <div className="mt-6 min-h-[120px]">
        <p className="text-caption">{chips.length ? "What we're noticing" : phase === "analyzing" ? " " : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <AnimatePresence>
            {chips.map((c) => (
              <motion.span
                key={c.key}
                layout
                initial={{ opacity: 0, scale: 0.6, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] ${
                  c.kind === "category"
                    ? "border-ink bg-ink text-white"
                    : c.kind === "brand"
                      ? "border-accent/50 bg-accent-soft text-ink"
                      : "border-line bg-white text-ink-2"
                }`}
              >
                {c.label}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        {a?.palette && a.palette.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {a.palette.map((p, i) =>
              p?.hex ? (
                <motion.span
                  key={p.hex + i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 20 }}
                  className="h-6 w-6 rounded-full border border-black/10"
                  style={{ background: p.hex }}
                  title={p.name}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      {phase === "error" && (
        <div className="mt-auto space-y-3 pt-6">
          <p className="text-body">{error ?? "We couldn't read this walkthrough."}</p>
          <p className="text-caption">Try filming your shelves in good light, without people or screens.</p>
          <Button onClick={() => router.replace("/onboarding/scan")}>Try again</Button>
          <Button variant="ghost" onClick={() => router.replace("/onboarding/done")}>
            Skip for now
          </Button>
        </div>
      )}
    </div>
  );
}

function ExtractRing({ progress }: { progress: { done: number; total: number } | null }) {
  const pct = progress ? progress.done / progress.total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="text-ink">
      <circle cx="36" cy="36" r={r} stroke="var(--line)" strokeWidth="4" fill="none" />
      <circle
        cx="36"
        cy="36"
        r={r}
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 250ms ease-out" }}
      />
    </svg>
  );
}
