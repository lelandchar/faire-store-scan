# Store Scan — cold-start personalization for new Faire retailers

An independent prototype: a new retailer films a 15-second walkthrough of their store, the shelves are read into structured signals, the retailer confirms them, and their very first home feed (and search results) are personalized before they have any behavioral history.

Not affiliated with or endorsed by Faire. Synthetic and public data only.

## What happens end to end

1. **Faire's existing onboarding** — store type, store details, store category (replicated from the iOS app).
2. **Show us your shelves** (new step) — do/don't examples, record or upload, or pick a sample store.
3. **Frames on the phone** — the browser samples ~16 candidate frames, drops the blurriest (Laplacian variance), keeps 8 at 1280px. The raw video never uploads.
4. **Store read** — `/api/analyze` streams a Claude structured-output JSON (categories with evidence frames, styles, materials, palette, price position, legible brands, merchandising notes, complements, summary). The UI reveals signals as they stream.
5. **Nearest neighbors** — `/api/retrieve` embeds the frames with an open-source CLIP model on the server, scores every catalog product (image-image and text-image cosines) and returns per-frame neighbors plus timings.
6. **Retailer confirms** — "More like this / Already covered / Not for me" per category, style chips, price point, complements, buying mode.
7. **Personalized feed and search** — deterministic, explainable re-ranking fused with the embedding scores. Toggle generic vs personalized; every card explains why.
8. **Engineer view** (`/admin`) — run the pipeline on example inputs and inspect input → output → neighbors → fusion at every stage.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY, or leave MOCK_ANALYSIS=1
npm run embed                # precompute catalog embeddings (downloads CLIP once, ~150 MB)
npm run dev
```

Open http://localhost:3000. The phone frame appears on desktop widths; on a phone it is full-screen.

## Deploy (Railway)

The service builds with `npm run build && npm run warm-models` so the CLIP weights are baked into the image. Set `ANTHROPIC_API_KEY` (and optionally `ANALYSIS_MODEL`, `ANALYSIS_EFFORT`) as service variables. `railway up --service web --detach` deploys the working tree.

## Layout

- `src/app/onboarding/*` — the flow screens; `src/app/home`, `src/app/search`, `src/app/about`, `src/app/admin`.
- `src/lib/frames.ts` — browser frame extraction. `src/lib/analysis-schema.ts` — the Zod schema the model must follow.
- `src/lib/ranking.ts` — weights, reasons, fusion. `src/lib/embeddings.ts` — CLIP wrapper. `src/lib/retrieval.ts` — retrieval contract.
- `data/catalog.json` — synthetic Faire-style catalog (images in `public/catalog`). `data/catalog-public.json` — public dataset catalog. `data/embeddings/` — precomputed vectors.
- `public/samples/` — sample store photos (Unsplash/Pexels) and Seedance-generated walkthrough clips.
- `research/` — design tokens, Faire insights, vision API comparison, embeddings notes.

## Privacy rules the prototype follows

Raw video stays on device; only ~8 compressed frames are sent. Text visible in images is treated as data, never instructions. Nothing about demographics, location, sales or finances is inferred. Frames and the derived profile can be deleted from the profile screen.
