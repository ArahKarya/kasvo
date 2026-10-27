"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, LayoutDashboard, Menu, PiggyBank, Plus } from "lucide-react";

interface MobileNavProps {
  labels: { dashboard: string; transactions: string; record: string; budgets: string; more: string };
}

const TABS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/transactions", key: "transactions", icon: ArrowLeftRight },
  { href: "/record", key: "record", icon: Plus },
  { href: "/budgets", key: "budgets", icon: PiggyBank },
  { href: "/more", key: "more", icon: Menu },
] as const;

/** Bottom tab bar on phones (and in the Capacitor app); the sidebar takes over from `md`. */
export function MobileNav({ labels }: MobileNavProps) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Menu"
    >
      {TABS.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const primary = key === "record";
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted aria-[current=page]:font-semibold aria-[current=page]:text-accent"
          >
            <span className={`flex h-8 w-10 items-center justify-center rounded-sm ${primary ? "bg-accent text-accent-text" : ""}`}>
              <Icon size={primary ? 20 : 18} aria-hidden="true" />
            </span>
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
