"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

// Faire's newer illustration palette leans bold and warm; keep it to one burst.
const COLORS = ["#ab7456", "#91957b", "#36676a", "#c9a24d", "#8b6f3a", "#6b4a5a", "#e07a5f", "#f2cc8f"];

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One bold burst from the bottom of the screen, then gravity. ~2 s, no sound. */
export function Confetti({ count = 64, seed = 11 }: { count?: number; seed?: number }) {
  const pieces = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 0.9; // mostly upward
      const power = 260 + rnd() * 320;
      const shape = rnd();
      return {
        id: i,
        dx: Math.cos(angle) * power,
        dy: Math.sin(angle) * power,
        fall: 260 + rnd() * 240,
        rot: rnd() * 720 - 360,
        size: 8 + rnd() * 8,
        color: COLORS[i % COLORS.length],
        shape: shape < 0.33 ? "circle" : shape < 0.66 ? "rect" : "tri",
        delay: rnd() * 0.12,
        duration: 1.6 + rnd() * 0.5,
      };
    });
  }, [count, seed]);
  return (
    <div className="pointer-events-none absolute inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.6 }}
          animate={{
            x: [0, p.dx * 0.7, p.dx],
            y: [0, p.dy, p.dy + p.fall],
            rotate: [0, p.rot * 0.6, p.rot],
            opacity: [1, 1, 0],
            scale: [0.6, 1, 0.9],
          }}
          transition={{ duration: p.duration, delay: p.delay, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] }}
          className="absolute left-1/2 top-[68%]"
          style={{
            width: p.size,
            height: p.shape === "rect" ? p.size * 0.55 : p.size,
            background: p.color,
            borderRadius: p.shape === "circle" ? 999 : 2,
            clipPath: p.shape === "tri" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** The one-line celebration that lands with the feed. */
export function CelebrationBanner({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-12, 0, 0, -6], scale: [0.96, 1, 1, 1] }}
      transition={{ duration: 2.6, times: [0, 0.15, 0.8, 1], ease: "easeOut" }}
      className="pointer-events-none absolute inset-x-6 top-[38%] z-[61] rounded-[var(--radius-lg)] bg-white/95 px-5 py-4 text-center shadow-[var(--shadow-card)]"
    >
      <p className="font-serif text-[22px] leading-tight text-ink">{text}</p>
      <p className="text-caption mt-1">Every row below was shaped by your walkthrough.</p>
    </motion.div>
  );
}
