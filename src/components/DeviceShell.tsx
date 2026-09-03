"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar";

const STEPS = [
  { href: "/", label: "Store type (Faire's onboarding)" },
  { href: "/onboarding/welcome", label: "Why film your store" },
  { href: "/onboarding/store-details", label: "Store details" },
  { href: "/onboarding/scan", label: "Film a 15-second walkthrough" },
  { href: "/onboarding/analyzing", label: "Reading the shelves" },
  { href: "/onboarding/profile", label: "Retailer confirms the read" },
  { href: "/home", label: "Personalized storefront" },
];

export function DeviceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The engineer/admin trace view is a full-width page, not a phone screen.
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));
  return (
    <div className="shell">
      <aside className="side-panel w-[360px] shrink-0 self-center text-ink">
        <h1 className="text-display">Store Scan</h1>
        <p className="text-body mt-3">A new step in Faire&apos;s retailer onboarding: film your shelves, and your storefront is personalized from day one.</p>
        <ol className="mt-6 space-y-1.5">
          {STEPS.map((s, i) => {
            const active = isActive(s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-3 rounded-[var(--radius)] px-2 py-1.5 text-[14px] transition-colors ${
                    active ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:bg-white/60"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${active ? "border-ink bg-ink text-white" : "border-line text-muted"}`}>
                    {i + 1}
                  </span>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="text-caption mt-8">Built by Leland Char</p>
      </aside>
      <div className="device">
        <div className={`proto-tab ${pathname?.startsWith("/home") || pathname?.startsWith("/search") ? "proto-tab--quiet" : ""}`}>
          <Link href="/about">How it works</Link>
          <span aria-hidden>·</span>
          <Link href="/admin">Engineer view</Link>
        </div>
        <StatusBar />
        <div className="screen">{children}</div>
      </div>
    </div>
  );
}
