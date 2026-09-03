"use client";

import { useRouter } from "next/navigation";
import { OptionRow } from "@/components/ui/OptionRow";
import { Screen } from "@/components/ui/Screen";
import { useOnboarding, type StoreTypeChoice } from "@/lib/store";

const OPTIONS: { value: StoreTypeChoice; label: string }[] = [
  { value: "physical", label: "Physical retail store" },
  { value: "online", label: "Online-only store" },
  { value: "popup", label: "Pop-up shop" },
  { value: "none", label: "None of the above" },
];

export default function StoreTypePage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  return (
    <Screen back="/" title="Store type" subtitle="Where do you sell your products?">
      <div className="mt-8 space-y-3">
        {OPTIONS.map((o) => (
          <OptionRow
            key={o.value}
            selected={state.storeType === o.value}
            onClick={() => {
              dispatch({ type: "setStoreType", value: o.value });
              router.push("/onboarding/store-details");
            }}
          >
            {o.label}
          </OptionRow>
        ))}
      </div>
      <p className="mt-6 text-center text-[15px] text-ink-2 underline underline-offset-4">I&apos;m just shopping for myself</p>
    </Screen>
  );
}
