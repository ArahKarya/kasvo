# Kasvo — Specification

> Status: draft v0.1 · 2026-10-27 · License AGPL-3.0-only

Kasvo is an open-source, self-hosted personal-finance app built for Indonesia first,
with a first-party MCP server so an AI agent can record, categorize, and analyze money
on the user's behalf. Everything the UI can do goes through the same domain layer the
agent uses, so both are held to the same rules and both leave an audit trail.

## 1. Goals and non-goals

**Goals**
- Record money across bank accounts, e-wallets, cash, and credit cards in IDR.
- Let an agent (Claude Code, Claude Desktop, any MCP client) add, edit, import, and
  analyze data safely: scoped tokens, confirmation for destructive actions, audit log.
- Import statements from major Indonesian banks with dedup and auto-categorization.
- Bilingual UI (Bahasa Indonesia default, English).
- Run locally with one `docker compose up`.

**Non-goals (v1)**
- Live bank connections / scraping internet banking.
- Tax filing, business accounting, invoicing.
- Hosted multi-tenant SaaS (self-host only; the schema is multi-user ready).

## 2. Architecture

```
            ┌──────────── Next.js app ─────────────┐
 Browser ──▶│ UI (RSC + server actions)            │
            │ /api/mcp  (Streamable HTTP, bearer)  │──┐
            └──────────────────────────────────────┘  │
 MCP stdio ──▶ mcp/stdio.ts (KASVO_TOKEN) ─────────────┤
                                                       ▼
                         src/server/domain/*  (services, zod-validated)
                                     │  every write → AuditLog
                                     ▼
                              Prisma 7 → Postgres 17
```

- **Domain layer is the only path to the database.** UI server actions, the HTTP MCP
  endpoint, and the stdio MCP binary all call the same service functions with an
  `Actor` (`{ userId, kind: "user" | "agent", clientName, scopes }`).
- **Money** is stored as `BigInt` minor units plus an ISO-4217 currency per account.
  IDR has exponent 0. Never floats.
- **Dates** are stored as `DATE` (booking date) in the user's timezone
  (default `Asia/Jakarta`); timestamps are UTC.

### Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript strict |
| DB | Postgres 17, Prisma 7 |
| UI | Tailwind v4, Radix primitives, Recharts; small-radius (4px) controls, no pills |
| i18n | Typed in-repo dictionaries (`src/i18n`), `id` (default) and `en` |
| Auth | Email + password (scrypt from node:crypto), HTTP-only session cookie |
| MCP | `@modelcontextprotocol/sdk`, stdio + Streamable HTTP |
| Validation | zod v4 at every boundary |
| Tests | Vitest (unit + integration against a real Postgres), Playwright (e2e) |

## 3. Data model

| Entity | Key fields |
|---|---|
| `User` | email, passwordHash, locale, timezone, baseCurrency (`IDR`) |
| `Account` | name, type (`BANK`, `EWALLET`, `CASH`, `CREDIT_CARD`, `LOAN`, `INVESTMENT`), institution, currency, openingBalance, openingDate, archivedAt |
| `Category` | name, kind (`INCOME`, `EXPENSE`), parentId (one level), color, icon, archivedAt |
| `Transaction` | accountId, bookedOn, amount (signed BigInt), description, payee, categoryId?, note, transferId?, importBatchId?, fingerprint, source (`MANUAL`, `IMPORT`, `AGENT`), deletedAt |
| `Transfer` | links exactly two transactions (out and in), optional fee transaction |
| `Budget` | categoryId (expense), month (`YYYY-MM`), amount. A parent's budget covers its subcategories; warning at 80% used or when the pace projects past the limit. No rollover yet. |
| `Rule` | priority, conditions (description contains/regex, amount range, account), actions (set category, set payee); `enabled` |
| `ImportBatch` | accountId, format, fileName, fileHash, status (`STAGED`, `COMMITTED`, `REVERTED`), counts |
| `StagedRow` | batchId, parsed fields, fingerprint, `duplicateOf?`, suggested category |
| `ApiToken` | name, tokenHash (sha256), prefix, scopes, expiresAt, lastUsedAt, revokedAt |
| `PendingAction` | actor, tool, payload (JSON), summary, expiresAt (10 min), consumedAt |
| `AuditLog` | actor kind + client, action, entity, entityId, before, after, at |

Rules:
- Balance = openingBalance + Σ non-deleted transactions. No stored running balance.
- Transfers never count as income/expense in reports.
- Deletes are soft (`deletedAt`) and restorable for 30 days.
- `fingerprint` = sha256(accountId, bookedOn, amount, normalized description, n-th
  occurrence that day). Used for import dedup.

## 4. MCP server

Tools are grouped by scope. A token carries any of `read`, `write`, `destructive`.
Names use the `kasvo_` prefix so they read clearly next to other servers' tools.

**read**
| Tool | Purpose |
|---|---|
| `kasvo_overview` | Net worth, balances per account, this month's income/expense, instalments due within 7 days |
| `kasvo_list_accounts` | Accounts with current balance |
| `kasvo_list_categories` | Category tree |
| `kasvo_find_transactions` | Filter by date range, account, category, amount, text; paginated |
| `kasvo_spending_breakdown` | Totals by category / payee / account for a period |
| `kasvo_compare_periods` | Period A vs B per category, with biggest movers |
| `kasvo_cashflow` | Income, expense, net per day/week/month |
| `kasvo_budget_status` | Budget vs actual for a month, projected end-of-month |
| `kasvo_find_anomalies` | Unusually large transactions, new payees, duplicate charges |
| `kasvo_list_rules` | Categorization rules |
| `kasvo_list_imports`, `kasvo_get_import` | Import history; review a staged batch row by row |
| `kasvo_list_goals` | Savings goals: progress, needed per month, projected date, state |
| `kasvo_list_debts`, `kasvo_get_debt` | Debts and receivables: outstanding, next/overdue instalments, full schedule and payments |

**write**
| Tool | Purpose |
|---|---|
| `kasvo_record_transaction` | One income/expense; accepts natural amounts (`"25rb"`, `"1,5jt"`) |
| `kasvo_record_transactions` | Up to 200 at once (e.g. from a receipt or chat log) |
| `kasvo_record_transfer` | Between two accounts, optional fee |
| `kasvo_edit_transaction` | Change fields of one transaction |
| `kasvo_categorize` | Set category for a list of transaction ids |
| `kasvo_create_category` / `kasvo_create_account` | Setup |
| `kasvo_set_budget` | Budgets for one or more categories in a month (0 removes) |
| `kasvo_copy_budgets` | Copy last month's budgets, keeping any already set |
| `kasvo_create_rule` | New categorization rule, with a dry-run count of matches |
| `kasvo_stage_import` | Stage rows (from a supported file, or rows the agent parsed itself) |
| `kasvo_commit_import` | Commit a staged batch, skipping duplicates; per-row category/skip changes |
| `kasvo_discard_import`, `kasvo_apply_rules` | Drop an uncommitted batch; run rules over uncategorized rows |
| `kasvo_restore_transactions` | Undo a delete within 30 days |
| `kasvo_create_goal`, `kasvo_update_goal`, `kasvo_contribute_goal` | Savings goals (linked account or manual contributions) |
| `kasvo_create_debt`, `kasvo_pay_debt` | Debts/receivables; a payment books a transaction, a transfer to a linked loan account, or links an existing (imported) transaction |

**destructive** (two-step)
| Tool | Purpose |
|---|---|
| `kasvo_delete_transactions`, `kasvo_revert_import`, `kasvo_remove_debt_payment` | Return a `PendingAction` id and a human-readable summary; nothing changes yet |
| `kasvo_confirm` | Executes a pending action by id |

Conventions:
- Inputs validated with zod; errors return `{ code, message, hint }` the agent can act on.
- Amounts in output are both raw (`amount`) and formatted (`"Rp1.250.000"`).
- Every write returns the created/changed ids so the agent can follow up or undo.
- MCP **prompts**: `monthly_review`, `categorize_uncategorized` (M2), `budget_plan` (M4), `debt_plan` (M5: avalanche vs snowball).
- Accounts and categories may be passed by id or name; ambiguous names return `NOT_FOUND` with a hint.
- A token's scopes decide which tools are even listed. `destructive` implies `write`, which implies `read`.
- MCP **resources**: `kasvo://accounts`, `kasvo://categories` for cheap context.

Transports:
- **stdio**: `pnpm --silent --dir <repo> mcp`, authenticates with `KASVO_TOKEN`.
- **HTTP**: `POST /api/mcp`, `Authorization: Bearer kv_…`. OAuth 2.1 is a later phase.

## 5. Import

Pipeline: upload → detect format → parse → normalize → fingerprint → mark duplicates →
apply rules → **staged preview** → user or agent commits.

| Format | v1 |
|---|---|
| Generic CSV with column mapping (saved per account) | yes |
| BCA (KlikBCA / myBCA CSV) | yes |
| Mandiri (Livin' CSV) | yes |
| BRI, BNI | yes, CSV |
| Bank PDF statements | phase 3 (text-based PDFs only) |
| E-wallet exports (GoPay, OVO, DANA) | phase 3 |
| OFX/QFX | phase 3 |

There is one CSV engine, not one parser per bank: it finds the header row by column-name aliases
(tanggal/date, keterangan/uraian/description, debit/debet, kredit/credit, jumlah/nominal, D/K),
reads both `1.000.000,00` and `1,000,000.00`, `DB`/`CR` suffixes, and dates with or without a
year (KlikBCA takes the year from its `Periode` line). The bank name is only a label guessed from
the header shape. Unrecognised files go to `NEEDS_MAPPING` and the user maps columns by hand;
agents can instead stage rows they extracted themselves (e.g. from a PDF). Fixtures are synthetic.
Real statements are never committed; fixtures are synthetic.

## 5b. Goals and debts (M5a)

- A **goal** follows a linked account's balance, or the sum of manual contributions (negative = withdrawal). Kasvo shows what is needed per month to hit the target date and, from the last 90 days, the projected date. States: achieved, on track, behind, overdue, open (goals younger than 30 days are not judged).
- A **debt** is BORROWED (the user owes) or LENT (owed to the user). Its schedule is never stored: `instalmentCount` monthly payments of `instalmentAmount` from `firstDueOn`, keeping the day of month (clamped in short months). A one-off debt has a count of 1.
- **Payments** are applied to instalments oldest first. A payment can book an expense/income, a transfer to a linked LOAN/CREDIT_CARD account (so it is not counted as spending twice), or link a transaction that already exists, e.g. an imported bank row. A payment whose linked transaction is deleted stops counting.

## 6. UI (v1 screens)

Dashboard · Transactions (filter, inline edit, bulk categorize) · Accounts · Budgets ·
Import (upload, preview, commit) · Rules · Reports (cashflow, breakdown) ·
Settings (profile, language, API tokens with scopes, audit log viewer).

Agent activity is visible: rows created by an agent show the client name, and the
audit log can be filtered by actor.

## 7. Security

- scrypt passwords (parameters stored in the digest); session cookie `HttpOnly`, `Secure` in production, `SameSite=Lax`.
- API tokens shown once, stored as sha256; revocable; optional expiry.
- Destructive operations require `destructive` scope **and** confirmation.
- Rate limit on login and `/api/mcp`.
- No telemetry. Secrets only from env, validated at startup.

## 8. Milestones

| # | Scope | Done when |
|---|---|---|
| M0 | Scaffold: Next.js, Prisma, Docker Compose, i18n, lint, Vitest, CI | `docker compose up` shows a login page |
| M1 | Auth, accounts, categories (seeded Indonesian defaults), transactions, transfers | Manual CRUD works end-to-end with tests |
| M2 | MCP server (read + write + destructive), tokens, audit log | Claude Code can record and analyze via stdio and HTTP |
| M3 | Import: generic CSV + BCA/Mandiri/BRI/BNI, rules, dedup | A real statement imports with no duplicates on re-import |
| M4 | Budgets, reports, dashboard | Monthly review prompt produces a useful answer |
| M5a | Savings goals, debts/receivables with instalment schedules | Done: schedule derived from terms, payments link to the ledger |
| M5b | PDF (text-based, password supported) + e-wallet import | Real anonymised samples parse |
| M6 | Mobile app (Expo) on the same API | — |
