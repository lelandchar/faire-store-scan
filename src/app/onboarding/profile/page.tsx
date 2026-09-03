"use client";

import { motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { Switch } from "@/components/ui/Switch";
import { CATEGORY_TILE_IMAGE } from "@/lib/catalog";
import { useOnboarding } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/types";

/** Screen 1 of 3: what the walkthrough found, and whether the retailer wants more of it. */
export default function AssortmentPage() {
  const router = useRouter();
  const { state, dispatch, setCategoryIntent } = useOnboarding();
  const { profile, analysis, frames } = state;
  const [adding, setAdding] = useState(false);

  if (!profile || !analysis) {
    return (
      <Screen back="/onboarding/scan" title="Nothing to show yet" subtitle="Film a quick walkthrough and we'll read your shelves.">
        <div className="mt-8">
          <Button onClick={() => router.replace("/onboarding/scan")}>Show us your shelves</Button>
        </div>
      </Screen>
    );
  }

  const frameById = new Map(frames.map((f) => [f.id, f]));
  const evidenceFor = (cat: Category) => analysis.categories?.find((c) => c.name === cat)?.evidence_frames ?? [];
  const remaining = CATEGORIES.filter((c) => !profile.categories.some((p) => p.name === c));

  return (
    <Screen
      back="/onboarding/scan"
      footer={
        <Button onClick={() => router.push("/onboarding/style")}>
          Next
        </Button>
      }
    >
      <p className="text-caption uppercase tracking-[0.14em]">Step 1 of 3 · Your assortment</p>
      <h1 className="text-display-sm mt-2 rise">Here&apos;s what&apos;s on your shelves</h1>
      <p className="mt-3 font-serif text-[17px] leading-[1.35] text-ink rise">{profile.summary}</p>
      <p className="text-caption mt-2">Turn off anything you don&apos;t want more of.</p>

      <div className="mt-6 space-y-3">
        {profile.categories.map((c, i) => {
          const evidence = evidenceFor(c.name).map((id) => frameById.get(id)).find(Boolean);
          const image = evidence?.dataUrl ?? CATEGORY_TILE_IMAGE[c.name];
          const on = c.intent !== "skip";
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 rounded-[var(--radius-lg)] border border-line p-3 transition-colors ${on ? "bg-white" : "bg-surface-2"}`}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className={`h-14 w-14 shrink-0 rounded-[6px] object-cover transition-opacity ${on ? "" : "opacity-50"}`} />
              ) : (
                <span className="h-14 w-14 shrink-0 rounded-[6px] bg-surface-3" />
              )}
              <p className={`min-w-0 flex-1 text-[16px] font-medium leading-snug ${on ? "text-ink" : "text-muted"}`}>{c.name}</p>
              <Switch checked={on} label={`Show me more ${c.name.toLowerCase()}`} onChange={(next) => setCategoryIntent(c.name, next ? "more" : "skip")} />
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4">
        {adding ? (
          <div className="flex flex-wrap gap-2">
            {remaining.map((c) => (
              <Chip
                key={c}
                size="sm"
                active={false}
                onClick={() => {
                  dispatch({ type: "patchProfile", patch: { categories: [...profile.categories, { name: c, share: "trace", intent: "more" }] } });
                  setAdding(false);
                }}
              >
                <Plus size={12} /> {c}
              </Chip>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-[13px] text-ink underline underline-offset-4">
            Add a category we missed
          </button>
        )}
      </div>

      {analysis.suggested_complements && analysis.suggested_complements.length > 0 && (
        <section className="mt-8 mb-2">
          <h2 className="text-[16px] font-semibold text-ink">Not on your shelves yet</h2>
          <p className="text-caption mt-1">These tend to sell alongside what you carry. Keep the ones you&apos;d consider.</p>
          <div className="mt-3 space-y-2">
            {analysis.suggested_complements.map((c) => {
              const on = profile.complements.includes(c.category);
              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "patchProfile",
                      patch: { complements: on ? profile.complements.filter((x) => x !== c.category) : [...profile.complements, c.category] },
                    })
                  }
                  className={`flex w-full items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${on ? "border-ink bg-surface-2" : "border-line"}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-white" : "border-line"}`}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-ink">{c.category}</span>
                    <span className="text-caption block">{c.reason}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </Screen>
  );
}
