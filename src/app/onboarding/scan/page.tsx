"use client";

import { Camera, EyeOff, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DemoSheet, type DemoChoice } from "@/components/DemoSheet";
import { DoDont } from "@/components/DoDont";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { setPendingInput } from "@/lib/pending";
import { loadSampleManifest, samplePhotoUrl, SAMPLE_VIDEOS, type SampleStore } from "@/lib/samples";
import { useOnboarding } from "@/lib/store";

const TIPS = [
  { Icon: Camera, text: "Slow pan, about 4 feet from your shelves, 10 to 20 seconds" },
  { Icon: Sun, text: "Good light. No need to tidy up first" },
  { Icon: EyeOff, text: "Skip people, screens and receipts" },
];

export default function ScanPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const recordRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<SampleStore[]>([]);
  const [sheet, setSheet] = useState<"record" | "upload" | null>(null);

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

  const choose = (c: DemoChoice) => {
    setSheet(null);
    if (c.kind === "sample-video") {
      const s = SAMPLE_VIDEOS.find((v) => v.slug === c.slug);
      if (!s) return;
      fillDetailsIfEmpty(s.name, s.storeType, s.tagline);
      setPendingInput({ kind: "sample-video", slug: s.slug, url: s.file });
      dispatch({ type: "setSource", source: "sample", sampleSlug: s.slug });
      go();
    } else if (c.kind === "sample-photos") {
      const s = samples.find((x) => x.slug === c.slug);
      if (!s) return;
      fillDetailsIfEmpty(s.name, s.storeType, s.tagline);
      setPendingInput({ kind: "sample-photos", slug: s.slug, urls: s.photos.map((p) => samplePhotoUrl(s, p)) });
      dispatch({ type: "setSource", source: "sample", sampleSlug: s.slug });
      go();
    } else if (c.kind === "own-record") recordRef.current?.click();
    else if (c.kind === "own-video") videoRef.current?.click();
    else photosRef.current?.click();
  };

  return (
    <Screen back="/onboarding/store-details" title="Show us your shelves" subtitle="A 15-second walkthrough lets Faire personalize your storefront from day one.">
      <div className="mt-5 rise">
        <DoDont />
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
        <Button onClick={() => setSheet("record")}>
          <span className="inline-flex items-center gap-2">
            <Camera size={18} strokeWidth={1.75} /> Record a walkthrough
          </span>
        </Button>
        <Button variant="secondary" onClick={() => setSheet("upload")}>
          <span className="inline-flex items-center gap-2">
            <Upload size={18} strokeWidth={1.75} /> Upload video or photos
          </span>
        </Button>
        <input ref={recordRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <input ref={photosRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>


      <Link href="/home" className="mt-4 block py-3 text-center text-[14px] text-muted underline underline-offset-4">
        Skip for now
      </Link>

      <DemoSheet open={sheet !== null} mode={sheet} photoSets={samples} onClose={() => setSheet(null)} onChoose={choose} />
    </Screen>
  );
}
