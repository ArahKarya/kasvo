"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Delete, HandCoins, Heart, Landmark, Smartphone, Star, TrendingUp, type LucideIcon } from "lucide-react";
import { quickRecordAction } from "@/app/actions/quick";
import type { Dictionary } from "@/i18n/dictionaries";
import { evaluateAmount, isExpression } from "@/lib/amount-expression";
import { formatMoney } from "@/server/domain/money";
import { CategoryIcon } from "./category-icons";

type Kind = "EXPENSE" | "INCOME" | "TRANSFER";
type Necessity = "NEED" | "WANT";

export interface QuickAccount {
  id: string;
  name: string;
  type: string;
}

export interface QuickCategory {
  id: string;
  kind: "INCOME" | "EXPENSE";
  shortName: string;
  icon: string | null;
  color: string | null;
  necessity: Necessity | null;
}

interface QuickEntryProps {
  accounts: QuickAccount[];
  categories: QuickCategory[];
  today: string;
  locale: string;
  currency: string;
  labels: Pick<Dictionary, "quick" | "tx">;
  /** Called after a successful save (the sheet closes itself). */
  onSaved?: (message: string) => void;
}

const ACCOUNT_ICONS: Record<string, LucideIcon> = { BANK: Landmark, EWALLET: Smartphone, CASH: Banknote, CREDIT_CARD: CreditCard, LOAN: HandCoins, INVESTMENT: TrendingUp };
const LAST_ACCOUNT = "kasvo.lastAccount";

const shiftDay = (day: string, by: number): string => new Date(Date.parse(day) + by * 86_400_000).toISOString().slice(0, 10);

function remembered(accounts: QuickAccount[]): string | undefined {
  try {
    const id = localStorage.getItem(LAST_ACCOUNT);
    return accounts.some((a) => a.id === id) ? (id ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT, id);
  } catch {
    // Storage can be unavailable (private mode); the first account is then the default.
  }
}

const chip =
  "inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-sm transition aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent border-border text-muted hover:text-text";

const noop = () => () => {};

/**
 * Fast entry in the spirit of a banking app: kind, day, account chips, a big amount driven
 * by a calculator keypad (or the keyboard), category chips with icons, and need/want.
 * Rendered only in the browser, because it starts from the last account used on this device.
 */
export function QuickEntry(props: QuickEntryProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <QuickEntryForm {...props} /> : <div className="h-[34rem]" aria-busy="true" />;
}

function QuickEntryForm({ accounts, categories, today, locale, currency, labels, onSaved }: QuickEntryProps) {
  const q = labels.quick;
  const [pending, startSaving] = useTransition();
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [day, setDay] = useState(today);
  const [accountId, setAccountId] = useState(() => remembered(accounts) ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [necessity, setNecessity] = useState<Necessity | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const value = evaluateAmount(amount);
  const shownCategories = categories.filter((c) => c.kind === (kind === "INCOME" ? "INCOME" : "EXPENSE"));
  const category = categories.find((c) => c.id === categoryId);
  const autoNecessity = category?.necessity ?? null;
  const dayLabel =
    day === today ? q.today : day === shiftDay(today, -1) ? q.yesterday : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  const press = (key: string) => {
    setError("");
    if (key === "C") setAmount("");
    else if (key === "⌫") setAmount((a) => a.slice(0, -1));
    else setAmount((a) => (/[+−×÷]$/.test(a) && /[+−×÷]/.test(key) ? a.slice(0, -1) + key : a + key));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value === null || value <= 0n) {
      setError(q.invalidAmount);
      return;
    }
    remember(accountId);
    const data = new FormData(event.currentTarget);
    startSaving(async () => {
      const result = await quickRecordAction({}, data);
      if (!result.ok) {
        setError(result.error ?? "");
        return;
      }
      setAmount("");
      setDescription("");
      setCategoryId("");
      setNecessity(null);
      onSaved?.(result.message ?? "");
    });
  };

  const switchKind = (next: Kind) => {
    setKind(next);
    setCategoryId("");
    setNecessity(null);
  };

  if (accounts.length === 0) return <p className="text-sm text-muted">{q.needAccount}</p>;

  const keys = ["C", "÷", "×", "⌫", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "000", "0", ","];
  const keyClass = "flex h-12 items-center justify-center rounded-lg border border-border bg-surface text-lg font-medium active:bg-surface-2 hover:bg-surface-2";
  const kindLabel: Record<Kind, string> = { EXPENSE: labels.tx.expense, INCOME: labels.tx.income, TRANSFER: labels.tx.transfer };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="bookedOn" value={day} />
      <input type="hidden" name="accountId" value={accountId} />
      {kind === "TRANSFER" && <input type="hidden" name="toAccountId" value={toAccountId} />}
      <input type="hidden" name="categoryId" value={kind === "TRANSFER" ? "" : categoryId} />
      <input type="hidden" name="necessity" value={kind === "EXPENSE" && necessity ? necessity : ""} />
      <input type="hidden" name="fallbackDescription" value={category?.shortName ?? ""} />

      <div role="tablist" aria-label={labels.tx.kind} className="grid grid-cols-3 rounded-sm border border-border p-0.5">
        {(["EXPENSE", "INCOME", "TRANSFER"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => switchKind(k)} className="rounded-[4px] py-2 text-sm text-muted aria-selected:bg-accent aria-selected:font-semibold aria-selected:text-accent-text">
            {kindLabel[k]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label={q.prevDay} className="rounded-sm p-2 text-muted hover:bg-surface-2">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <label className="relative flex-1 text-center text-sm font-medium">
          {dayLabel}
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={labels.tx.date} />
        </label>
        <button type="button" onClick={() => setDay((d) => shiftDay(d, 1))} disabled={day >= today} aria-label={q.nextDay} className="rounded-sm p-2 text-muted hover:bg-surface-2 disabled:opacity-30">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <AccountChips label={kind === "TRANSFER" ? q.from : q.account} accounts={accounts} value={accountId} onChange={setAccountId} />
      {kind === "TRANSFER" && <AccountChips label={q.to} accounts={accounts.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} />}

      <div className="border-b border-border pb-2 text-right">
        <label className="sr-only" htmlFor="quick-amount">
          {q.amount}
        </label>
        <input
          id="quick-amount"
          name="amount"
          value={amount}
          onChange={(e) => {
            setError("");
            setAmount(e.target.value);
          }}
          inputMode="none"
          autoComplete="off"
          placeholder="0"
          className={`num w-full bg-transparent text-right text-4xl font-bold tracking-tight outline-none placeholder:text-muted/50 ${kind === "INCOME" ? "text-income" : kind === "EXPENSE" ? "text-expense" : ""}`}
        />
        <p className="num h-5 text-sm text-muted">{isExpression(amount) && value !== null ? `= ${formatMoney(value, currency, locale)}` : value !== null && amount ? formatMoney(value, currency, locale) : ""}</p>
      </div>

      <input name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder={q.descriptionPlaceholder} aria-label={q.description} className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />

      {kind !== "TRANSFER" && (
        <>
          {kind === "EXPENSE" && (
            <div className="flex gap-2">
              {(["NEED", "WANT"] as const).map((n) => {
                const Icon = n === "NEED" ? Heart : Star;
                const active = necessity === n || (necessity === null && autoNecessity === n);
                return (
                  <button key={n} type="button" aria-pressed={active} onClick={() => setNecessity(necessity === n ? null : n)} className={chip}>
                    <Icon size={14} aria-hidden="true" />
                    {n === "NEED" ? q.need : q.want}
                    {necessity === null && autoNecessity === n && <span className="text-[10px] font-normal opacity-70">({q.auto})</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div role="group" aria-label={q.category} className="no-scrollbar grid auto-cols-max grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto">
            {shownCategories.map((c) => (
              <button key={c.id} type="button" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)} className={`${chip} py-1 pl-1`}>
                <CategoryIcon icon={c.icon} color={c.color} size={24} />
                {c.shortName}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === "⌫" ? q.backspace : k === "C" ? q.clear : k} className={`${keyClass} ${["÷", "×", "−", "+", "C"].includes(k) ? "text-muted" : ""}`}>
            {k === "⌫" ? <Delete size={20} aria-hidden="true" /> : k}
          </button>
        ))}
        <button type="submit" disabled={pending} className="col-span-2 flex h-12 items-center justify-center rounded-lg bg-accent text-base font-semibold text-accent-text disabled:opacity-60">
          {q.save}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function AccountChips({ label, accounts, value, onChange }: { label: string; accounts: QuickAccount[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="group" aria-label={label} className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      {accounts.map((a) => {
        const Icon = ACCOUNT_ICONS[a.type] ?? Landmark;
        return (
          <button key={a.id} type="button" aria-pressed={value === a.id} onClick={() => onChange(a.id)} className={chip}>
            <Icon size={14} aria-hidden="true" />
            {a.name}
          </button>
        );
      })}
    </div>
  );
}
