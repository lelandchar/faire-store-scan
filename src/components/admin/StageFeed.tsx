"use client";

import { formatPrice } from "@/lib/catalog";
import type { Ranked } from "@/lib/ranking";
import type { Category, Product, StoreProfile } from "@/lib/types";
import { Card, DeltaBadge, Mono, Placeholder } from "./ui";

function Tile({ p, delta, inSet }: { p: Product; delta?: number; inSet: boolean }) {
  return (
    <div className="min-w-0">
      <div className="relative overflow-hidden rounded-[var(--radius)] bg-surface-2" style={{ aspectRatio: "1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
        {delta !== undefined && delta !== 0 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-1.5 py-0.5 shadow-sm">
            <DeltaBadge delta={delta} />
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-[1.3] text-ink">{p.name}</p>
      <p className="text-[11px] text-ink-2">
        <span className="font-semibold text-ink">{formatPrice(p.wholesalePrice)}</span> ·{" "}
        <span className={inSet ? "text-success" : "text-muted"}>{p.category}</span>
      </p>
    </div>
  );
}

export function StageFeed({ generic, personalized, profile }: { generic: Product[]; personalized: Ranked[] | null; profile: StoreProfile | null }) {
  const confirmed = new Set<Category>((profile?.categories ?? []).filter((c) => c.intent !== "skip").map((c) => c.name));
  const gTop = generic.slice(0, 12);
  const pTop = (personalized ?? []).filter((r) => r.score >= 0).slice(0, 12);
  const gHits = gTop.filter((p) => confirmed.has(p.category)).length;
  const pHits = pTop.filter((r) => confirmed.has(r.product.category)).length;

  return (
    <Card
      step="Stage 5"
      title="Feed comparison"
      subtitle="What the retailer sees on /home: the popularity prior every new account would get, versus the fused ranking from the confirmed profile. Green category labels are in the confirmed set; the badge is the rank delta versus generic."
    >
      {profile && personalized ? (
        <p className="mb-3 text-[13px] text-ink-2">
          Of each top 12, <Mono className="font-medium text-ink">{pHits}/12</Mono> personalized vs{" "}
          <Mono className="font-medium text-ink">{gHits}/12</Mono> generic fall in the categories the retailer confirmed (
          {Array.from(confirmed).join(", ") || "none"}).
        </p>
      ) : (
        <p className="mb-3 text-[13px] text-muted">Run a sample to compare against the generic feed.</p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-[13px] font-medium text-ink">
            Generic <span className="font-normal text-muted">(popularity prior · rankGeneric)</span>
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {gTop.map((p) => (
              <Tile key={p.id} p={p} inSet={confirmed.has(p.category)} />
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-[13px] font-medium text-ink">
            Personalized <span className="font-normal text-muted">(fused · personalize)</span>
          </h3>
          {pTop.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {pTop.map((r) => (
                <Tile key={r.product.id} p={r.product} delta={r.delta} inSet={confirmed.has(r.product.category)} />
              ))}
            </div>
          ) : (
            <Placeholder />
          )}
        </div>
      </div>
    </Card>
  );
}
