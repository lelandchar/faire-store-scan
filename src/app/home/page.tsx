"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, MessageCircle, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductCard, type FeedItem } from "@/components/ProductCard";
import { TabBar } from "@/components/ui/TabBar";
import { CATEGORY_TILE_IMAGE, getCatalog } from "@/lib/catalog";
import { orderCategories, personalize, rankGeneric, type Ranked } from "@/lib/ranking";
import { useOnboarding } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/types";

const PAGE = 24;

export default function HomePage() {
  const { state, hydrated } = useOnboarding();
  const profile = state.profile;
  const personalized = state.personalized && !!profile;
  const catalog = useMemo(() => getCatalog(state.catalogSource), [state.catalogSource]);
  const generic = useMemo(() => rankGeneric(catalog), [catalog]);
  const scores = state.retrieval && state.retrieval.catalog === state.catalogSource ? state.retrieval.scores : undefined;
  const ranked = useMemo(
    () => (profile ? personalize(catalog, profile, { scores, weights: state.weights }) : null),
    [catalog, profile, scores, state.weights],
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [why, setWhy] = useState<Ranked | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] =
      personalized && ranked ? ranked.filter((r) => r.score >= 0).map((r) => ({ product: r.product, ranked: r })) : generic.map((p) => ({ product: p }));
    return items.filter((i) => !hidden.has(i.product.id));
  }, [personalized, ranked, generic, hidden]);

  const cats = useMemo(() => orderCategories(CATEGORIES, personalized ? profile : null), [personalized, profile]);
  // Curated tile art so the top of the feed always reads cleanly, whichever catalog powers the list.
  const tileImage = (c: Category) => CATEGORY_TILE_IMAGE[c] ?? generic.find((p) => p.category === c)?.image;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  if (!hydrated) return <div className="min-h-full flex-1" />;

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      {/* Search */}
      <div className="sticky top-0 z-20 bg-white px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <Link href="/search" className="flex h-11 flex-1 items-center gap-3 rounded-full border border-line px-4 text-muted">
            <Search size={18} strokeWidth={1.75} />
            <span className="flex-1 text-left text-[15px]">Search</span>
            <Camera size={18} strokeWidth={1.75} />
          </Link>
          <MessageCircle size={24} strokeWidth={1.5} className="text-ink" />
        </div>
      </div>

      {/* Category tiles */}
      <div className="mt-1 shrink-0 overflow-x-auto px-4 [scrollbar-width:none]">
        <div className="grid grid-flow-col grid-rows-2 gap-2" style={{ gridAutoColumns: "170px" }}>
          {cats.map((c) => (
            <motion.button key={c} type="button" className="flex h-[72px] items-center justify-between overflow-hidden rounded-[var(--radius)] bg-warm pl-3">
              <span className="text-left text-[14px] font-medium leading-tight text-ink">{c}</span>
              {tileImage(c) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tileImage(c)} alt="" className="h-[60px] w-[52px] rounded-[4px] object-cover" />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Ideas for you */}
      <section className="mt-7 px-4 pb-6">
        <h2 className="text-[19px] font-semibold text-ink">{personalized && profile ? "Picked for your store" : "Ideas for you"}</h2>
        {personalized && profile && <p className="text-caption mt-0.5">Ordered from your walkthrough and your choices. Tap a card&apos;s note to see why.</p>}
        <div key={personalized ? "p" : "g"} className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6">
          {feed.slice(0, limit).map((item, i) => (
            <ProductCard key={item.product.id} item={item} index={i} personalized={personalized} onWhy={setWhy} />
          ))}
        </div>
        {limit < feed.length && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-6 h-11 w-full rounded-[var(--radius)] border border-ink text-[14px] font-medium text-ink">
            See more
          </button>
        )}
      </section>

      <TabBar active="Home" />

      {/* Why sheet */}
      <AnimatePresence>
        {why && (
          <>
            <motion.div key="ov" className="absolute inset-0 z-30 bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWhy(null)} />
            <motion.div
              key="sheet"
              className="absolute inset-x-0 bottom-0 z-40 rounded-t-[16px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <div className="mx-auto h-1 w-10 rounded-full bg-line" />
              <div className="mt-3 flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={why.product.image} alt="" className="h-16 w-16 rounded-[4px] object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] font-medium text-ink">{why.product.name}</p>
                  <p className="text-caption">
                    {why.delta > 0 ? `Moved up ${why.delta} places for your store` : why.delta === 0 ? "Same spot as the generic feed" : `Moved down ${-why.delta} places`}
                  </p>
                </div>
                <button type="button" aria-label="Close" onClick={() => setWhy(null)} className="text-muted">
                  <X size={20} />
                </button>
              </div>
              <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Why this</p>
              <ul className="mt-2 space-y-2">
                {why.reasons.map((r) => (
                  <li key={r.text} className="flex items-center gap-2 text-[14px] text-ink-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {r.text}
                  </li>
                ))}
              </ul>
              <EvidenceStrip category={why.product.category} />
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWhy(null);
                    showToast("Got it. We'll show more like this.");
                  }}
                  className="h-11 flex-1 rounded-[var(--radius)] bg-ink text-[14px] font-medium text-white"
                >
                  More like this
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHidden((h) => new Set(h).add(why.product.id));
                    setWhy(null);
                    showToast("Removed. We'll keep that in mind.");
                  }}
                  className="h-11 flex-1 rounded-[var(--radius)] border border-ink text-[14px] font-medium text-ink"
                >
                  Not relevant
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-6 bottom-24 z-40 rounded-[var(--radius)] bg-ink px-4 py-3 text-center text-[13px] text-white shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EvidenceStrip({ category }: { category: Category }) {
  const { state } = useOnboarding();
  const sig = state.analysis?.categories?.find((c) => c.name === category);
  const ids = new Set([...(sig?.evidence_frames ?? [])]);
  const frames = state.frames.filter((f) => ids.has(f.id)).slice(0, 4);
  if (!frames.length) return null;
  return (
    <div className="mt-4">
      <p className="text-caption">From your walkthrough</p>
      <div className="mt-2 flex gap-2">
        {frames.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f.id} src={f.dataUrl} alt="" className="h-14 w-14 rounded-[4px] object-cover" />
        ))}
      </div>
    </div>
  );
}
