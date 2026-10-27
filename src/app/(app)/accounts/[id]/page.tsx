import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveAccountAction, updateAccountAction } from "@/app/actions/ledger";
import { AccountFields } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { Amount, buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getAccount } from "@/server/domain/accounts";
import { DomainError } from "@/server/domain/errors";
import { formatMoney } from "@/server/domain/money";
import { getDictionary } from "@/i18n/server";
import { intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const account = await getAccount(user.id, id).catch((error: unknown) => {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/accounts" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <PageTitle actions={<Amount value={formatMoney(account.balance, account.currency, intlLocale(locale))} sign={0} />}>
        {account.name}
      </PageTitle>

      <Card>
        <h2 className="mb-4 font-semibold">{t.accounts.editTitle}</h2>
        <ActionForm action={updateAccountAction.bind(null, account.id)} submit={t.common.save} success={t.common.saved}>
          <AccountFields t={t} today="" account={account} />
        </ActionForm>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/transactions?account=${account.id}`} className={buttonClass.secondary}>
          {t.tx.title}
        </Link>
        <form action={archiveAccountAction}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="archived" value={account.archivedAt ? "0" : "1"} />
          <button className={account.archivedAt ? buttonClass.secondary : buttonClass.danger}>
            {account.archivedAt ? t.common.unarchive : t.common.archive}
          </button>
        </form>
      </div>
      {!account.archivedAt && <p className="text-xs text-muted">{t.accounts.archiveHint}</p>}
    </div>
  );
}
