"use client";

import { CATALOG_LABEL, getCatalog } from "@/lib/catalog";
import type { CatalogSource, RetrievalResult } from "@/lib/retrieval";
import type { OnboardingState } from "@/lib/store";
import type { Frame } from "@/lib/types";
import { Card, KV, Mono, Placeholder, TD, TH, Thumb, fmt, fmtMs } from "./ui";

function Vec({ v }: { v: number[] }) {
  return <Mono className="text-ink-2">[{v.map((x) => (x >= 0 ? " " : "") + x.toFixed(4)).join(", ")} …]</Mono>;
}

function stats(scores: RetrievalResult["scores"], key: "visual" | "semantic") {
  const vals: number[] = [];
  for (const s of Object.values(scores)) {
    const v = s[key];
    if (v !== null && v !== undefined) vals.push(v);
  }
  if (!vals.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / vals.length, n: vals.length };
}

const SUBTITLE =
  "Frames and the LM read are embedded with CLIP ViT-B/32 (transformers.js, int8 ONNX on CPU); every product image and product text in the catalog was embedded offline into a 512-d index. visual = cosine(product image, mean frame vector). semantic = ½·cosine(product image, store text) + ½·cosine(product text, store text), where store text is the mean of the prompt vectors below.";

export function StageEmbeddings({
  retrieval,
  status,
  error,
  frames,
  catalogSource,
}: {
  retrieval: RetrievalResult | null;
  status: OnboardingState["retrievalStatus"];
  error: string | null;
  frames: Frame[];
  catalogSource: CatalogSource;
}) {
  if (!retrieval) {
    return (
      <Card step="Stage 3" title="Embeddings" subtitle={SUBTITLE}>
        <Placeholder>
          {status === "running"
            ? "Embedding frames and scoring the catalog…"
            : status === "error"
              ? `Retrieval failed: ${error ?? "unknown"} — fusion falls back to tag-only.`
              : "Run a sample to populate."}
        </Placeholder>
      </Card>
    );
  }

  const products = new Map(getCatalog(retrieval.catalog).map((p) => [p.id, p]));
  const frameById = new Map(frames.map((f) => [f.id, f]));
  const vis = stats(retrieval.scores, "visual");
  const sem = stats(retrieval.scores, "semantic");
  const stale = retrieval.catalog !== catalogSource;
  const t = retrieval.timings;
  const timingRows: [string, number][] = [
    ["load index", t.loadMs],
    ["embed images", t.embedImagesMs],
    ["embed texts", t.embedTextsMs],
    ["score", t.scoreMs],
    ["total", t.totalMs],
  ];
  const distRows: [string, ReturnType<typeof stats>][] = [
    ["visual", vis],
    ["semantic", sem],
  ];

  return (
    <Card step="Stage 3" title="Embeddings" subtitle={SUBTITLE}>
      {stale && (
        <p className="mb-3 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2 text-[12px] text-danger">
          This index was computed against the {CATALOG_LABEL[retrieval.catalog]}; fusion below runs on the {CATALOG_LABEL[catalogSource]}, so
          these scores are not applied there. Re-run to refresh.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <KV
          items={[
            { k: "Model", v: <Mono>{retrieval.model}</Mono> },
            { k: "Dim", v: <Mono>{retrieval.dim}</Mono> },
            {
              k: "Catalog",
              v: (
                <>
                  {CATALOG_LABEL[retrieval.catalog]} <Mono className="text-muted">({retrieval.count.toLocaleString()} products)</Mono>
                </>
              ),
            },
            { k: "Status", v: <Mono className={status === "error" ? "text-danger" : ""}>{status}</Mono> },
            { k: "Frames", v: <Mono>{retrieval.frameNeighbors.length}</Mono> },
          ]}
        />
        <div>
          <p className="mb-1 text-[13px] font-medium text-ink">Timings (server)</p>
          <table className="border-collapse text-[12px]">
            <tbody>
              {timingRows.map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-4 text-muted">{k}</td>
                  <td className="text-right">
                    <Mono className={k === "total" ? "font-medium text-ink" : ""}>{fmtMs(v)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 text-[13px] font-medium text-ink">Raw cosine distribution across catalog</p>
          <table className="border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={TH}>channel</th>
                <th className={`${TH} text-right`}>min</th>
                <th className={`${TH} text-right`}>mean</th>
                <th className={`${TH} text-right`}>max</th>
                <th className={`${TH} text-right`}>n</th>
              </tr>
            </thead>
            <tbody>
              {distRows.map(([k, s]) => (
                <tr key={k}>
                  <td className={`${TD} text-ink`}>{k}</td>
                  <td className={`${TD} text-right`}>
                    <Mono>{fmt(s?.min)}</Mono>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Mono>{fmt(s?.mean)}</Mono>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Mono>{fmt(s?.max)}</Mono>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Mono>{s ? s.n : "—"}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-[13px] font-medium text-ink">
            Text prompts <Mono className="text-muted">(promptsFromAnalysis → CLIP text tower)</Mono>
          </p>
          {retrieval.prompts.length ? (
            <ol className="list-decimal space-y-0.5 pl-5 text-[12px]">
              {retrieval.prompts.map((p, i) => (
                <li key={i}>
                  <Mono className="text-ink-2">{p}</Mono>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] text-muted">none → semantic = null</p>
          )}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-[13px] font-medium text-ink">
            Store vector <Mono className="text-muted">(mean of frame vectors, L2-normalized · first 8 of {retrieval.dim})</Mono>
          </p>
          <div className="overflow-x-auto">
            <Vec v={retrieval.storeVectorPreview} />
          </div>
          <p className="mb-1 mt-3 text-[13px] font-medium text-ink">Frame vectors</p>
          <ul className="space-y-1 overflow-x-auto">
            {retrieval.frameVectorPreviews.map((p) => {
              const f = frameById.get(p.frameId);
              return (
                <li key={p.frameId} className="flex items-center gap-2 whitespace-nowrap">
                  {f ? <Thumb src={f.dataUrl} size={24} /> : <span className="h-6 w-6 shrink-0 rounded-[3px] bg-surface-2" />}
                  <Mono className="w-6 shrink-0 text-ink">{p.frameId}</Mono>
                  <Vec v={p.preview} />
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[13px] font-medium text-ink">
          Per-frame nearest neighbours <Mono className="text-muted">(top-5 catalog images by cosine to that single frame)</Mono>
        </p>
        <div className="space-y-2">
          {retrieval.frameNeighbors.map((fn) => {
            const f = frameById.get(fn.frameId);
            return (
              <div key={fn.frameId} className="flex items-start gap-3 border-t border-line pt-2">
                <div className="w-[72px] shrink-0">
                  {f ? <Thumb src={f.dataUrl} size={72} /> : <div className="h-[72px] w-[72px] rounded-[3px] bg-surface-2" />}
                  <Mono className="mt-1 block text-ink">{fn.frameId}</Mono>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {fn.neighbors.map((n) => {
                    const p = products.get(n.id);
                    return (
                      <div key={n.id} className="flex min-w-0 gap-2">
                        {p ? <Thumb src={p.image} size={56} alt={p.name} /> : <div className="h-14 w-14 shrink-0 rounded-[3px] bg-surface-2" />}
                        <div className="min-w-0 text-[11px] leading-[1.35]">
                          <p className="line-clamp-2 font-medium text-ink">{p?.name ?? n.id}</p>
                          <p className="truncate text-muted">{p?.category ?? "—"}</p>
                          <Mono className="text-ink-2">{fmt(n.score, 3)}</Mono>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-caption mt-3 max-w-[920px]">
          Caveat: CLIP image–image cosines are compressed. Across this catalog they cluster in roughly the 0.5–0.7 band (see the distribution
          above), so a raw cosine is not on the same scale as the 0–1 tag score. Before fusion each channel is min–max normalized across the
          catalog (ranking.ts → minMax), which preserves order but not distances — a 0.02 gap in cosine can become a 0.3 gap after
          normalization.
        </p>
      </div>
    </Card>
  );
}
