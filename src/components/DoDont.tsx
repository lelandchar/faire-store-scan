"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";

const CARDS: { kind: "do" | "dont"; title: string; body: string; video?: string; poster: string; photos?: string[] }[] = [
  {
    kind: "do",
    title: "Slow, steady pan",
    body: "Whole shelves in frame, 10 to 20 seconds.",
    video: "/samples/videos/good-steady-pan.mp4",
    poster: "/samples/videos/good-steady-pan.jpg",
  },
  {
    kind: "dont",
    title: "Don't rush",
    body: "Fast pans blur the products we're trying to read.",
    video: "/samples/videos/bad-too-fast.mp4",
    poster: "/samples/videos/bad-too-fast.jpg",
  },
  {
    kind: "dont",
    title: "Don't get too close",
    body: "One product tells us less than the whole shelf.",
    video: "/samples/videos/bad-too-close.mp4",
    poster: "/samples/videos/bad-too-close.jpg",
  },
  {
    kind: "dont",
    title: "Turn the lights on",
    body: "Dim shots hide colors and materials.",
    video: "/samples/videos/bad-too-dark.mp4",
    poster: "/samples/videos/bad-too-dark.jpg",
  },
  {
    kind: "do",
    title: "Or 4 to 6 wide photos",
    body: "Different corners of the store, not close-ups.",
    poster: "/samples/home-gift/cover.jpg",
    photos: ["/samples/home-gift/01.jpg", "/samples/home-gift/02.jpg", "/samples/home-gift/03.jpg", "/samples/home-gift/04.jpg"],
  },
];

/** Horizontal do / don't carousel with muted looping clips. */
export function DoDont() {
  const ref = useRef<HTMLDivElement>(null);
  // Only play clips that are on screen; phones don't love five videos at once.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const vids = Array.from(root.querySelectorAll("video"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { root, threshold: 0.6 },
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">
      {CARDS.map((c) => (
        <div key={c.title} className="w-[168px] shrink-0 snap-start">
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-surface-2" style={{ aspectRatio: "4 / 5" }}>
            {c.video ? (
              <video className="h-full w-full object-cover" src={c.video} poster={c.poster} muted loop playsInline preload="metadata" />
            ) : (
              <div className="grid h-full w-full grid-cols-2 gap-0.5 bg-white">
                {c.photos?.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
            )}
            <span
              className={`absolute left-2 top-2 inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-white ${
                c.kind === "do" ? "bg-success" : "bg-danger"
              }`}
            >
              {c.kind === "do" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
              {c.kind === "do" ? "Do" : "Don't"}
            </span>
          </div>
          <p className="mt-2 text-[14px] font-medium text-ink">{c.title}</p>
          <p className="text-caption">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
