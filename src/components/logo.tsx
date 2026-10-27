/** Wordmark: a ledger tick inside a square, then the name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="var(--accent)" />
        <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Kasvo
    </span>
  );
}
