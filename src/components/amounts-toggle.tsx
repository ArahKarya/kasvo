"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { HIDE_AMOUNTS_COOKIE } from "./amounts-cookie";

const ATTRIBUTE = "data-hide-amounts";

/** Every toggle on the page follows the attribute on <html>, so they never disagree. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] });
  return () => observer.disconnect();
}

interface AmountsToggleProps {
  hidden: boolean;
  labels: { hide: string; show: string };
  className?: string;
}

/**
 * Blurs every number on screen (for using Kasvo in public). The choice lives in a cookie so
 * the next page renders already hidden, without a flash of real balances.
 */
export function AmountsToggle({ hidden: initial, labels, className = "" }: AmountsToggleProps) {
  const hidden = useSyncExternalStore(subscribe, () => document.documentElement.hasAttribute(ATTRIBUTE), () => initial);
  const toggle = () => {
    const next = !hidden;
    document.documentElement.toggleAttribute(ATTRIBUTE, next);
    document.cookie = `${HIDE_AMOUNTS_COOKIE}=${next ? "1" : ""}; path=/; max-age=${next ? 31536000 : 0}; samesite=lax`;
  };
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? labels.show : labels.hide} title={hidden ? labels.show : labels.hide} className={className}>
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
