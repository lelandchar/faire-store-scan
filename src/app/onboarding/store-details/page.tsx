"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { useOnboarding } from "@/lib/store";

const SAMPLE = {
  name: "Simple Salt",
  description:
    "Simple, durable tools for the heart of the home. We make unpretentious kitchenware designed for the quiet joy of everyday cooking.",
};

export default function StoreDetailsPage() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const [name, setName] = useState(state.storeName);
  const [description, setDescription] = useState(state.description);
  const canNext = name.trim().length > 0;

  const next = () => {
    dispatch({ type: "setDetails", storeName: name.trim(), description: description.trim() });
    router.push("/onboarding/scan");
  };

  return (
    <Screen
      back="/onboarding/welcome"
      title="Store Details"
      footer={
        <Button disabled={!canNext} onClick={next}>
          Next
        </Button>
      }
    >
      <div className="mt-10">
        <label className="text-label block">Store Name</label>
        <input
          className="input-underline mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder=""
          autoComplete="organization"
          enterKeyHint="next"
        />
      </div>
      <div className="mt-8">
        <label className="text-label block">Description</label>
        <textarea
          className="mt-2 h-[200px] w-full resize-none rounded-[var(--radius)] border border-line bg-white p-3 text-[15px] text-ink outline-none focus:border-ink"
          maxLength={250}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-label">250 characters max</span>
          <button
            type="button"
            className="text-caption underline underline-offset-2"
            onClick={() => {
              setName(SAMPLE.name);
              setDescription(SAMPLE.description);
            }}
          >
            Fill with a sample
          </button>
        </div>
      </div>
    </Screen>
  );
}
