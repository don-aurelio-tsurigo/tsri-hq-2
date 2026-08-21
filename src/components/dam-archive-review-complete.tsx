"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DamConfirmDialog } from "@/components/dam-confirm-dialog";
import { completeDamArchiveReview } from "@/lib/actions/dam";

export function DamArchiveReviewComplete({
  openedAtIso,
  remainingCount,
}: {
  openedAtIso: string;
  remainingCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (remainingCount === 0) return null;

  return (
    <>
      <p className="pt-2 text-right text-xs text-[var(--muted)]">
        <button
          type="button"
          className="hover:text-[var(--fg)] hover:underline"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          Review abschliessen
        </button>
      </p>
      {error ? (
        <p className="text-right text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <DamConfirmDialog
          title="Review abschliessen?"
          body={`${remainingCount} ${
            remainingCount === 1 ? "Foto bleibt" : "Fotos bleiben"
          } im Archiv und gelten als gesichtet. Neu publizierte Fotos kommen in den nächsten Review.`}
          confirmLabel="Abschliessen"
          pending={pending}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            startTransition(async () => {
              const result = await completeDamArchiveReview(openedAtIso);
              if (result.error) {
                setError(result.error);
                setOpen(false);
                return;
              }
              setOpen(false);
              router.push("/dam/archive");
              router.refresh();
            });
          }}
        />
      ) : null}
    </>
  );
}
