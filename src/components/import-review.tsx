"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions/ledger";
import { ActionForm } from "./action-form";
import type { CategoryOption } from "./transaction-form";
import { inputClass } from "./ui";

export interface ReviewRow {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amountText: string;
  /** -1 for money out, 1 for money in. */
  sign: number;
  duplicate: boolean;
  categoryId: string | null;
}

interface ImportReviewProps {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  rows: ReviewRow[];
  categories: CategoryOption[];
  labels: { include: string; duplicate: string; commit: string; uncategorized: string; date: string; description: string; amount: string; category: string };
}

/** The review table: a tick and a category per row, committed in one submit. */
export function ImportReview({ action, rows, categories, labels }: ImportReviewProps) {
  const [included, setIncluded] = useState(() => new Set(rows.filter((r) => !r.duplicate).map((r) => r.id)));
  const toggle = (id: string, on: boolean) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <ActionForm action={action} submit={labels.commit.replace("{n}", String(included.size))}>
      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{labels.include}</th>
              <th className="px-3 py-2 font-medium">{labels.date}</th>
              <th className="px-3 py-2 font-medium">{labels.description}</th>
              <th className="px-3 py-2 text-right font-medium">{labels.amount}</th>
              <th className="px-3 py-2 font-medium">{labels.category}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className={included.has(r.id) ? "" : "opacity-50"}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    name={`inc:${r.id}`}
                    checked={included.has(r.id)}
                    onChange={(e) => toggle(r.id, e.target.checked)}
                    aria-label={`${labels.include}: ${r.description}`}
                    className="accent-[var(--accent)]"
                  />
                </td>
                <td className="num whitespace-nowrap px-3 py-1.5 text-muted">{r.date}</td>
                <td className="px-3 py-1.5">
                  <span className="block max-w-md truncate" title={r.description}>
                    {r.description}
                  </span>
                  {(r.payee || r.duplicate) && (
                    <span className="text-xs text-muted">
                      {[r.payee, r.duplicate ? labels.duplicate : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className={`num whitespace-nowrap px-3 py-1.5 text-right font-medium ${r.sign < 0 ? "text-expense" : "text-income"}`}>{r.amountText}</td>
                <td className="px-3 py-1.5">
                  <select name={`cat:${r.id}`} defaultValue={r.categoryId ?? ""} className={`${inputClass} min-w-40 py-1`} aria-label={labels.category}>
                    <option value="">{labels.uncategorized}</option>
                    {categories
                      .filter((c) => c.kind === (r.sign < 0 ? "EXPENSE" : "INCOME"))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
