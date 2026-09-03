# QA notes — Store Scan prototype

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
