"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OptionRow } from "@/components/ui/OptionRow";
import { Screen } from "@/components/ui/Screen";
import { STORE_CATEGORIES } from "@/lib/catalog";
import { useOnboarding } from "@/lib/store";

export default function StoreCategoryPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  return (
    <Screen
      back="/onboarding/store-details"
      title="Which of these best describes your store?"
      footer={
        <Button disabled={!state.storeCategory} onClick={() => router.push("/onboarding/scan")}>
          Next
        </Button>
      }
    >
      <div className="mt-8 space-y-3">
        {STORE_CATEGORIES.map((c) => (
          <OptionRow key={c} selected={state.storeCategory === c} onClick={() => dispatch({ type: "setStoreCategory", value: c })}>
            {c}
          </OptionRow>
        ))}
      </div>
    </Screen>
  );
}
