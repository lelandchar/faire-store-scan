"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { styleLabel } from "@/lib/ranking";
import { useOnboarding } from "@/lib/store";
import { CATEGORIES, STYLES, type BuyingMode, type Category, type CategoryIntent, type PriceTier, type Share } from "@/lib/types";

const SHARE_LABEL: Record<Share, string> = {
  dominant: "Most of your shelves",
  strong: "A strong section",
  present: "A few pieces",
  trace: "A hint of it",
};

const INTENTS: { value: CategoryIntent; label: string }[] = [
  { value: "more", label: "More like this" },
  { value: "stocked", label: "Already covered" },
  { value: "skip", label: "Not for me" },
];

const MODES: { value: BuyingMode; title: string; body: string }[] = [
  { value: "replenish", title: "Restock what sells", body: "Proven bestsellers in the categories you already carry." },
  { value: "complement", title: "Fill the gaps", body: "Categories that pair with your shelves but aren't on them yet." },
  { value: "discover", title: "Discover new brands", body: "Fresh brands that match your look, weighted toward the new." },
];

export default function ProfilePage() {
  const router = useRouter();
  const { state, dispatch, setCategoryIntent, toggleStyle, setMode } = useOnboarding();
  const { profile, analysis, frames } = state;
  const [addingStyle, setAddingStyle] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);

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
  const remainingStyles = STYLES.filter((s) => !profile.styles.includes(s));
  const remainingCategories = CATEGORIES.filter((c) => !profile.categories.some((p) => p.name === c));

  return (
    <Screen
      back="/onboarding/scan"
      footer={
        <Button onClick={() => router.push("/onboarding/done")}>
          Looks right
        </Button>
      }
    >
      <p className="text-caption uppercase tracking-[0.14em]">From your walkthrough</p>
      <h1 className="text-display mt-2 rise">Here&apos;s what we noticed</h1>
      <p className="mt-4 font-serif text-[19px] leading-[1.35] text-ink rise">{profile.summary}</p>
      <p className="text-caption mt-3">You know your store best. Tap anything to tweak it.</p>

      {profile.vibeWords.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.vibeWords.map((w) => (
            <Chip key={w} size="sm" tone="accent">
              {w}
            </Chip>
          ))}
          {profile.palette.map((p) => (
            <span key={p.hex} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line pl-1 pr-2.5 text-[12px] text-ink-2">
              <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: p.hex }} />
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Categories */}
      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-ink">Your assortment</h2>
        <p className="text-caption mt-1">Tell us what to do with each section.</p>
        <div className="mt-4 space-y-5">
          <AnimatePresence initial={false}>
            {profile.categories.map((c) => {
              const sig = analysis.categories?.find((s) => s.name === c.name);
              const evidence = evidenceFor(c.name).map((id) => frameById.get(id)).filter(Boolean).slice(0, 3);
              return (
                <motion.div key={c.name} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={c.intent === "skip" ? "opacity-60" : ""}>
                  <div className="flex items-start gap-3">
                    <div className="flex -space-x-2">
                      {evidence.length ? (
                        evidence.map((f) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={f!.id} src={f!.dataUrl} alt="" className="h-11 w-11 rounded-[6px] border-2 border-white object-cover shadow-sm" />
                        ))
                      ) : (
                        <span className="h-11 w-11 rounded-[6px] bg-surface-2" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{c.name}</p>
                      <p className="text-caption truncate">
                        {SHARE_LABEL[c.share]}
                        {sig?.examples?.length ? ` · ${sig.examples.slice(0, 3).join(", ")}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <Segmented size="sm" value={c.intent} options={INTENTS} onChange={(v) => setCategoryIntent(c.name, v)} />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="mt-4">
          {addingCategory ? (
            <div className="flex flex-wrap gap-2">
              {remainingCategories.map((c) => (
                <Chip
                  key={c}
                  size="sm"
                  active={false}
                  onClick={() => {
                    dispatch({ type: "patchProfile", patch: { categories: [...profile.categories, { name: c, share: "trace", intent: "more" }] } });
                    setAddingCategory(false);
                  }}
                >
                  <Plus size={12} /> {c}
                </Chip>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCategory(true)} className="text-[13px] text-ink underline underline-offset-4">
              Add a category we missed
            </button>
          )}
        </div>
      </section>

      {/* Styles */}
      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-ink">Your look</h2>
        <p className="text-caption mt-1">Styles we&apos;ll lean toward. Tap to turn off.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.styles?.map((s) => (
            <Chip key={s.name} size="sm" active={profile.styles.includes(s.name)} onClick={() => toggleStyle(s.name)}>
              {styleLabel(s.name)}
            </Chip>
          ))}
          {profile.styles
            .filter((s) => !analysis.styles?.some((a) => a.name === s))
            .map((s) => (
              <Chip key={s} size="sm" active onClick={() => toggleStyle(s)}>
                {styleLabel(s)}
              </Chip>
            ))}
          {addingStyle ? (
            remainingStyles.map((s) => (
              <Chip
                key={s}
                size="sm"
                active={false}
                onClick={() => {
                  toggleStyle(s);
                  setAddingStyle(false);
                }}
              >
                <Plus size={12} /> {styleLabel(s)}
              </Chip>
            ))
          ) : (
            <Chip size="sm" active={false} onClick={() => setAddingStyle(true)}>
              <Plus size={12} /> Add
            </Chip>
          )}
        </div>
        {profile.materials.length > 0 && (
          <p className="text-caption mt-3">
            Materials we noticed: <span className="text-ink-2">{profile.materials.join(", ")}</span>
          </p>
        )}
      </section>

      {/* Price */}
      <section className="mt-8">
        <h2 className="text-[17px] font-semibold text-ink">Your price point</h2>
        <p className="text-caption mt-1">{analysis.price_position?.rationale}</p>
        <div className="mt-3">
          <Segmented<PriceTier | "unknown">
            value={profile.priceTier}
            options={[
              { value: "value", label: "Value" },
              { value: "mid", label: "Mid" },
              { value: "premium", label: "Premium" },
              { value: "unknown", label: "Show all" },
            ]}
            onChange={(v) => dispatch({ type: "patchProfile", patch: { priceTier: v } })}
          />
        </div>
      </section>

      {/* Complements */}
      {analysis.suggested_complements && analysis.suggested_complements.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold text-ink">Might pair well</h2>
          <p className="text-caption mt-1">Not on your shelves yet. Keep the ones you&apos;d consider.</p>
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
                  className={`flex w-full items-start gap-3 rounded-[var(--radius)] border p-3 text-left transition-colors ${on ? "border-ink bg-surface-2" : "border-line"}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-white" : "border-line"}`}>
                    {on && <Plus size={12} strokeWidth={3} />}
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

      {/* Mode */}
      <section className="mt-8 mb-2">
        <h2 className="text-[17px] font-semibold text-ink">What are you buying for right now?</h2>
        <div className="mt-3 space-y-2">
          {MODES.map((m) => {
            const on = profile.mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`w-full rounded-[var(--radius)] border p-3 text-left transition-colors ${on ? "border-ink bg-surface-2" : "border-line"}`}
              >
                <span className="block text-[14px] font-medium text-ink">{m.title}</span>
                <span className="text-caption block">{m.body}</span>
              </button>
            );
          })}
        </div>
      </section>
      <button
        type="button"
        onClick={() => {
          dispatch({ type: "resetScan" });
          router.replace("/onboarding/scan");
        }}
        className="mb-2 mt-4 w-full py-2 text-center text-[13px] text-muted underline underline-offset-4"
      >
        Delete my walkthrough and start over
      </button>
    </Screen>
  );
}
