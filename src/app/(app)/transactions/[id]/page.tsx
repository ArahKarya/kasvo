import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTransactionAction, editTransactionAction } from "@/app/actions/ledger";
import { AttachmentPanel } from "@/components/attachment-panel";
import { TransactionForm } from "@/components/transaction-form";
import { MAX_ATTACHMENTS_PER_TRANSACTION } from "@/server/domain/attachment-files";
import { listAttachments } from "@/server/domain/attachments";
import { Amount, buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { toDay } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { pickerOptions } from "@/server/domain/options";
import { getTransaction } from "@/server/domain/transaction-queries";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Transaction" };

export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const [row, { accounts, categories }, attachments] = await Promise.all([getTransaction(user.id, id), pickerOptions(user.id), listAttachments(user.id, id)]);
  if (!row) notFound();

  const isTransfer = Boolean(row.transferId);
  const magnitude = row.amount < 0n ? -row.amount : row.amount;
  // An archived account is not in the picker; keep it selectable for this row.
  const accountOptions = accounts.some((a) => a.id === row.account.id) ? accounts : [...accounts, row.account];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/transactions" className="text-sm text-muted hover:text-text">
        ← {t.common.back}
      </Link>
      <PageTitle actions={<Amount value={formatMoney(row.amount, row.account.currency, intlLocale(locale))} sign={row.amount > 0n ? 1 : -1} muted={isTransfer} />}>
        {row.description}
      </PageTitle>
      {isTransfer && row.counterparty && (
        <p className="-mt-4 text-sm text-muted">
          {row.account.name} {fmt(row.amount < 0n ? t.tx.transferTo : t.tx.transferFrom, { account: row.counterparty.name })}
        </p>
      )}
      {row.source === "AGENT" && <p className="-mt-4 text-xs text-muted">{fmt(t.tx.byAgent, { client: row.createdBy ?? "agent" })}</p>}

      <AttachmentPanel
        transactionId={row.id}
        items={attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size }))}
        labels={t.attach}
        max={MAX_ATTACHMENTS_PER_TRANSACTION}
      />

      <Card>
        <h2 className="mb-3 font-semibold">{t.tx.editTitle}</h2>
        <TransactionForm
          mode="edit"
          transferLeg={isTransfer}
          action={editTransactionAction.bind(null, row.id, isTransfer)}
          labels={{ tx: t.tx, common: t.common }}
          accounts={accountOptions}
          categories={categories}
          defaults={{
            kind: row.amount < 0n ? "EXPENSE" : "INCOME",
            accountId: row.account.id,
            amount: magnitude.toString(),
            bookedOn: toDay(row.bookedOn),
            description: row.description,
            payee: row.payee ?? "",
            note: row.note ?? "",
            categoryId: row.category?.id ?? "",
          }}
        />
      </Card>

      <details className="rounded-sm border border-danger/30 p-4">
        <summary className="cursor-pointer text-sm font-medium text-danger">{t.common.delete}</summary>
        <p className="mt-2 text-sm text-muted">{t.tx.deleteConfirm}</p>
        <form action={deleteTransactionAction} className="mt-3">
          <input type="hidden" name="id" value={row.id} />
          <button className={buttonClass.danger}>{t.common.delete}</button>
        </form>
      </details>
    </div>
  );
}
