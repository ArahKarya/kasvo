# Kasvo

Open-source personal finance for Indonesia, with a first-party MCP server so your AI
agent can record, categorize, and analyze your money.

> Status: early development. See [docs/SPEC.md](docs/SPEC.md).

- Accounts for banks, e-wallets, cash, and credit cards (IDR first)
- Import statements from BCA, Mandiri, BRI, BNI and e-wallets (GoPay, OVO, DANA): CSV or PDF, including password-protected e-statements
- Budgets, reports, savings goals, and debts/instalments (cicilan) with due dates
- MCP tools for reading, writing, and safe two-step destructive actions
- Bilingual UI: Bahasa Indonesia and English
- Self-hosted with Docker

## License

[AGPL-3.0-only](LICENSE). Kasvo is an independent clean-room implementation; see
[docs/CLEANROOM.md](docs/CLEANROOM.md).

## Run locally

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5433
pnpm prisma migrate deploy
pnpm dev                                         # http://localhost:3100
```

## Connect an AI agent (MCP)

Create a token in **Settings → API tokens**, then:

```bash
# Claude Code, stdio
claude mcp add kasvo --env KASVO_TOKEN=kv_... -- pnpm --silent --dir /path/to/kasvo mcp

# Any MCP client over HTTP
claude mcp add --transport http kasvo http://localhost:3100/api/mcp --header "Authorization: Bearer kv_..."
```

Read tools answer questions, write tools record and edit, and destructive tools only
prepare a change: the agent must show you a summary and call `kasvo_confirm` after you
agree. Every change appears in **Settings → Activity log**.
