<div align="center">

<img src="docs/brand/kasvo-icon-1024.png" alt="Kasvo" width="96" />

# Kasvo — Personal Finance for Indonesia

**Your money, your server, your AI agent.**

[![Release](https://img.shields.io/github/v/release/ArahKarya/kasvo?style=flat-square&color=16C79A&label=Release)](https://github.com/ArahKarya/kasvo/releases)
[![Deploy](https://img.shields.io/badge/Deploy-Self--hosted%20Docker-16C79A?style=flat-square&logo=docker&logoColor=white)](#-quickstart)
[![Stack](https://img.shields.io/badge/Stack-Next.js%2016%20%2B%20Prisma%207-0F3460?style=flat-square&logo=nextdotjs&logoColor=white)](#-stack)
[![License](https://img.shields.io/badge/License-AGPL--3.0-0F3460?style=flat-square)](LICENSE)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%2017-FF6F61?style=flat-square&logo=postgresql&logoColor=white)](#-architecture)
[![MCP](https://img.shields.io/badge/Agent-MCP%20server%20%2845%20tools%29-7B2FBF?style=flat-square)](#-connect-an-ai-agent-mcp)

</div>

> Product of **Arah Karya Sinergi (AKS)**. Independent clean-room implementation, see [docs/CLEANROOM.md](docs/CLEANROOM.md).

Kasvo records money across **bank accounts, e-wallets, cash, and credit cards** in IDR, imports Indonesian bank **statements** (CSV or PDF), and tracks **budgets, goals, debts, and assets** in one net-worth number. A first-party **MCP server** lets an AI agent record, categorize, and analyze your money through the same domain layer the UI uses, so human and agent follow the same rules and leave the same **audit trail**.

## ✨ Why Kasvo

| Problem | Solution |
|---|---|
| Finance apps keep your data on their servers | **Self-hosted** with one `docker compose up`; your Postgres, your backups |
| Bank statements arrive as PDF, never as clean data | **Importer** for BCA, Mandiri, BRI, BNI, GoPay, OVO, DANA, including password-protected e-statements, with dedup and auto-categorization |
| Cicilan, kasbon, and credit-card balances are scattered | **Debts** with instalment schedules and due dates, in both directions (you owe / owed to you) |
| Net worth ignores what you own | **Assets** (property, vehicles, gold, stocks, funds, crypto, deposits, pension funds) with acquisition vs market value and value history |
| Letting an AI touch your money is risky | **Scoped API tokens**, two-step confirmation for destructive actions, and an activity log for every change |
| Money apps default to English | **Bahasa Indonesia** by default, English available, IDR stored as integers (no floats) |

## 🧭 Features

- **Accounts**: bank, e-wallet, cash, credit card, loan, with a history per account
- **Transactions**: income, expenses, transfers with a fee, categories tagged need or want, rules for auto-categorization
- **Budgets and reports**: monthly budgets, 50/30/20 split, period comparison, cashflow, anomaly flags, net-worth trend
- **Goals**: savings goals with the monthly amount needed to hit the date
- **Debts**: instalment schedules, partial payments, due dates on the dashboard
- **Assets**: acquisition vs market value, depreciation or gain, value history
- **Import**: stage, review, commit, or revert a statement import
- **Android app** (Capacitor) that opens your own server, as a signed APK
- Dark and light theme, hide-amounts toggle, mobile bottom tabs with quick "Record"

## 🏛️ Architecture

```
            ┌──────────── Next.js app ─────────────┐
 Browser ──▶│ UI (RSC + server actions)            │
 Android ──▶│ /api/mcp  (Streamable HTTP, bearer)  │──┐
            └──────────────────────────────────────┘  │
 MCP stdio ──▶ mcp/stdio.mts (KASVO_TOKEN) ────────────┤
                                                       ▼
                         src/server/domain/*  (services, zod-validated)
                                     │  every write → AuditLog
                                     ▼
                              Prisma 7 → PostgreSQL 17
```

- **The domain layer is the only path to the database.** UI actions, the HTTP MCP endpoint, and the stdio binary call the same service functions with an `Actor` (user or agent, plus scopes).
- **Money is `BigInt` rupiah.** No floats. Dates are booking dates in the user's timezone (default `Asia/Jakarta`).

## 🔁 Pipeline: statement to ledger

```
 PDF / CSV ──▶ parse (bank profile) ──▶ stage_import ──▶ review ──▶ commit_import
 e-statement     dedup by fingerprint     suggested        you or      writes to the
 (password OK)   + auto-categorize        categories       the agent   ledger (revertable)
```

## 🤖 Connect an AI agent (MCP)

Create a token in **Settings → API tokens**, then:

```bash
# Claude Code, stdio
claude mcp add kasvo --env KASVO_TOKEN=kv_... -- pnpm --silent --dir /path/to/kasvo mcp

# Any MCP client over HTTP
claude mcp add --transport http kasvo http://localhost:3100/api/mcp --header "Authorization: Bearer kv_..."
```

**45 tools** in four groups:

| Group | Examples |
|---|---|
| Read | `overview`, `net_worth`, `find_transactions`, `spending_breakdown`, `compare_periods`, `cashflow`, `find_anomalies`, `budget_status` |
| Write | `record_transaction`, `record_transfer`, `edit_transaction`, `categorize`, `create_account`, `set_budget`, `create_goal`, `create_debt`, `pay_debt`, `create_asset`, `value_asset` |
| Import | `stage_import`, `get_import`, `commit_import`, `discard_import`, `apply_rules` |
| Destructive | `delete_transactions`, `revert_import`, `remove_debt_payment`: they only **prepare** the change; the agent shows you a summary and calls `confirm` after you agree |

Every change appears in **Settings → Activity log**.

## 📁 Repo Structure

```
kasvo/
├── src/
│   ├── app/            # routes: dashboard, transactions, accounts, budgets, goals, debts, assets, reports, import, settings
│   ├── components/     # UI blocks and dashboard cards
│   ├── mcp/            # MCP server and tools (read, write, imports, plans, assets, insights, destructive)
│   ├── server/domain/  # services, budget/debt/goal math, importers (csv, pdf-statement)
│   └── i18n/           # typed dictionaries: id (default), en
├── prisma/             # schema and migrations
├── mobile/             # Capacitor shell for Android (and iOS)
├── tests/              # unit and integration tests (real Postgres)
├── docs/               # SPEC.md, CLEANROOM.md, brand/
├── Dockerfile
└── docker-compose.prod.yml
```

## 🚀 Quickstart

**Self-host**

```bash
git clone https://github.com/ArahKarya/kasvo.git && cd kasvo
echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env       # optional: APP_PORT, APP_TIMEZONE, REGISTRATION
docker compose -f docker-compose.prod.yml up -d --build
# open http://127.0.0.1:3000 and register the first user
```

After you create your account, set `REGISTRATION=closed` in `.env` and run `docker compose -f docker-compose.prod.yml up -d` again.
Put Kasvo behind HTTPS (reverse proxy or Cloudflare Tunnel). Over plain `http`, also set `COOKIE_SECURE=false`.

**Develop locally**

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5433
pnpm prisma migrate deploy
pnpm dev                                         # http://localhost:3100
```

**Android**: download the signed APK from [Releases](https://github.com/ArahKarya/kasvo/releases), install it, and enter your server address. The app needs a connection to your server (no offline mode). See [mobile/README.md](mobile/README.md) for the emulator, LAN, and iOS.

**Back up**: all your data is one Postgres database, so a nightly `pg_dump` is enough.

## ✅ Status

- [x] Accounts, transactions, transfers with a fee, categories, rules
- [x] Statement import: CSV and PDF, dedup, review, revert
- [x] Budgets, 50/30/20, reports, cashflow, anomalies
- [x] Goals, debts and instalments in both directions
- [x] Assets: acquisition vs market value, value history, pension funds
- [x] MCP server over stdio and HTTP, 45 tools, two-step destructive actions, audit log
- [x] Bilingual UI (id, en), dark and light theme
- [x] Docker self-host and signed Android APK
- [ ] iOS build

## 🧱 Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Prisma 7 · PostgreSQL 17 · zod v4 · `@modelcontextprotocol/sdk` · Capacitor 8 · Vitest · Docker

## 📄 License

[AGPL-3.0-only](LICENSE). If you run a modified Kasvo as a network service, you must offer its source to your users.

<div align="center">

<sub>© 2026 Arah Karya Sinergi (AKS)</sub>

</div>
