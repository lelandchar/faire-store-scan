"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Screen } from "@/components/ui/Screen";
import { WEIGHTS } from "@/lib/ranking";

// "How it works": the concept, the pipeline, where it would plug into Faire's
// retrieval stack, and how it would be tested. Copy mirrors Faire's own
// vocabulary (see research/faire-insights.md) so a PM can read it cold.

const STEPS: { title: string; body: string }[] = [
  {
    title: "Film 15 seconds",
    body: "Walk the store the way a customer would. No tidying, no narration; the shelves do the talking.",
  },
  {
    title: "Sample frames on the phone",
    body: "The browser seeks through the clip, keeps about eight sharp frames at 1280 px, and drops the blurriest. The raw video never uploads.",
  },
  {
    title: "Read the shelves",
    body: "Claude looks at the frames and streams back a store read against a strict JSON schema: categories with share and evidence frames, styles, materials, palette, price position, legible brands, merchandising notes, suggested complements, and a warm summary.",
  },
  {
    title: "Confirm and steer",
    body: "The retailer edits the read, marks each category More like this, Already covered, or Not for me, and picks a buying mode: restock, fill gaps, or discover.",
  },
  {
    title: "Re-rank the catalog",
    body: "A deterministic weighted score reorders the feed. Every contribution becomes a plain-language reason, with the frame that triggered it.",
  },
  {
    title: "Match by look",
    body: "Open-source CLIP embeddings of the frames are compared with product photos; nearest neighbors are fused with the tag-based score. In progress.",
  },
];

const CAN = ["Categories on the shelves, and roughly how much room each takes up", "Style and overall look", "Materials", "Color palette", "Merchandising: how things are grouped and displayed", "Brands whose names are legible"];

const CANNOT = ["What actually sells", "Margins and order sizes", "What the retailer wants to buy next", "Demographics, location, and finances: never inferred, by rule and by schema"];

const WEIGHT_ROWS: { key: keyof typeof WEIGHTS; label: string; color: string; note: string }[] = [
  { key: "category", label: "Category fit", color: "bg-ink", note: "share of shelf, scaled by your label" },
  { key: "style", label: "Style", color: "bg-ink-2", note: "overlap with your look" },
  { key: "material", label: "Material", color: "bg-muted", note: "materials you already stock" },
  { key: "price", label: "Price tier", color: "bg-muted-2", note: "distance from your price position" },
  { key: "popularity", label: "Popularity", color: "bg-sage", note: "the same prior as the generic feed" },
  { key: "novelty", label: "Novelty", color: "bg-accent", note: "new brands or bestsellers, by buying mode" },
];

const REASONS: { text: string; why: string }[] = [
  { text: "You carry candles & fragrance", why: "Category fit. A category you marked More like this, scaled by how much shelf it took up." },
  { text: "Matches your modern farmhouse and natural look", why: "Style fit. The share of a product's style tags that overlap with yours." },
  { text: "Pairs with your home decor", why: "Complement. A suggested category you kept, strongest in Fill the gaps mode." },
];

const PRIVACY: string[] = [
  "The raw video stays on the phone. Only about eight compressed JPEG frames are sent.",
  "Text in the frames (signs, price tags, labels) is treated as data about the store, never as instructions to the model.",
  "The model is told not to infer demographics, location, customer type, sales, or financial health, and the schema has no field for them.",
  "Frames and the store profile can be deleted at any time. Deleting them removes the personalization.",
  "Nothing uploaded is used to train a model.",
];

const ARMS: { label: string; body: string }[] = [
  { label: "A", body: "Today's preference quiz (control)" },
  { label: "B", body: "Store scan, confirm, done" },
  { label: "C", body: "Store scan plus two intent questions: category labels and buying mode" },
];

const GUARDRAILS = ["Query relevance: search intent must not erode", "Assortment diversity: no siloing into one category", "Onboarding completion rate", "Privacy complaints and opt-outs"];

const OFFLINE = [
  "Recall@K lift on the low-engagement retailer cohort",
  "Irrelevance@K held flat",
  "Shuffled-video control: permute store vectors across retailers; the lift should vanish",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="hairline mt-9" />
      <section className="mt-8">
        <h2 className="font-serif text-[22px] leading-[1.25] text-ink">{title}</h2>
        <div className="mt-3">{children}</div>
      </section>
    </>
  );
}

function NumberDot({ n }: { n: number }) {
  return <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink bg-ink text-[12px] text-white">{n}</span>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[14px] leading-[1.45] text-ink-2">
          <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-2" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <Screen
      back="/"
      title="How it works"
      subtitle="New retailers are Faire's cold-start problem: in Faire's own words, new or low-engagement retailers give the ranking models almost nothing to work with. A 15-second walkthrough of the store is the fastest honest signal about their assortment, because it shows what is on the shelves rather than what they say when asked."
    >
      {/* 2. The pipeline */}
      <Section title="The pipeline">
        <ol className="space-y-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <NumberDot n={i + 1} />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-[14px] leading-[1.45] text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <dl className="mt-6 space-y-3 rounded-[var(--radius)] bg-surface-2 p-4">
          <div>
            <dt className="text-caption uppercase tracking-[0.14em]">Real in this prototype</dt>
            <dd className="mt-1 text-[13px] leading-[1.45] text-ink-2">
              Frame sampling in the browser, Claude structured-output streaming, the deterministic ranker, and local open-source CLIP embeddings.
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-[0.14em]">Simulated</dt>
            <dd className="mt-1 text-[13px] leading-[1.45] text-ink-2">
              A small synthetic catalog (about 70 products with generated images), and a generic feed that is just a popularity prior: bestseller flag, rating, review count.
            </dd>
          </div>
        </dl>
      </Section>

      {/* 3. Where it plugs into Faire's retrieval */}
      <Section title="Where it plugs into Faire's retrieval">
        <p className="text-[14px] leading-[1.5] text-ink-2">
          Faire&apos;s QRP retrieval fuses a query tower and a retailer tower into one query-retailer embedding and scores it against a product tower. The retailer tower is four sub-towers: a long-term behavior embedding, a feature encoder over structured attributes (store type, age, language, trade zone), and attention-pooled encoders over carted products and past searches, trained with random sub-tower dropout. A new retailer has almost nothing to feed the last three. The walkthrough would be a fifth sub-tower, a store-content encoder: frames embedded with the same vision encoder behind the product tower&apos;s vision product embeddings, attention-pooled into one store vector. The extracted categories, styles, materials, palette, and price tier enter the structured-attribute encoder beside store type; legible brands warm-start the long-term behavior embedding; pseudo-queries seed the search-history sub-tower. Because dropout already tolerates an absent sub-tower, the serving contract does not change. On day one the learned α fusion blends the query with a real retailer vector, not a mean, and the video&apos;s weight decays as carts and searches accumulate.
        </p>
        <ul className="mt-5 space-y-1.5">
          {["Long-term behavior embedding", "Structured attributes: store type, age, language, trade zone", "Carted products (attention-pooled)", "Past search queries (attention-pooled)"].map((t, i) => (
            <li key={t} className="flex items-center gap-3 text-[13px] text-ink-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-muted">{i + 1}</span>
              {t}
            </li>
          ))}
          <li className="flex items-center gap-3 text-[13px] text-ink">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent bg-accent-soft text-[11px] text-accent">5</span>
            <span>
              Store walkthrough (proposed) <span className="text-muted">· retailer sub-towers</span>
            </span>
          </li>
        </ul>
      </Section>

      {/* 4. What the camera can and can't tell us */}
      <Section title="What the camera can and can't tell us">
        <div className="space-y-3">
          <div className="rounded-[var(--radius)] border border-line p-4">
            <p className="text-caption uppercase tracking-[0.14em]">Can tell us</p>
            <div className="mt-3">
              <Bullets items={CAN} />
            </div>
          </div>
          <div className="rounded-[var(--radius)] border border-line p-4">
            <p className="text-caption uppercase tracking-[0.14em]">Can&apos;t tell us</p>
            <div className="mt-3">
              <Bullets items={CANNOT} />
            </div>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-[1.5] text-ink-2">
          That gap is why the confirmation step exists. The camera sees the assortment; only the retailer knows the intent. Labeling each category More like this, Already covered, or Not for me, and choosing a buying mode, turns an observation into a preference, and the retailer owns the result.
        </p>
      </Section>

      {/* 5. Ranking, explained */}
      <Section title="Ranking, explained">
        <p className="text-[14px] leading-[1.5] text-ink-2">
          A transparent weighted score, not a model, so every point can be shown back to the retailer. Weights are read from the code that runs the feed.
        </p>
        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
          {WEIGHT_ROWS.map((w) => (
            <div key={w.key} className={w.color} style={{ width: `${WEIGHTS[w.key] * 100}%` }} />
          ))}
        </div>
        <ul className="mt-3 space-y-1.5">
          {WEIGHT_ROWS.map((w) => (
            <li key={w.key} className="flex items-baseline gap-2.5 text-[13px]">
              <span className={`relative top-[1px] h-2.5 w-2.5 shrink-0 rounded-full ${w.color}`} />
              <span className="w-[92px] shrink-0 font-medium text-ink">{w.label}</span>
              <span className="w-8 shrink-0 tabular-nums text-ink">{Math.round(WEIGHTS[w.key] * 100)}%</span>
              <span className="min-w-0 text-muted">{w.note}</span>
            </li>
          ))}
        </ul>
        <p className="text-caption mt-4">A category marked Not for me is removed entirely rather than down-weighted.</p>
        <p className="mt-5 text-[13px] font-medium text-ink">Reasons you would see on a card</p>
        <ul className="mt-2 space-y-2.5">
          {REASONS.map((r) => (
            <li key={r.text} className="rounded-[var(--radius)] bg-surface-2 p-3">
              <p className="font-serif text-[16px] leading-[1.3] text-ink">&ldquo;{r.text}&rdquo;</p>
              <p className="text-caption mt-1">{r.why}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 6. Privacy */}
      <Section title="Privacy">
        <Bullets items={PRIVACY} />
      </Section>

      {/* 7. How I'd test it */}
      <Section title="How I'd test it">
        <p className="text-caption uppercase tracking-[0.14em]">Online: three arms</p>
        <ul className="mt-3 space-y-2">
          {ARMS.map((a) => (
            <li key={a.label} className="flex gap-3 text-[14px] leading-[1.45] text-ink-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[12px] text-muted">{a.label}</span>
              <span>{a.body}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-caption uppercase tracking-[0.14em]">Primary metric</dt>
            <dd className="mt-1 text-[14px] leading-[1.45] text-ink-2">
              Time to first qualified cart (a cart that clears a brand&apos;s order minimum), and time to first order.
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-[0.14em]">Guardrails</dt>
            <dd className="mt-2">
              <Bullets items={GUARDRAILS} />
            </dd>
          </div>
          <div>
            <dt className="text-caption uppercase tracking-[0.14em]">Offline, in Faire&apos;s own harness</dt>
            <dd className="mt-2">
              <Bullets items={OFFLINE} />
            </dd>
          </div>
        </dl>
      </Section>

      {/* 8. Footer */}
      <div className="hairline mt-10" />
      <footer className="mt-6 pb-2">
        <p className="text-caption leading-[1.5]">
          Built by Leland Char · Independent concept inspired by an interview conversation. Not affiliated with or endorsed by Faire. Synthetic and public data only.
        </p>
        <Link
          href="/"
          className="mt-6 flex h-[48px] w-full items-center justify-center rounded-[var(--radius)] border border-ink text-[15px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          Start the demo
        </Link>
      </footer>
    </Screen>
  );
}
