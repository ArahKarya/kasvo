"use client";

import { Plus } from "lucide-react";
import { OPEN_QUICK_ENTRY } from "./quick-entry-sheet";

/** Opens the quick-entry sheet; falls back to the Record page without JavaScript. */
export function QuickEntryButton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <a
      href="/record"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_QUICK_ENTRY));
      }}
      className={`inline-flex items-center gap-1.5 rounded-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-text hover:bg-accent-strong ${className}`}
    >
      <Plus size={16} aria-hidden="true" />
      {label}
    </a>
  );
}
