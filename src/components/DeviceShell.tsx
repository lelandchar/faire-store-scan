"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FeedToggle } from "./FeedToggle";
import { StatusBar } from "./StatusBar";

export function DeviceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The end-to-end trace view is a full-width page, not a phone screen.
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  const onAbout = pathname?.startsWith("/about");
  const onFeed = pathname?.startsWith("/home") || pathname?.startsWith("/search");
  return (
    <div className="shell">
      <header className="top-nav">
        <Link href="/" className="top-nav__brand font-serif">
          Store Scan
        </Link>
        <nav className="top-nav__links">
          <Link href="/admin">End-to-end trace view</Link>
          <Link href="/about" aria-current={onAbout ? "page" : undefined}>
            How it works
          </Link>
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
