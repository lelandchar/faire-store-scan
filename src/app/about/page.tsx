import Link from "next/link";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Film 15 seconds",
    body: "The retailer walks their store with their phone the way a customer would. The video stays on the phone.",
  },
  {
    title: "Pick the clearest frames",
    body: "The phone samples a couple of moments per second from the clip, drops blurry and repeated ones, and keeps six to sixteen sharp frames spread evenly through the walkthrough, so every section of the store is represented. Only those small images are sent.",
  },
  {
    title: "Read the shelves",
    body: "A vision model (Meta Muse Spark 1.3) looks at the frames and answers in a fixed format: a short note to the retailer, then the categories on the shelves and how much room each takes, the store's style, materials, and the categories that would pair well. Every claim points back to the frames it came from.",
  },
  {
    title: "The retailer confirms",
    body: "Three quick screens: what's on the shelves (a switch per category), the look (keep or drop each style), and two dials: restock what sells versus discover new brands, and how strongly the walkthrough should shape the feed. Their answers win over the model's guesses.",
  },
  {
    title: "Match against the catalog",
    body: "The frames and the confirmed choices are turned into vectors with an open-source image-and-text model (SigLIP) and compared with every product in the catalog, which was embedded the same way. Each product also gets a plain score from the confirmed choices: category fit, style, materials, and the buying goal.",
  },
  {
    title: "A buyer's-eye review",
    body: "The sixty best candidates go back to a vision model together with a short brief of the store. It looks at each product the way a wholesale buyer would and rates the fit from one to five; strong fits rise and poor ones drop below products it did not review.",
  },
  {
    title: "Build the storefront",
    body: "The scores are combined into one ranking. The home feed, its modules, and search results are re-ordered from it, and every product can explain why it moved. No popularity signal is used; the order comes only from the store and the retailer's choices.",
  },
];

export default function AboutPage() {
  return (
    <article>
      <p className="text-caption uppercase tracking-[0.14em]">How it works</p>
      <h1 className="text-display mt-2">A storefront that already knows the store</h1>

      <section className="mt-10">
        <h2 className="font-serif text-[26px] text-ink">The problem</h2>
        <p className="text-body mt-3 text-[16px]">
          A new retailer on Faire has no history: no searches, no carts, no orders. Personalization needs exactly those signals, so on day one the feed is
          the same for a bookshop and a pet store. Faire&apos;s own writing calls this the low-engagement cohort, and the first order is the hardest one to earn.
          The quiz that stands in for history today asks the retailer to describe their store in words, which is slow and vague.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[26px] text-ink">The goal</h2>
        <p className="text-body mt-3 text-[16px]">
          Give every new retailer a storefront built for their store before they search for anything. Use the most honest signal a store has, its shelves,
          and let the retailer correct it in a few taps. Measured by how quickly a new retailer gets to a first cart that clears a brand minimum, and a
          first order.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-[26px] text-ink">How the technology works</h2>
        <ol className="mt-4 space-y-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] text-white">{i + 1}</span>
              <div>
                <p className="text-[16px] font-semibold text-ink">{s.title}</p>
                <p className="text-body mt-1 text-[15px]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-white p-5">
          <p className="text-caption uppercase tracking-[0.12em]">Where it would live at Faire</p>
          <p className="text-body mt-2 text-[15px]">
            Faire&apos;s retrieval model already has a retailer tower with four inputs: past behavior, store attributes, carted products, and past searches. The
            walkthrough becomes a fifth input, a store-content vector, plus the confirmed categories and styles as attributes. It is present for retailers
            who filmed and absent for those who didn&apos;t, and its weight decays as real orders accumulate, so the walkthrough is the on-ramp to
            personalization rather than a permanent anchor.
          </p>
        </div>
      </section>

      <div className="mt-10 flex gap-3">
        <Link href="/" className="inline-flex h-11 items-center rounded-[var(--radius)] bg-ink px-5 text-[14px] font-medium text-white">
          Start the demo
        </Link>
        <Link href="/admin" className="inline-flex h-11 items-center rounded-[var(--radius)] border border-ink px-5 text-[14px] font-medium text-ink">
          End-to-end trace view
        </Link>
      </div>
    </article>
  );
}
