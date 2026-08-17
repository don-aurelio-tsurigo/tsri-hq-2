"use client";

export function DamConfirmDialog({
  title,
  body,
  confirmLabel,
  pending = false,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-confirm-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="dam-confirm-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className={danger ? "btn btn-primary bg-[var(--danger)] border-[var(--danger)]" : "btn btn-primary"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Bitte warten…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
