"use client";

import { motion } from "framer-motion";
import { Camera, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductCard, type FeedItem } from "@/components/ProductCard";
import { TabBar } from "@/components/ui/TabBar";
import { CATEGORY_TILE_IMAGE, getCatalog } from "@/lib/catalog";
import { orderCategories, personalize, rankGeneric } from "@/lib/ranking";
import { useInspect } from "@/lib/inspect";
import { useOnboarding } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/types";

const PAGE = 48;

export default function HomePage() {
  const { state, hydrated } = useOnboarding();
  const { setItem: inspect } = useInspect();
  const profile = state.profile;
  const personalized = state.personalized && !!profile;
  const catalog = useMemo(
    () => getCatalog(state.catalogSource),
    [state.catalogSource],
  );
  const generic = useMemo(() => rankGeneric(catalog), [catalog]);
  const scores =
    state.retrieval && state.retrieval.catalog === state.catalogSource
      ? state.retrieval.scores
      : undefined;
  const rerank =
    state.rerank && state.rerank.catalog === state.catalogSource
      ? state.rerank.fits
      : undefined;
  const ranked = useMemo(
    () =>
      profile
        ? personalize(catalog, profile, {
            scores,
            weights: state.weights,
            rerank,
          })
        : null,
    [catalog, profile, scores, state.weights, rerank],
  );
  const [limit, setLimit] = useState(PAGE);
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] =
      personalized && ranked
        ? ranked
            .filter((r) => r.score >= 0)
            .map((r) => ({ product: r.product, ranked: r }))
        : generic.map((p) => ({ product: p }));
    return items;
  }, [personalized, ranked, generic]);

  const cats = useMemo(
    () => orderCategories(CATEGORIES, personalized ? profile : null),
    [personalized, profile],
  );
  // Curated tile art so the top of the feed always reads cleanly, whichever catalog powers the list.
  const tileImage = (c: Category) =>
    CATEGORY_TILE_IMAGE[c] ?? generic.find((p) => p.category === c)?.image;

  if (!hydrated) return <div className="min-h-full grow shrink-0" />;

  return (
    <div className="relative flex min-h-full grow shrink-0 flex-col">
      {/* Search */}
      <div className="sticky top-0 z-20 bg-white px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <Link
            href="/search"
            className="flex h-11 flex-1 items-center gap-3 rounded-full border border-line px-4 text-muted"
          >
            <Search size={18} strokeWidth={1.75} />
            <span className="flex-1 text-left text-[15px]">Search</span>
            <Camera size={18} strokeWidth={1.75} />
          </Link>
          <MessageCircle size={24} strokeWidth={1.5} className="text-ink" />
        </div>
      </div>

      {/* Category tiles */}
      <div className="mt-1 shrink-0 overflow-x-auto px-4 [scrollbar-width:none]">
        <div
          className="grid grid-flow-col grid-rows-2 gap-2"
          style={{ gridAutoColumns: "170px" }}
        >
          {cats.map((c) => (
            <motion.button
              key={c}
              type="button"
              className="flex h-[72px] items-center justify-between overflow-hidden rounded-[var(--radius)] bg-warm pl-3"
            >
              <span className="text-left text-[14px] font-medium leading-tight text-ink">
                {c}
              </span>
              {tileImage(c) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tileImage(c)}
                  alt=""
                  className="h-[60px] w-[52px] rounded-[4px] object-cover"
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Ideas for you */}
      <section className="mt-7 px-4 pb-6">
        <h2 className="text-[19px] font-semibold text-ink">
          {personalized && profile ? "Picked for your store" : "Ideas for you"}
        </h2>
        <div
          key={personalized ? "p" : "g"}
          className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6"
        >
          {feed.slice(0, limit).map((item, i) => (
            <ProductCard
              key={item.product.id}
              item={item}
              index={i}
              onHover={(r) => inspect(r, catalog.length)}
            />
          ))}
        </div>
        {limit < feed.length && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="mt-6 h-11 w-full rounded-[var(--radius)] border border-ink text-[14px] font-medium text-ink"
          >
            See more
          </button>
        )}
      </section>

      <TabBar active="Home" />
    </div>
  );
}
