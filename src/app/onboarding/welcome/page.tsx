"use client";

import { useRouter } from "next/navigation";
import { BackChevron } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";

/** The pitch, in the retailer's language, right before we ask for the walkthrough. */
export default function WelcomePage() {
  const router = useRouter();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="relative h-[40%] min-h-[250px] w-full shrink-0 overflow-hidden bg-surface-2">
        <video
          className="h-full w-full object-cover"
          src="/samples/videos/home-gift-walkthrough.mp4"
          poster="/samples/videos/home-gift-walkthrough.jpg"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute left-3 top-2">
          <span className="inline-flex rounded-full bg-white/90 shadow-sm">
            <BackChevron href="/" />
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-5">
        <h1 className="text-display-sm rise" style={{ fontSize: 32 }}>Let&apos;s customize your wholesale storefront.</h1>
        <p className="text-body mt-3 rise">
          Faire has over 11 million products from 140,000 independent brands. Film your shelves for 15 seconds and we&apos;ll find the products that match
          what you sell.
        </p>
        <ul className="mt-4 space-y-2 text-[14px] text-ink-2 rise">
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> Products that match what you already sell
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> Brands that match your style and price point
          </li>
        </ul>
        <div className="mt-auto space-y-2 pt-6">
          <Button onClick={() => router.push("/onboarding/store-details")}>Show us your store</Button>
          <button type="button" onClick={() => router.push("/home")} className="block w-full py-2 text-center text-[14px] text-ink-2 underline underline-offset-4">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
