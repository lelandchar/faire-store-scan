"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getCatalog } from "@/lib/catalog";
import { personalize } from "@/lib/ranking";
import { RERANK_CANDIDATES, runRerank } from "@/lib/rerank";
import { promptsFromProfile, runRetrieval } from "@/lib/retrieval";
import { useOnboarding } from "@/lib/store";

/**
 * Runs only after the retailer has confirmed their assortment, style and dials:
 * frames + the confirmed profile are embedded and matched against the catalog.
 */
export default function BuildingPage() {
  const router = useRouter();
  const { state, dispatch, hydrated } = useOnboarding();
  const [phase, setPhase] = useState<"running" | "review" | "done" | "error">("running");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const catalog = useMemo(() => getCatalog(state.catalogSource), [state.catalogSource]);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    const { frames, profile, analysis } = state;
    if (!profile) {
      router.replace("/onboarding/scan");
      return;
    }
    const go = async () => {
      if (!frames.length) {
        // Frames were not persisted (large upload or refresh): ranking still works from the profile alone.
        setPhase("done");
        setTimeout(() => router.replace("/onboarding/done"), 900);
        return;
      }
      dispatch({ type: "setRetrievalStatus", status: "running" });
      dispatch({ type: "setRerank", rerank: null });
      try {
        const retrieval = await runRetrieval({ frames, catalog: state.catalogSource, prompts: promptsFromProfile(profile, analysis) });
        dispatch({ type: "setRetrieval", retrieval });
        dispatch({ type: "setRetrievalStatus", status: "done" });
        // A buyer's-eye pass over the top candidates: the LM looks at the products themselves.
        setPhase("review");
        dispatch({ type: "setRerankStatus", status: "running" });
        try {
          const ids = personalize(catalog, profile, { scores: retrieval.scores, weights: state.weights })
            .filter((r) => r.score >= 0)
            .slice(0, RERANK_CANDIDATES)
            .map((r) => r.product.id);
          const rerank = await runRerank({ catalog: state.catalogSource, ids, profile, storeType: analysis?.store_read?.store_type_guess });
          dispatch({ type: "setRerank", rerank });
          dispatch({ type: "setRerankStatus", status: "done" });
        } catch (e) {
          // Not fatal: the fused ranking stands on its own.
          dispatch({ type: "setRerankStatus", status: "error", error: e instanceof Error ? e.message : "Review failed" });
        }
        setPhase("done");
        setTimeout(() => router.replace("/onboarding/done"), 1100);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Matching failed";
        dispatch({ type: "setRetrieval", retrieval: null });
        dispatch({ type: "setRetrievalStatus", status: "error", error: msg });
        setError(msg);
        setPhase("error");
      }
    };
    setTimeout(() => void go(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const retrieval = state.retrieval;
  const topMatches = useMemo(() => {
    if (!retrieval || retrieval.catalog !== state.catalogSource) return [];
    const ids = new Set<string>();
    for (const fn of retrieval.frameNeighbors) for (const n of fn.neighbors.slice(0, 2)) ids.add(n.id);
    return Array.from(ids)
      .map((id) => catalog.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .slice(0, 8);
  }, [retrieval, catalog, state.catalogSource]);

  return (
    <div className="flex min-h-full grow shrink-0 flex-col px-6 pb-10 pt-10">
      <p className="text-caption uppercase tracking-[0.14em]">Almost done</p>
      <h1 className="text-display-sm mt-2">Building your storefront</h1>
      <p className="text-body mt-2 text-muted">
        {phase === "done"
          ? "Ready."
          : phase === "review"
            ? `Giving the top ${RERANK_CANDIDATES} picks a buyer's-eye review`
            : `Matching your shelves and your choices against ${catalog.length.toLocaleString()} products from independent brands`}
        {(phase === "running" || phase === "review") && <span className="pulse-soft">…</span>}
      </p>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full bg-ink"
          initial={{ width: "6%" }}
          animate={{ width: phase === "done" ? "100%" : phase === "review" ? ["40%", "92%"] : ["6%", "36%"] }}
          transition={phase === "done" ? { duration: 0.4 } : phase === "review" ? { duration: 22, ease: "easeOut" } : { duration: 3, ease: "easeOut" }}
        />
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        {(topMatches.length ? topMatches : Array.from({ length: 8 }, () => null)).map((p, i) => (
          <motion.div
            key={p ? p.id : `ph-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: p ? 1 : 0.5, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="overflow-hidden rounded-[6px] bg-surface-2"
            style={{ aspectRatio: "1" }}
          >
            {p && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-full w-full object-cover" />
            )}
          </motion.div>
        ))}
      </div>
      {phase === "done" && (
        <p className="mt-4 flex items-center gap-2 text-[14px] text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
            <Check size={12} strokeWidth={3} />
          </span>
          {retrieval
            ? `${retrieval.count.toLocaleString()} products scored against your shelves${state.rerank ? `, top ${state.rerank.count} reviewed` : ""}.`
            : "Your storefront is ready."}
        </p>
      )}
      {phase === "error" && (
        <div className="mt-6 space-y-3">
          <p className="text-body">{error}</p>
          <p className="text-caption">Your storefront will still use what you confirmed; visual matching was skipped.</p>
          <Button onClick={() => router.replace("/onboarding/done")}>Continue</Button>
        </div>
      )}
    </div>
  );
}
