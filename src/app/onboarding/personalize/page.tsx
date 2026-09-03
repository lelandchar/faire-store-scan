"use client";

import { useRouter } from "next/navigation";
import { StopSlider } from "@/components/Slider";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useOnboarding } from "@/lib/store";

const GOAL_CAPTIONS = [
  "Restock what sells: proven bestsellers in the categories you already carry.",
  "Mostly restock, with a few fresh names in your strongest sections.",
  "A balance: what you carry today, plus the categories that pair with it.",
  "Mostly new: brands that match your look, weighted toward what you don't have yet.",
  "Discover: fresh brands and adjacent categories first.",
];

const STRENGTH_CAPTIONS = [
  "Barely: close to the feed every new retailer sees.",
  "Lightly: a nudge toward your shelves.",
  "Moderately: your walkthrough shapes most rows.",
  "Strongly: almost everything is chosen for your store.",
  "Fully: only what fits your shelves, style and goal.",
];

/** Screen 3 of 3: two dials that tune how the walkthrough shapes the storefront. */
export default function PersonalizePage() {
  const router = useRouter();
  const { state, setExplore, setStrength } = useOnboarding();
  const profile = state.profile;
  if (!profile) {
    return (
      <Screen back="/onboarding/scan" title="Nothing to tune yet">
        <div className="mt-8">
          <Button onClick={() => router.replace("/onboarding/scan")}>Show us your shelves</Button>
        </div>
      </Screen>
    );
  }
  const goalIdx = Math.round(profile.explore * 4);
  const strengthIdx = Math.round(profile.strength * 4);
  return (
    <Screen
      back="/onboarding/style"
      footer={
        <Button onClick={() => router.push("/onboarding/building")}>
          Looks right
        </Button>
      }
    >
      <p className="text-caption uppercase tracking-[0.14em]">Step 3 of 3 · Personalization</p>
      <h1 className="text-display-sm mt-2 rise">Tune your storefront</h1>
      <p className="text-body mt-3 rise">Two dials. You can change them anytime from your profile.</p>

      <section className="mt-8 rounded-[var(--radius-lg)] border border-line p-4">
        <h2 className="text-[16px] font-semibold text-ink">What are you buying for right now?</h2>
        <div className="mt-4">
          <StopSlider value={profile.explore} onChange={setExplore} leftLabel="Restock what sells" rightLabel="Discover new brands" ariaLabel="Buying goal" />
        </div>
        <p className="text-caption mt-3 min-h-[36px]">{GOAL_CAPTIONS[goalIdx]}</p>
      </section>

      <section className="mt-4 rounded-[var(--radius-lg)] border border-line p-4">
        <h2 className="text-[16px] font-semibold text-ink">How much should your walkthrough shape your feed?</h2>
        <div className="mt-4">
          <StopSlider value={profile.strength} onChange={setStrength} leftLabel="Lightly" rightLabel="Fully" ariaLabel="Personalization strength" />
        </div>
        <p className="text-caption mt-3 min-h-[36px]">{STRENGTH_CAPTIONS[strengthIdx]}</p>
      </section>

      <button
        type="button"
        onClick={() => {
          router.replace("/onboarding/scan");
        }}
        className="mb-2 mt-6 w-full py-2 text-center text-[13px] text-muted underline underline-offset-4"
      >
        Film a different walkthrough
      </button>
    </Screen>
  );
}
