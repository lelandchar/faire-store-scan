/** Benchmark notes for the vision models we route through OpenRouter (Artificial Analysis index, Sep 2026). */
export interface ModelNote {
  label: string;
  vendor: string;
  intelligence?: number;
  speedTps?: number;
  context?: string;
  inputPerM?: number;
  outputPerM?: number;
  inputs?: string;
  note?: string;
}

export const MODEL_NOTES: Record<string, ModelNote> = {
  "meta/muse-spark-1.3": {
    label: "Muse Spark 1.3 (xhigh)",
    vendor: "Meta",
    intelligence: 61,
    speedTps: 186,
    context: "1M",
    inputPerM: 1.25,
    outputPerM: 4.25,
    inputs: "text, image, video, file, audio",
    note: "Highest intelligence index in the recommended set; accepts native video, so a future version could skip frame sampling. Requires an 18+ attestation on the OpenRouter account.",
  },
  "anthropic/claude-sonnet-5": {
    label: "Claude Sonnet 5 (low)",
    vendor: "Anthropic",
    context: "1M",
    inputPerM: 2,
    outputPerM: 10,
    inputs: "text, image, file",
    note: "Fallback model. Strong structured-output adherence; ~16 s for 8 frames at low effort.",
  },
  "google/gemini-3.8-flash": {
    label: "Gemini 3.8 Flash (high)",
    vendor: "Google",
    intelligence: 59,
    speedTps: 299,
    context: "1M",
    inputPerM: 0.75,
    outputPerM: 3.75,
    inputs: "text, image, video, file, audio",
    note: "Fastest of the set; native video input.",
  },
  "qwen/qwen3.8-flash-next": {
    label: "Qwen3.8-Flash-Next",
    vendor: "Alibaba",
    intelligence: 56,
    speedTps: 86,
    context: "256K",
    inputPerM: 0.15,
    outputPerM: 0.47,
    note: "Cheapest on the index-cost metric.",
  },
};

export function modelNote(id?: string | null): ModelNote | undefined {
  if (!id) return undefined;
  return MODEL_NOTES[id] ?? MODEL_NOTES[id.replace(/^anthropic\//, "")] ?? undefined;
}
