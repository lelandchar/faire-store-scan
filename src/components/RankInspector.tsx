"use client";

import { BUYER_STEP, effectiveWeights, WEIGHTS } from "@/lib/ranking";
import { useInspect } from "@/lib/inspect";
import { useOnboarding } from "@/lib/store";

function Bar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono text-[11px] text-ink">{display}</span>
      </div>
      <div className="mt-1 h-[4px] overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%`, transition: "width 0.25s ease-out" }} />
      </div>
    </div>
  );
}

/** Ranking breakdown for the hovered feed card: tag parts, embedding matches, the second-pass fit, and the fused score. */
export function RankInspector() {
  const { item, total } = useInspect();
  const { state } = useOnboarding();
  if (!item) {
    return <p className="text-caption mt-5 leading-snug">Hover a product in the feed to see why it ranks where it does.</p>;
  }
  const c = item.components;
  const w = effectiveWeights(state.weights, c.visual !== null, c.semantic !== null, c.nn !== null, c.centroid !== null);
  const buyerShift = c.buyer !== null ? (c.buyer - 3) * BUYER_STEP : 0;
  const parts = c.parts;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-caption uppercase tracking-[0.12em]">Why it ranks here</p>
      <div className="mt-2 flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.product.image} alt="" className="h-12 w-12 shrink-0 rounded-[4px] object-cover" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{item.product.name}</p>
          <p className="text-caption mt-0.5">
            #{item.personalizedRank}
            {total ? ` of ${total.toLocaleString()}` : ""} · {item.product.category}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        <Bar label="Category fit" value={parts.category} max={WEIGHTS.category} display={parts.category.toFixed(2)} />
        <Bar label="Style" value={parts.style} max={WEIGHTS.style} display={parts.style.toFixed(2)} />
        <Bar label="Materials" value={parts.material} max={WEIGHTS.material} display={parts.material.toFixed(2)} />
        <Bar label="Nearest-neighbour match" value={c.nn ?? 0} max={1} display={c.nn === null ? "n/a" : c.nn.toFixed(2)} />
        <Bar label="Store centroid" value={c.centroid ?? 0} max={1} display={c.centroid === null ? "n/a" : c.centroid.toFixed(2)} />
        <Bar label="Second-pass fit" value={c.buyer === null ? 0 : c.buyer - 1} max={4} display={c.buyer === null ? "not reviewed" : `${c.buyer} / 5`} />
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-2">
        fused {c.fused.toFixed(3)} = {w.tag.toFixed(2)}·tag {c.tag.toFixed(2)} + {w.nn.toFixed(2)}·nn {(c.nn ?? 0).toFixed(2)} + {w.centroid.toFixed(2)}·centroid{" "}
        {(c.centroid ?? 0).toFixed(2)}
        {w.visual > 0 ? ` + ${w.visual.toFixed(2)}·visual ${(c.visual ?? 0).toFixed(2)}` : ""}
        {w.semantic > 0 ? ` + ${w.semantic.toFixed(2)}·text ${(c.semantic ?? 0).toFixed(2)}` : ""}
        {c.buyer !== null ? ` ${buyerShift >= 0 ? "+" : "−"} ${Math.abs(buyerShift).toFixed(2)} rerank` : ""}
      </p>
      {item.reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.reasons.map((r) => (
            <li key={r.text} className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-2">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-accent" />
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
