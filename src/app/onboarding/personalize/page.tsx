"use client";

import { useRouter } from "next/navigation";
import { StopSlider } from "@/components/Slider";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useOnboarding } from "@/lib/store";

const GOAL_CAPTIONS = [
  "Only the categories you sell today.",
  "Mostly what you sell today, with a few new names in your strongest sections.",
  "What you sell today, plus the categories that pair with it.",
  "Lean toward new categories that fit your look.",
  "New categories first.",
];

const STRENGTH_CAPTIONS = [
  "A light touch: your walkthrough nudges the order.",
  "Your walkthrough shapes most of what we recommend.",
  "Your walkthrough shapes almost everything we recommend.",
  "Nearly everything is chosen for your store.",
  "Only what fits your shelves, style and goal.",
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
  const walkthrough = state.source === "photos" || (state.source === "sample" && !(state.sampleSlug ?? "").endsWith("-video")) ? "photo walkthrough" : "video walkthrough";
  return (
    <Screen
      back="/onboarding/style"
      footer={
        <Button onClick={() => router.push("/onboarding/building")}>
          Looks right
        </Button>
      }
    >
      <p className="text-caption uppercase tracking-[0.14em]">Step 3 of 3</p>
      <h1 className="text-display-sm mt-2 rise">Tune your storefront</h1>

      <section className="mt-8 rounded-[var(--radius-lg)] border border-line p-4">
        <h2 className="text-[16px] font-semibold text-ink">How much should your {walkthrough} shape what we recommend?</h2>
        <div className="mt-4">
          <StopSlider value={profile.strength} onChange={setStrength} leftLabel="Lightly" rightLabel="Fully" ariaLabel="Personalization strength" />
        </div>
        <p className="text-caption mt-3 min-h-[36px]">{STRENGTH_CAPTIONS[strengthIdx]}</p>
      </section>

      <section className="mt-4 rounded-[var(--radius-lg)] border border-line p-4">
        <h2 className="text-[16px] font-semibold text-ink">How adventurous are you feeling about adding new categories to your store?</h2>
        <div className="mt-4">
          <StopSlider value={profile.explore} onChange={setExplore} leftLabel="Restock what I sell today" rightLabel="Mix in new categories" ariaLabel="New categories" />
        </div>
        <p className="text-caption mt-3 min-h-[36px]">{GOAL_CAPTIONS[goalIdx]}</p>
      </section>
    </Screen>
  );
}
