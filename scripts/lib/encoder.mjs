// Plain-ESM image/text encoder used by the build-time scripts (embed-catalog, warm-models).
// Mirrors src/lib/embeddings.ts: keep DEFAULT_MODEL in sync.
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
} from "@huggingface/transformers";

export const DEFAULT_MODEL = "Xenova/siglip-base-patch16-224";
export const MODEL = process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
export const FAMILY = /siglip/i.test(MODEL) ? "siglip" : "clip";
export const DTYPE = process.env.EMBEDDING_DTYPE ?? "q8";
export const IMAGE_SIZE = 224;

env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR ?? path.join(process.cwd(), ".cache", "transformers");
env.useFSCache = true;
env.allowLocalModels = false;
env.allowRemoteModels = process.env.TRANSFORMERS_OFFLINE !== "1";

function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
function rows(t, count) {
  const [n, dim] = t.dims;
  if (n !== count) throw new Error(`unexpected shape [${t.dims}]`);
  const out = [];
  for (let r = 0; r < n; r++) out.push(normalize(t.data.slice(r * dim, (r + 1) * dim)));
  return out;
}

/** Load both towers once; returns { model, family, dim, embedImages(files), embedTexts(strings), loadMs }. */
export async function loadEncoder() {
  const t0 = performance.now();
  const opts = { dtype: DTYPE };
  const [processor, tokenizer] = await Promise.all([AutoProcessor.from_pretrained(MODEL), AutoTokenizer.from_pretrained(MODEL)]);
  const vision = FAMILY === "clip" ? await CLIPVisionModelWithProjection.from_pretrained(MODEL, opts) : await SiglipVisionModel.from_pretrained(MODEL, opts);
  const text = FAMILY === "clip" ? await CLIPTextModelWithProjection.from_pretrained(MODEL, opts) : await SiglipTextModel.from_pretrained(MODEL, opts);
  const loadMs = performance.now() - t0;
  let dim = 0;
  const IMAGE_BATCH = 8;
  const TEXT_BATCH = 32;
  async function embedRaw(images) {
    const res = await vision(await processor(images));
    const t = res.image_embeds ?? res.pooler_output;
    dim = t.dims[1];
    return rows(t, images.length);
  }
  return {
    model: MODEL,
    family: FAMILY,
    loadMs,
    get dim() {
      return dim;
    },
    async embedImages(files) {
      const out = [];
      for (let i = 0; i < files.length; i += IMAGE_BATCH) {
        const chunk = files.slice(i, i + IMAGE_BATCH);
        const images = await Promise.all(chunk.map((f) => (f instanceof RawImage ? f : RawImage.read(f))));
        out.push(...(await embedRaw(images)));
      }
      return out;
    },
    async embedTexts(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += TEXT_BATCH) {
        const chunk = texts.slice(i, i + TEXT_BATCH);
        const inputs = await tokenizer(chunk, FAMILY === "siglip" ? { padding: "max_length", truncation: true } : { padding: true, truncation: true });
        const res = await text(inputs);
        const t = res.text_embeds ?? res.pooler_output;
        dim = t.dims[1];
        out.push(...rows(t, chunk.length));
      }
      return out;
    },
    blank() {
      return new RawImage(new Uint8ClampedArray(IMAGE_SIZE * IMAGE_SIZE * 3), IMAGE_SIZE, IMAGE_SIZE, 3);
    },
  };
}
