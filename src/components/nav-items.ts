import { ArrowLeftRight, BarChart3, Download, Gem, Goal, HandCoins, LayoutDashboard, PiggyBank, Settings, Tags, Wallet, Wand2 } from "lucide-react";

/** Every section of the app, in sidebar order. */
export const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/transactions", key: "transactions", icon: ArrowLeftRight },
  { href: "/accounts", key: "accounts", icon: Wallet },
  { href: "/categories", key: "categories", icon: Tags },
  { href: "/import", key: "import", icon: Download },
  { href: "/rules", key: "rules", icon: Wand2 },
  { href: "/budgets", key: "budgets", icon: PiggyBank },
  { href: "/goals", key: "goals", icon: Goal },
  { href: "/debts", key: "debts", icon: HandCoins },
  { href: "/assets", key: "assets", icon: Gem },
  { href: "/reports", key: "reports", icon: BarChart3 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
