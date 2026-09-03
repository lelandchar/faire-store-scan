"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { runAnalysis } from "@/lib/analyze-client";
import { extractFramesFromVideo, framesFromImages, framesFromUrls } from "@/lib/frames";
import { takePendingInput, type PendingInput } from "@/lib/pending";
import { styleLabel } from "@/lib/ranking";
import { profileFromAnalysis, useOnboarding } from "@/lib/store";
import type { Analysis, Frame, Share } from "@/lib/types";

type Phase = "loading" | "extracting" | "analyzing" | "done" | "error";

const SHARE_LABEL: Record<Share, string> = {
  dominant: "Most of your shelves",
  strong: "A strong section",
  present: "A few pieces",
  trace: "A hint of it",
};

function statusFor(a: Partial<Analysis> | null, phase: Phase): string {
  switch (phase) {
    case "loading":
      return "Getting your video ready";
    case "extracting":
      return "Pulling the clearest moments from your video";
    case "done":
      return "Got it.";
    case "error":
      return "Hmm.";
  }
  if (!a) return "Looking at what's on your shelves";
  if (a.suggested_complements) return "Almost there";
  if (a.styles || a.palette) return "Noticing your style";
  if (a.categories) return "Sorting what's on your shelves";
  if (a.frame_notes) return "Looking at each shelf";
  if (a.store_read) return "Writing you a note about your store";
  return "Looking at what's on your shelves";
}

function Stage({ index, title, state, children }: { index: number; title: string; state: "active" | "done" | "pending"; children?: ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }} className="mt-7">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${
            state === "done" ? "border-success bg-success text-white" : state === "active" ? "border-ink bg-ink text-white" : "border-line text-muted"
          }`}
        >
          {state === "done" ? <Check size={13} strokeWidth={3} /> : index}
        </span>
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

export default function AnalyzingPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ index: number; dataUrl: string; timestampMs: number }[]>([]);
  const [kept, setKept] = useState<number[] | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setInterval(() => setScanIdx((i) => i + 1), 850);
    return () => clearInterval(t);
  }, [phase]);
  const started = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  async function run(input: PendingInput) {
    try {
      dispatch({ type: "setAnalysisStatus", status: "extracting" });
      dispatch({ type: "setAnalysis", analysis: null });
      dispatch({ type: "setProfile", profile: null });
      dispatch({ type: "setRetrieval", retrieval: null });
      dispatch({ type: "setRetrievalStatus", status: "idle" });
      const onCandidate = (c: { index: number; dataUrl: string; timestampMs: number }) => setCandidates((prev) => [...prev, c]);
      const onSelected = (idx: number[]) => setKept(idx);
      let frames: Frame[] = [];
      if (input.kind === "video") {
        setPhase("extracting");
        frames = await extractFramesFromVideo(input.file, { onCandidate, onSelected });
      } else if (input.kind === "photos") {
        setPhase("extracting");
        frames = await framesFromImages(input.files, { onCandidate, onSelected });
      } else if (input.kind === "sample-photos") {
        setPhase("extracting");
        frames = await framesFromUrls(input.urls, { onCandidate, onSelected });
      } else {
        setPhase("loading");
        const blob = await (await fetch(input.url)).blob();
        const file = new File([blob], "sample.mp4", { type: blob.type || "video/mp4" });
        setPhase("extracting");
        frames = await extractFramesFromVideo(file, { onCandidate, onSelected });
      }
      if (!frames.length) throw new Error("We couldn't find usable frames in that walkthrough.");
      dispatch({ type: "setFrames", frames });

      setPhase("analyzing");
      dispatch({ type: "setAnalysisStatus", status: "analyzing" });
      const t0 = performance.now();
      const analysis = await runAnalysis({
        frames,
        context: {
          storeName: state.storeName || undefined,
          storeType: state.storeCategory || undefined,
          description: state.description || undefined,
          sampleSlug: state.sampleSlug || undefined,
        },
        onPartial: (p) => dispatch({ type: "setAnalysis", analysis: p }),
        onMeta: (m) => dispatch({ type: "setAnalysisMeta", meta: { ...m, ms: Math.round(performance.now() - t0) } }),
      });
      dispatch({ type: "setAnalysis", analysis });
      dispatch({
        type: "setProfile",
        profile: profileFromAnalysis(analysis, { storeName: state.storeName, storeType: state.storeCategory ?? "", description: state.description }),
      });
      dispatch({ type: "setAnalysisStatus", status: "done" });

      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setPhase("error");
      dispatch({ type: "setAnalysisStatus", status: "error", error: msg });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const input = takePendingInput();
    if (!input) {
      router.replace(state.analysisStatus === "done" && state.profile ? "/onboarding/profile" : "/onboarding/scan");
      return;
    }
    // Kick off asynchronously so the effect itself does not set state. No cleanup on
    // purpose: StrictMode's simulated unmount must not cancel a run that already
    // consumed the pending input.
    setTimeout(() => void run(input), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = state.analysis;
  const frames = state.frames;
  const status = statusFor(a, phase);
  const notes = useMemo(
    () => new Map((a?.frame_notes ?? []).filter((n) => n?.frame_id && n?.what_we_saw).map((n) => [n.frame_id, n.what_we_saw])),
    [a?.frame_notes],
  );
  const cats = (a?.categories ?? []).filter((c) => c?.name);
  const styles = (a?.styles ?? []).filter((s) => s?.name);
  const complements = (a?.suggested_complements ?? []).filter((c) => c?.category);
  const summary = a?.store_read?.summary;
  // Keep the newest information in view as it streams in.
  const version = `${phase}|${candidates.length}|${kept?.length ?? 0}|${notes.size}|${cats.length}|${styles.length}|${complements.length}|${summary ? 1 : 0}`;
  useEffect(() => {
    const t = setTimeout(() => sentinel.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 120);
    return () => clearTimeout(t);
  }, [version]);

  const stage1: "active" | "done" = phase === "loading" || phase === "extracting" ? "active" : "done";
  const stage2: "active" | "done" | "pending" = phase === "analyzing" ? "active" : phase === "done" ? "done" : "pending";

  return (
    <div className="flex min-h-full flex-1 flex-col px-6 pb-10 pt-8">
      <p className="text-caption uppercase tracking-[0.14em]">Store scan</p>
      <h1 className="text-display-sm mt-2">Reading your shelves</h1>
      <div className="mt-2 flex min-h-6 items-center gap-2 text-body">
        <AnimatePresence mode="wait">
          <motion.span key={status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className={phase === "done" ? "text-ink" : "text-muted"}>
            {status}
            {phase !== "done" && phase !== "error" ? <span className="pulse-soft">…</span> : null}
          </motion.span>
        </AnimatePresence>
        {phase === "done" && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </div>

      {/* Stage 1: the video becomes frames, live */}
      <Stage index={1} title="Your walkthrough" state={stage1}>
        {candidates.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-[var(--radius-lg)] bg-surface-2 text-caption">{phase === "loading" ? "Loading the clip" : "Decoding the first frames"}</div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {candidates.map((c) => {
              const isKept = kept ? kept.includes(c.index) : true;
              return (
                <motion.button
                  type="button"
                  aria-label="View frame"
                  onClick={() => setLightbox(c.dataUrl)}
                  key={c.index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: kept && !isKept ? 0.3 : 1, scale: 1 }}
                  transition={{ duration: 0.35 }}
                  className="relative overflow-hidden rounded-[6px] bg-surface-2"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.dataUrl} alt="" className="h-full w-full object-cover" />
                  {kept && isKept && (
                    <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-ink shadow-sm">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
        <div className="text-caption mt-2 space-y-0.5">
          {candidates.length > 0 && (
            <p>
              {kept ? `Sampled ${candidates.length} images.` : `Sampling ${candidates.length} images`}
              {!kept && <span className="pulse-soft">…</span>}
            </p>
          )}
          <AnimatePresence>
            {kept && (
              <motion.p key="keep" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                Keeping the {kept.length} clearest. Tap any image to look closer. Your video itself never leaves your phone.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Stage>

      {/* Stage 2: the read, streaming in the retailer's language */}
      {stage2 !== "pending" && (
        <Stage index={2} title="A note about your store" state={stage2}>
          {summary && (
            <motion.p key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 font-serif text-[18px] leading-[1.35] text-ink">
              {summary}
            </motion.p>
          )}
          {frames.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {frames.map((f, i) => {
                const scanning = phase === "analyzing" && scanIdx % frames.length === i;
                const note = notes.get(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-label="View frame"
                    onClick={() => setLightbox(f.dataUrl)}
                    className={`relative overflow-hidden rounded-[8px] bg-surface-2 transition-shadow ${scanning ? "ring-2 ring-ink" : ""}`}
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.dataUrl} alt="" className="h-full w-full object-cover" />
                    {scanning && (
                      <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        <div className="absolute inset-x-0 h-[22%] bg-gradient-to-b from-transparent via-white/55 to-transparent" style={{ animation: "scanline 0.85s ease-in-out infinite" }} />
                      </div>
                    )}
                    <AnimatePresence>
                      {note && (
                        <motion.span
                          key={`note-${f.id}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-x-1 bottom-1 truncate rounded-full bg-white/95 px-2 py-1 text-left text-[11px] font-medium text-ink shadow-sm"
                        >
                          {note}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          )}

          <AnimatePresence initial={false}>
            {cats.length > 0 && (
              <motion.div key="cats" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="text-caption uppercase tracking-[0.1em]">On your shelves</p>
                <ul className="mt-2 space-y-2">
                  {cats.map((c) => (
                    <motion.li key={c.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-baseline justify-between gap-3">
                      <span className="text-[15px] font-medium text-ink">{c.name}</span>
                      <span className="text-caption text-right">{c.share ? SHARE_LABEL[c.share] : ""}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
            {styles.length > 0 && (
              <motion.div key="look" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="text-caption uppercase tracking-[0.1em]">Your look</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {styles.map((s) => (
                    <motion.span key={s.name} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[13px] text-white">
                      {styleLabel(s.name)}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
            {complements.length > 0 && (
              <motion.div key="comp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="text-caption uppercase tracking-[0.1em]">Would pair well</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {complements.map((c) => (
                    <span key={c.category} className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-[13px] text-ink-2">
                      + {c.category}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Stage>
      )}

      {phase === "error" && (
        <div className="mt-8 space-y-3">
          <p className="text-body">{error ?? "We couldn't read this walkthrough."}</p>
          <p className="text-caption">Try filming your shelves in good light, without people or screens.</p>
          <Button onClick={() => router.replace("/onboarding/scan")}>Try again</Button>
          <Button variant="ghost" onClick={() => router.replace("/home")}>
            Skip for now
          </Button>
        </div>
      )}
      {phase === "done" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="sticky bottom-0 -mx-6 mt-8 border-t border-line bg-white/95 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
          <Button onClick={() => router.push("/onboarding/profile")}>Review what we found</Button>
          <p className="text-caption mt-2 text-center">Next: confirm your assortment, your style, and two dials.</p>
        </motion.div>
      )}
      <div ref={sentinel} className="h-1" />

      <AnimatePresence>
        {lightbox && (
          <motion.button
            type="button"
            aria-label="Close"
            key="lightbox"
            onClick={() => setLightbox(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" className="max-h-full max-w-full rounded-[8px] object-contain" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
