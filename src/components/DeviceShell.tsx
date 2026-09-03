"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useOnboarding } from "@/lib/store";
import { FeedToggle } from "./FeedToggle";
import { StatusBar } from "./StatusBar";

export function DeviceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { dispatch } = useOnboarding();
  const restart = () => {
    dispatch({ type: "reset" });
    try {
      sessionStorage.removeItem("celebrated");
    } catch {
      /* ignore */
    }
    router.push("/");
  };
  // The end-to-end trace view is a full-width page, not a phone screen.
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  const onAbout = pathname?.startsWith("/about");
  const onFeed = pathname?.startsWith("/home") || pathname?.startsWith("/search");
  return (
    <div className="shell">
      <header className="top-nav">
        <div className="top-nav__brand">
          <span className="top-nav__mark font-serif" aria-hidden>
            F
          </span>
          <span className="font-serif">Faire Store Scan</span>
        </div>
        <nav className="top-nav__links">
          <Link href="/admin">End-to-end trace view</Link>
          <Link href="/about" aria-current={onAbout ? "page" : undefined}>
            How it works
          </Link>
          <button type="button" onClick={restart} className="top-nav__restart">
            <RotateCcw size={14} strokeWidth={2} /> Restart
          </button>
        </nav>
      </header>
      <div className="stage">
        <div className="device">
          <StatusBar />
          <div className="screen">{children}</div>
          {onFeed && <FeedToggle variant="floating" />}
        </div>
        {onFeed && <FeedToggle variant="side" />}
      </div>
    </div>
  );
}
