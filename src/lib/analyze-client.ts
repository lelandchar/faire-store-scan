import { parse, Allow } from "partial-json";
import { AnalysisSchema } from "./analysis-schema";
import type { Analysis, Frame } from "./types";

export interface AnalyzeMeta {
  mock?: boolean;
  model?: string;
  usage?: { input: number; output: number };
}

export async function runAnalysis(opts: {
  frames: Frame[];
  context: { storeName?: string; storeType?: string; description?: string; sampleSlug?: string };
  onPartial: (partial: Partial<Analysis>) => void;
  onMeta?: (meta: AnalyzeMeta) => void;
  signal?: AbortSignal;
}): Promise<Analysis> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      frames: opts.frames.map((f) => ({ id: f.id, timestampMs: f.timestampMs, dataUrl: f.dataUrl })),
      context: opts.context,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6)) as {
        delta?: string;
        replace?: string;
        error?: string;
        status?: string;
        done?: boolean;
        mock?: boolean;
        model?: string;
        usage?: { input: number; output: number };
      };
      if (evt.error) throw new Error(evt.error);
      if (evt.status === "started") opts.onMeta?.({ mock: evt.mock });
      if (evt.delta) {
        text += evt.delta;
        try {
          opts.onPartial(parse(text, Allow.ALL) as Partial<Analysis>);
        } catch {
          /* incomplete token boundary; wait for more */
        }
      }
      if (evt.replace) text = evt.replace;
      if (evt.done) opts.onMeta?.({ mock: evt.mock, model: evt.model, usage: evt.usage });
    }
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The analysis came back incomplete. Please try again.");
  }
  const result = AnalysisSchema.safeParse(raw);
  if (!result.success) throw new Error("The analysis came back malformed. Please try again.");
  return result.data as Analysis;
}
