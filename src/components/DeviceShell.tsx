"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const STEPS = [
  { href: "/onboarding/store-type", label: "Faire's existing onboarding" },
  { href: "/onboarding/scan", label: "New: film a store walkthrough" },
  { href: "/onboarding/analyzing", label: "Frames → structured signals" },
  { href: "/onboarding/profile", label: "Retailer confirms the read" },
  { href: "/home", label: "Cold-start personalized feed" },
];

export function DeviceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <aside className="side-panel w-[360px] shrink-0 self-center text-ink">
        <p className="text-caption uppercase tracking-[0.14em]">Prototype</p>
        <h1 className="text-display mt-2">Store Scan</h1>
        <p className="text-body mt-3">
          Cold-start personalization for new Faire retailers: film your shelves, and your first feed already knows your store.
        </p>
        <ol className="mt-6 space-y-2">
          {STEPS.map((s, i) => {
            const active = pathname?.startsWith(s.href);
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={`flex items-center gap-3 rounded-[var(--radius)] px-2 py-1.5 text-[15px] transition-colors ${
                    active ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[12px] ${
                      active ? "border-ink bg-ink text-white" : "border-line text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="mt-8 space-y-2 text-caption">
          <p>
            <Link href="/about" className="underline underline-offset-2">
              How it works
            </Link>{" "}
            · built by Leland Char
          </p>
          <p>Independent concept inspired by an interview conversation. Not affiliated with or endorsed by Faire.</p>
        </div>
      </aside>
      <div className="device">
        <div className="status-bar flex shrink-0 items-end justify-between px-8 pb-2 text-[15px] font-semibold text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[10px] w-[16px] rounded-[2px] bg-ink" />
            <span className="inline-block h-[10px] w-[22px] rounded-[3px] border border-ink" />
          </span>
        </div>
        <div className="screen">{children}</div>
      </div>
    </div>
  );
}
