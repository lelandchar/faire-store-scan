"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, Images, Play, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { SAMPLE_VIDEOS, type SampleStore } from "@/lib/samples";

export type DemoChoice =
  | { kind: "sample-video"; slug: string }
  | { kind: "sample-photos"; slug: string }
  | { kind: "own-record" }
  | { kind: "own-video" }
  | { kind: "own-photos" };

function Row({ icon, title, meta, onClick }: { icon: ReactNode; title: string; meta?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[var(--radius)] px-2 py-2 text-left transition-colors hover:bg-surface-2 active:bg-surface-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-surface-2 text-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{title}</span>
        {meta && <span className="text-caption block truncate">{meta}</span>}
      </span>
      <span className="text-muted">›</span>
    </button>
  );
}

export function DemoSheet({
  open,
  mode,
  photoSets,
  onClose,
  onChoose,
}: {
  open: boolean;
  mode: "record" | "upload" | null;
  photoSets: SampleStore[];
  onClose: () => void;
  onChoose: (c: DemoChoice) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="ov" className="absolute inset-0 z-30 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            key="sheet"
            className="absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-[16px] bg-white pb-[max(16px,env(safe-area-inset-bottom))]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="px-5 pt-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-line" />
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <span className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Demo purposes only</span>
                  <p className="mt-2 text-[17px] font-semibold text-ink">{mode === "record" ? "Film your store" : "Add your store"}</p>
                  <p className="text-caption mt-0.5">Pick a pre-recorded walkthrough to see the whole flow, or use your own.</p>
                </div>
                <button type="button" aria-label="Close" onClick={onClose} className="mt-1 text-muted">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none]">
              <p className="text-caption px-2 pt-2 uppercase tracking-[0.1em]">Pre-recorded walkthroughs</p>
              {SAMPLE_VIDEOS.map((v) => (
                <Row
                  key={v.slug}
                  onClick={() => onChoose({ kind: "sample-video", slug: v.slug })}
                  title={v.name}
                  meta={v.tagline}
                  icon={
                    <span className="relative h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.poster} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow">
                        <Play size={14} fill="currentColor" />
                      </span>
                    </span>
                  }
                />
              ))}
              {photoSets.length > 0 && <p className="text-caption px-2 pt-3 uppercase tracking-[0.1em]">Example photo sets</p>}
              {photoSets.map((s) => (
                <Row
                  key={s.slug}
                  onClick={() => onChoose({ kind: "sample-photos", slug: s.slug })}
                  title={s.name}
                  meta={`${s.photos.length} photos · ${s.tagline}`}
                  icon={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/samples/${s.slug}/cover.jpg`} alt="" className="h-full w-full object-cover" />
                  }
                />
              ))}
              <p className="text-caption px-2 pt-3 uppercase tracking-[0.1em]">Use your own</p>
              <Row onClick={() => onChoose({ kind: "own-record" })} title="Record a video now" meta="Opens your camera" icon={<Camera size={20} strokeWidth={1.75} />} />
              <Row onClick={() => onChoose({ kind: "own-video" })} title="Upload a video" meta="10 to 20 seconds works best" icon={<Upload size={20} strokeWidth={1.75} />} />
              <Row onClick={() => onChoose({ kind: "own-photos" })} title="Upload photos" meta="4 to 6 wide shots of your store" icon={<Images size={20} strokeWidth={1.75} />} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
