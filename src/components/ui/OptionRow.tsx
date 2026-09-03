"use client";

import type { ReactNode } from "react";

export function OptionRow({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-[48px] w-full items-center justify-center rounded-[var(--radius)] border px-4 text-[15px] transition-colors duration-150 ${
        selected ? "border-ink bg-surface-2 text-ink" : "border-line-strong/70 bg-white text-ink-2 hover:bg-surface-2"
      } ${className}`}
    >
      {children}
    </button>
  );
}
