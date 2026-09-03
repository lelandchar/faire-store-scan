"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronLeft, Images, Play, Upload, X } from "lucide-react";
import { useId, useState, type DragEvent, type ReactNode } from "react";
import { SAMPLE_VIDEOS, type SampleStore } from "@/lib/samples";

export type DemoChoice = { kind: "sample-video"; slug: string } | { kind: "sample-photos"; slug: string };

type OwnKind = "record" | "video" | "photos";

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

/** Pick files from the device or drop them on the panel; a real file input, so every browser opens its picker. */
export function FileDropPanel({ kind, onFiles, onBack }: { kind: OwnKind; onFiles: (files: File[]) => void; onBack?: () => void }) {
  const [over, setOver] = useState(false);
  const inputId = useId();
  const isPhotos = kind === "photos";
  const copy =
    kind === "photos"
      ? { title: "Drag and drop 4 to 10 photos here", hint: "Wide shots, about 4 feet from your shelves", cta: "Choose photos", Icon: Images }
      : kind === "record"
        ? { title: "Record a walkthrough", hint: "On a phone this opens the camera. On a computer, pick a video you already have.", cta: "Open camera or choose a video", Icon: Camera }
        : { title: "Drag and drop a video here", hint: "10 to 20 seconds works best. MP4 or MOV, any phone is fine.", cta: "Choose a video", Icon: Upload };
  const take = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).filter((f) => (isPhotos ? f.type.startsWith("image/") : f.type.startsWith("video/") || f.type.startsWith("image/")));
    if (files.length) onFiles(files);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };
  return (
    <div className="px-5 pb-3">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 py-1 text-[13px] text-ink-2">
          <ChevronLeft size={16} strokeWidth={1.75} /> All options
        </button>
      )}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border-2 border-dashed px-4 py-7 text-center transition-colors ${
          over ? "border-ink bg-warm" : "border-line bg-surface-2"
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm">
          <copy.Icon size={20} strokeWidth={1.75} />
        </span>
        <span className="mt-1 text-[15px] font-medium text-ink">{copy.title}</span>
        <span className="text-caption max-w-[260px]">{copy.hint}</span>
        <span className="mt-3 inline-flex h-10 items-center rounded-[var(--radius)] bg-ink px-4 text-[14px] font-medium text-white">{copy.cta}</span>
        <input
          id={inputId}
          type="file"
          accept={isPhotos ? "image/*" : "video/*"}
          multiple={isPhotos}
          capture={kind === "record" ? "environment" : undefined}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-caption mt-3">Your video is read on this device. Only a few small frames are sent.</p>
    </div>
  );
}

function SheetContent({
  mode,
  photoSets,
  onClose,
  onChoose,
  onFiles,
}: {
  mode: "record" | "upload" | null;
  photoSets: SampleStore[];
  onClose: () => void;
  onChoose: (c: DemoChoice) => void;
  onFiles: (files: File[]) => void;
}) {
  const [view, setView] = useState<"list" | OwnKind>("list");
  return (
    <>
      <div className="px-5 pt-3">
        <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Demo purposes only</span>
            <p className="mt-2 text-[17px] font-semibold text-ink">
              {view === "video" ? "Upload a video" : view === "photos" ? "Upload photos" : view === "record" ? "Record a video" : mode === "record" ? "Film your store" : "Add your store"}
            </p>
            {view === "list" && <p className="text-caption mt-0.5">Pick a pre-recorded walkthrough to see the whole flow, or use your own.</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="mt-1 text-muted">
            <X size={20} />
          </button>
        </div>
      </div>
      {view !== "list" ? (
        <div className="mt-2">
          <FileDropPanel kind={view} onFiles={onFiles} onBack={() => setView("list")} />
        </div>
      ) : (
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
          <Row onClick={() => setView("record")} title="Record a video now" meta="Opens your camera" icon={<Camera size={20} strokeWidth={1.75} />} />
          <Row onClick={() => setView("video")} title="Upload a video" meta="Drag and drop, or choose a file" icon={<Upload size={20} strokeWidth={1.75} />} />
          <Row onClick={() => setView("photos")} title="Upload photos" meta="4 to 10 wide shots of your store" icon={<Images size={20} strokeWidth={1.75} />} />
        </div>
      )}
    </>
  );
}

export function DemoSheet({
  open,
  mode,
  photoSets,
  onClose,
  onChoose,
  onFiles,
}: {
  open: boolean;
  mode: "record" | "upload" | null;
  photoSets: SampleStore[];
  onClose: () => void;
  onChoose: (c: DemoChoice) => void;
  onFiles: (files: File[]) => void;
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
            {/* Mounted only while open, so the panel always reopens on the list. */}
            <SheetContent mode={mode} photoSets={photoSets} onClose={onClose} onChoose={onChoose} onFiles={onFiles} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
