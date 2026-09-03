"use client";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={`flex w-full rounded-[var(--radius)] border border-line bg-white p-0.5 ${size === "sm" ? "h-8" : "h-10"}`} role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-[3px] px-1 transition-colors duration-150 ${size === "sm" ? "text-[12px]" : "text-[13px]"} ${
              on ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
