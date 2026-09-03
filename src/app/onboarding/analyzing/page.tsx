"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { runAnalysis } from "@/lib/analyze-client";
import {
  extractFramesFromVideo,
  framesFromImages,
  framesFromUrls,
} from "@/lib/frames";
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

/** One sweep per frame; slow enough to read as "looking", not "flashing". */
const SWEEP_MS = 1700;
/** Reveal pace for sampled frames and the pause between the selection and the note stage. */
const REVEAL_MS = 110;
const STAGE_PAUSE_MS = 1400;

const THINKING_STEPS = [
  "Looking at what's on your shelves",
  "Comparing the shelves to each other",
  "Working out how the sections fit together",
  "Thinking about what your store is really about",
  "Choosing the words for your note",
  "Double-checking against the frames",
  "Nearly there",
];

const DURATIONS_KEY = "store-scan-durations-v1";
/** End-to-end expectation (frames + read) before this device has seen a run. */
const DEFAULT_EXPECTED_MS = 58_000;

function readDurations(): number[] {
  try {
    const raw = localStorage.getItem(DURATIONS_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter(
          (n): n is number => typeof n === "number" && n > 3000 && n < 600_000,
        )
      : [];
  } catch {
    return [];
  }
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function humanDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 40) return "about half a minute";
  if (s < 100) return "about a minute";
  return `about ${Math.round(s / 60)} minutes`;
}
/** Reaches 90% at the expected time, then creeps toward 97% so a slow run never looks stuck. */
function progressFor(elapsedMs: number, expectedMs: number): number {
  const t = elapsedMs / Math.max(1000, expectedMs);
  return t <= 1
    ? 90 * t
    : Math.min(97, 90 + 7 * (1 - Math.exp(-(t - 1) * 1.4)));
}

function statusFor(
  a: Partial<Analysis> | null,
  phase: Phase,
  thinkingChars = 0,
): string {
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
  if (!a)
    return thinkingChars > 0
      ? THINKING_STEPS[
          Math.min(THINKING_STEPS.length - 1, Math.floor(thinkingChars / 2500))
        ]
      : "Looking at what's on your shelves";
  if (a.suggested_complements) return "Almost there";
  if (a.styles || a.palette) return "Noticing your style";
  if (a.categories) return "Sorting what's on your shelves";
  if (a.frame_notes) return "Looking at each shelf";
  if (a.store_read) return "Writing you a note about your store";
  return "Looking at what's on your shelves";
}

function Stage({
  index,
  title,
  state,
  children,
}: {
  index: number;
  title: string;
  state: "active" | "done" | "pending";
  children?: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      className="mt-7"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${
            state === "done"
              ? "border-success bg-success text-white"
              : state === "active"
                ? "border-ink bg-ink text-white"
                : "border-line text-muted"
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
  const [candidates, setCandidates] = useState<
    { index: number; dataUrl: string; timestampMs: number }[]
  >([]);
  const [kept, setKept] = useState<number[] | null>(null);
  const [inputKind, setInputKind] = useState<"video" | "photos">("video");
  // Frames decode faster than the eye can follow; reveal them at a steady pace and give the
  // selection a beat before the note stage slides into view.
  const revealQueue = useRef<
    { index: number; dataUrl: string; timestampMs: number }[]
  >([]);
  const draining = useRef(false);
  const revealNext = () => {
    const next = revealQueue.current.shift();
    if (!next) {
      draining.current = false;
      return;
    }
    draining.current = true;
    setCandidates((prev) => [...prev, next]);
    setTimeout(revealNext, REVEAL_MS);
  };
  const enqueueCandidate = (c: {
    index: number;
    dataUrl: string;
    timestampMs: number;
  }) => {
    revealQueue.current.push(c);
    if (!draining.current) revealNext();
  };
  const settleSelection = (idx: number[]) => {
    if (revealQueue.current.length || draining.current) {
      setTimeout(() => settleSelection(idx), 120);
      return;
    }
    setKept(idx);
  };
  const [stage2Ready, setStage2Ready] = useState(false);
  useEffect(() => {
    if (!kept) return;
    const t = setTimeout(() => setStage2Ready(true), STAGE_PAUSE_MS);
    return () => clearTimeout(t);
  }, [kept]);
  const stage2Ref = useRef<HTMLDivElement>(null);
  const stage3Ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(
      () =>
        stage3Ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      150,
    );
    return () => clearTimeout(t);
  }, [phase]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  const [thinking, setThinking] = useState(0);
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setInterval(() => setScanIdx((i) => i + 1), SWEEP_MS);
    return () => clearInterval(t);
  }, [phase]);
  const started = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  // Overall progress, paced against the median end-to-end time.
  const runStart = useRef(0);
  const localSamples = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [expected, setExpected] = useState(DEFAULT_EXPECTED_MS);
  useEffect(() => {
    if (phase === "done" || phase === "error") return;
    const t = setInterval(
      () => setElapsed(performance.now() - runStart.current),
      200,
    );
    return () => clearInterval(t);
  }, [phase]);

  async function run(input: PendingInput) {
    try {
      runStart.current = performance.now();
      const seen = readDurations();
      localSamples.current = seen.length;
      const med = median(seen);
      if (med) setExpected(med);
      dispatch({ type: "setAnalysisStatus", status: "extracting" });
      dispatch({ type: "setAnalysisMeta", meta: null });
      dispatch({ type: "setAnalysis", analysis: null });
      dispatch({ type: "setProfile", profile: null });
      dispatch({ type: "setRetrieval", retrieval: null });
      dispatch({ type: "setRetrievalStatus", status: "idle" });
      const onCandidate = enqueueCandidate;
      const onSelected = settleSelection;
      setInputKind(
        input.kind === "photos" || input.kind === "sample-photos"
          ? "photos"
          : "video",
      );
      let frames: Frame[] = [];
      if (input.kind === "video") {
        setPhase("extracting");
        frames = await extractFramesFromVideo(input.file, {
          onCandidate,
          onSelected,
        });
      } else if (input.kind === "photos") {
        setPhase("extracting");
        frames = await framesFromImages(input.files, {
          onCandidate,
          onSelected,
        });
      } else if (input.kind === "sample-photos") {
        setPhase("extracting");
        frames = await framesFromUrls(input.urls, { onCandidate, onSelected });
      } else {
        setPhase("loading");
        const blob = await (await fetch(input.url)).blob();
        const file = new File([blob], "sample.mp4", {
          type: blob.type || "video/mp4",
        });
        setPhase("extracting");
        frames = await extractFramesFromVideo(file, {
          onCandidate,
          onSelected,
        });
      }
      if (!frames.length)
        throw new Error("We couldn't find usable frames in that walkthrough.");
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
        onMeta: (m) => {
          dispatch({
            type: "setAnalysisMeta",
            meta: { ...m, ms: Math.round(performance.now() - t0) },
          });
          // First runs on this device: trust the server's median plus the time frames already took.
          if (m.p50Ms && localSamples.current < 2)
            setExpected(performance.now() - runStart.current + m.p50Ms);
        },
        onThinking: (chars) => setThinking(chars),
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
      const total = Math.round(performance.now() - runStart.current);
      setElapsed(total);
      try {
        localStorage.setItem(
          DURATIONS_KEY,
          JSON.stringify([...readDurations(), total].slice(-12)),
        );
      } catch {
        /* private mode */
      }

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
      router.replace(
        state.analysisStatus === "done" && state.profile
          ? "/onboarding/profile"
          : "/onboarding/scan",
      );
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
  const status = statusFor(a, phase, thinking);
  const notes = useMemo(
    () =>
      new Map(
        (a?.frame_notes ?? [])
          .filter((n) => n?.frame_id && n?.what_we_saw)
          .map((n) => [n.frame_id, n.what_we_saw]),
      ),
    [a?.frame_notes],
  );
  const cats = (a?.categories ?? []).filter((c) => c?.name);
  const styles = (a?.styles ?? []).filter((s) => s?.name);
  const complements = (a?.suggested_complements ?? []).filter(
    (c) => c?.category,
  );
  const summary = a?.store_read?.summary;
  // Keep the newest information in view as it streams in, unless the retailer has
  // scrolled up to look at something: then only a stage change moves the view.
  const version = `${phase}|${candidates.length}|${kept?.length ?? 0}|${notes.size}|${cats.length}|${styles.length}|${complements.length}|${Math.floor((summary?.length ?? 0) / 60)}`;
  const lastPhase = useRef(phase);
  useEffect(() => {
    const phaseChanged = lastPhase.current !== phase;
    lastPhase.current = phase;
    // The hand-off to the note stage is choreographed separately (see stage2Ready).
    if (!stage2Ready && phase !== "done" && phase !== "error") return;
    const el = sentinel.current?.closest(".screen");
    const nearBottom =
      !(el instanceof HTMLElement) ||
      el.scrollHeight - el.scrollTop - el.clientHeight < 260;
    if (!nearBottom && !phaseChanged) return;
    const t = setTimeout(
      () =>
        sentinel.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      120,
    );
    return () => clearTimeout(t);
  }, [version, phase, stage2Ready]);

  const stage1: "active" | "done" =
    phase === "loading" || phase === "extracting" || !kept ? "active" : "done";
  const stage2: "active" | "done" | "pending" = !stage2Ready
    ? "pending"
    : phase === "analyzing"
      ? "active"
      : phase === "done"
        ? "done"
        : "pending";
  useEffect(() => {
    if (!stage2Ready) return;
    const t = setTimeout(
      () =>
        stage2Ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      80,
    );
    return () => clearTimeout(t);
  }, [stage2Ready]);

  return (
    <div
      className={`flex min-h-full grow shrink-0 flex-col px-6 pt-8 ${phase === "done" ? "pb-0" : "pb-24"}`}
    >
      <p className="text-caption uppercase tracking-[0.14em]">Store scan</p>
      <h1 className="text-display-sm mt-2">Reading your shelves</h1>
      {/* Status and progress stay pinned while the page auto-scrolls through the stages. */}
      <div className="sticky top-0 z-20 -mx-6 bg-white/95 px-6 pb-2.5 pt-2 backdrop-blur">
        <div className="flex min-h-6 items-center gap-2 text-body">
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
              {phase !== "done" && phase !== "error" ? (
                <span className="pulse-soft">…</span>
              ) : null}
            </motion.span>
          </AnimatePresence>
          {phase === "done" && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"
            >
              <Check size={12} strokeWidth={3} />
            </motion.span>
          )}
        </div>
        {phase !== "error" && (
          <div className="mt-3" aria-hidden>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-ink"
                style={{
                  width: `${phase === "done" ? 100 : progressFor(elapsed, expected)}%`,
                  transition: "width 0.3s linear",
                }}
              />
            </div>
            <p className="text-caption mt-1.5">
              {phase === "done"
                ? `Done in ${Math.max(1, Math.round(elapsed / 1000))} seconds`
                : `Usually takes ${humanDuration(expected)}`}
            </p>
          </div>
        )}
      </div>

      {/* Stage 1: the video becomes frames, live */}
      <Stage
        index={1}
        title={inputKind === "photos" ? "Your photos" : "Your walkthrough"}
        state={stage1}
      >
        {candidates.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-[var(--radius-lg)] bg-surface-2 text-caption">
            {phase === "loading"
              ? "Loading the clip"
              : "Decoding the first frames"}
          </div>
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
                  <img
                    src={c.dataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm"
                    aria-hidden
                  >
                    <Maximize2 size={11} strokeWidth={2.25} />
                  </span>
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
        <div className="text-caption mt-2">
          {candidates.length > 0 && !kept && (
            <p>
              {inputKind === "photos"
                ? "Loading your photos"
                : `Sampling ${candidates.length} images from your video`}
              <span className="pulse-soft">…</span>
            </p>
          )}
          <AnimatePresence>
            {kept && (
              <motion.p
                key="keep"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {inputKind === "photos"
                  ? `Captured ${kept.length} photos of your store.`
                  : `Captured ${kept.length} high-quality images from your video.`}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Stage>

      {/* Stage 2: the read, streaming in the retailer's language */}
      {stage2 !== "pending" && (
        <div ref={stage2Ref} className="scroll-mt-[96px]">
          <Stage index={2} title="Analyzing your images" state={stage2}>
            {frames.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {frames.map((f, i) => {
                  const scanning =
                    phase === "analyzing" && scanIdx % frames.length === i;
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
                      <img
                        src={f.dataUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm"
                        aria-hidden
                      >
                        <Maximize2 size={12} strokeWidth={2.25} />
                      </span>
                      {scanning && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                          <div
                            className="absolute inset-x-0 h-[22%] bg-gradient-to-b from-transparent via-white/55 to-transparent"
                            style={{
                              animation: `scanline ${SWEEP_MS}ms ease-in-out infinite`,
                            }}
                          />
                        </div>
                      )}
                      <AnimatePresence>
                        {note && (
                          <motion.span
                            key={`note-${f.id}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-x-1 bottom-1 line-clamp-2 rounded-[6px] bg-white/95 px-2 py-1 text-left text-[11px] font-medium leading-snug text-ink shadow-sm"
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
          </Stage>
        </div>
      )}

      {/* Stage 3: what the read adds up to, once the images are done */}
      {phase === "done" && a && (
        <div ref={stage3Ref} className="scroll-mt-[96px]">
          <Stage index={3} title="Your store's unique taste" state="done">
            {summary && (
              <motion.p
                key="summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-serif text-[18px] leading-[1.35] text-ink"
              >
                {summary}
              </motion.p>
            )}
            <AnimatePresence initial={false}>
              {cats.length > 0 && (
                <motion.div
                  key="cats"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <p className="text-caption uppercase tracking-[0.1em]">
                    On your shelves
                  </p>
                  <ul className="mt-2 space-y-2">
                    {cats.map((c) => (
                      <motion.li
                        key={c.name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="text-[15px] font-medium text-ink">
                          {c.name}
                        </span>
                        <span className="text-caption text-right">
                          {c.share ? SHARE_LABEL[c.share] : ""}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {styles.length > 0 && (
                <motion.div
                  key="look"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <p className="text-caption uppercase tracking-[0.1em]">
                    Your look
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {styles.map((s) => (
                      <motion.span
                        key={s.name}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[13px] text-white"
                      >
                        {styleLabel(s.name)}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}
              {complements.length > 0 && (
                <motion.div
                  key="comp"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <p className="text-caption uppercase tracking-[0.1em]">
                    Would pair well
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {complements.map((c) => (
                      <span
                        key={c.category}
                        className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-[13px] text-ink-2"
                      >
                        + {c.category}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Stage>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-8 space-y-3">
          <p className="text-body">
            {error ?? "We couldn't read this walkthrough."}
          </p>
          <p className="text-caption">
            Try filming your shelves in good light, without people or screens.
          </p>
          <Button onClick={() => router.replace("/onboarding/scan")}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => router.replace("/home")}>
            Skip for now
          </Button>
        </div>
      )}
      <div ref={sentinel} className="h-1" />
      {phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-0 -mx-6 mt-8 border-t border-line bg-white/95 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 backdrop-blur"
        >
          <Button onClick={() => router.push("/onboarding/profile")}>
            Review what we found
          </Button>
        </motion.div>
      )}

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
            <img
              src={lightbox}
              alt=""
              className="max-h-full max-w-full rounded-[8px] object-contain"
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
