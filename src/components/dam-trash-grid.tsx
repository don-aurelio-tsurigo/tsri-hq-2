"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DamConfirmDialog } from "@/components/dam-confirm-dialog";
import { purgeAsset, restoreAssetsFromTrash } from "@/lib/actions/dam";
import { trashDaysRemaining } from "@/lib/dam/trash-policy";

export type TrashAssetCard = {
  id: string;
  fileName: string;
  credit: string;
  altText: string | null;
  deletedAt: string | null;
  width: number | null;
  height: number | null;
};

function remainingLabel(deletedAt: string | null): string {
  if (!deletedAt) return "Frist unbekannt";
  const days = trashDaysRemaining(new Date(deletedAt));
  if (days <= 0) return "Wird demnächst endgültig gelöscht";
  if (days === 1) return "Noch 1 Tag";
  return `Noch ${days} Tage`;
}

export function DamTrashGrid({ assets }: { assets: TrashAssetCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  function runRestore() {
    if (!restoreId) return;
    const id = restoreId;
    startTransition(async () => {
      const result = await restoreAssetsFromTrash([id]);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRestoreId(null);
      router.refresh();
    });
  }

  function runPurge() {
    if (!purgeId) return;
    const id = purgeId;
    startTransition(async () => {
      const result = await purgeAsset(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPurgeId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {assets.map((asset) => (
          <li key={asset.id}>
            <article className="card overflow-hidden">
              <div className="flex aspect-[4/3] items-center justify-center bg-[var(--panel-muted)] p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/dam/assets/${asset.id}/file?variant=thumb`}
                  alt={asset.altText || asset.fileName}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="space-y-2 p-2">
                <p className="truncate text-sm font-semibold">{asset.fileName}</p>
                <p className="truncate text-xs text-[var(--muted)]">{asset.credit}</p>
                <p className="text-xs font-semibold text-[var(--accent)]">
                  {remainingLabel(asset.deletedAt)}
                </p>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="btn btn-primary px-3 py-1.5 text-sm"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setRestoreId(asset.id);
                    }}
                  >
                    Wiederherstellen
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-sm"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setPurgeId(asset.id);
                    }}
                  >
                    Endgültig löschen
                  </button>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>

      {restoreId ? (
        <DamConfirmDialog
          title="Wiederherstellen?"
          body="Das Bild erscheint wieder im Archiv und ist durchsuchbar."
          confirmLabel="Wiederherstellen"
          pending={pending}
          onClose={() => setRestoreId(null)}
          onConfirm={runRestore}
        />
      ) : null}

      {purgeId ? (
        <DamConfirmDialog
          title="Endgültig löschen?"
          body="Das Bild und die Dateien werden sofort entfernt. Das lässt sich nicht rückgängig machen."
          confirmLabel="Endgültig löschen"
          danger
          pending={pending}
          onClose={() => setPurgeId(null)}
          onConfirm={runPurge}
        />
      ) : null}
    </div>
  );
}
