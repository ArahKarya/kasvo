/**
 * Wordmark: the K symbol from the app icon (green square, white K, amber dot), then the name.
 * `inverted` swaps to a white square with a green K for green backgrounds.
 */
export function Logo({ className = "", mark = 24, inverted = false }: { className?: string; mark?: number; inverted?: boolean }) {
  const tile = inverted ? "#ffffff" : "#196c4e";
  const letter = inverted ? "#196c4e" : "#ffffff";
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" width={mark} height={mark} aria-hidden="true">
        <rect width="24" height="24" rx="5.5" fill={tile} />
        <rect x="6" y="4.8" width="3.3" height="14.4" rx="0.9" fill={letter} />
        <path d="M9.3 10.9 14.7 4.8h3.6l-6.4 7.2 6.4 7.2h-3.6l-5.4-6.1z" fill={letter} />
        <circle cx="17.6" cy="12" r="1.9" fill="#f4ae2a" />
      </svg>
      Kasvo
    </span>
  );
}
