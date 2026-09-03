"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

/**
 * Celebration modeled on Faire's illustration system (the "designing for joy"
 * confetti): a small pink dot blooms into a scalloped ring with a dark-green
 * spiky halo, then scatters small elements (four-point stars, leaves, dots,
 * half-circles, squares) in the same palette. One burst, about two seconds.
 */

const P = {
  pink: "#F4A7E3",
  pinkDeep: "#E96FD0",
  yellow: "#F2E51F",
  olive: "#A2AC2F",
  green: "#1F5A2E",
  brick: "#8E1F18",
  red: "#E43A1D",
  cream: "#F7EBD9",
};

type Kind = "star" | "leaf" | "dot" | "half" | "square" | "diamond";

interface Piece {
  id: number;
  kind: Kind;
  fill: string;
  accent: string;
  size: number;
  angle: number;
  dist: number;
  delay: number;
  rot: number;
  duration: number;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KINDS: Kind[] = ["star", "leaf", "dot", "half", "square", "diamond", "star", "dot", "leaf"];
const FILLS = [P.pink, P.yellow, P.olive, P.green, P.brick, P.red, P.pinkDeep, P.cream];

function Shape({ kind, fill, accent, size }: { kind: Kind; fill: string; accent: string; size: number }) {
  const s = size;
  switch (kind) {
    case "star":
      return (
        <svg width={s} height={s} viewBox="-1 -1 2 2" aria-hidden>
          <path d="M0,-1 C0.08,-0.3 0.3,-0.08 1,0 C0.3,0.08 0.08,0.3 0,1 C-0.08,0.3 -0.3,0.08 -1,0 C-0.3,-0.08 -0.08,-0.3 0,-1Z" fill={fill} />
          <circle r="0.22" fill={accent} />
        </svg>
      );
    case "leaf":
      return (
        <svg width={s} height={s * 0.6} viewBox="-1 -0.6 2 1.2" aria-hidden>
          <path d="M-1,0 C-0.5,-0.6 0.5,-0.6 1,0 C0.5,0.6 -0.5,0.6 -1,0Z" fill={fill} />
        </svg>
      );
    case "half":
      return (
        <svg width={s} height={s / 2} viewBox="-1 -1 2 1" aria-hidden>
          <path d="M-1,0 A1,1 0 0 1 1,0 Z" fill={fill} />
        </svg>
      );
    case "square":
      return <span style={{ display: "block", width: s * 0.8, height: s * 0.8, background: fill }} />;
    case "diamond":
      return (
        <svg width={s * 0.8} height={s} viewBox="-0.8 -1 1.6 2" aria-hidden>
          <path d="M0,-1 L0.8,0 L0,1 L-0.8,0Z" fill={fill} />
        </svg>
      );
    default:
      return <span style={{ display: "block", width: s * 0.7, height: s * 0.7, borderRadius: 999, background: fill }} />;
  }
}

export function JoyBurst({
  originX = 50,
  originY = 45,
  count = 34,
  scale = 1,
  seed = 3,
}: {
  /** percent of the container */
  originX?: number;
  originY?: number;
  count?: number;
  scale?: number;
  seed?: number;
}) {
  const pieces = useMemo<Piece[]>(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => {
      const kind = KINDS[Math.floor(rnd() * KINDS.length)];
      const fill = FILLS[Math.floor(rnd() * FILLS.length)];
      const accent = fill === P.pink ? P.yellow : fill === P.olive ? P.red : P.pink;
      return {
        id: i,
        kind,
        fill,
        accent,
        size: (kind === "star" ? 16 + rnd() * 14 : 8 + rnd() * 9) * scale,
        angle: (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.5,
        dist: (110 + rnd() * 150) * scale,
        delay: 0.32 + rnd() * 0.25,
        rot: (rnd() - 0.5) * 540,
        duration: 1.3 + rnd() * 0.5,
      };
    });
  }, [count, scale, seed]);

  const big = useMemo(() => {
    const rnd = seeded(seed + 7);
    return [
      { id: "b1", fill: P.pink, accent: P.yellow, x: -120 * scale, y: -70 * scale, size: 54 * scale, delay: 0.42 + rnd() * 0.1 },
      { id: "b2", fill: P.olive, accent: P.red, x: 118 * scale, y: -40 * scale, size: 46 * scale, delay: 0.5 + rnd() * 0.1 },
      { id: "b3", fill: P.yellow, accent: P.pink, x: 70 * scale, y: 110 * scale, size: 40 * scale, delay: 0.58 + rnd() * 0.1 },
    ];
  }, [scale, seed]);

  const origin = { left: `${originX}%`, top: `${originY}%` };

  return (
    <div className="pointer-events-none absolute inset-0 z-[60] overflow-hidden">
      {/* 1. The dot that blooms into a scalloped ring with a spiky green halo */}
      <motion.svg
        className="absolute"
        style={{ ...origin, marginLeft: -60 * scale, marginTop: -60 * scale }}
        width={120 * scale}
        height={120 * scale}
        viewBox="-60 -60 120 120"
        initial={{ scale: 0.05, opacity: 1 }}
        animate={{ scale: [0.05, 0.35, 1, 1.35], opacity: [1, 1, 1, 0] }}
        transition={{ duration: 0.95, times: [0, 0.25, 0.7, 1], ease: "easeOut" }}
        aria-hidden
      >
        <circle r="34" fill="none" stroke={P.green} strokeWidth="9" strokeDasharray="4 7" strokeLinecap="round" />
        <circle r="24" fill={P.pink} />
        <circle r="24" fill="none" stroke={P.pinkDeep} strokeWidth="5" strokeDasharray="5 5" strokeLinecap="round" />
        <circle r="6" fill={P.yellow} />
      </motion.svg>

      {/* 2. Three large illustrated stars pop near the ring */}
      {big.map((b) => (
        <motion.div
          key={b.id}
          className="absolute"
          style={{ ...origin, marginLeft: -b.size / 2, marginTop: -b.size / 2 }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: -20 }}
          animate={{ x: b.x, y: b.y + 30 * scale, scale: [0, 1.15, 1, 0.9], opacity: [0, 1, 1, 0], rotate: 25 }}
          transition={{ duration: 1.6, delay: b.delay, times: [0, 0.25, 0.75, 1], ease: "easeOut" }}
        >
          <Shape kind="star" fill={b.fill} accent={b.accent} size={b.size} />
        </motion.div>
      ))}

      {/* 3. Small elements scatter outward, then settle */}
      {pieces.map((p) => {
        const dx = Math.cos(p.angle) * p.dist;
        const dy = Math.sin(p.angle) * p.dist;
        return (
          <motion.div
            key={p.id}
            className="absolute"
            style={{ ...origin, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
            animate={{
              x: [0, dx * 0.85, dx],
              y: [0, dy * 0.85, dy + 60 * scale],
              scale: [0, 1, 1],
              opacity: [0, 1, 0],
              rotate: [0, p.rot * 0.6, p.rot],
            }}
            transition={{ duration: p.duration, delay: p.delay, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"] }}
          >
            <Shape kind={p.kind} fill={p.fill} accent={p.accent} size={p.size} />
          </motion.div>
        );
      })}
    </div>
  );
}
