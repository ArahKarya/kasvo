"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, X } from "lucide-react";
import { removeAttachmentAction, uploadAttachmentAction } from "@/app/actions/attachments";
import type { Dictionary } from "@/i18n/dictionaries";
import { compressForUpload } from "@/lib/compress-image";

export interface AttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface AttachmentPanelProps {
  transactionId: string;
  items: AttachmentItem[];
  labels: Dictionary["attach"];
  /** Most a transaction can hold. */
  max: number;
}

const kb = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Thumbnails of a transaction's receipts and proofs, each opening the file; on phones the
 * "Attach" picker offers the camera too. Photos are shrunk before upload, one file per request.
 */
export function AttachmentPanel({ transactionId, items, labels, max }: AttachmentPanelProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, startRemoving] = useTransition();
  const left = max - items.length;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const chosen = [...files].slice(0, left);
    const failed: string[] = [];
    setErrors([]);
    for (const [i, file] of chosen.entries()) {
      setProgress({ done: i, total: chosen.length });
      const form = new FormData();
      form.set("file", await compressForUpload(file));
      const result = await uploadAttachmentAction(transactionId, form);
      if (!result.ok) failed.push(labels.failed.replace("{name}", file.name).replace("{error}", result.error ?? ""));
    }
    setProgress(null);
    setErrors(failed);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Paperclip size={16} aria-hidden="true" />
          {labels.title}
          {items.length > 0 && <span className="text-sm font-normal text-muted">({items.length})</span>}
        </h2>
        {left > 0 && (
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-sm hover:bg-surface-2 ${progress ? "pointer-events-none opacity-60" : ""}`}>
            <Paperclip size={14} aria-hidden="true" />
            {labels.add}
            <input ref={input} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
          </label>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{labels.empty}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((a) => (
            <li key={a.id} className="group relative">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-border bg-surface-2" title={`${labels.open}: ${a.fileName}`}>
                {a.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, authenticated file; next/image cannot proxy it
                  <img src={`/api/attachments/${a.id}`} alt={a.fileName} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted">
                    <FileText size={28} aria-hidden="true" />
                    <span className="line-clamp-2 text-[11px] break-all">{a.fileName}</span>
                  </span>
                )}
              </a>
              <p className="mt-1 truncate text-[11px] text-muted">{kb(a.size)}</p>
              <form
                action={(form) => startRemoving(() => removeAttachmentAction(form).then(() => router.refresh()))}
                className="absolute top-1 right-1"
              >
                <input type="hidden" name="id" value={a.id} />
                <button disabled={removing} aria-label={`${labels.remove} ${a.fileName}`} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/75 disabled:opacity-50">
                  <X size={14} aria-hidden="true" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted">{progress ? labels.uploading.replace("{done}", String(progress.done + 1)).replace("{total}", String(progress.total)) : labels.addHint}</p>
      {errors.map((e) => (
        <p key={e} role="alert" className="mt-1 text-sm text-danger">
          {e}
        </p>
      ))}
    </section>
  );
}
