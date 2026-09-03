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
  if (!cache.has(name)) cache.set(name, load(name));
  return cache.get(name)!;
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
