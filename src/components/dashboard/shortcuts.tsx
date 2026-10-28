import Link from "next/link";
import { BarChart3, Download, Gem, Goal, HandCoins, PiggyBank } from "lucide-react";

const ITEMS = [
  { href: "/budgets", key: "budgets", icon: PiggyBank },
  { href: "/goals", key: "goals", icon: Goal },
  { href: "/debts", key: "debts", icon: HandCoins },
  { href: "/assets", key: "assets", icon: Gem },
  { href: "/reports", key: "reports", icon: BarChart3 },
  { href: "/import", key: "import", icon: Download },
] as const;

/** Quick links under the hero card: soft square tiles, not pills. */
export function Shortcuts({ labels }: { labels: Record<(typeof ITEMS)[number]["key"], string> }) {
  return (
    <nav className="grid grid-cols-6 gap-2" aria-label="Shortcuts">
      {ITEMS.map(({ href, key, icon: Icon }) => (
        <Link key={href} href={href} className="group flex flex-col items-center gap-1.5 text-center text-[11px] text-muted hover:text-text sm:text-xs">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-accent-text sm:h-14 sm:w-14">
            <Icon size={22} aria-hidden="true" />
          </span>
          {labels[key]}
        </Link>
      ))}
    </nav>
  );
}
