"use client";

import { styleLabel } from "@/lib/ranking";
import { useOnboarding } from "@/lib/store";

/**
 * A reminder of what the walkthrough saw, beside the phone on desktop, so a reviewer
 * can compare the personalized feed with the store it came from.
 */
export function StoreRecap() {
  const { state, hydrated } = useOnboarding();
  if (!hydrated || !state.profile) return null;
  const p = state.profile;
  const frames = state.frames.slice(0, 8);
  const carrying = p.categories.filter((c) => c.intent !== "skip");
  const skipped = p.categories.filter((c) => c.intent === "skip");
  const storeType = state.analysis?.store_read?.store_type_guess?.trim() || p.storeType;
  return (
    <aside className="stage-side stage-side--left">
      <p className="text-caption uppercase tracking-[0.12em]">Your store</p>
      <p className="mt-2 font-serif text-[22px] leading-tight text-ink">{state.storeName || "Your store"}</p>
      {storeType && <p className="text-caption mt-1 leading-snug">{storeType}</p>}
      {frames.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-1">
          {frames.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={f.dataUrl} alt="" className="aspect-[4/3] w-full rounded-[4px] object-cover" />
          ))}
        </div>
      )}
      {p.summary && <p className="mt-3 line-clamp-6 text-[13px] leading-snug text-ink-2">{p.summary}</p>}
      <p className="text-caption mt-4 uppercase tracking-[0.1em]">On your shelves</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {carrying.map((c) => (
          <li key={c.name} className="rounded-full border border-line bg-white px-2.5 py-1 text-[12px] text-ink">
            {c.name}
          </li>
        ))}
        {p.complements.map((c) => (
          <li key={`+${c}`} className="rounded-full border border-dashed border-line px-2.5 py-1 text-[12px] text-ink-2">
            + {c}
          </li>
        ))}
      </ul>
      {skipped.length > 0 && <p className="text-caption mt-2 leading-snug">Not interested: {skipped.map((c) => c.name.toLowerCase()).join(", ")}</p>}
      {p.styles.length > 0 && (
        <>
          <p className="text-caption mt-4 uppercase tracking-[0.1em]">Your look</p>
          <p className="mt-1 text-[13px] text-ink">{p.styles.map(styleLabel).join(" · ")}</p>
        </>
      )}
    </aside>
  );
}
