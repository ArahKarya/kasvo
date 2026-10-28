import type { Metadata } from "next";
import Link from "next/link";
import { QuickEntry } from "@/components/quick-entry";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { todayIn } from "@/server/domain/dates";
import { pickerOptions } from "@/server/domain/options";
import { getDictionary } from "@/i18n/server";
import { intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Record" };

/** Quick entry: just the form, for the phone's centre tab. */
export default async function RecordPage() {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { timezone: true } });
  const { accounts, categories } = await pickerOptions(user.id);
  const accountId = accounts[0]?.id;

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
          <QuickEntry accounts={accounts} categories={categories} today={todayIn(timezone)} locale={intlLocale(locale)} currency={user.baseCurrency} labels={{ quick: t.quick, tx: t.tx }} />
        </Card>
      )}
    </div>
  );
}
