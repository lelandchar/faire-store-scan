"use client";

import Link from "next/link";
import { useOnboarding } from "@/lib/store";

/**
 * The generic-vs-personalized switch lives outside the app UI: beside the phone
 * on desktop, as a small floating pill on a real phone.
 */
export function FeedToggle({ variant }: { variant: "side" | "floating" }) {
  const { state, dispatch, hydrated } = useOnboarding();
  if (!hydrated) return null;
  const hasProfile = !!state.profile;
  const on = state.personalized && hasProfile;
  const set = (value: boolean) => dispatch({ type: "setPersonalized", value });

  const segmented = (
    <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-[13px]" role="radiogroup" aria-label="Homepage view">
      <button
        type="button"
        role="radio"
        aria-checked={!on}
        onClick={() => set(false)}
        className={`rounded-full px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/40 ${!on ? "bg-ink text-white" : "text-ink-2"}`}
      >
        Generic
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={!hasProfile}
        onClick={() => set(true)}
        className={`rounded-full px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/40 ${on ? "bg-ink text-white" : hasProfile ? "text-ink-2" : "text-muted-2"}`}
      >
        Personalized
      </button>
    </div>
  );

  if (variant === "floating") {
    return <div className="feed-toggle-floating">{segmented}</div>;
  }
  return (
    <aside className="stage-side">
      <p className="text-caption uppercase tracking-[0.12em]">Homepage view</p>
      <div className="mt-2">{segmented}</div>
      <p className="text-caption mt-3 leading-snug">
        {hasProfile
          ? on
            ? "Ranked only from the walkthrough: what the retailer carries, their style, their goal, and visual matches to their shelves. No popularity signal."
            : "What a brand-new retailer sees today: popularity order, no store context."
          : "No walkthrough yet, so this is the generic feed."}
      </p>
      {!hasProfile && (
        <Link href="/onboarding/scan" className="mt-2 inline-block text-[13px] text-ink underline underline-offset-4">
          Film a store to personalize
        </Link>
      )}
    </aside>
  );
}
