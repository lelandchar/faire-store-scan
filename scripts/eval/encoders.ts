// Image/text encoders for the offline evaluation. "clip-b32" is what the app ships;
// the others are candidates. All vectors are L2-normalized.
import path from "node:path";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
  env,
  type Tensor,
} from "@huggingface/transformers";

env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR ?? path.join(process.cwd(), ".cache", "transformers");
env.useFSCache = true;
env.allowLocalModels = false;

export const ENCODERS = {
  "clip-b32": { model: "Xenova/clip-vit-base-patch32", family: "clip" },
  "clip-b16": { model: "Xenova/clip-vit-base-patch16", family: "clip" },
  "clip-l14": { model: "Xenova/clip-vit-large-patch14", family: "clip" },
  "siglip-b16": { model: "Xenova/siglip-base-patch16-224", family: "siglip" },
  /** Hosted multimodal embedding through OpenRouter (text and images in one space, 768-d requested). */
  gemini: { model: "google/gemini-embedding-2", family: "gemini" },
} as const;
export type EncoderName = keyof typeof ENCODERS;

export interface Encoder {
  name: EncoderName;
  model: string;
  embedImages(inputs: (Buffer | string)[]): Promise<Float32Array[]>;
  embedTexts(texts: string[]): Promise<Float32Array[]>;
}

function rows(t: Tensor): Float32Array[] {
  const [n, dim] = t.dims as number[];
  const data = t.data as Float32Array;
  const out: Float32Array[] = [];
  for (let r = 0; r < n; r++) {
    const v = Float32Array.from(data.subarray(r * dim, (r + 1) * dim));
    let s = 0;
    for (let i = 0; i < dim; i++) s += v[i] * v[i];
    const norm = Math.sqrt(s) || 1;
    for (let i = 0; i < dim; i++) v[i] /= norm;
    out.push(v);
  }
  return out;
}

async function toRawImage(input: Buffer | string): Promise<RawImage> {
  if (typeof input === "string") return RawImage.read(input);
  return RawImage.fromBlob(new Blob([new Uint8Array(input)]));
}

const cache = new Map<EncoderName, Promise<Encoder>>();

export function getEncoder(name: EncoderName): Promise<Encoder> {
  if (!cache.has(name)) cache.set(name, ENCODERS[name].family === "gemini" ? loadGemini(name) : load(name));
  return cache.get(name)!;
}

async function openRouterKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const fs = await import("node:fs/promises");
  const txt = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
  const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(txt);
  if (!m) throw new Error("OPENROUTER_API_KEY not found");
  return m[1].trim();
}

async function loadGemini(name: EncoderName): Promise<Encoder> {
  const { model } = ENCODERS[name];
  const key = await openRouterKey();
  const DIM = 768;
  const BATCH = 8;
  const fs = await import("node:fs/promises");
  const toDataUrl = async (input: Buffer | string): Promise<string> => {
    if (typeof input === "string" && input.startsWith("data:")) return input;
    const buf = typeof input === "string" ? await fs.readFile(input) : input;
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  };
  const call = async (inputs: unknown[]): Promise<Float32Array[]> => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, dimensions: DIM, input: inputs }),
      });
      if (res.ok) {
        const j = (await res.json()) as { data: { index: number; embedding: number[] }[] };
        const rowsOut = [...j.data].sort((a, b) => a.index - b.index).map((d) => {
          const v = Float32Array.from(d.embedding);
          let s = 0;
          for (let i = 0; i < v.length; i++) s += v[i] * v[i];
          const n = Math.sqrt(s) || 1;
          for (let i = 0; i < v.length; i++) v[i] /= n;
          return v;
        });
        if (rowsOut.length !== inputs.length) throw new Error(`gemini embeddings: got ${rowsOut.length} for ${inputs.length} inputs`);
        return rowsOut;
      }
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 4000 * (attempt + 1);
        console.error(`[gemini] ${res.status} on a batch of ${inputs.length}; retrying in ${wait} ms: ${text.slice(0, 160)}`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error(`gemini embeddings ${res.status}: ${text.slice(0, 300)}`);
    }
    throw new Error("gemini embeddings: gave up after retries");
  };
  return {
    name,
    model,
    async embedImages(inputs) {
      const out: Float32Array[] = [];
      for (let i = 0; i < inputs.length; i += BATCH) {
        const chunk = await Promise.all(inputs.slice(i, i + BATCH).map(toDataUrl));
        out.push(...(await call(chunk.map((url) => ({ content: [{ type: "image_url", image_url: { url } }] })))));
      }
      return out;
    },
    async embedTexts(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += BATCH) out.push(...(await call(texts.slice(i, i + BATCH))));
      return out;
    },
  };
}

async function load(name: EncoderName): Promise<Encoder> {
  const { model, family } = ENCODERS[name];
  const dtype = "q8" as const;
  const t0 = performance.now();
  const [processor, tokenizer] = await Promise.all([AutoProcessor.from_pretrained(model), AutoTokenizer.from_pretrained(model)]);
  const vision = family === "clip" ? await CLIPVisionModelWithProjection.from_pretrained(model, { dtype }) : await SiglipVisionModel.from_pretrained(model, { dtype });
  const text = family === "clip" ? await CLIPTextModelWithProjection.from_pretrained(model, { dtype }) : await SiglipTextModel.from_pretrained(model, { dtype });
  console.error(`[encoders] ${name} (${model}) loaded in ${Math.round(performance.now() - t0)} ms`);
  const IMAGE_BATCH = 8;
  const TEXT_BATCH = 32;
  return {
    name,
    model,
    async embedImages(inputs) {
      const out: Float32Array[] = [];
      for (let i = 0; i < inputs.length; i += IMAGE_BATCH) {
        const images = await Promise.all(inputs.slice(i, i + IMAGE_BATCH).map(toRawImage));
        const res = (await vision(await processor(images))) as Record<string, Tensor>;
        out.push(...rows(res.image_embeds ?? res.pooler_output));
      }
      return out;
    },
    async embedTexts(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += TEXT_BATCH) {
        const chunk = texts.slice(i, i + TEXT_BATCH);
        const inputs = await tokenizer(chunk, family === "siglip" ? { padding: "max_length", truncation: true } : { padding: true, truncation: true });
        const res = (await text(inputs)) as Record<string, Tensor>;
        out.push(...rows(res.text_embeds ?? res.pooler_output));
      }
      return out;
    },
  };
}
