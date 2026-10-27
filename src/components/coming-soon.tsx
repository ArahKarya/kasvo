import { getDictionary } from "@/i18n/server";
import { fmt, type Dictionary } from "@/i18n/dictionaries";

interface ComingSoonProps {
  title: (t: Dictionary) => string;
  milestone: string;
}

export async function ComingSoon({ title, milestone }: ComingSoonProps) {
  const { t } = await getDictionary();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{title(t)}</h1>
      <div className="rounded-sm border border-dashed border-border bg-surface p-6">
        <p className="font-semibold">{fmt(t.soon.title, { milestone })}</p>
        <p className="mt-1 text-sm text-muted">{t.soon.body}</p>
      </div>
    </div>
  );
}
