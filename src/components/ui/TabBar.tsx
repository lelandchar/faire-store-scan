"use client";

import { Home, Search, ShoppingCart, Package, User } from "lucide-react";
import { useRouter } from "next/navigation";

const TABS = [
  { label: "Home", Icon: Home, href: "/home" },
  { label: "Browse", Icon: Search, href: "/search" },
  { label: "Cart", Icon: ShoppingCart, href: null },
  { label: "Orders", Icon: Package, href: null },
  { label: "Profile", Icon: User, href: "/onboarding/profile" },
];

export function TabBar({ active = "Home" }: { active?: string }) {
  const router = useRouter();
  return (
    <nav className="sticky bottom-0 z-20 flex items-stretch justify-around border-t border-line bg-white px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      {TABS.map(({ label, Icon, href }) => {
        const on = label === active;
        return (
          <button key={label} type="button" onClick={() => href && router.push(href)} className={`flex w-16 flex-col items-center gap-1 ${on ? "text-ink" : "text-muted"}`}>
            <Icon size={24} strokeWidth={on ? 2 : 1.5} />
            <span className="text-[11px]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
