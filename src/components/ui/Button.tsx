"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const base =
    "w-full h-[48px] rounded-[var(--radius)] text-[15px] font-medium transition-[background-color,color,transform] duration-200 active:scale-[0.99] select-none";
  const styles: Record<Variant, string> = {
    primary: disabled ? "bg-surface-2 text-muted-2" : "bg-ink text-white hover:bg-[#1f1f1f]",
    secondary: disabled ? "border border-line text-muted-2" : "border border-ink text-ink hover:bg-surface-2",
    ghost: "text-ink underline underline-offset-4 h-auto py-2",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
