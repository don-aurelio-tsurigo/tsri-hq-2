"use client";

import { useMemo, useState } from "react";
import type { PersonalAssetCard } from "@/lib/dam/types";

export function DamPublishDialog({
  assets,
  pending,
  onClose,
  onConfirm,
}: {
  assets: PersonalAssetCard[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (items: { assetId: string; altText: string }[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(assets.map((asset) => [asset.id, asset.altText?.trim() ?? ""])),
  );
  const [submitted, setSubmitted] = useState(false);

  const missing = useMemo(
    () => assets.filter((asset) => !drafts[asset.id]?.trim()).map((asset) => asset.id),
    [assets, drafts],
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-publish-title"
    >
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5">
        <h2
          id="dam-publish-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          Ins Archiv verschieben
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Alt-Text ist Pflicht. Bitte den Vorschlag prüfen oder korrigieren.
        </p>

        <ul className="mt-4 space-y-4">
          {assets.map((asset) => {
            const empty = submitted && !drafts[asset.id]?.trim();
            return (
              <li key={asset.id} className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[var(--panel-muted)] p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/dam/assets/${asset.id}/file?variant=thumb`}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="field">
                  <label htmlFor={`alt-${asset.id}`}>
                    {asset.fileName}
                    <span className="text-[var(--danger)]"> *</span>
                  </label>
                  <textarea
                    id={`alt-${asset.id}`}
                    rows={3}
                    value={drafts[asset.id] ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [asset.id]: e.target.value }))
                    }
                    aria-invalid={empty}
                    placeholder="Beschreibe das Motiv für Screenreader und Suche"
                  />
                  {empty ? (
                    <p className="text-xs text-[var(--danger)]">Alt-Text darf nicht leer sein.</p>
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
              if (missing.length > 0) return;
              onConfirm(
                assets.map((asset) => ({
                  assetId: asset.id,
                  altText: drafts[asset.id].trim(),
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
