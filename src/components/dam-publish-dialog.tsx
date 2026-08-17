"use client";

import { useMemo, useState } from "react";
import { DamCombobox } from "@/components/dam-combobox";
import type { PersonalAssetCard } from "@/lib/dam/types";

type CollectionOption = { id: string; name: string };

export function DamPublishDialog({
  assets,
  allCollections,
  pending,
  onClose,
  onConfirm,
  onCreateCollection,
}: {
  assets: PersonalAssetCard[];
  allCollections: CollectionOption[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (
    items: { assetId: string; altText: string; collectionIds: string[] }[],
  ) => void;
  onCreateCollection?: (
    name: string,
  ) => Promise<{ value: string; label: string } | null>;
}) {
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(assets.map((asset) => [asset.id, asset.altText?.trim() ?? ""])),
  );
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, string[]>>(
    () =>
      Object.fromEntries(
        assets.map((asset) => [asset.id, asset.collections.map((c) => c.id)]),
      ),
  );
  const [submitted, setSubmitted] = useState(false);

  const collectionOptions = useMemo(
    () => allCollections.map((collection) => ({ value: collection.id, label: collection.name })),
    [allCollections],
  );

  const missingAlt = useMemo(
    () => assets.filter((asset) => !altDrafts[asset.id]?.trim()).map((asset) => asset.id),
    [assets, altDrafts],
  );
  const missingCollection = useMemo(
    () =>
      assets
        .filter((asset) => (collectionDrafts[asset.id] ?? []).length === 0)
        .map((asset) => asset.id),
    [assets, collectionDrafts],
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-publish-title"
    >
      <div className="card my-auto w-full max-w-2xl overflow-visible p-5">
        <h2
          id="dam-publish-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          Ins Archiv verschieben
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Alt-Text und Collection sind Pflicht. Bitte prüfen oder korrigieren.
        </p>

        <ul className="mt-4 space-y-5">
          {assets.map((asset) => {
            const emptyAlt = submitted && !altDrafts[asset.id]?.trim();
            const emptyCollection =
              submitted && (collectionDrafts[asset.id] ?? []).length === 0;
            return (
              <li
                key={asset.id}
                className="relative z-0 grid gap-3 focus-within:z-20 sm:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[var(--panel-muted)] p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/dam/assets/${asset.id}/file?variant=thumb`}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0 space-y-3">
                  <p className="truncate text-sm font-semibold">{asset.fileName}</p>
                  <div className="field">
                    <label htmlFor={`alt-${asset.id}`}>
                      Alt-Text
                      <span className="text-[var(--danger)]"> *</span>
                    </label>
                    <textarea
                      id={`alt-${asset.id}`}
                      rows={3}
                      value={altDrafts[asset.id] ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        setAltDrafts((prev) => ({ ...prev, [asset.id]: e.target.value }))
                      }
                      aria-invalid={emptyAlt}
                      placeholder="Beschreibe das Motiv für Screenreader und Suche"
                    />
                    {emptyAlt ? (
                      <p className="text-xs text-[var(--danger)]">
                        Alt-Text darf nicht leer sein.
                      </p>
                    ) : null}
                  </div>
                  <DamCombobox
                    id={`publish-collection-${asset.id}`}
                    label="Collection *"
                    emptyLabel="Collection zuweisen…"
                    placeholder="Collection suchen…"
                    options={collectionOptions}
                    value={collectionDrafts[asset.id] ?? []}
                    multiple
                    onCreate={onCreateCollection}
                    onChange={(ids) =>
                      setCollectionDrafts((prev) => ({ ...prev, [asset.id]: ids }))
                    }
                  />
                  {emptyCollection ? (
                    <p className="text-xs text-[var(--danger)]">
                      Mindestens eine Collection zuweisen.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-highlight"
            disabled={pending}
            onClick={() => {
              setSubmitted(true);
              if (missingAlt.length > 0 || missingCollection.length > 0) return;
              onConfirm(
                assets.map((asset) => ({
                  assetId: asset.id,
                  altText: altDrafts[asset.id].trim(),
                  collectionIds: collectionDrafts[asset.id] ?? [],
                })),
              );
            }}
          >
            {pending ? "Verschiebt…" : `${assets.length} ins Archiv`}
          </button>
        </div>
      </div>
    </div>
  );
}
