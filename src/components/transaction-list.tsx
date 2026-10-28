import Link from "next/link";
import { ArrowLeftRight, Bot } from "lucide-react";
import { CategoryIcon } from "./category-icons";
import type { TransactionRow } from "@/server/domain/transaction-queries";
import { formatMoney } from "@/server/domain/money";
import { fmt, intlLocale, type Dictionary, type Locale } from "@/i18n/dictionaries";
import { Amount } from "./ui";

interface TransactionListProps {
  items: TransactionRow[];
  t: Dictionary;
  locale: Locale;
}

/** Rows grouped under their booking date, newest first. */
export function TransactionList({ items, t, locale }: TransactionListProps) {
  const dayLabel = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const days = [...new Set(items.map((i) => i.bookedOn.toISOString().slice(0, 10)))];

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {days.map((day) => (
        <section key={day}>
          <h3 className="bg-surface-2 px-4 py-1.5 text-xs font-semibold text-muted">{dayLabel.format(new Date(`${day}T00:00:00Z`))}</h3>
          <ul className="divide-y divide-border">
            {items
              .filter((i) => i.bookedOn.toISOString().startsWith(day))
              .map((i) => {
                const isTransfer = Boolean(i.transferId);
                const meta = [
                  i.account.name,
                  isTransfer && i.counterparty
                    ? fmt(i.amount < 0n ? t.tx.transferTo : t.tx.transferFrom, { account: i.counterparty.name })
                    : (i.category?.name ?? t.tx.uncategorized),
                  i.payee,
                ].filter(Boolean);
                return (
                  <li key={i.id}>
                    <Link href={`/transactions/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-border/30">
                      {isTransfer ? (
                        <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                          <ArrowLeftRight size={18} />
                        </span>
                      ) : (
                        <CategoryIcon icon={i.category?.icon} color={i.category?.color} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.description}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          {meta.join(" · ")}
                          {i.source === "AGENT" && (
                            <span className="inline-flex items-center gap-1" title={fmt(t.tx.byAgent, { client: i.createdBy ?? "agent" })}>
                              <Bot size={12} aria-hidden="true" />
                              {i.createdBy}
                            </span>
                          )}
                        </p>
                      </div>
                      <Amount
                        value={formatMoney(i.amount, i.account.currency, intlLocale(locale))}
                        sign={i.amount > 0n ? 1 : -1}
                        muted={isTransfer}
                      />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
