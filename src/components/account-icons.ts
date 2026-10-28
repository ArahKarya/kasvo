import { Banknote, CreditCard, HandCoins, Landmark, Smartphone, TrendingUp, type LucideIcon } from "lucide-react";

/** One icon per account type, shared by the dashboard, accounts page, and quick entry. */
export const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  BANK: Landmark,
  EWALLET: Smartphone,
  CASH: Banknote,
  CREDIT_CARD: CreditCard,
  LOAN: HandCoins,
  INVESTMENT: TrendingUp,
};
