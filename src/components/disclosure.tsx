"use client";

import { useState, type ReactNode } from "react";

interface DisclosureProps {
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A <details> whose open state belongs to the browser, not the server: re-rendering after a
 * save does not snap it shut.
 */
export function Disclosure({ summary, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">{summary}</summary>
      {children}
    </details>
  );
}
