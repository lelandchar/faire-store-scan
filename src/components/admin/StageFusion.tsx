"use client";

import { Segmented } from "@/components/Segmented";
import { effectiveWeights, WEIGHTS, type Ranked } from "@/lib/ranking";
import type { FusionWeights } from "@/lib/retrieval";
import type { Category, CategoryIntent, StoreProfile } from "@/lib/types";
import { Card, DeltaBadge, Mono, Placeholder, TD, TH, Thumb, fmt } from "./ui";

// Same three options the retailer sees on /onboarding/profile.
const INTENTS: { value: CategoryIntent; label: string }[] = [
  { value: "more", label: "More like this" },
  { value: "stocked", label: "Already covered" },
  { value: "skip", label: "Not for me" },
];

const CHANNELS = ["tag", "visual", "semantic"] as const;

export function StageFusion({
  weights,
  onWeights,
  ranked,
  hasVisual,
  hasSemantic,
  profile,
  onIntent,
  catalogLabel,
  catalogCount,
}: {
  weights: FusionWeights;
  onWeights: (w: FusionWeights) => void;
  ranked: Ranked[] | null;
  hasVisual: boolean;
  hasSemantic: boolean;
  profile: StoreProfile | null;
  onIntent: (name: Category, intent: CategoryIntent) => void;
  catalogLabel: string;
  catalogCount: number;
}) {
  const eff = effectiveWeights(weights, hasVisual, hasSemantic);
  return (
    <Card
      step="Stage 4"
      title="Fusion & ranking"
      subtitle="personalize(catalog, profile, { scores, weights }) in ranking.ts. The tag channel is a transparent linear score over the confirmed profile; visual and semantic are the min–max normalized embedding scores from Stage 3. Everything here is deterministic, so every row can carry a reason the retailer can read."
    >
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">
              Fusion weights <Mono className="text-muted">(state.weights → effectiveWeights)</Mono>
            </p>
            <div className="space-y-2">
              {CHANNELS.map((k) => {
                const available = k === "tag" || (k === "visual" ? hasVisual : hasSemantic);
                return (
                  <label key={k} className="grid grid-cols-[68px_1fr_44px_72px] items-center gap-2 text-[13px]">
                    <span className={available ? "text-ink" : "text-muted line-through"}>{k}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[k]}
                      onChange={(e) => onWeights({ ...weights, [k]: Number(e.target.value) })}
                      style={{ accentColor: "var(--ink)" }}
                      aria-label={`${k} weight`}
                    />
                    <Mono>{weights[k].toFixed(2)}</Mono>
                    <Mono className={available ? "text-ink-2" : "text-muted"} title="effective (renormalized) weight">
                      → {eff[k].toFixed(3)}
                    </Mono>
                  </label>
                );
              })}
            </div>
            <p className="text-caption mt-2">
              A channel with no scores drops to 0 and the rest renormalize to sum 1.{!hasVisual && " No embedding scores for this catalog → tag-only."}{" "}
              fused = w·tag + w·minmax(visual) + w·minmax(semantic). tag = {WEIGHTS.category}·category + {WEIGHTS.style}·style +{" "}
              {WEIGHTS.material}·material + {WEIGHTS.price}·price + {WEIGHTS.novelty}·novelty + {WEIGHTS.popularity}·popularity; “Not for
              me” pins a product at −1.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">
              Category intent <Mono className="text-muted">(state.profile.categories → patchProfile)</Mono>
            </p>
            {!profile ? (
              <Placeholder />
            ) : (
              <>
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className={TH}>Category</th>
                      <th className={TH}>Share</th>
                      <th className={TH}>Intent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.categories.map((c) => (
                      <tr key={c.name}>
                        <td className={`${TD} whitespace-nowrap font-medium text-ink`}>{c.name}</td>
                        <td className={TD}>
                          <Mono>{c.share}</Mono>
                        </td>
                        <td className={`${TD} w-[236px]`}>
                          <Segmented size="sm" value={c.intent} options={INTENTS} onChange={(v) => onIntent(c.name, v)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-caption mt-2 break-words">
                  mode <Mono>{profile.mode}</Mono> · price <Mono>{profile.priceTier}</Mono> · styles <Mono>{profile.styles.join(", ") || "—"}</Mono>{" "}
                  · materials <Mono>{profile.materials.join(", ") || "—"}</Mono> · complements <Mono>{profile.complements.join(", ") || "—"}</Mono>
                </p>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-[13px] font-medium text-ink">
            Fused ranking · top 40 of {catalogCount.toLocaleString()} <Mono className="text-muted">({catalogLabel})</Mono>
          </p>
          {!ranked ? (
            <Placeholder />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={TH}>#</th>
                    <th className={TH}>Product</th>
                    <th className={TH}>Category</th>
                    <th className={`${TH} text-right`}>tag</th>
                    <th className={`${TH} text-right`}>visual</th>
                    <th className={`${TH} text-right`}>semantic</th>
                    <th className={`${TH} text-right`}>fused</th>
                    <th className={`${TH} text-right`}>generic</th>
                    <th className={`${TH} text-right`}>Δ</th>
                    <th className={TH}>Top reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.slice(0, 40).map((r) => (
                    <tr key={r.product.id} className={r.score < 0 ? "opacity-50" : ""}>
                      <td className={TD}>
                        <Mono>{r.personalizedRank}</Mono>
                      </td>
                      <td className={`${TD} min-w-[200px]`}>
                        <span className="flex items-center gap-2">
                          <Thumb src={r.product.image} size={32} alt={r.product.name} />
                          <span className="line-clamp-2 leading-[1.3] text-ink">{r.product.name}</span>
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink-2`}>{r.product.category}</td>
                      <td className={`${TD} text-right`}>
                        <Mono>{fmt(r.components.tag)}</Mono>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Mono>{fmt(r.components.visual)}</Mono>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Mono>{fmt(r.components.semantic)}</Mono>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Mono className="font-medium text-ink">{fmt(r.components.fused)}</Mono>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Mono>{r.genericRank}</Mono>
                      </td>
                      <td className={`${TD} text-right`}>
                        <DeltaBadge delta={r.delta} />
                      </td>
                      <td className={`${TD} min-w-[160px] text-ink-2`}>{r.reasons[0]?.text ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
