"use client";

import type { Frame } from "@/lib/types";
import { Card, Mono, Placeholder, kb } from "./ui";

export function StageFrames({ frames, progress }: { frames: Frame[]; progress: { done: number; total: number } | null }) {
  const totalKb = frames.reduce((n, f) => n + kb(f.dataUrl), 0);
  return (
    <Card
      step="Stage 1"
      title={frames[0]?.source === "photo" ? "Photo processing" : "Video to frames"}
      subtitle="Client-side selection (frames.ts): candidates are sampled uniformly across the clip (~2 per second, up to 32), each scored for sharpness (mean 3×3 Laplacian over a 96px grayscale copy) and fingerprinted (24×24 grayscale) for similarity. The clip is split into evenly spaced time buckets, about 0.8 per second (6 to 16 frames), so every section of the store is represented; in each bucket the acceptably sharp frames (≥60% of the bucket's best) are ranked by how different they look from frames already kept, and near-duplicates (fingerprint difference <0.035) are skipped. Frames are resized to ≤1280px and JPEG-encoded at q=0.8; the raw video never leaves the device. Photos skip sampling and are only resized."
    >
      {frames.length === 0 ? (
        <Placeholder>{progress ? `Extracting ${progress.done}/${progress.total}…` : "Run a sample to populate."}</Placeholder>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-ink-2">
            <Mono className="text-ink">{frames.length}</Mono> frames · <Mono className="text-ink">{totalKb} KB</Mono> uploaded · source{" "}
            <Mono className="text-ink">{frames[0].source}</Mono>
          </p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {frames.map((f) => (
              <figure key={f.id} className="min-w-0">
                <div className="overflow-hidden rounded-[var(--radius)] bg-surface-2" style={{ aspectRatio: "1" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.dataUrl} alt={`frame ${f.id}`} className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-1 text-[11px] leading-[1.35] text-muted">
                  <Mono className="text-ink">{f.id}</Mono> · <Mono>{(f.timestampMs / 1000).toFixed(1)}s</Mono> · <Mono>{kb(f.dataUrl)} KB</Mono> ·{" "}
                  {f.source}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
