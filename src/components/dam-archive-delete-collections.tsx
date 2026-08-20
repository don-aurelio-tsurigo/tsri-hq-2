"use client";

import { useState, useTransition } from "react";
import { DamCombobox, type DamComboboxOption } from "@/components/dam-combobox";
import { deleteDamCollections } from "@/lib/actions/dam";

async function fetchCollectionOptions(q: string): Promise<DamComboboxOption[]> {
  const params = new URLSearchParams({ type: "collections", q });
  const res = await fetch(`/api/dam/archive/facets?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { options?: DamComboboxOption[] };
  return data.options ?? [];
}

export function DamArchiveDeleteCollectionsDialog({
  options,
  remote,
  pending = false,
  onClose,
  onDeleted,
}: {
  options: DamComboboxOption[];
  remote: boolean;
  pending?: boolean;
  onClose: () => void;
  onDeleted: (result: { names: string[]; ids: string[] }) => void;
}) {
  const [saving, startTransition] = useTransition();
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || saving;

  function submit() {
    if (ids.length === 0 || busy) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDamCollections(ids);
      if (result.error || !result.names?.length) {
        setError(result.error ?? "Collections konnten nicht gelöscht werden.");
        return;
      }
      onDeleted({ names: result.names, ids: result.ids ?? ids });
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-delete-collections-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="dam-delete-collections-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          Collections löschen
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Die Bilder bleiben im Archiv. Nur die Collection und ihre Zuordnung
          werden entfernt — unabhängig davon, wie viele Bilder drin sind.
        </p>

        <div className="mt-4">
          <DamCombobox
            id="delete-collections"
            label="Collections"
            emptyLabel="Collections wählen…"
            placeholder="Collection suchen…"
            options={options}
            value={ids}
            multiple
            remote={remote}
            onSearch={remote ? fetchCollectionOptions : undefined}
            onChange={setIds}
          />
        </div>

        {error ? (
          <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary bg-[var(--danger)] border-[var(--danger)]"
            disabled={busy || ids.length === 0}
            onClick={submit}
          >
            {saving
              ? "Löscht…"
              : ids.length <= 1
                ? "Collection löschen"
                : `${ids.length} Collections löschen`}
          </button>
        </div>
      </div>
    </div>
  );
}
