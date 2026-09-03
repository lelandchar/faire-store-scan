# Local CLIP embeddings for store-frame -> product retrieval

Date: 2026-09-02. Numbers measured on an Apple M2 Max (12 cores, 32 GB), Node 22.20, `@huggingface/transformers` 4.2.0,
`onnxruntime-node` 1.24.3, `sharp` 0.35.4. Model: `Xenova/clip-vit-base-patch32`, int8 (`dtype: "q8"`) ONNX weights.

## TL;DR

- `src/lib/embeddings.ts` embeds store-photo frames and text prompts into the same 512-d CLIP space on the server,
  CPU only, no API key. Model load from a warm disk cache is ~0.3 s; a 1600x1200 JPEG embeds in ~25-35 ms alone or
  ~12-16 ms/image batched; a text prompt in ~1-6 ms. The Node process sits at ~400 MB RSS with the model loaded and
  ~600-700 MB while serving batches.
- `npm run embed` precomputes image + text vectors for every catalog product with an image file (currently 68/72) into
  `data/embeddings/catalog.json` (365 KB). At request time the ranking is a mean-of-frames vector dotted against
  68 catalog vectors: microseconds, no vector index needed.
- Sanity check passes: the six bookshop frames rank the journal/sketchbook/cookbook products first and "a bookstore"
  above "a home goods store"; the six home-gift frames rank the pillow/vase/bowl first and "a home goods store" above
  "a bookstore". 5/6 bookshop frames and 6/6 home-gift frames pick the right store type individually; the set mean is
  right in both cases.
- Railway: bake the 160 MB model cache into the image with `npm run warm-models` at build time (or mount a volume at
  `TRANSFORMERS_CACHE_DIR`). Do not let the first user request trigger a 150 MB download from huggingface.co.
- A production version at Faire would not use off-the-shelf CLIP at all; it would embed frames into Faire's own
  product-tower space and query the existing ANN index (details at the end).

## How the pipeline works

```
store frames (JPEG Buffer | data URL | path)            catalog products (data/catalog.json)
        |                                                        |  (offline, npm run embed)
   sharp decode                                                  |
        |                                                        v
   CLIP image processor: shortest edge -> 224, center crop, normalize      "name. category. subcategory. materials"
        |                                                        |                       |
   vision_model_quantized.onnx (ViT-B/32) -> projection -> 512-d  |            text_model_quantized.onnx -> 512-d
        |                                                        v                       v
   L2 normalize  --->  meanVector(frames)  --cosine-->  image vectors [68 x 512]   text vectors [68 x 512]
                                                                 |
                                            zero-shot styles: cosine(image, "a product photo in a {style} style"), top-2
```

**Module: `src/lib/embeddings.ts`** (server-only; throws if imported in a browser bundle)

```ts
export const EMBEDDING_MODEL = "Xenova/clip-vit-base-patch32";
export const EMBEDDING_DIM = 512;
export const EMBEDDING_DTYPE = "q8";
export const EMBEDDING_CACHE_DIR: string;              // TRANSFORMERS_CACHE_DIR ?? ./.cache/transformers

export function loadClip(): Promise<ClipBundle>;       // lazy singleton (processor, tokenizer, vision, text, loadMs)
export function warmEmbeddings(): Promise<{ loadMs; firstInferenceMs; cacheDir }>;
export function embedImages(inputs: (Buffer | string)[]): Promise<Float32Array[]>;  // JPEG buffers, data: URLs, paths, URLs
export function embedTexts(texts: string[]): Promise<Float32Array[]>;
export function cosine(a: Float32Array, b: Float32Array): number;
export function meanVector(vs: Float32Array[]): Float32Array;                       // re-normalized
export function normalize(v: Float32Array): Float32Array;                           // in place
```

Details that matter:

- **Lazy singleton on `globalThis`.** Nothing loads at import time; the first `embed*` call loads all four artifacts
  (processor config, tokenizer, vision tower, text tower) in parallel and caches the promise on `globalThis`, so
  `next dev` module re-evaluation does not reload 150 MB per edit. A failed load is evicted so the next call retries.
- **Both towers are loaded separately** (`CLIPVisionModelWithProjection`, `CLIPTextModelWithProjection`) rather than the
  fused `CLIPModel`, so image-only requests never touch the text ONNX session and vice versa.
- **All vectors are L2-normalized** by the module; transformers.js returns raw projection outputs (`image_embeds`,
  `text_embeds`, dims `[N, 512]`). `cosine()` still divides by norms so it is safe on vectors from elsewhere.
- **Batching.** Images go through the ONNX session 8 at a time, texts 32 at a time. Input order is preserved.
- **Input decoding.** `Buffer` and `data:` URLs are copied into a `Blob` and decoded by `RawImage.fromBlob` (sharp under
  the hood). Buffer, data URL and file path inputs of the same JPEG produce identical vectors (cosine 1.000000).
- **Environment.** transformers.js reads no environment variables itself, so the module sets `env.cacheDir` from
  `TRANSFORMERS_CACHE_DIR` (default `./.cache/transformers`), disables the pointless `node_modules/.../models` probe
  (`env.allowLocalModels = false`), and honours `TRANSFORMERS_OFFLINE=1` (fail fast instead of downloading).
- **Next.js.** `next.config.ts` lists `@huggingface/transformers`, `onnxruntime-node` and `sharp` in
  `serverExternalPackages` (Next 16 already externalizes all three by default; the explicit entry documents the
  dependency). `next build` and `npx tsc --noEmit -p .` both pass. Route handlers that use the module must be on the
  Node runtime (`export const runtime = "nodejs"`, as `/api/analyze` already is), never Edge.

**Scripts** (plain Node ESM, no TS loader, so they run unchanged in a Railway build step):

- `npm run embed` -> `scripts/embed-catalog.mjs`. Reads `data/catalog.json` and, if present, `data/catalog-public.json`
  (images resolved as `public/<product.image>`), skips and logs products whose image file is missing, and writes
  `data/embeddings/<catalogName>.json`:
  `{ model, dim, ids: string[], image: base64(Float32Array), text: base64(Float32Array), styles: Record<id, string[]> }`.
  Product text is `${name}. ${category}. ${subcategory}. ${materials.join(", ")}`. `styles` is the top-2 of
  cosine(product image vector, "a product photo in a {style} style") over the 13 `STYLES` in `src/lib/types.ts`, with
  readable phrasing ("modern farmhouse", "Scandinavian").
- `npm run warm-models` -> `scripts/warm-models.mjs`. Downloads (if needed) and loads the model, runs one blank image
  and one prompt through each tower, prints load time / first-inference time / RSS. Exit code 0 on success.

Decoding the JSON at request time:

```ts
import emb from "../../data/embeddings/catalog.json";
const decode = (b64: string) => {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
};
const image = decode(emb.image); // row i = image.subarray(i * emb.dim, (i + 1) * emb.dim), id = emb.ids[i]
```

## Timings (M2 Max)

| Step | Measured |
|---|---|
| Cold start, empty cache (download 150 MB from huggingface.co + load) | 2.5 s on this connection (~75 MB/s) |
| Load from warm disk cache (4 artifacts, parallel) | 270-370 ms |
| First inference after load (ONNX session init) | image ~50 ms, text ~7 ms |
| One 1600x1200 JPEG, decode + preprocess + vision tower | 25 / 29 / 35 ms (3 runs) |
| Batch of 6 sample frames | 97-99 ms (~16 ms/image) |
| Catalog build: 68 x 800x800 JPEGs | 837 ms (12 ms/image) |
| One text prompt | 3-6 ms |
| Batch of 6 prompts / 68 product strings | 6 ms / 101 ms (~1 ms/text) |
| `npm run embed` end to end (load + 68 images + 68 texts + 13 style prompts) | 1.45 s wall |

So an 8-frame scan costs roughly 150-250 ms of embedding on this machine. Expect 2-4x slower on a shared Railway vCPU
(no NEON/AMX-class SIMD wins, fewer cores), i.e. well under a second per scan; it is negligible next to the ~10 s
Claude vision call the scan already makes.

## Memory footprint

| State | RSS |
|---|---|
| Node before importing the module | 44 MB |
| After `import "@huggingface/transformers"` (onnxruntime-node + sharp loaded) | 107 MB |
| After model load (both towers, q8) | ~410-420 MB |
| While serving batches of 6-8 1600x1200 frames | ~600-700 MB |

On disk: 160 MB cache (`vision_model_quantized.onnx` 85 MB, `text_model_quantized.onnx` 61.5 MB, `tokenizer.json`
2.2 MB, three small configs). `npm install` added ~400 MB to `node_modules`: `onnxruntime-node` 210 MB (native
binaries), `onnxruntime-web` 130 MB (a hard dependency of transformers.js that Node never uses), `sharp` + libvips
~27 MB, transformers.js itself 31 MB. fp32 weights would be 335 + 242 MB and were not needed.

Budget ~1 GB of memory for the web service when the model is resident. Railway Hobby (8 GB) and Pro plans are fine;
the Trial/Free tiers are tight once Next.js's own footprint is added.

## Sanity check: sample frames vs catalog and store-type prompts

Six frames each from `public/samples/bookshop/` and `public/samples/home-gift/` were embedded, averaged with
`meanVector`, and compared against 12 catalog product images spanning 8 categories and six store-type prompts.

Bookshop mean vs catalog (cosine, top 6 of 12): `bj-05` Leather Travel Sketchbook 0.701, `bj-01` Linen-Bound Journal
0.632, `bj-02` Seasonal Baking Cookbook 0.620, `hd-03` Linen Throw Pillow 0.601, `bj-04` The Coastal Home photo book
0.598, `hd-01` Bud Vase 0.583. Bottom: `kt-01` Serving Bowl 0.516, `fd-02` Honey Jar 0.515.

Home-gift mean vs catalog (top 6): `hd-03` Linen Throw Pillow 0.685, `bj-02` Baking Cookbook 0.674, `hd-01` Bud Vase
0.667, `bj-05` Sketchbook 0.646, `kt-01` Serving Bowl 0.638, `cf-01` Soy Candle 0.629. Bottom: `fd-02` Honey 0.571,
`bj-04` photo book 0.566.

Set mean vs prompts (cosine):

| prompt | bookshop | home-gift |
|---|---|---|
| a bookstore | **0.326** | 0.260 |
| a home goods store | 0.293 | **0.313** |
| a pet store | 0.279 | 0.284 |
| a clothing boutique | 0.244 | 0.267 |
| a coffee shop | 0.256 | 0.271 |
| a garden center | 0.250 | 0.265 |

Per-frame argmax over {bookstore, home goods, pet}: bookshop 01-04 and 06 -> bookstore; bookshop 05 -> pet store by
0.003 (0.277 vs 0.274 vs 0.261, a close-up shelf with no readable books); home-gift 01-06 -> home goods store.
Bookshop-mean vs home-gift-mean cosine is 0.843; frames average 0.87 to their own set mean and 0.73 to the other.

Verdict: sensible. Books frames retrieve book/stationery products and "a bookstore"; home-gift frames retrieve
textiles/ceramics and "a home goods store". Two things to design around:

1. **Absolute cosines are compressed.** Image-image lands in 0.5-0.7, image-text in 0.2-0.35, and the gap between a
   good and a bad match is 0.03-0.15. Use ranks or a softmax with CLIP's logit scale (x100) rather than fixed
   thresholds, and always average several frames: single frames flip (bookshop/05).
2. **Everything looks a bit like everything.** Warm, wood-and-linen catalog photography sits close to any warm store
   interior, which is why a cookbook ranks #2 for the home-gift store and a pillow ranks #4 for the bookshop. Retrieval
   should be combined with the category signals from the Claude analysis (filter or re-rank within categories) rather
   than used as the sole ranking signal.

## Zero-shot styles: quality and a known bias

`data/embeddings/catalog.json` `styles` agree with the hand-labelled `styles` in `data/catalog.json` on at least one of
the two tags for 48/68 products (71%; chance is ~32%), both tags for 8/68. Image -> own product text retrieval among
the 68 products is 79% top-1 / 94% top-3, which confirms the image and text vectors are well aligned.

The raw top-2 is biased by the prompt prior: "rustic" (29 slots), "playful" (25), "minimalist" (24) and "vintage" (23)
dominate, and "cottagecore", "maximalist" and "modern-farmhouse" are never chosen because their prompt vectors score
lower against every product photo. Subtracting each style's mean cosine over the catalog spreads the picks over all
13 styles (modern-farmhouse 20, minimalist 17, vintage 14, natural 13, ...) but *lowers* agreement with the hand labels
to 65%, because the hand labels share the same skew toward minimalist/rustic/natural. The shipped file keeps the
spec'd raw computation; if the UI ever surfaces the zero-shot styles directly, mean-centre them (or use the hand labels,
which are the better signal for this catalog).

## Railway implications

- **Download size and cold start.** A cold container with an empty cache pulls 150 MB from huggingface.co on the
  first request: 2.5 s here on a fast link, plausibly 10-30 s from a Railway region, plus a hard dependency on the Hub
  being up. Model load from local disk is ~0.3 s on NVMe and maybe 1-2 s on Railway. Keep the download out of the
  request path:
  1. **Preferred: bake the cache into the image.** Add `npm run warm-models` to the build. With Railpack the build
     directory becomes the runtime filesystem, so `./.cache/transformers` written during the build ships with the
     image (+160 MB image size). Build command: `npm run warm-models && npm run build`. Set it in the service settings
     or in `railway.json` (`{"build": {"buildCommand": "npm run warm-models && npm run build"}}`; note Railway has
     deprecated config-as-code files in favour of Infrastructure as Code, with legacy file support ending 2026-12-01).
     Dockerfile equivalent:
     ```Dockerfile
     FROM node:22-bookworm-slim
     WORKDIR /app
     COPY package*.json ./
     RUN npm ci
     COPY . .
     ENV TRANSFORMERS_CACHE_DIR=/app/.cache/transformers
     RUN npm run warm-models && npm run build
     ENV TRANSFORMERS_OFFLINE=1
     CMD ["npm", "start"]
     ```
     Setting `TRANSFORMERS_OFFLINE=1` at runtime makes a missing cache a loud startup error rather than a slow
     surprise.
  2. **Alternative: persistent volume.** Mount a volume (Hobby: 5 GB, Pro: 50 GB) and set
     `TRANSFORMERS_CACHE_DIR=$RAILWAY_VOLUME_MOUNT_PATH/transformers` (Railway exposes the mount path as
     `RAILWAY_VOLUME_MOUNT_PATH`); the first request after the first deploy downloads once and later deploys reuse it. Volumes are not
     available during the build and cannot be combined with replicas, so (1) is simpler for a prototype.
- **Warm the ONNX sessions at boot**, not on the first scan: call `warmEmbeddings()` from `src/instrumentation.ts`
  (`register()`, Node runtime only) or hit a `/api/warm` route from the healthcheck. Otherwise the first scan pays
  ~0.3-2 s load + ~60 ms session init.
- **Memory.** Plan for ~1 GB RSS for the Next.js server with the model resident. One model per Node process; do not
  run several Node processes in one container.
- **Catalog vectors are build artifacts.** Run `npm run embed` locally whenever `data/catalog.json` or the catalog
  images change and commit `data/embeddings/*.json` (365 KB). Do not compute them at deploy time; the images
  are in the repo and the file is deterministic for a given model + dtype.
- **Image size.** `node_modules` gains ~400 MB: onnxruntime-node ships binaries for every platform (linux 52 MB, darwin 35 MB,
  win32 124 MB) and onnxruntime-web (130 MB) is a hard dependency Node never loads. Acceptable for a prototype; a production Dockerfile would prune them.

## What a production version at Faire would do instead

Off-the-shelf CLIP ViT-B/32 (2021, 400 M web image-text pairs) is the right tool for a key-free prototype and the
wrong tool for the real product:

- **Use Faire's own product-tower embeddings.** Faire's retrieval and recommendation stack already produces a product
  embedding per SKU from a two-tower model trained on retailer-product interactions (views, adds, orders), product
  images, titles and taxonomy. Those vectors encode "what retailers who stock X also stock", which is the signal a
  store-scan should tap. The catalog side would be a lookup into that existing index, not a fresh CLIP pass.
- **Train the query side into that space.** Store frames would go through a vision encoder fine-tuned (or a small
  adapter on top of a frozen backbone such as SigLIP 2 / DINOv2) to map store photos into the product-tower space,
  supervised by the products the scanned retailer actually orders. Zero-shot CLIP alignment is replaced by a learned
  alignment on Faire's data.
- **Serve from an ANN index, not a JSON file.** Millions of SKUs live in an approximate-nearest-neighbour index
  (FAISS/ScaNN/Vespa/pgvector-class), filtered by the retailer's country, category permissions, MOQ and stock, and
  re-ranked by the existing ranking model with the scan-derived features as inputs.
- **Style and category come from Faire's taxonomy classifiers**, trained on labelled catalog data, rather than
  zero-shot prompt matching; calibration and coverage issues like the rustic/vintage bias above disappear.
- **Offline batch + feature store.** Product vectors are computed in the batch pipeline when a product is created or
  its images change, versioned with the model, and served from a feature store; only the handful of store frames
  are embedded online, on GPU-backed inference, with the on-device frame extraction this prototype already does.
- **Bigger/better open models if staying open-source**: SigLIP 2, OpenCLIP ViT-L/14 or MetaCLIP give noticeably
  better retrieval than ViT-B/32 at 2-6x the weight size and latency; transformers.js has ONNX builds for several.

## Sources

- transformers.js docs, `env` module: https://huggingface.co/docs/transformers.js/api/env (cacheDir, allowLocalModels, useFSCache)
- transformers.js docs, `RawImage`: https://huggingface.co/docs/transformers.js/api/utils/image (read/fromBlob input types)
- CLIP class examples and `dtype`/`device` options: `node_modules/@huggingface/transformers/types/models/clip/modeling_clip.d.ts`, `types/utils/hub.d.ts`, `types/utils/dtypes.d.ts` (v4.2.0)
- Model files and sizes: https://huggingface.co/api/models/Xenova/clip-vit-base-patch32/tree/main/onnx
- Next.js `serverExternalPackages` (default list includes `@huggingface/transformers`, `onnxruntime-node`, `sharp`): `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`
- Railway volumes (plan limits, no replicas with volumes): https://docs.railway.com/reference/volumes
- Railway config-as-code (`build.buildCommand`, deprecation notice): https://docs.railway.com/reference/config-as-code
- Railway variables (`RAILWAY_VOLUME_MOUNT_PATH`, `RAILWAY_VOLUME_NAME`): https://docs.railway.com/reference/variables


## Addendum (2026-09-03): SigLIP base replaces CLIP ViT-B/32

Decided on the offline evaluation in `scripts/eval` (six demos, Sonnet-judged top 20, clean catalog of 2,016):

| variant | fit (1–5) | fit ≥ 4 |
|---|---|---|
| generic popularity feed | 1.58 | 7% |
| CLIP ViT-B/32, mean vectors, prompts v1 (old default) | 3.02 | 42% |
| SigLIP base, best-two-of-16 prompts, fusion 0.4/0.15/0.45, style 0.08 (shipped) | 3.28 | 48% |
| the same plus the buyer's-eye rerank of the top 60 (shipped) | 3.73 | 65% |

CLIP ViT-B/16 scored below B/32 on the same setup (2.52), so bigger is not automatically better here; SigLIP's sigmoid-trained text tower is what helps the per-prompt matching. Both towers load through the same wrapper (`src/lib/embeddings.ts`, `scripts/lib/encoder.mjs`); `EMBEDDING_MODEL` switches models and `npm run embed` rebuilds the indexes. SigLIP text inputs pad to 64 tokens; vectors are 768-d.
