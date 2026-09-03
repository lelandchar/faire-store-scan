"use client";

/** Five-stop slider in the spirit of an effort dial: labeled ends, dots, a white knob. */
export function StopSlider({
  value,
  onChange,
  leftLabel,
  rightLabel,
  stops = 5,
  ariaLabel,
}: {
  value: number; // 0..1
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
  stops?: number;
  ariaLabel: string;
}) {
  const idx = Math.round(value * (stops - 1));
  const pct = (idx / (stops - 1)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <div className="relative mt-2 h-9">
        <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(90deg, #bdbab4 0%, #e6e3dd 100%)" }} />
        {Array.from({ length: stops }, (_, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `calc(16px + (100% - 32px) * ${i / (stops - 1)})`, background: i <= idx ? "rgba(51,51,51,0.55)" : "rgba(51,51,51,0.25)" }}
          />
        ))}
        <span
          className="pointer-events-none absolute top-1/2 h-7 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[7px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-[left] duration-150"
          style={{ left: `calc(16px + (100% - 32px) * ${pct / 100})` }}
        />
        <input
          type="range"
          min={0}
          max={stops - 1}
          step={1}
          value={idx}
          aria-label={ariaLabel}
          onChange={(e) => onChange(Number(e.target.value) / (stops - 1))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
