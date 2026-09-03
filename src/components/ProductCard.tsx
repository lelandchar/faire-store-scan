"use client";

import { motion } from "framer-motion";
import { Heart, Plus, Star, Store } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import type { Ranked } from "@/lib/ranking";
import type { Product } from "@/lib/types";

export interface FeedItem {
  product: Product;
  ranked?: Ranked;
}

export function ProductCard({
  item,
  personalized,
  onWhy,
  compact = false,
  index = 0,
}: {
  item: FeedItem;
  personalized: boolean;
  onWhy?: (r: Ranked) => void;
  compact?: boolean;
  index?: number;
}) {
  const p = item.product;
  const r = item.ranked;
  const topReason = personalized && r && r.reasons.length ? r.reasons[0] : null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0.7, 0.2, 1] }} className={compact ? "w-[156px] shrink-0" : ""}>
      <div className="relative overflow-hidden rounded-[var(--radius)] bg-surface-2" style={{ aspectRatio: "1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        {p.isBestseller && !p.ratingSynthetic && (
          <span className="absolute left-2 top-2 rounded-[3px] bg-white px-2 py-1 text-[11px] font-medium text-ink shadow-sm">Bestseller</span>
        )}
        <button type="button" aria-label="Save" className="absolute right-2 top-2 text-white drop-shadow">
          <Heart size={22} strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Add" className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-sm">
          <Plus size={18} strokeWidth={2} />
        </button>
        {personalized && r && r.delta >= 8 && (
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-teal shadow-sm">↑ {r.delta}</span>
        )}
      </div>
      <div className="mt-2">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-semibold text-ink">{formatPrice(p.wholesalePrice)}</span>
          <span className="text-[12px] text-muted">MSRP {formatPrice(p.msrp)}</span>
        </p>
        <p className="line-clamp-2 text-[14px] font-medium leading-[1.3] text-ink">{p.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-2">
          <Store size={12} strokeWidth={2} className="shrink-0 text-ink" />
          <span className="truncate underline underline-offset-2">{p.brand}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-2">
          {!p.ratingSynthetic && (
            <>
              <Star size={11} fill="currentColor" strokeWidth={0} /> {p.rating.toFixed(1)} ·{" "}
            </>
          )}
          ${p.minOrder} min
        </p>
        {topReason && (
          <button
            type="button"
            onClick={() => r && onWhy?.(r)}
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-left text-[11px] leading-tight text-ink"
          >
            <span className="truncate">{topReason.text}</span>
            <span className="shrink-0 text-muted">›</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
