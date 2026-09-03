"use client";

import { motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { CATALOG } from "@/lib/catalog";
import { styleLabel } from "@/lib/ranking";
import { useOnboarding } from "@/lib/store";
import { STYLES, type Style } from "@/lib/types";

const STYLE_BLURB: Record<Style, string> = {
  minimalist: "Clean lines, quiet palettes, nothing extra",
  "modern-farmhouse": "Warm woods, white walls, everyday useful",
  boho: "Layered textures, rattan, sun-washed color",
  coastal: "Airy, weathered, blues and sand",
  cottagecore: "Florals, gingham, soft and homemade",
  playful: "Bright color, humor, a little unexpected",
  luxe: "Polished finishes, rich materials, gifting-ready",
  rustic: "Raw wood, iron, honest and handmade",
  vintage: "Found objects, patina, a story per piece",
  scandinavian: "Pale wood, function first, calm",
  maximalist: "More is more: pattern on pattern",
  literary: "Paper, ink, quiet corners to read",
  natural: "Linen, stoneware, plants, undyed tones",
};

/** Screen 2 of 3: the look the walkthrough suggests, illustrated with catalog examples. */
export default function StylePage() {
  const router = useRouter();
  const { state, toggleStyle } = useOnboarding();
  const { profile, analysis } = state;
  const [adding, setAdding] = useState(false);

  const detected = useMemo(() => (analysis?.styles ?? []).map((s) => s.name), [analysis]);
  const extra = useMemo(() => (profile?.styles ?? []).filter((s) => !detected.includes(s)), [profile, detected]);
  const shown = [...detected, ...extra];
  const examplesFor = (style: Style) => CATALOG.filter((p) => p.styles.includes(style)).slice(0, 3);

  if (!profile || !analysis) {
    return (
      <Screen back="/onboarding/scan" title="Nothing to show yet">
        <div className="mt-8">
          <Button onClick={() => router.replace("/onboarding/scan")}>Show us your shelves</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      back="/onboarding/profile"
      footer={
        <Button onClick={() => router.push("/onboarding/personalize")}>
          Next
        </Button>
      }
    >
      <p className="text-caption uppercase tracking-[0.14em]">Step 2 of 3 · Your style</p>
      <h1 className="text-display-sm mt-2 rise">This is the look we&apos;ll shop for</h1>
      <p className="text-body mt-3 rise">Keep the styles that feel like your store. We&apos;ll lean toward brands that match.</p>

      {profile.vibeWords.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {profile.vibeWords.map((w) => (
            <Chip key={w} size="sm" tone="accent">
              {w}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {shown.map((s, i) => {
          const on = profile.styles.includes(s);
          const ex = examplesFor(s);
          return (
            <motion.button
              key={s}
              type="button"
              onClick={() => toggleStyle(s)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${on ? "border-ink bg-white" : "border-line bg-surface-2 opacity-70"}`}
            >
              <div className="flex shrink-0 -space-x-2">
                {ex.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.image} alt="" className="h-12 w-12 rounded-[6px] border-2 border-white object-cover shadow-sm" />
                ))}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium capitalize text-ink">{styleLabel(s)}</span>
                <span className="text-caption block">{STYLE_BLURB[s]}</span>
              </span>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
                {on && <Check size={13} strokeWidth={3} />}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 mb-2">
        {adding ? (
          <div className="flex flex-wrap gap-2">
            {STYLES.filter((s) => !shown.includes(s)).map((s) => (
              <Chip
                key={s}
                size="sm"
                active={false}
                onClick={() => {
                  toggleStyle(s);
                  setAdding(false);
                }}
              >
                <Plus size={12} /> {styleLabel(s)}
              </Chip>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-[13px] text-ink underline underline-offset-4">
            Add a style
          </button>
        )}
        {profile.materials.length > 0 && (
          <p className="text-caption mt-4">
            Materials we noticed: <span className="text-ink-2">{profile.materials.join(", ")}</span>
          </p>
        )}
      </div>
    </Screen>
  );
}
