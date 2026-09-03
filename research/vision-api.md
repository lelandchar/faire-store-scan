# Vision API selection for the store-scan prototype

Date: 2026-09-02. All limits/prices below were read from official docs on this date (URLs in each section
and in Sources). Latency figures are estimates unless a source is cited.

## TL;DR

- **Go with the plan as stated, with three tweaks:** (1) default to **Claude Sonnet 5** (`claude-sonnet-5`), not
  Opus 5, for the 15-20 s budget; keep Opus 5 one env var away. (2) Extract **6-8 frames**, not 10, and
  compress to **~1280 px long edge** (not 1024) when brand-name legibility matters; Claude 4.7+ models accept up to
  2576 px natively so this is still cheap. (3) **Stream** the structured-output call and order the schema keys so
  cheap signals (categories, colors) come before the summary; parse with a partial-JSON parser to reveal
  sections progressively.
- Frames-to-Claude costs about **$0.025/analysis** on Sonnet 5 (8 x 1024x768), ~$0.06 on Opus 5, ~$0.013 on Haiku 4.5.
- **Gemini 3.8 Flash native video is the right second provider** (about $0.007-0.010/analysis, 300 tok/s output),
  but on a phone the raw clip upload (10-40 MB for 15 s of 1080p) is the latency killer, not the model. Keep the
  provider interface frame-based and add a `video` input variant only for the Gemini adapter.
- OpenAI has no video input at all (frames only); gpt-5.6-terra is price-competitive (~$0.025) but adds nothing
  over Claude here. Skip for the prototype.

## What the prototype needs

Input: 10-20 s phone video (or 4-8 photos) of a store interior. Output: strict JSON with product categories,
style/aesthetic tags, materials, color palette, price-positioning cues, readable brand names, short warm summary.
Stack: Next.js/TypeScript on Railway. End-to-end target <15-20 s. Cost secondary. Keys: Anthropic (have), Gemini (likely).

## 1. Anthropic Claude Messages API (images)

Source: https://platform.claude.com/docs/en/build-with-claude/vision, https://platform.claude.com/docs/en/about-claude/models/overview,
https://platform.claude.com/docs/en/about-claude/pricing, https://platform.claude.com/docs/en/build-with-claude/structured-outputs

| Item | Value |
|---|---|
| Current model IDs | `claude-opus-5` ($5/$25 per MTok, latency "Moderate"), `claude-sonnet-5` ($2/$10, "Fast"), `claude-haiku-4-5` ($1/$5, "Fastest", 200K ctx). All support image input. Fable 5.1 ($10/$50, "Slower") is overkill here. |
| Images per request | 600 (100 for 200K-context models, i.e. Haiku 4.5). Above 20 images a stricter 2000 px per-side cap applies. |
| Per-image limits | 8000x8000 px max; 10 MB base64 per image; 32 MB per request. JPEG/PNG/GIF/WebP. |
| Image tokens | 28x28 px patches: `ceil(w/28) * ceil(h/28)`. Claude 4.7+ ("high-res tier") accepts up to 2576 px long edge / 4784 tokens before downscaling; older models 1568 px / 1568 tokens. |
| Worked sizes | 1024x768 = 37x28 = **1036 tokens**. 1280x960 = 46x35 = 1610. 1568x1176 = 56x42 = 2352. 1920x1080 = 2691 (Opus/Sonnet 5 do not downscale it). |
| Video input | **Not supported.** Animated GIFs use the first frame only. Frames must be extracted client- or server-side. |
| Structured output | `output_config: { format: { type: "json_schema", schema } }` (old `output_format` is deprecated). Supported on Opus 5, Sonnet 5, Haiku 4.5. Requires `additionalProperties: false` + `required`. Unsupported: `min/max`, `minLength`, recursive schemas, `minItems` > 1. Works with image inputs ("Extract data from images or text"). |
| Grammar compile | "The first time you use a specific schema, there is additional latency while the grammar compiles"; cached 24 h from last use. Pre-warm with a dummy request on deploy. |
| Streaming | SSE; JSON arrives as `text_delta` events on a text block. SDK example `examples/structured-outputs-streaming.ts` uses `client.messages.stream({ output_config: { format: zodOutputFormat(Schema) } })` then `finalMessage().parsed_output`. Non-streaming: `client.messages.parse()`. |
| Thinking | Adaptive by default on Opus 5/Sonnet 5. Use `output_config: { effort: "low" }` (Sonnet 5 also accepts `thinking: { type: "disabled" }`). Do not leave at default `high` for a latency-bound call. |
| Prompt tips (docs) | Put images before text; label each one ("Frame 1 (t=2s):"); Claude reads no image metadata; heavy JPEG compression hurts text legibility, so inspect the actual frames you send. |

Vision doc example cost: at Opus 5 a 1000x1000 image is ~$6.48 per thousand images.

## 2. Google Gemini API (native video)

Source: https://ai.google.dev/gemini-api/docs/video-understanding, https://ai.google.dev/gemini-api/docs/media-resolution,
https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/gemini-api/docs/files,
https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash, https://ai.google.dev/gemini-api/docs/thinking

| Item | Value |
|---|---|
| Models | `gemini-3.8-flash` (latest Flash; 1,048,576 in / 65,536 out; text+image+video+audio+PDF; updated Sep 2026). Cheaper: `gemini-3.5-flash-lite` ($0.30/$2.50). Pro: `gemini-3.1-pro-preview` ($2/$12 <=200K). |
| Pricing (3.8 Flash) | **$0.75 in / $3.75 out per MTok through 2026-12-31; $1.50 / $7.50 from 2027-01-01.** Image/video billed per token. |
| Video input | Inline bytes: docs say "Small files (<100MB), short duration (<1min)" but also "Always use the Files API when the total request size ... is larger than 20 MB" -- treat **20 MB** as the inline ceiling. Files API: 2 GB/file, 20 GB/project, 48 h retention, must poll until state is `ACTIVE` (examples poll every 5 s). Formats: mp4, mpeg, mov, avi, flv, mpg, webm, wmv, 3gpp. "All Gemini models can process video data." |
| Frame sampling | Default **1 fps**; `processing: { type: "static", fps: 0.5 }` to change; `start_offset`/`end_offset` to clip. |
| Video tokens | Gemini 3 `media_resolution`: 70 tokens/frame at unspecified/low/medium, **280/frame at high**; audio 32 tokens/s. (Video-understanding page still quotes the older 66/258 per frame, ~100/~300 tokens per second.) 15 s @1 fps @high = 15x280 + 15x32 = **~4,700 tokens**. |
| Image tokens (Gemini 3) | `media_resolution` per image: low 280, medium 560, high/unspecified **1120**, ultra_high 2240. Max 3,600 images/request; 20 MB inline request limit. PNG/JPEG/WEBP/HEIC/HEIF. |
| Structured output | Interactions API (current default in docs): `response_format: { type: "text", mime_type: "application/json", schema }`. Legacy `generateContent` (still "fully supported") uses `responseMimeType` + `responseSchema`. Supports `enum`, `minItems/maxItems`, `minimum/maximum`, `additionalProperties`. "Very large or deeply nested schemas may be rejected." |
| Streaming | Yes: "The streamed chunks are valid partial JSON strings that can be concatenated to form the final JSON object." |
| Thinking | On by default (medium) and **cannot be fully disabled**; set `generation_config.thinking_level: "minimal"` or `"low"`. |
| Latency evidence | Artificial Analysis (https://artificialanalysis.ai/models/gemini-3-8-flash): 302 tok/s output, but 13.3 s TTFT at thinking `high` on their reasoning benchmark. At `minimal/low` with a short prompt expect a few seconds; 700 output tokens then take ~2.5 s. |

Typical 15 s clip, Files API path: upload from Railway (1-3 s for 10-20 MB) + poll to `ACTIVE` (0-10 s) + model (3-6 s).
Inline path (<20 MB) skips the upload/poll step. Either way the **phone -> Railway upload** of the raw clip dominates.

## 3. OpenAI (GPT-5.6 family, images only)

Source: https://developers.openai.com/api/docs/guides/images-vision, https://developers.openai.com/api/docs/models,
https://developers.openai.com/api/docs/pricing, https://developers.openai.com/api/docs/guides/structured-outputs

| Item | Value |
|---|---|
| Models | `gpt-5.6-sol` ($4/$20 per MTok), `gpt-5.6-terra` ($2/$12), `gpt-5.6-luna` ($0.20/$1.20); 1.05M ctx, 128K out, image input yes. Older `gpt-5.4-mini` $0.75/$4.50; `gpt-5-mini` $0.25/$2 (shuts down 2026-12-11). |
| Image limits | 512 MB total payload; 1,500 images/request; PNG/JPEG/WEBP/non-animated GIF. |
| Image tokens | 32 px patches: `ceil(w/32)*ceil(h/32)`, x1.2 multiplier, rounded up. `high` fits a 2,500-patch budget (up to 2048x2048); `low` fits 512x512; `original`/`auto` preserve dimensions; >30,000 patches rejected. 1024x768 = 768 patches x1.2 = **922 tokens**. |
| Video input | **None.** Responses API accepts images/PDFs/docs only; native video input is an open feature request (https://github.com/openai/openai-node/issues/1778). Frames only. |
| Structured output | Responses API `text: { format: { type: "json_schema", strict: true, schema } }`; all fields must be in `required`, `additionalProperties: false`; first request per schema has extra latency, then cached. |
| Streaming | `stream: true` yields `response.output_text.delta` events; JSON text streams as deltas. |
| Latency evidence | AA (https://artificialanalysis.ai/models/gpt-5-6-terra): 97.7 tok/s; TTFT 222 s at their default-reasoning benchmark -- set reasoning effort low. |

## Progressive reveal (all three)

All three stream the JSON as text deltas, so the UI can reveal fields as they close:
- Order schema keys cheap-to-expensive: `categories`, `color_palette`, `materials`, `style_tags`, `price_cues`,
  `brands`, then `summary` last. All three emit keys in schema order in practice, but none of the docs fetched
  guarantee it contractually -- render on key completion, not on key position.
- Parse with a partial-JSON parser (e.g. the `partial-json` npm package) on each delta; render a section once its
  key is complete. Claude's SDK also exposes `.on('inputJson', (partial, snapshot))` for tool-input streaming if you
  later switch to a tool with `strict: true` + `eager_input_streaming: true`.
- Alternative if you want true parallelism: two concurrent Haiku/Sonnet calls (fast "facts" schema; slower
  "summary" schema). Doubles image-token cost (~+$0.02) but the facts card can land in ~4-5 s.

## Cost per analysis (8 images @ 1024x768, ~700 prompt tokens, ~700 output tokens, thinking low/off)

| Provider / model | Image tokens (8) | Input $ | Output $ | Total per analysis |
|---|---|---|---|---|
| Claude Haiku 4.5 | 8,288 | $0.009 | $0.0035 | **~$0.013** |
| Claude Sonnet 5 | 8,288 | $0.018 | $0.007 | **~$0.025** |
| Claude Opus 5 | 8,288 | $0.045 | $0.0175 | **~$0.063** |
| Gemini 3.8 Flash (images, default 1120/img) | 8,960 | $0.0072 | $0.0026 | **~$0.010** (doubles in 2027) |
| Gemini 3.8 Flash (native 15 s video, 1 fps, high) | ~4,700 | $0.004 | $0.0026 | **~$0.007** |
| OpenAI gpt-5.6-luna | 7,376 | $0.0016 | $0.0008 | **~$0.0025** |
| OpenAI gpt-5.6-terra | 7,376 | $0.016 | $0.0084 | **~$0.025** |
| OpenAI gpt-5.6-sol | 7,376 | $0.032 | $0.014 | **~$0.046** |

Thinking/reasoning tokens are billed as output on all three; keep effort low. At 1280x960 frames, Claude cost rises
~55% (1610 tok/img): Sonnet 5 ~$0.035. Even 1,000 scans/day on Sonnet 5 is ~$25/day.

## Latency budget (frames -> Claude Sonnet 5)

| Step | Estimate | Notes |
|---|---|---|
| Browser: seek + draw 8 frames, JPEG encode | 1-3 s | `<video>` seeks on iOS Safari are ~100-300 ms each; do it while the user reviews the clip. |
| Upload 8 JPEGs (~150-300 KB each, ~1.5-2.5 MB) | 1-3 s on LTE | vs 10-40 MB for the raw clip (15-60 s on a weak connection). |
| Claude TTFT (9-13K input tokens incl. images) | ~1-3 s | Plus one-time grammar compile on a new schema (pre-warm). |
| Generation, 400-700 tokens @ ~70 tok/s (AA: 71.5) | 6-10 s | Biggest lever: cap the summary at ~60 words and tags at ~8/list. |
| **Total** | **~10-18 s** | Within budget; Haiku 4.5 trims 3-5 s if Sonnet proves slow. Opus 5 ("Moderate") likely exceeds it without fast mode ($10/$50). |

Gemini native video: model side ~4-8 s, but add raw-clip upload (dominant) + Files API poll unless inline (<20 MB).

## Recommendation

**Validated, with adjustments:**

1. **Client-side frame extraction stays.** It is the only path that works for OpenAI and Claude, it makes the
   phone upload ~10x smaller than any native-video path, and it gives you deterministic control over which
   moments get analyzed (evenly spaced, skip the first 0.5 s of shake). Use a `<video>` + `<canvas>` loop; also
   accept 4-8 still photos through the same path (photos are just "frames").
2. **6-8 frames at ~1280 px long edge, JPEG q~0.8.** 1024 px is fine for categories/palette/style, but brand names
   on shelf labels are small; Claude 4.7+ takes 1280 px at 1610 tokens (still ~$0.035 on Sonnet). If summaries
   look right but `brands` is sparse, that is the first knob. Do not go past 8 frames -- redundancy, not coverage,
   is the cost.
3. **Claude Sonnet 5 as the default model; Opus 5 behind `VISION_MODEL`.** Anthropic's general guidance is to start
   with Opus 5, but its "Moderate" latency vs Sonnet's "Fast" matters for a 15-20 s budget, and Sonnet 5's $2/$10
   (now permanent) makes it the better prototype default. Run `output_config.effort: "low"`; keep `max_tokens`
   ~2,000. Use `client.messages.stream()` + `zodOutputFormat()` + `finalMessage().parsed_output` for the strict
   schema; handle `stop_reason: "refusal"` by returning a friendly empty result.
4. **Strict schema, small.** Enums for `price_positioning` (`value|mid|premium|luxury`) and bounded lists; put
   `summary` last; include a `confidence` per brand so the UI can hide low-confidence reads. Claude's structured
   outputs strip `minLength/maxLength` -- enforce list lengths in the prompt, not the schema.
5. **Pluggable provider interface** (`analyzeStore(input: { frames: Jpeg[] } | { video: Blob }, schema) ->
   AsyncIterable<PartialSignals>`). Ship the Claude adapter first; add a Gemini adapter that accepts either frames
   or a video and uses the Interactions API with `thinking_level: "minimal"`, `response_format` JSON schema, and
   1 fps `high` media resolution. Gate the raw-video upload behind a size check (<20 MB -> inline; else Files API).
   OpenAI adapter is optional; nothing here needs it.
6. **Next.js plumbing:** post frames to a Route Handler (Server Actions default to a 1 MB body limit,
   https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions) and stream SSE back to the client.
   Pre-warm the Claude grammar cache on boot (24 h TTL) and keep the system prompt byte-stable so prompt caching
   (cache reads = 10% of input price) kicks in.

**Where I pushed back:** 10 frames and 1024 px both point the wrong way (too many frames, too little resolution);
Opus-by-default risks the latency budget; and Gemini native video is worth wiring but should not be the primary
path on mobile because of clip upload size, not model quality.

## Sources

- Claude vision limits/tokens: https://platform.claude.com/docs/en/build-with-claude/vision
- Claude models/latency descriptors: https://platform.claude.com/docs/en/about-claude/models/overview
- Claude pricing (Sonnet 5 $2/$10 made permanent): https://platform.claude.com/docs/en/about-claude/pricing
- Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Claude streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- Claude TS SDK helpers + streaming example: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md ,
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/structured-outputs-streaming.ts
- Gemini video: https://ai.google.dev/gemini-api/docs/video-understanding ; media resolution: https://ai.google.dev/gemini-api/docs/media-resolution
- Gemini images: https://ai.google.dev/gemini-api/docs/image-understanding ; files: https://ai.google.dev/gemini-api/docs/files
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing ; models: https://ai.google.dev/gemini-api/docs/models ,
  https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Gemini structured output / thinking / Interactions: https://ai.google.dev/gemini-api/docs/structured-output ,
  https://ai.google.dev/gemini-api/docs/thinking , https://ai.google.dev/gemini-api/docs/interactions
- OpenAI vision: https://developers.openai.com/api/docs/guides/images-vision ; models: https://developers.openai.com/api/docs/models ;
  pricing: https://developers.openai.com/api/docs/pricing ; structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs ;
  streaming: https://developers.openai.com/api/docs/guides/streaming-responses ; no video input: https://github.com/openai/openai-node/issues/1778
- Independent latency: https://artificialanalysis.ai/models/gemini-3-8-flash , https://artificialanalysis.ai/models/claude-sonnet-5 ,
  https://artificialanalysis.ai/models/gpt-5-6-terra
