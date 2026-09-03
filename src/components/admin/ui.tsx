"use client";

import { Fragment, type ReactNode } from "react";

// Small presentational primitives for the engineer view: dense, sans body,
// monospace for numbers and vectors, white cards on the page's warm grey.

export function Card({
  id,
  step,
  title,
  subtitle,
  children,
  className = "",
}: {
  id?: string;
  step?: string;
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`rounded-[var(--radius-lg)] border border-line bg-white p-5 ${className}`}>
      {(step || title) && (
        <header className="mb-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            {step && <span className="text-caption uppercase tracking-[0.14em]">{step}</span>}
            {title && <h2 className="font-serif text-[22px] leading-tight text-ink">{title}</h2>}
          </div>
          {subtitle && <p className="text-caption mt-1 max-w-[920px]">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Placeholder({ children = "Run a sample to populate." }: { children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line bg-surface-2 px-4 py-6 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

export function Mono({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`font-mono text-[12px] tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export function Details({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-[var(--radius)] border border-line">
      <summary className="cursor-pointer select-none bg-surface-2 px-3 py-2 text-[13px] font-medium text-ink-2">{summary}</summary>
      <div className="border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

export function Thumb({ src, alt = "", size = 40, className = "", title }: { src: string; alt?: string; size?: number; className?: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      title={title}
      width={size}
      height={size}
     
      className={`shrink-0 rounded-[3px] bg-surface-2 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function KV({ items, className = "" }: { items: { k: string; v: ReactNode }[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px] ${className}`}>
      {items.map((it) => (
        <Fragment key={it.k}>
          <dt className="text-muted">{it.k}</dt>
          <dd className="min-w-0 text-ink">{it.v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function Pre({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[480px] overflow-auto rounded-[var(--radius)] bg-surface-2 p-3 font-mono text-[11px] leading-[1.45] text-ink-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function DeltaBadge({ delta, className = "" }: { delta: number; className?: string }) {
  if (delta > 0) return <span className={`font-mono text-[12px] font-medium tabular-nums text-success ${className}`}>↑{delta}</span>;
  if (delta < 0) return <span className={`font-mono text-[12px] font-medium tabular-nums text-danger ${className}`}>↓{Math.abs(delta)}</span>;
  return <span className={`font-mono text-[12px] text-muted-2 ${className}`}>·</span>;
}

export function Btn({
  children,
  onClick,
  disabled = false,
  primary = false,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[var(--radius)] border px-3 text-[13px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "border-ink bg-ink text-white hover:bg-ink-2" : "border-line bg-white text-ink hover:bg-surface-2"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export const TH = "whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted";
export const TD = "border-b border-line px-2 py-1.5 align-top";

export function fmt(n: number | null | undefined, digits = 3): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);
}

export function fmtMs(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString()} ms`;
}

/** Approximate decoded size of a base64 data URL, in KB. */
export function kb(dataUrl: string): number {
  return Math.round((dataUrl.length * 3) / 4 / 1024);
}

/** Streamed (partial-json) arrays may hold half-filled objects; treat every element as partial. */
export function partials<T>(arr: T[] | undefined | null): Partial<T>[] {
  return (arr ?? []).filter(Boolean) as Partial<T>[];
}
