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
| i18n | next-intl, `id` (default) and `en` |
| Auth | Email + password (argon2id), HTTP-only session cookie |
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
| `Budget` | categoryId, month (`YYYY-MM`), amount; optional rollover flag |
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
| `kasvo_overview` | Net worth, balances per account, this month's income/expense, budget health |
| `kasvo_list_accounts` | Accounts with current balance |
| `kasvo_list_categories` | Category tree |
| `kasvo_find_transactions` | Filter by date range, account, category, amount, text; paginated |
| `kasvo_spending_breakdown` | Totals by category / payee / account for a period |
| `kasvo_compare_periods` | Period A vs B per category, with biggest movers |
| `kasvo_cashflow` | Income, expense, net per day/week/month |
| `kasvo_budget_status` | Budget vs actual for a month, projected end-of-month |
| `kasvo_find_anomalies` | Unusually large transactions, new payees, duplicate charges |
| `kasvo_list_rules` | Categorization rules |

**write**
| Tool | Purpose |
|---|---|
| `kasvo_record_transaction` | One income/expense; accepts natural amounts (`"25rb"`, `"1,5jt"`) |
| `kasvo_record_transactions` | Up to 200 at once (e.g. from a receipt or chat log) |
| `kasvo_record_transfer` | Between two accounts, optional fee |
| `kasvo_edit_transaction` | Change fields of one transaction |
| `kasvo_categorize` | Set category for a list of transaction ids |
| `kasvo_create_category` / `kasvo_create_account` | Setup |
| `kasvo_set_budget` | Budget for a category and month |
| `kasvo_create_rule` | New categorization rule, with a dry-run count of matches |
| `kasvo_stage_import` | Stage rows (from a supported file, or rows the agent parsed itself) |
| `kasvo_commit_import` | Commit a staged batch, skipping duplicates |

**destructive** (two-step)
| Tool | Purpose |
|---|---|
| `kasvo_delete_transactions`, `kasvo_revert_import`, `kasvo_bulk_edit` | Return a `PendingAction` id and a human-readable summary; nothing changes yet |
| `kasvo_confirm` | Executes a pending action by id |

Conventions:
- Inputs validated with zod; errors return `{ code, message, hint }` the agent can act on.
- Amounts in output are both raw (`amount`) and formatted (`"Rp1.250.000"`).
- Every write returns the created/changed ids so the agent can follow up or undo.
- MCP **prompts**: `monthly_review`, `categorize_uncategorized`, `budget_plan`.
- MCP **resources**: `kasvo://accounts`, `kasvo://categories` for cheap context.

Transports:
- **stdio**: `pnpm mcp` / `npx kasvo-mcp`, authenticates with `KASVO_TOKEN`.
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

Parsers are pure functions `(file: Buffer) => ParsedRow[]` with fixture-based tests.
Real statements are never committed; fixtures are synthetic.

## 6. UI (v1 screens)

Dashboard · Transactions (filter, inline edit, bulk categorize) · Accounts · Budgets ·
Import (upload, preview, commit) · Rules · Reports (cashflow, breakdown) ·
Settings (profile, language, API tokens with scopes, audit log viewer).

Agent activity is visible: rows created by an agent show the client name, and the
audit log can be filtered by actor.

## 7. Security

- Argon2id passwords; session cookie `HttpOnly`, `Secure` in production, `SameSite=Lax`.
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
| M5 | Goals, debts/instalments, PDF + e-wallet import | — |
| M6 | Mobile app (Expo) on the same API | — |
