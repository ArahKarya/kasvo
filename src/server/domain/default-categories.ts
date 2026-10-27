import type { CategoryKind } from "@/generated/prisma/client";

interface DefaultCategory {
  kind: CategoryKind;
  id: string;
  en: string;
}

/** Seeded for every new user in their language; they can rename or archive any of them. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { kind: "INCOME", id: "Gaji", en: "Salary" },
  { kind: "INCOME", id: "Bonus & THR", en: "Bonus & holiday allowance" },
  { kind: "INCOME", id: "Usaha", en: "Business" },
  { kind: "INCOME", id: "Investasi", en: "Investment" },
  { kind: "INCOME", id: "Lain-lain", en: "Other" },
  { kind: "EXPENSE", id: "Makan & minum", en: "Food & drink" },
  { kind: "EXPENSE", id: "Belanja harian", en: "Groceries" },
  { kind: "EXPENSE", id: "Transportasi", en: "Transport" },
  { kind: "EXPENSE", id: "Tagihan & utilitas", en: "Bills & utilities" },
  { kind: "EXPENSE", id: "Pulsa & internet", en: "Phone & internet" },
  { kind: "EXPENSE", id: "Rumah", en: "Housing" },
  { kind: "EXPENSE", id: "Kesehatan", en: "Health" },
  { kind: "EXPENSE", id: "Pendidikan", en: "Education" },
  { kind: "EXPENSE", id: "Hiburan", en: "Entertainment" },
  { kind: "EXPENSE", id: "Belanja", en: "Shopping" },
  { kind: "EXPENSE", id: "Zakat & sedekah", en: "Charity" },
  { kind: "EXPENSE", id: "Keluarga", en: "Family" },
  { kind: "EXPENSE", id: "Cicilan", en: "Loan repayment" },
  { kind: "EXPENSE", id: "Biaya admin bank", en: "Bank fees" },
  { kind: "EXPENSE", id: "Lain-lain", en: "Other" },
];
