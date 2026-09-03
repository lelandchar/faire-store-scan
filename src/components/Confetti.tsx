"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

const COLORS = ["#8b6f3a", "#91957b", "#36676a", "#ab7456", "#f6eee4", "#c9a24d"];

/** Deterministic pseudo-random so render stays pure (and the burst is reproducible). */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One restrained burst, "an intimate birthday party" per Faire's own bar. */
export function Confetti({ count = 26, seed = 7 }: { count?: number; seed?: number }) {
  const pieces = useMemo(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 8 + rnd() * 84,
      delay: rnd() * 0.25,
      rot: rnd() * 360,
      size: 6 + rnd() * 6,
      color: COLORS[i % COLORS.length],
      round: rnd() > 0.5,
      drift: (rnd() - 0.5) * 60,
      duration: 1.5 + rnd() * 0.5,
    }));
  }, [count, seed]);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: `${p.x}vw`, y: -20, rotate: p.rot, opacity: 1 }}
          animate={{ y: 420, x: `calc(${p.x}vw + ${p.drift}px)`, rotate: p.rot + 240, opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
          className="absolute top-0 left-0"
          style={{ width: p.size, height: p.round ? p.size : p.size * 0.5, background: p.color, borderRadius: p.round ? 999 : 2 }}
        />
      ))}
    </div>
  );
}
