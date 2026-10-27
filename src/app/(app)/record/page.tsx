import type { Metadata } from "next";
import Link from "next/link";
import { recordAction } from "@/app/actions/ledger";
import { TransactionForm } from "@/components/transaction-form";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "Record" };

/** Quick entry: just the form, for the phone's centre tab. */
export default async function RecordPage({ searchParams }: PageProps<"/record">) {
  const user = await requireUser();
  const { t } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const { accounts, categories } = await pickerOptions(user.id);
  const requested = (await searchParams).account;
  const accountId = typeof requested === "string" && accounts.some((a) => a.id === requested) ? requested : accounts[0]?.id;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle>{t.mobileNav.recordTitle}</PageTitle>
      {!accountId ? (
        <Card>
          <p className="text-sm text-muted">{t.tx.needAccount}</p>
          <Link href="/accounts" className={`${buttonClass.primary} mt-3 inline-block`}>
            {t.accounts.add}
          </Link>
        </Card>
      ) : (
        <Card>
          <TransactionForm
            mode="create"
            action={recordAction}
            labels={{ tx: t.tx, common: t.common }}
            accounts={accounts}
            categories={categories}
            defaults={{ kind: "EXPENSE", accountId, amount: "", bookedOn: todayIn(timezone), description: "", payee: "", note: "", categoryId: "" }}
          />
        </Card>
      )}
    </div>
  );
}
