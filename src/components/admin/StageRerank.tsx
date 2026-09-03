"use client";

import type { Ranked } from "@/lib/ranking";
import type { RerankResult } from "@/lib/rerank";
import type { OnboardingState } from "@/lib/store";
import { Card, DeltaBadge, KV, Mono, Placeholder, TD, TH, Thumb, fmtMs } from "./ui";

export function StageRerank({
  rerank,
  status,
  error,
  before,
  after,
}: {
  rerank: RerankResult | null;
  status: OnboardingState["rerankStatus"];
  error?: string | null;
  before: Ranked[] | null;
  after: Ranked[] | null;
}) {
  const beforeRank = new Map((before ?? []).map((r) => [r.product.id, r.personalizedRank]));
  const rows = (after ?? []).filter((r) => r.components.buyer !== null);
  const fits = rows.map((r) => r.components.buyer as number);
  const hist = [1, 2, 3, 4, 5].map((f) => fits.filter((x) => x === f).length);
  return (
    <Card
      step="Stage 5"
      title="LLM-based second pass"
      subtitle="The top 60 candidates from fusion go back to the vision LM with a brief of the confirmed store (note, categories, look, materials, buying goal) and a 192px thumbnail each. It rates every product 1–5 for fit with the store; the fused score shifts by 0.15 per point away from 3, so a 5 gains 0.30 and a 1 loses 0.30. Unreviewed products keep their fused score, which puts a poorly reviewed product below the best unreviewed ones. Three batches of 20 run in parallel. The reranker defaults to Qwen3.8-Flash with thinking off (about 7 s per batch of 20; Sonnet 5 takes 5 s and Muse Spark 23 s; RERANK_MODEL overrides), with the same fallback rules as the store read; the mock rates deterministically. On the offline evaluation this is the step that lifts the judged fit of the top 20 the most."
    >
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <KV
            items={[
              { k: "Model", v: <Mono>{rerank ? (rerank.mock ? "mock" : rerank.model) : status === "running" ? "reviewing…" : "—"}</Mono> },
              { k: "Effort", v: <Mono>{rerank?.effort ?? "—"}</Mono> },
              ...(rerank?.fallbackReason ? [{ k: "Fallback", v: <span className="text-[12px] text-orange">{rerank.fallbackReason}</span> }] : []),
              { k: "Latency", v: <Mono>{fmtMs(rerank?.ms)}</Mono> },
              { k: "Reviewed", v: <Mono>{rerank ? `${Object.keys(rerank.fits).length} of ${rerank.count}` : "—"}</Mono> },
              {
                k: "Status",
                v: (
                  <Mono className={status === "error" ? "text-danger" : ""}>
                    {status}
                    {error ? ` · ${error}` : ""}
                  </Mono>
                ),
              },
              { k: "Fit histogram", v: <Mono>{rows.length ? hist.map((n, i) => `${i + 1}:${n}`).join("  ") : "—"}</Mono> },
            ]}
          />
        </div>
        <div className="min-w-0">
          {!rows.length ? (
            <Placeholder>{status === "running" ? "The reranker is scoring the top candidates…" : "Run a sample to populate."}</Placeholder>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-[6px] border border-line">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className={`${TH} text-right`}>after</th>
                    <th className={`${TH} text-right`}>before</th>
                    <th className={TH}>product</th>
                    <th className={TH}>category</th>
                    <th className={`${TH} text-right`}>fit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const b = beforeRank.get(r.product.id) ?? 0;
                    return (
                      <tr key={r.product.id} className="border-t border-line">
                        <td className={`${TD} text-right`}>
                          <Mono>{r.personalizedRank}</Mono>
                        </td>
                        <td className={`${TD} text-right`}>
                          <Mono>{b || "—"}</Mono> {b ? <DeltaBadge delta={b - r.personalizedRank} /> : null}
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-2">
                            <Thumb src={r.product.image} size={28} />
                            <span className="line-clamp-1">{r.product.name}</span>
                          </span>
                        </td>
                        <td className={`${TD} text-muted`}>{r.product.category}</td>
                        <td className={`${TD} text-right`}>
                          <Mono className={(r.components.buyer ?? 0) >= 4 ? "text-success" : (r.components.buyer ?? 0) <= 2 ? "text-danger" : ""}>{r.components.buyer}</Mono>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
