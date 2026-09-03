"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Ranked } from "./ranking";

// Which feed card the reviewer is looking at (hover on desktop), so the panel beside the
// phone can show that product's ranking breakdown. Not persisted.
interface InspectState {
  item: Ranked | null;
  total: number;
  setItem: (item: Ranked | null, total?: number) => void;
}

const InspectContext = createContext<InspectState>({ item: null, total: 0, setItem: () => {} });

export function InspectProvider({ children }: { children: ReactNode }) {
  const [item, setCurrent] = useState<Ranked | null>(null);
  const [total, setTotal] = useState(0);
  const value = useMemo<InspectState>(
    () => ({
      item,
      total,
      setItem: (next, count) => {
        setCurrent(next);
        if (typeof count === "number") setTotal(count);
      },
    }),
    [item, total],
  );
  return <InspectContext.Provider value={value}>{children}</InspectContext.Provider>;
}

export const useInspect = () => useContext(InspectContext);
