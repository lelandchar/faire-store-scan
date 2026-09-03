"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JoyBurst } from "@/components/JoyBurst";
import { Button } from "@/components/ui/Button";
import { useOnboarding } from "@/lib/store";

export default function DonePage() {
  const router = useRouter();
  const { state } = useOnboarding();
  const hero = state.frames[0]?.dataUrl;
  const [burst, setBurst] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBurst(false), 2600);
    return () => clearTimeout(t);
  }, []);
  const perks = ["Free returns on your first order", "Net 60 payment terms", state.profile ? "A feed built from your store" : null].filter(Boolean) as string[];
  return (
    <div className="relative flex min-h-full grow shrink-0 flex-col">
      {burst && <JoyBurst originX={50} originY={46} />}
      <div className="relative h-[320px] w-full shrink-0 overflow-hidden bg-surface-2">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="h-full w-full object-cover" />
        ) : (
          <video className="h-full w-full object-cover" src="/samples/videos/home-gift-walkthrough.mp4" poster="/samples/videos/home-gift-walkthrough.jpg" autoPlay muted loop playsInline />
        )}
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6 text-center">
        <motion.h1
          className="text-display mt-8"
          initial={{ opacity: 0, scale: 0.9, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.25 }}
        >
          Congratulations!
        </motion.h1>
        <div className="hairline mt-6" />
        <p className="text-body mt-5">Your account has been created with</p>
        <ul className="mt-4 space-y-3">
          {perks.map((p, i) => (
            <li key={p} className="flex items-center justify-center gap-3 text-[15px] text-ink-2 rise" style={{ animationDelay: `${120 + i * 90}ms` }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-accent text-accent">
                <Check size={13} strokeWidth={2.5} />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <div className="hairline mt-6" />
        <p className="text-body mt-5">
          {state.profile ? `Start stocking ${state.storeName || "your shelves"} with products chosen for your store` : "Start stocking your shelves today with products from thousands of brands"}
        </p>
        <div className="mt-auto pt-6">
          <Button onClick={() => router.push("/home")}>Start Shopping</Button>
        </div>
      </div>
    </div>
  );
}
