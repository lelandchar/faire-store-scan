"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function BackChevron({ href }: { href?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (href ? router.push(href) : router.back())}
      className="-ml-2 flex h-11 w-11 items-center justify-center text-ink-2"
    >
      <ChevronLeft size={26} strokeWidth={1.5} />
    </button>
  );
}

export function Screen({
  back,
  title,
  subtitle,
  children,
  footer,
  padTop = true,
  className = "",
}: {
  back?: string | false;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  padTop?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex min-h-full flex-1 flex-col ${className}`}>
      <div className="flex-1 px-6 pb-6">
        {back !== false && (
          <div className={`${padTop ? "pt-4" : "pt-2"} pb-6`}>
            <BackChevron href={typeof back === "string" ? back : undefined} />
          </div>
        )}
        {title && <h1 className="text-display rise">{title}</h1>}
        {subtitle && <p className="text-body mt-3 rise">{subtitle}</p>}
        {children}
      </div>
      {footer && (
        <div className="sticky bottom-0 border-t border-line bg-white/95 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  );
}
