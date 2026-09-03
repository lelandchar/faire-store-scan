"use client";

import { ChevronLeft, Search as SearchIcon, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ProductCard, type FeedItem } from "@/components/ProductCard";
import { TabBar } from "@/components/ui/TabBar";
import { getCatalog } from "@/lib/catalog";
import { genericPrior, personalize } from "@/lib/ranking";
import { relevance, SUGGESTED_QUERIES } from "@/lib/search";
import { useOnboarding } from "@/lib/store";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-full grow shrink-0" />}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const { state, hydrated } = useOnboarding();
  const profile = state.profile;
  const personalized = state.personalized && !!profile;
  const catalog = useMemo(
    () => getCatalog(state.catalogSource),
    [state.catalogSource],
  );
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

  const results: FeedItem[] = useMemo(() => {
    const query = submitted.trim();
    if (!query) return [];
    const rel = catalog
      .map((p) => ({ p, r: relevance(p, query) }))
      .filter((x) => x.r > 0);
    if (!rel.length) return [];
    const maxRel = Math.max(...rel.map((x) => x.r));
    const byId = new Map((ranked ?? []).map((r) => [r.product.id, r]));
    const maxPers = Math.max(
      0.0001,
      ...rel.map((x) => byId.get(x.p.id)?.score ?? 0),
    );
    // Generic: relevance, then the seeded random order. Personalized: relevance dominates, profile re-orders within.
    const scored = rel.map((x) => {
      const rk = byId.get(x.p.id);
      const relN = x.r / maxRel;
      const pers = rk && rk.score > 0 ? rk.score / maxPers : 0;
      const generic = relN + 0.15 * genericPrior(x.p);
      const skip = rk?.score === -1;
      const personal = skip ? -1 : 0.65 * relN + 0.35 * pers;
      return { p: x.p, rk, generic, personal };
    });
    const genericOrder = [...scored].sort(
      (a, b) => b.generic - a.generic || a.p.id.localeCompare(b.p.id),
    );
    const genericRank = new Map(genericOrder.map((s, i) => [s.p.id, i + 1]));
    const order = personalized
      ? [...scored]
          .filter((s) => s.personal >= 0)
          .sort(
            (a, b) => b.personal - a.personal || a.p.id.localeCompare(b.p.id),
          )
      : genericOrder;
    return order.map((s, i) => ({
      product: s.p,
      ranked:
        personalized && s.rk
          ? {
              ...s.rk,
              genericRank: genericRank.get(s.p.id) ?? 0,
              personalizedRank: i + 1,
              delta: (genericRank.get(s.p.id) ?? 0) - (i + 1),
            }
          : undefined,
    }));
  }, [submitted, catalog, ranked, personalized]);

  if (!hydrated) return <div className="min-h-full grow shrink-0" />;

  const submit = (value: string) => {
    setSubmitted(value);
    router.replace(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="relative flex min-h-full grow shrink-0 flex-col">
      <div className="sticky top-0 z-20 bg-white px-4 pb-2 pt-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
        >
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.push("/home")}
            className="-ml-2 flex h-11 w-9 items-center justify-center text-ink-2"
          >
            <ChevronLeft size={24} strokeWidth={1.5} />
          </button>
          <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-line px-4">
            <SearchIcon size={18} strokeWidth={1.75} className="text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              autoFocus={!initial}
              enterKeyHint="search"
              className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setQ("")}
                className="text-muted"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="flex-1 px-4 pb-6">
        {!submitted && (
          <div className="mt-2">
            <p className="text-label">Try a search</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQ(s);
                    submit(s);
                  }}
                  className="h-9 rounded-full border border-line px-3.5 text-[14px] text-ink-2"
                >
                  {s}
                </button>
              ))}
            </div>
            {profile && (
              <p className="text-caption mt-6">
                Query protection: a search only ever returns products that match
                what you typed. Your store profile changes the order, never the
                set.
              </p>
            )}
          </div>
        )}
        {submitted && (
          <>
            <p className="text-caption mt-2">
              {results.length} result{results.length === 1 ? "" : "s"} for
              &ldquo;{submitted}&rdquo;
            </p>
            {results.length === 0 ? (
              <div className="mt-10 text-center">
                <p className="text-[15px] text-ink">
                  No results for &ldquo;{submitted}&rdquo;
                </p>
                <p className="text-caption mt-1">
                  Try one of the suggested searches.
                </p>
              </div>
            ) : (
              <div
                key={`${submitted}-${personalized ? "p" : "g"}`}
                className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6"
              >
                {results.map((item, i) => (
                  <ProductCard key={item.product.id} item={item} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <TabBar active="Browse" />
    </div>
  );
}
