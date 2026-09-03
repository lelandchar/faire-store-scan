"use client";

import { Home, Search, ShoppingCart, Package, User } from "lucide-react";

const TABS = [
  { label: "Home", Icon: Home },
  { label: "Browse", Icon: Search },
  { label: "Cart", Icon: ShoppingCart },
  { label: "Orders", Icon: Package },
  { label: "Profile", Icon: User },
];

export function TabBar({ active = "Home" }: { active?: string }) {
  return (
    <nav className="sticky bottom-0 z-20 flex items-stretch justify-around border-t border-line bg-white px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      {TABS.map(({ label, Icon }) => {
        const on = label === active;
        return (
          <button key={label} type="button" className={`flex w-16 flex-col items-center gap-1 ${on ? "text-ink" : "text-muted"}`}>
            <Icon size={24} strokeWidth={on ? 2 : 1.5} />
            <span className="text-[11px]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
