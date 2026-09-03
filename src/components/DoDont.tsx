"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
    title: "Don't stand too far away",
    body: "From across the room we can't see what's on the shelf.",
    video: "/samples/videos/bad-too-far.mp4",
    poster: "/samples/videos/bad-too-far.jpg",
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
    title: "Or 4 to 6 photos, about 4 feet from your shelves",
    body: "",
    poster: "/samples/videos/home-gift-walkthrough.jpg",
    photos: [
      "/samples/videos/home-gift-walkthrough.jpg",
      "/samples/videos/good-steady-pan.jpg",
      "/samples/videos/boutique-walkthrough.jpg",
      "/samples/videos/general-store-walkthrough.jpg",
    ],
  },
];

/** Horizontal do / don't carousel with muted looping clips. Scrolls by touch, wheel, mouse drag, or the edge arrows. */
export function DoDont() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [edge, setEdge] = useState<{ start: boolean; end: boolean }>({ start: true, end: false });

  const updateEdges = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };

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
    updateEdges();
    return () => io.disconnect();
  }, []);

  const scrollBy = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="relative">
      <div
        ref={ref}
        className="-mx-6 flex cursor-grab gap-3 overflow-x-auto px-6 pb-2 active:cursor-grabbing [scrollbar-width:none]"
        style={{ touchAction: "pan-x pan-y", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}
        onScroll={updateEdges}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const dx = e.clientX - drag.current.x;
          if (Math.abs(dx) > 3) drag.current.moved = true;
          ref.current.scrollLeft = drag.current.left - dx;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
      {CARDS.map((c) => (
        <div key={c.title} className="w-[150px] shrink-0">
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-surface-2" style={{ aspectRatio: "4 / 5" }}>
            {c.video ? (
              <video className="h-full w-full object-cover" src={c.video} poster={c.poster} muted loop playsInline preload="metadata" draggable={false} />
            ) : (
              <div className="grid h-full w-full grid-cols-2 gap-0.5 bg-white">
                {c.photos?.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="" draggable={false} className="h-full w-full object-cover" />
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
          <p className="mt-2 text-[13px] font-medium leading-snug text-ink">{c.title}</p>
        </div>
      ))}
      </div>
      {!edge.start && (
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scrollBy(-320)}
          className="absolute -left-3 top-[78px] flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-[var(--shadow-card)]"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {!edge.end && (
        <button
          type="button"
          aria-label="Next"
          onClick={() => scrollBy(320)}
          className="absolute -right-3 top-[78px] flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-[var(--shadow-card)]"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
