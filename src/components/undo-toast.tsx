"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { undoDeleteAction } from "@/app/actions/quick";

const SECONDS = 5;

interface UndoToastProps {
  ids: string[];
  labels: { deleted: string; undo: string };
  /** Where to go once the toast is done, without the ?deleted= parameter. */
  href: string;
}

/** "Transaction deleted · Undo" for five seconds, with a bar that runs down. */
export function UndoToast({ ids, labels, href }: UndoToastProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => router.replace(href, { scroll: false }), SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [router, href]);

  if (gone) return null;
  const undo = () =>
    start(async () => {
      await undoDeleteAction(ids);
      setGone(true);
      router.replace(href, { scroll: false });
    });

  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-[min(24rem,calc(100%-2rem))] overflow-hidden rounded-lg bg-text text-bg shadow-lg md:bottom-8">
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <Trash2 size={16} aria-hidden="true" />
        <span className="flex-1">{labels.deleted}</span>
        <button type="button" onClick={undo} disabled={pending} className="rounded-sm px-2 py-1 font-semibold text-gold hover:bg-white/10 disabled:opacity-60">
          {labels.undo}
        </button>
      </div>
      <div aria-hidden="true" className="h-1 origin-left animate-[shrink_5s_linear_forwards] bg-gold" />
    </div>
  );
}
