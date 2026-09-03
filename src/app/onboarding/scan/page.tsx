"use client";

import { Camera, EyeOff, Play, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DoDont } from "@/components/DoDont";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { setPendingInput } from "@/lib/pending";
import { loadSampleManifest, samplePhotoUrl, SAMPLE_VIDEOS, type SampleStore } from "@/lib/samples";
import { useOnboarding } from "@/lib/store";

const TIPS = [
  { Icon: Camera, text: "Slow pan across your shelves, 10 to 20 seconds" },
  { Icon: Sun, text: "Good light. No need to tidy up first" },
  { Icon: EyeOff, text: "Skip people, screens and receipts" },
];

export default function ScanPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const recordRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<SampleStore[]>([]);

  useEffect(() => {
    loadSampleManifest().then(setSamples);
  }, []);

  const go = () => router.push("/onboarding/analyzing");

  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const video = files.find((f) => f.type.startsWith("video/"));
    if (video) {
      setPendingInput({ kind: "video", file: video });
      dispatch({ type: "setSource", source: "video" });
    } else {
      const photos = files.filter((f) => f.type.startsWith("image/"));
      if (!photos.length) return;
      setPendingInput({ kind: "photos", files: photos });
      dispatch({ type: "setSource", source: "photos" });
    }
    go();
  };

  const fillDetailsIfEmpty = (name: string, storeType: string, tagline: string) => {
    if (!state.storeName) dispatch({ type: "setDetails", storeName: name, description: tagline });
    if (!state.storeCategory) dispatch({ type: "setStoreCategory", value: storeType });
  };

  const pickVideoSample = (s: (typeof SAMPLE_VIDEOS)[number]) => {
    fillDetailsIfEmpty(s.name, s.storeType, s.tagline);
    setPendingInput({ kind: "sample-video", slug: s.slug, url: s.file });
    dispatch({ type: "setSource", source: "sample", sampleSlug: s.slug });
    go();
  };

  const pickPhotoSample = (s: SampleStore) => {
    fillDetailsIfEmpty(s.name, s.storeType, s.tagline);
    setPendingInput({ kind: "sample-photos", slug: s.slug, urls: s.photos.map((p) => samplePhotoUrl(s, p)) });
    dispatch({ type: "setSource", source: "sample", sampleSlug: s.slug });
    go();
  };

  return (
    <Screen back="/onboarding/store-category" title="Show us your shelves" subtitle="A 15-second walkthrough lets Faire personalize your feed from day one.">
      <div className="mt-5">
        <p className="text-label">What a good walkthrough looks like</p>
        <div className="mt-3 rise">
          <DoDont />
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {TIPS.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-[14px] text-ink-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink">
              <Icon size={14} strokeWidth={1.75} />
            </span>
            {text}
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-3">
        <Button onClick={() => recordRef.current?.click()}>
          <span className="inline-flex items-center gap-2">
            <Camera size={18} strokeWidth={1.75} /> Record a walkthrough
          </span>
        </Button>
        <Button variant="secondary" onClick={() => uploadRef.current?.click()}>
          <span className="inline-flex items-center gap-2">
            <Upload size={18} strokeWidth={1.75} /> Upload video or photos
          </span>
        </Button>
        <input
          ref={recordRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="video/*,image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      <p className="text-caption mt-4">
        Your video stays on your phone. We only send a handful of still frames, and you can delete them anytime.
      </p>

      <div className="mt-8">
        <p className="text-label">Or try a sample store</p>
        <div className="-mx-6 mt-3 flex gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">
          {SAMPLE_VIDEOS.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => pickVideoSample(s)}
              className="w-[150px] shrink-0 text-left"
            >
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-surface-2" style={{ aspectRatio: "3 / 4" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.poster} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-ink">
                  <Play size={10} fill="currentColor" /> Video
                </span>
              </div>
              <p className="mt-2 text-[15px] font-medium text-ink">{s.name}</p>
              <p className="text-caption">{s.tagline}</p>
            </button>
          ))}
          {samples.map((s) => (
            <button key={s.slug} type="button" onClick={() => pickPhotoSample(s)} className="w-[150px] shrink-0 text-left">
              <div className="overflow-hidden rounded-[var(--radius-lg)] bg-surface-2" style={{ aspectRatio: "3 / 4" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/samples/${s.slug}/cover.jpg`} alt="" className="h-full w-full object-cover" />
              </div>
              <p className="mt-2 text-[15px] font-medium text-ink">{s.name}</p>
              <p className="text-caption">
                {s.photos.length} photos · {s.tagline}
              </p>
            </button>
          ))}
        </div>
      </div>

      <Link href="/onboarding/done" className="mt-4 block py-3 text-center text-[15px] text-muted underline underline-offset-4">
        Skip for now
      </Link>
    </Screen>
  );
}
