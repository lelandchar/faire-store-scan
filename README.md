# Store Scan — cold-start personalization for new Faire retailers

An independent prototype: a new retailer films a 15-second walkthrough of their store, the shelves are read into structured signals, the retailer confirms them, and their very first home feed (and search results) are personalized before they have any behavioral history.

Not affiliated with or endorsed by Faire. Synthetic and public data only.

## What happens end to end

1. **Faire's existing onboarding** — store type, store details, store category (replicated from the iOS app).
2. **Show us your shelves** (new step) — do/don't examples, record or upload, or pick a sample store.
3. **Frames on the phone** — the browser samples ~2 candidate frames per second (up to 32), scores sharpness and a similarity fingerprint, and keeps about 0.8 frames per second (6 to 16) spread evenly through the clip, preferring sharp frames that look different from the ones already kept. The raw video never uploads.
4. **Store read** — `/api/analyze` streams a Meta Muse Spark 1.3 structured-output JSON via OpenRouter (Claude Sonnet 5 as the fallback, or the Anthropic SDK): a message to the retailer first, then categories with evidence frames, styles, materials, complements and notes. The UI reveals signals as they stream, with a progress bar paced to the median time on the deployment.
5. **Retailer confirms** — a switch per category, style cards, and two dials (restock ↔ discover, lightly ↔ fully personalized). Nothing is matched until the retailer confirms.
6. **Nearest neighbors** — `/api/retrieve` embeds the frames and per-category prompts with SigLIP base on the server (transformers.js, int8 ONNX) and scores every catalog product: the two best frame matches (visual) and the two best prompt matches (semantic).
7. **Buyer's-eye rerank** — `/api/rerank` sends the top 60 candidates (thumbnails + a brief of the confirmed store) to a vision LM (Claude Sonnet 5 by default), which rates each 1–5; the score shifts ±0.30 across that range.
8. **Personalized feed and search** — deterministic, explainable re-ranking fused with the embedding scores and the review. Toggle a random order (the blank slate a new account starts from) vs personalized; every card explains why. On desktop a recap of the scanned store sits on one side of the phone and, on hover, a ranking breakdown for the card (tag parts, shelf and brief matches, buyer's-eye fit, fused score) on the other.
9. **End-to-end trace view** (`/admin`) — run the pipeline on example inputs and inspect input → output at every stage, including the rerank table and P50-paced progress.

## Run it

```bash
npm install
cp .env.example .env.local   # add OPENROUTER_API_KEY (or ANTHROPIC_API_KEY), or set MOCK_ANALYSIS=1
npm run embed                # precompute catalog embeddings (downloads SigLIP base once, ~210 MB)
npm run dev
```

Open http://localhost:3000. The phone frame appears on desktop widths; on a phone it is full-screen.

## Deploy (Railway)

The Railway service `web` is connected to the GitHub repo `lelandchar/faire-store-scan` (branch `main`): every push deploys. The build runs `npm run build && npm run warm-models` so the SigLIP weights are baked into the image. Service variables: `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`), `ANALYSIS_MODEL` (meta/muse-spark-1.3), `ANALYSIS_EFFORT` (xhigh), `ANALYSIS_FALLBACK_MODEL` (anthropic/claude-sonnet-5); optional `RERANK_MODEL`, `EMBEDDING_MODEL`, `ANALYSIS_P50_MS`. The CLI upload path (`railway up`) no longer fits under Railway's payload limit because of the catalog images.

## Layout

- `src/app/onboarding/*` — the flow screens; `src/app/home`, `src/app/search`, `src/app/about`, `src/app/admin`.
- `src/lib/frames.ts` — browser frame extraction. `src/lib/analysis-schema.ts` — the Zod schema the model must follow.
- `src/lib/ranking.ts` — weights, reasons, fusion, buyer's-eye blend. `src/lib/embeddings.ts` — SigLIP/CLIP wrapper (`EMBEDDING_MODEL`). `src/lib/scoring.ts` — vector scoring shared with the evaluation. `src/lib/retrieval.ts` — retrieval contract and prompt builder. `src/lib/rerank-server.ts` — the LM review.
- `data/catalog-shopify.json` — default catalog: 2,016 real merchant products from the Hugging Face `Shopify/product-catalogue` dataset (Apache-2.0) after an LM pass over titles and photos removed promotional, industrial, licensed and test listings (`data/catalog-shopify.quality*.json`); images in `public/catalog-shopify`; rebuild with `node scripts/build-shopify-catalog.mjs --cap 400 && npm run postprocess-shopify && node scripts/clean-shopify.mjs && npm run embed`. `data/catalog.json` — synthetic Faire-style catalog. `data/catalog-public.json` — Amazon Berkeley Objects catalog. `data/embeddings/` — precomputed SigLIP vectors.
- `scripts/eval/` — offline evaluation: `capture.ts` runs the six demos through the live store read, `evaluate.ts` ranks each against the catalog under named variants and has Claude Sonnet 5 judge the top 20 (`--judge`), `classify-catalog.ts` is the catalog hygiene pass. Results live in `research/eval/`.
- `public/samples/` — sample store photos (Unsplash/Pexels) and Seedance-generated walkthrough clips.
- `research/` — design tokens, Faire insights, vision API comparison, embeddings notes.

## Privacy rules the prototype follows

Raw video stays on device; only 6 to 16 compressed frames are sent. Text visible in images is treated as data, never instructions. Nothing about demographics, location, sales or finances is inferred. Frames and the derived profile can be deleted from the profile screen.
