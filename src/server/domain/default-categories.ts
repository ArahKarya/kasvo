import type { CategoryKind, Necessity } from "@/generated/prisma/client";

interface DefaultCategory {
  kind: CategoryKind;
  id: string;
  en: string;
  icon: string;
  color: string;
  necessity?: Necessity;
}

/** Seeded for every new user in their language; they can rename or archive any of them. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { kind: "INCOME", id: "Gaji", en: "Salary", icon: "briefcase", color: "green" },
  { kind: "INCOME", id: "Bonus & THR", en: "Bonus & holiday allowance", icon: "gift", color: "amber" },
  { kind: "INCOME", id: "Usaha", en: "Business", icon: "store", color: "teal" },
  { kind: "INCOME", id: "Investasi", en: "Investment", icon: "trending-up", color: "blue" },
  { kind: "INCOME", id: "Lain-lain", en: "Other", icon: "wallet", color: "slate" },
  { kind: "EXPENSE", id: "Makan & minum", en: "Food & drink", icon: "utensils", color: "orange", necessity: "NEED" },
  { kind: "EXPENSE", id: "Belanja harian", en: "Groceries", icon: "shopping-cart", color: "green", necessity: "NEED" },
  { kind: "EXPENSE", id: "Transportasi", en: "Transport", icon: "car", color: "blue", necessity: "NEED" },
  { kind: "EXPENSE", id: "Tagihan & utilitas", en: "Bills & utilities", icon: "zap", color: "amber", necessity: "NEED" },
  { kind: "EXPENSE", id: "Pulsa & internet", en: "Phone & internet", icon: "smartphone", color: "teal", necessity: "NEED" },
  { kind: "EXPENSE", id: "Rumah", en: "Housing", icon: "home", color: "purple", necessity: "NEED" },
  { kind: "EXPENSE", id: "Kesehatan", en: "Health", icon: "heart-pulse", color: "red", necessity: "NEED" },
  { kind: "EXPENSE", id: "Pendidikan", en: "Education", icon: "graduation-cap", color: "blue", necessity: "NEED" },
  { kind: "EXPENSE", id: "Hiburan", en: "Entertainment", icon: "film", color: "pink", necessity: "WANT" },
  { kind: "EXPENSE", id: "Belanja", en: "Shopping", icon: "shopping-bag", color: "purple", necessity: "WANT" },
  { kind: "EXPENSE", id: "Zakat & sedekah", en: "Charity", icon: "hand-heart", color: "green", necessity: "NEED" },
  { kind: "EXPENSE", id: "Keluarga", en: "Family", icon: "users", color: "pink", necessity: "NEED" },
  { kind: "EXPENSE", id: "Cicilan", en: "Loan repayment", icon: "landmark", color: "slate", necessity: "NEED" },
  { kind: "EXPENSE", id: "Biaya admin bank", en: "Bank fees", icon: "receipt", color: "slate", necessity: "NEED" },
  { kind: "EXPENSE", id: "Lain-lain", en: "Other", icon: "tag", color: "slate" },
];
