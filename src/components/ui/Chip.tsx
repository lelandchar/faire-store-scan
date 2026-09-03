"use client";

import type { ReactNode } from "react";

export function Chip({
  children,
  active = true,
  onClick,
  tone = "default",
  size = "md",
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "accent";
  size?: "sm" | "md";
  className?: string;
}) {
  const sizing = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-[15px]";
  const look = active
    ? tone === "accent"
      ? "bg-accent-soft text-ink border-accent/40"
      : "bg-ink text-white border-ink"
    : "bg-white text-ink-2 border-line hover:border-ink-2";
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap transition-colors duration-150 ${sizing} ${look} ${className}`}
    >
      {children}
    </Comp>
  );
}
