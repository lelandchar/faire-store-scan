"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getCatalog } from "@/lib/catalog";
import { personalize } from "@/lib/ranking";
import { RERANK_CANDIDATES, runRerank } from "@/lib/rerank";
import { promptsFromProfile, runRetrieval } from "@/lib/retrieval";
import { useOnboarding } from "@/lib/store";
import type { Product } from "@/lib/types";

const GRID = 24;

/**
 * Runs only after the retailer has confirmed their assortment, style and dials:
 * frames + the confirmed profile are embedded and matched against the catalog.
 */
export default function BuildingPage() {
  const router = useRouter();
  const { state, dispatch, hydrated } = useOnboarding();
  const [phase, setPhase] = useState<"running" | "review" | "done" | "error">(
    "running",
  );
  const [error, setError] = useState<string | null>(null);
  // The products under consideration, live: the fused top 24 as soon as matching finishes,
  // then the same grid re-ordered once the second pass has scored them.
  const [picks, setPicks] = useState<Product[]>([]);
  const started = useRef(false);
  const catalog = useMemo(
    () => getCatalog(state.catalogSource),
    [state.catalogSource],
  );

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
        const retrieval = await runRetrieval({
          frames,
          catalog: state.catalogSource,
          prompts: promptsFromProfile(profile, analysis),
          backend: state.embeddingBackend,
        });
        dispatch({ type: "setRetrieval", retrieval });
        dispatch({ type: "setRetrievalStatus", status: "done" });
        const fused = personalize(catalog, profile, {
          scores: retrieval.scores,
          weights: state.weights,
        }).filter((r) => r.score >= 0);
        setPicks(fused.slice(0, GRID).map((r) => r.product));
        // LLM reranking pass over the top candidates: the model looks at the products themselves.
        setPhase("review");
        dispatch({ type: "setRerankStatus", status: "running" });
        try {
          const ids = personalize(catalog, profile, {
            scores: retrieval.scores,
            weights: state.weights,
          })
            .filter((r) => r.score >= 0)
            .slice(0, RERANK_CANDIDATES)
            .map((r) => r.product.id);
          const rerank = await runRerank({
            catalog: state.catalogSource,
            ids,
            profile,
            storeType: analysis?.store_read?.store_type_guess,
          });
          dispatch({ type: "setRerank", rerank });
          dispatch({ type: "setRerankStatus", status: "done" });
          setPicks(
            personalize(catalog, profile, {
              scores: retrieval.scores,
              weights: state.weights,
              rerank: rerank.fits,
            })
              .filter((r) => r.score >= 0)
              .slice(0, GRID)
              .map((r) => r.product),
          );
        } catch (e) {
          // Not fatal: the fused ranking stands on its own.
          dispatch({
            type: "setRerankStatus",
            status: "error",
            error: e instanceof Error ? e.message : "Review failed",
          });
        }
        setPhase("done");
        // Rebuilds triggered from the feed (switching the retrieval method) return there instead of the Congratulations screen.
        const back = new URLSearchParams(window.location.search).get("return");
        setTimeout(
          () =>
            router.replace(
              back === "home" || back === "search"
                ? `/${back}`
                : "/onboarding/done",
            ),
          1100,
        );
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

  return (
    <div className="flex min-h-full grow shrink-0 flex-col px-6 pb-10 pt-10">
      <p className="text-caption uppercase tracking-[0.14em]">Almost done</p>
      <h1 className="text-display-sm mt-2">Building your storefront</h1>
      <p className="text-body mt-2 text-muted">
        {phase === "done"
          ? "Ready."
          : phase === "review"
            ? `Running a second pass on the top ${RERANK_CANDIDATES} picks`
            : `Matching your shelves and your choices against ${catalog.length.toLocaleString()} products from independent brands`}
        {(phase === "running" || phase === "review") && (
          <span className="pulse-soft">…</span>
        )}
      </p>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full rounded-full bg-ink"
          initial={{ width: "6%" }}
          animate={{
            width:
              phase === "done"
                ? "100%"
                : phase === "review"
                  ? ["40%", "92%"]
                  : ["6%", "36%"],
          }}
          transition={
            phase === "done"
              ? { duration: 0.4 }
              : phase === "review"
                ? { duration: 22, ease: "easeOut" }
                : { duration: 3, ease: "easeOut" }
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-4 gap-2">
        <AnimatePresence initial={false}>
          {(picks.length
            ? picks
            : Array.from({ length: GRID }, () => null)
          ).map((p, i) => (
            <motion.div
              key={p ? p.id : `ph-${i}`}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: p ? 1 : 0.45, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                layout: { type: "spring", stiffness: 260, damping: 28 },
                opacity: {
                  duration: 0.3,
                  delay: p ? Math.min(i, 23) * 0.03 : 0,
                },
              }}
              className="overflow-hidden rounded-[6px] bg-surface-2"
              style={{ aspectRatio: "1" }}
            >
              {p && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
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
          <p className="text-caption">
            Your storefront will still use what you confirmed; visual matching
            was skipped.
          </p>
          <Button onClick={() => router.replace("/onboarding/done")}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
