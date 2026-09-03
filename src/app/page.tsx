"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useOnboarding } from "@/lib/store";

export default function CoverPage() {
  const router = useRouter();
  const { dispatch } = useOnboarding();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="relative h-[46%] min-h-[300px] w-full overflow-hidden bg-surface-2">
        <video
          className="h-full w-full object-cover"
          src="/samples/videos/home-gift-walkthrough.mp4"
          poster="/samples/videos/home-gift-walkthrough.jpg"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-8">
        <p className="text-caption uppercase tracking-[0.14em]">Prototype · new retailer onboarding</p>
        <h1 className="text-display mt-2 rise">Your first feed should already know your store.</h1>
        <p className="text-body mt-4 rise">
          Film a 15-second walkthrough of your shelves. Faire reads what you carry and personalizes your home feed
          before you&apos;ve searched for anything.
        </p>
        <div className="mt-auto space-y-3 pt-8">
          <Button
            onClick={() => {
              dispatch({ type: "reset" });
              router.push("/onboarding/store-type");
            }}
          >
            Start the onboarding demo
          </Button>
          <Link href="/about" className="block py-2 text-center text-[14px] text-ink underline underline-offset-4">
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
