import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Bot, User } from "lucide-react";
import { revokeTokenAction } from "@/app/actions/settings";
import { TokenForm } from "@/components/token-form";
import { buttonClass, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { listTokens } from "@/server/domain/tokens";
import { getDictionary } from "@/i18n/server";
import { fmt, intlLocale } from "@/i18n/dictionaries";

export const metadata: Metadata = { title: "Settings" };

/** A short, human line for an audit entry, from whatever the row recorded. */
function describe(after: unknown, before: unknown): string {
  const pick = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const row = pick(after) ?? pick(before);
  if (Array.isArray(before)) return `${before.length} item(s)`;
  return String(row?.description ?? row?.name ?? "");
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const { t, locale } = await getDictionary();
  const actor = (await searchParams).actor;
  const actorKind = actor === "agent" ? "AGENT" : actor === "you" ? "USER" : undefined;
  const [tokens, audit, h] = await Promise.all([
    listTokens(user.id),
    db.auditLog.findMany({ where: { userId: user.id, ...(actorKind ? { actorKind } : {}) }, orderBy: { at: "desc" }, take: 50 }),
    headers(),
  ]);
  const when = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" });
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3100"}`;
  const s = t.settings;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageTitle>{s.title}</PageTitle>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">{s.tokens}</h2>
          <p className="text-sm text-muted">{s.tokensIntro}</p>
        </div>
        <TokenForm t={s} />
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">{s.noTokens}</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {tokens.map((tk) => {
              const inactive = !tk.active;
              return (
                <li key={tk.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${inactive ? "text-muted line-through" : ""}`}>
                      {tk.name} <code className="ml-1 font-mono text-xs text-muted">{tk.prefix}…</code>
                    </p>
                    <p className="text-xs text-muted">
                      {[
                        tk.scopes.join(" + "),
                        tk.lastUsedAt ? fmt(s.lastUsed, { when: when.format(tk.lastUsedAt) }) : s.neverUsed,
                        tk.expiresAt ? fmt(s.expires, { when: when.format(tk.expiresAt) }) : null,
                        tk.revokedAt ? s.revoked : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!inactive && (
                    <form action={revokeTokenAction}>
                      <input type="hidden" name="id" value={tk.id} />
                      <button className={buttonClass.danger}>{s.revoke}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">{s.connect}</h2>
          <p className="text-sm text-muted">{s.connectIntro}</p>
        </div>
        <p className="text-sm font-medium">{s.connectStdio}</p>
        <pre className="overflow-x-auto rounded-sm bg-bg p-3 font-mono text-xs">
          {`claude mcp add kasvo --env KASVO_TOKEN=TOKEN -- pnpm --silent --dir ${process.cwd()} mcp`}
        </pre>
        <p className="text-sm font-medium">{s.connectHttp}</p>
        <pre className="overflow-x-auto rounded-sm bg-bg p-3 font-mono text-xs">
          {`claude mcp add --transport http kasvo ${origin}/api/mcp --header "Authorization: Bearer TOKEN"`}
        </pre>
      </Card>

      <Card className="space-y-3 p-0">
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
          <div>
            <h2 className="font-semibold">{s.audit}</h2>
            <p className="text-sm text-muted">{s.auditIntro}</p>
          </div>
          <nav className="flex gap-1 text-sm">
            {(
              [
                [undefined, s.auditAll],
                ["agent", s.auditAgent],
                ["you", s.auditYou],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={label}
                href={value ? `/settings?actor=${value}` : "/settings"}
                aria-current={actor === value ? "page" : undefined}
                className="rounded-sm px-2 py-1 text-muted hover:text-text aria-[current=page]:bg-accent/10 aria-[current=page]:text-accent"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {audit.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">{s.auditEmpty}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {audit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm sm:items-center">
                <span className="mt-0.5 shrink-0 sm:mt-0">{a.actorKind === "AGENT" ? <Bot size={14} className="text-accent" aria-label="agent" /> : <User size={14} className="text-muted" aria-label="user" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <code className="shrink-0 font-mono text-xs">{a.action}</code>
                    <span className="min-w-0 truncate text-muted">{describe(a.after, a.before)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted sm:hidden">
                    {a.clientName ?? s.auditYou} · {when.format(a.at)}
                  </span>
                </span>
                <span className="hidden text-xs text-muted sm:inline">{a.clientName ?? s.auditYou}</span>
                <time className="hidden whitespace-nowrap text-xs text-muted sm:inline">{when.format(a.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
