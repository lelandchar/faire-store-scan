"use client";

import { motion } from "framer-motion";
import { Palette, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { BackChevron } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";

const PROMISES = [
  { Icon: ShoppingBag, text: "Products that match what you already sell" },
  { Icon: Palette, text: "Brands that match your style and price point" },
];

/** The pitch, in the retailer's language, right before we ask for the walkthrough. */
export default function WelcomePage() {
  const router = useRouter();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="relative h-[36%] min-h-[230px] w-full shrink-0 overflow-hidden bg-surface-2">
        <video
          className="h-full w-full object-cover"
          src="/samples/videos/home-gift-walkthrough.mp4"
          poster="/samples/videos/home-gift-walkthrough.jpg"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute left-4 top-3">
          <BackChevron href="/" variant="overlay" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-5 pt-5">
        <h1 className="text-display-sm rise" style={{ fontSize: 30 }}>
          Let&apos;s customize your wholesale storefront.
        </h1>
        <p className="text-body mt-3 rise">
          Faire has over 11 million products from 140,000 independent brands. Film your shelves for 15 seconds, and we&apos;ll find products that match your
          unique taste.
        </p>

        {/* The promises arrive one at a time so the screen reads as a sequence, not a wall. */}
        <ul className="my-auto space-y-2.5 py-5">
          {PROMISES.map(({ Icon, text }, i) => (
            <motion.li
              key={text}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 + i * 0.35, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-warm px-3.5 py-3 text-[14px] text-ink"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-sm">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              {text}
            </motion.li>
          ))}
        </ul>

        <div className="space-y-2">
          <Button onClick={() => router.push("/onboarding/store-details")}>Show us your store</Button>
          <button type="button" onClick={() => router.push("/home")} className="block w-full py-2 text-center text-[14px] text-ink-2 underline underline-offset-4">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
