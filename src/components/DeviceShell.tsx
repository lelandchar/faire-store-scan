"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { EMBEDDING_BACKEND_LABEL, type EmbeddingBackend } from "@/lib/retrieval";
import { useOnboarding } from "@/lib/store";
import { FeedToggle } from "./FeedToggle";
import { StatusBar } from "./StatusBar";
import { StoreRecap } from "./StoreRecap";

export function DeviceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const setBackend = (backend: EmbeddingBackend) => {
    dispatch({ type: "setEmbeddingBackend", backend });
    // A built storefront is rebuilt in the new space so the comparison is live, not stale.
    if (state.profile && state.frames.length && (pathname?.startsWith("/home") || pathname?.startsWith("/search"))) {
      router.push(`/onboarding/building?return=${pathname.startsWith("/search") ? "search" : "home"}`);
    }
  };
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
  const header = (
    <header className="top-nav">
        <div className="top-nav__brand">
          <span className="top-nav__mark font-serif" aria-hidden>
            F
          </span>
          <span className="font-serif">Faire Store Scan</span>
        </div>
        <nav className="top-nav__links">
          <label className="top-nav__select">
            <span>Retrieval</span>
            <select value={state.embeddingBackend} onChange={(e) => setBackend(e.target.value as EmbeddingBackend)} aria-label="Retrieval method">
              {(Object.keys(EMBEDDING_BACKEND_LABEL) as EmbeddingBackend[]).map((b) => (
                <option key={b} value={b}>
                  {EMBEDDING_BACKEND_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <Link href="/admin">End-to-end trace view</Link>
          <Link href="/about" aria-current={onAbout ? "page" : undefined}>
            How it works
          </Link>
          <button type="button" onClick={restart} className="top-nav__restart">
            <RotateCcw size={14} strokeWidth={2} /> Restart
          </button>
        </nav>
      </header>
  );
  if (onAbout) {
    return (
      <div className="shell shell--doc">
        {header}
        <main className="doc">{children}</main>
      </div>
    );
  }
  return (
    <div className="shell">
      {header}
      <div className="stage">
        <div className="device">
          <StatusBar />
          <div className="screen">{children}</div>
          {onFeed && <FeedToggle variant="floating" />}
        </div>
        {onFeed && <StoreRecap />}
        {onFeed && <FeedToggle variant="side" />}
      </div>
    </div>
  );
}
