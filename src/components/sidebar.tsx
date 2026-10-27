"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart3, Download, LayoutDashboard, PiggyBank, Settings, Wallet } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/transactions", key: "transactions", icon: ArrowLeftRight },
  { href: "/accounts", key: "accounts", icon: Wallet },
  { href: "/budgets", key: "budgets", icon: PiggyBank },
  { href: "/import", key: "import", icon: Download },
  { href: "/reports", key: "reports", icon: BarChart3 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export type NavLabels = Record<(typeof ITEMS)[number]["key"], string>;

export function Sidebar({ labels }: { labels: NavLabels }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex shrink-0 items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-muted hover:bg-border/50 hover:text-text aria-[current=page]:bg-accent/10 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
          >
            <Icon size={16} aria-hidden="true" />
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
