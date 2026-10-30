"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Plus, X } from "lucide-react";
import { QuickEntry, type QuickAccount, type QuickCategory } from "./quick-entry";
import type { Dictionary } from "@/i18n/dictionaries";

/** Any button can open the sheet by dispatching this event (the phone's "Record" tab does). */
export const OPEN_QUICK_ENTRY = "kasvo:record";

interface QuickEntrySheetProps {
  accounts: QuickAccount[];
  categories: QuickCategory[];
  today: string;
  locale: string;
  currency: string;
  labels: Pick<Dictionary, "quick" | "tx" | "attach">;
}

/**
 * The quick-entry form in a <dialog>: a bottom sheet on phones, a centred panel on wider
 * screens. A floating "+" opens it on desktop; a short toast confirms each save.
 */
export function QuickEntrySheet({ labels, ...props }: QuickEntrySheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const show = () => {
      setSession((s) => s + 1);
      setOpen(true);
      dialog.current?.showModal();
    };
    window.addEventListener(OPEN_QUICK_ENTRY, show);
    return () => window.removeEventListener(OPEN_QUICK_ENTRY, show);
  }, []);

  const saved = (message: string) => {
    dialog.current?.close();
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_ENTRY))}
        aria-label={labels.quick.title}
        className="fixed right-6 bottom-6 z-30 hidden h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-text shadow-lg hover:bg-accent-strong md:flex"
      >
        <Plus size={26} aria-hidden="true" />
      </button>

      <dialog
        ref={dialog}
        aria-label={labels.quick.title}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="mx-auto mt-auto mb-0 max-h-[94dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/50 sm:my-auto sm:max-w-lg sm:rounded-2xl"
      >
        <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:pt-4">
          <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{labels.quick.title}</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label={labels.quick.close} className="rounded-sm p-1.5 text-muted hover:bg-surface-2 hover:text-text">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {open && <QuickEntry key={session} {...props} labels={labels} onSaved={saved} />}
        </div>
      </dialog>

      {toast && (
        <p role="status" className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit items-center gap-2 rounded-lg bg-text px-4 py-2.5 text-sm font-medium text-bg shadow-lg md:bottom-8">
          <CircleCheck size={16} aria-hidden="true" />
          {toast}
        </p>
      )}
    </>
  );
}
