# QA notes — Store Scan prototype

## 2026-09-03 late session (catalog and flow restructure)

- Default catalog is now the Shopify merchant catalog: 3,793 products with images and CLIP embeddings (Home decor 399, Kitchen 393, Stationery 399, Apparel 400, Bath & body 390, Food & drink 369, Kids & baby 400, Pets 392, Garden 364, Jewelry 190, Candles 53, Books 44). Titles cleaned; live plants, seeds, bulk herbs and similar dropped. Prices, ratings and review counts are synthetic (the dataset has none).
- Flow: Store type → pitch → details → scan (demo sheet) → Reading your shelves (note first, live frames, scan sweep, pause on "Review what we found") → Your assortment → Your style → Personalization dials → Building your storefront (embedding + matching from the confirmed profile) → Congratulations (burst) → home (flat list, generic/personalized control beside the phone).
- Reasoning models write their JSON only after thinking; the phone now shows a thinking heartbeat with retailer-facing steps during that stretch. Muse Spark xhigh: 37–56 s per walkthrough; medium ≈ 25 s.
- Deploys now build from GitHub (`lelandchar/faire-store-scan`); the CLI upload hit Railway's 413 payload limit once the catalog images were added.


Tested 2026-09-02 with Playwright (390×844 mobile viewport and 1280×900 desktop) against the local dev server and the Railway deployment. Mock analysis mode (no API key yet); CLIP retrieval is real in both environments.

## Verified end to end

- Cover → store type → store details (sample fill) → store category → scan → analyzing (progressive reveal) → profile → congratulations → home. Live on Railway too.
- Inputs: sample Seedance video, sample Pexels video, real file upload of an 18.8 s 1080×2048 mp4 (8 frames with sensible temporal spread), multi-photo upload (4 jpgs).
- CLIP retrieval on Railway: ~4.7 s for 8 frames (0.5 s locally). "Matching your shelves to N products" covers the wait.
- Nearest neighbors are sensible: bookshop photos → journals/sketchbooks/stationery first; ceramics clip → bowls, tumblers, candles.
- Correction step changes the feed: "Already covered" on kitchen moved the anchor module to candles; "Not for me" on bath & body removed the category. Skip path shows the generic feed with a "film your store" prompt.
- Search: query protection holds (only matching products; profile reorders). Synonyms make "notebooks" find journals/planners/sketchbooks.
- Generic vs personalized toggle, "why this" sheet with evidence frames, "Not relevant" hides a card.

## Bugs found and fixed during QA

1. Session state reset on full reload (StrictMode double effect wrote initial state before hydrating). Fixed with a hydrate-once guard.
2. Category tiles collapsed to 0 px height (scroll container as a flex child with min-height:auto). Fixed with `shrink-0`.
3. Framer-motion layout animations overlapped cards after hydration. Replaced with keyed staggered fades; home renders only after hydration.
4. Mock analysis picked the boutique read for a home-goods sample because the tagline contained "boutique". Mock selection now prioritizes sample slug, then store type.
5. "notebooks" returned 0 results. Added a small synonym table and plural handling.
6. Playwright's `button:has-text("Next")` matched the Next.js dev-tools button; test selector issue only.

## Open issues, prioritized

P0 — resolved 2026-09-02 (late)
- Muse Spark 1.3 is live via OpenRouter after the 18+ attestation. Measured on 6 bookshop photos: xhigh 59 s (5.2k output tokens), medium 25 s (3.7k) with an equivalent read. Railway runs xhigh as requested; `railway variable set ANALYSIS_EFFORT=medium -s web` halves the wait.
- Sample walkthroughs regenerated as true scans that move through 3-4 sections (bookshop, apparel boutique, general store & pantry; the home & gift clip was already good). The static Pexels clips are retired. Frame selection now drops near-duplicates.

P0 — resolved
- Real store read runs through OpenRouter with structured outputs and streaming; near-valid outputs (e.g. 5 merchandising notes instead of 4) are coerced instead of failing the run.

P1 — should fix before sharing
- Public catalog: data written (1,137 products across 12 categories) but images/embeddings not finished at the time of writing; the catalog selector falls back to the synthetic catalog until then.
- Real-device check on iPhone Safari and Android Chrome is still pending (camera capture, HEVC decode → canvas, sessionStorage quota with 8×1280 px frames ≈ 2–3 MB).
- Railway cold start: CLIP loads on first request (~0.4 s warm, a few seconds cold); first analysis after a deploy may feel slower.

P2 — polish
- Analysis frame notes from the mock reference 8 frames even when only 4 photos were uploaded (harmless; real model returns one note per frame).
- The "why" pill truncates long reasons on 156 px cards; copy was shortened but a few still ellipsize.
- Congratulations hero uses the first frame; picking the frame cited by the dominant category would be nicer.
- Confetti fires once per session on the first personalized home landing; consider also on the "Got it" moment.


## Pass 3 (2026-09-03): personalization quality

Leland's read after trying the larger catalog: the feed was "not working really well relative to the categories the user wanted" (an apparel boutique got a black onesie and a branded toque first). Category matching was fine (0% of the top 40 outside carried or complement categories); the problem was *which* products inside those categories.

**Method.** `scripts/eval/capture.ts` ran the six demos (three Seedance walkthroughs, three photo sets) through the live Muse Spark read and saved frames, analysis and default profile. `scripts/eval/evaluate.ts` ranks each demo under a named variant and asks Claude Sonnet 5 to rate the top 20 as a wholesale buyer (fit 1–5, junk flag). Judge verdicts are cached per store and product, so variants are cheap to compare.

**Findings.**
- The generic feed (popularity order over the raw catalog) judged at fit 1.47 with 53 junk items in 120: the public dataset is full of promotional merch, office supply, licensed and test listings.
- The personalized baseline (CLIP ViT-B/32, mean-vector matching) reached fit 2.80 on the raw catalog; embedding and weight changes alone moved it by at most 0.1 to 0.2, within noise.
- Catalog hygiene mattered more: an LM pass over titles (746 removed) and photos (1,031 more) left 2,016 credible listings. The same baseline on the clean catalog scores 3.02.
- SigLIP base with per-prompt matching (best two of 16 prompts built from category examples, look, store type and frame notes), fusion 0.4/0.15/0.45 and a lighter style weight scores 3.28 (48% of the top 20 rated 4 or 5).
- A buyer's-eye rerank of the top 60 by a vision LM (Muse Spark in the evaluation) is the biggest single lift: fit 3.73 with 65% of the top 20 rated 4 or 5 and 6 junk items in 120, against 3.28 / 48% / 16 without it. Per-demo lists are in `research/eval/results-generic+baseline+app+apprerank.md`.

**Shipped.** SigLIP embeddings (`EMBEDDING_MODEL`), the prompt builder, scoring modes and weights, the cleaned catalog, and `/api/rerank` with a trace-view stage. The reviewer defaults to Sonnet 5 for latency (about 5 s per 20-image batch versus 23 s for Muse Spark at low effort); the evaluation used Muse Spark as the reviewer so the judge and the reviewer are different models.

**Also in this pass.** Scroll room on the analyzing screen (page roots no longer shrink below their content), a P50-paced progress bar on the analyzing screen and in the trace view (median of recent reads on the deployment, seeded at 52 s), a slower frame sweep, switch rows with one image on the assortment step, a store recap beside the feed on desktop, curated category tile art, a circular back button on the pitch screen, and frame selection that keeps 6 to 16 evenly spaced, sharp, mutually different frames depending on clip length.

**Open.** Muse Spark xhigh took 65 to 110 s per read tonight (P50 seed is 52 s); `ANALYSIS_EFFORT=medium` halves it. Books (34) and Candles (42) are thin after cleaning. The judge and the catalog classifier are the same model family, so the junk numbers are only as good as one reviewer's taste.

**Later the same night.** The upload rows in the demo sheet now open a drop panel (drag-and-drop or a native picker through a label, which Safari honours where a programmatic click on a hidden input does not); the file never leaves the browser. The generic feed is a seeded random order rather than the synthetic popularity prior, labelled "Random" in the toggle. Hovering a card on desktop shows its ranking breakdown beside the phone. The analyzing screen keeps status and progress pinned while it scrolls, reveals frames at a steady pace and pauses before the note stage. `RERANK_MODEL=off` skips the buyer's-eye pass (about 5 s with Sonnet 5; it took the judged fit of the top 20 from 3.28 to 3.73).
