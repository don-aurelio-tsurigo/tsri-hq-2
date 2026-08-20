"use client";

import { useMemo, useState, useTransition } from "react";
import { DamCombobox, type DamComboboxOption } from "@/components/dam-combobox";
import {
  bulkUpdatePublishedAssets,
  createDamCollection,
} from "@/lib/actions/dam";
import type { ArchiveFacets } from "@/lib/dam/archive-search";
import type { ArchiveAssetCard } from "@/lib/dam/types";

async function fetchFacetOptions(
  type: "keywords" | "collections",
  q: string,
): Promise<DamComboboxOption[]> {
  const params = new URLSearchParams({ type, q });
  const res = await fetch(`/api/dam/archive/facets?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { options?: DamComboboxOption[] };
  return data.options ?? [];
}

function optionMap(
  items: { value: string; label: string }[],
): DamComboboxOption[] {
  const seen = new Set<string>();
  const out: DamComboboxOption[] = [];
  for (const item of items) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    out.push(item);
  }
  return out;
}

export function DamArchiveBulkEditDialog({
  assets,
  selectedIds,
  facets,
  pending = false,
  onClose,
  onSaved,
}: {
  assets: ArchiveAssetCard[];
  selectedIds: string[];
  facets: ArchiveFacets;
  pending?: boolean;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [saving, startTransition] = useTransition();
  const [credit, setCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [clearNotes, setClearNotes] = useState(false);
  const [addKeywords, setAddKeywords] = useState<string[]>([]);
  const [removeKeywords, setRemoveKeywords] = useState<string[]>([]);
  const [addCollectionIds, setAddCollectionIds] = useState<string[]>([]);
  const [removeCollectionIds, setRemoveCollectionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || saving;

  const selected = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds],
  );

  const creditOptions = useMemo(
    () =>
      optionMap([
        ...facets.credits.map((item) => ({ value: item, label: item })),
        ...selected.map((asset) => ({ value: asset.credit, label: asset.credit })),
      ]),
    [facets.credits, selected],
  );

  const keywordOptions = useMemo(
    () =>
      optionMap([
        ...selected.flatMap((asset) =>
          asset.keywords.map((keyword) => ({ value: keyword, label: keyword })),
        ),
        ...facets.keywords.map((keyword) => ({ value: keyword, label: keyword })),
      ]),
    [facets.keywords, selected],
  );

  const collectionOptions = useMemo(
    () =>
      optionMap([
        ...selected.flatMap((asset) =>
          asset.collections.map((collection) => ({
            value: collection.id,
            label: collection.name,
          })),
        ),
        ...facets.collections.map((collection) => ({
          value: collection.id,
          label: collection.name,
        })),
      ]),
    [facets.collections, selected],
  );

  const hasChange =
    Boolean(credit.trim()) ||
    clearNotes ||
    Boolean(notes.trim()) ||
    addKeywords.length > 0 ||
    removeKeywords.length > 0 ||
    addCollectionIds.length > 0 ||
    removeCollectionIds.length > 0;

  async function createKeyword(name: string): Promise<DamComboboxOption | null> {
    const keyword = name.trim().slice(0, 60);
    if (!keyword) return null;
    return { value: keyword, label: keyword };
  }

  async function createCredit(name: string): Promise<DamComboboxOption | null> {
    const next = name.trim().slice(0, 200);
    if (!next) return null;
    return { value: next, label: next };
  }

  async function createCollection(name: string): Promise<DamComboboxOption | null> {
    const result = await createDamCollection(name, { isPersonal: false });
    if (result.error || !result.collection) {
      setError(result.error ?? "Collection konnte nicht angelegt werden.");
      return null;
    }
    return { value: result.collection.id, label: result.collection.name };
  }

  function submit() {
    if (!hasChange || busy) return;
    setError(null);
    startTransition(async () => {
      const result = await bulkUpdatePublishedAssets({
        assetIds: selectedIds,
        ...(credit.trim() ? { credit: credit.trim() } : {}),
        ...(clearNotes
          ? { notes: null }
          : notes.trim()
            ? { notes: notes.trim() }
            : {}),
        ...(addKeywords.length > 0 ? { addKeywords } : {}),
        ...(removeKeywords.length > 0 ? { removeKeywords } : {}),
        ...(addCollectionIds.length > 0 ? { addCollectionIds } : {}),
        ...(removeCollectionIds.length > 0 ? { removeCollectionIds } : {}),
      });
      if (result.error || !result.count) {
        setError(result.error ?? "Änderungen konnten nicht gespeichert werden.");
        return;
      }
      onSaved(result.count);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-bulk-title"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="dam-bulk-title"
          className="font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          Metadaten anpassen
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {selectedIds.length === 1
            ? "1 Bild"
            : `${selectedIds.length} Bilder`}
          . Leere Felder bleiben unverändert.
        </p>

        <div className="mt-4 grid gap-3">
          <DamCombobox
            id="bulk-credit"
            label="Credit"
            emptyLabel="Unverändert"
            placeholder="Credit suchen oder anlegen…"
            options={creditOptions}
            value={credit ? [credit] : []}
            onChange={(next) => setCredit(next[0] ?? "")}
            onCreate={createCredit}
          />

          <div className="field">
            <label htmlFor="bulk-notes">Kontext</label>
            <textarea
              id="bulk-notes"
              rows={3}
              maxLength={4000}
              value={notes}
              disabled={clearNotes || busy}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Unverändert"
            />
            <label className="mt-1.5 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clearNotes}
                disabled={busy}
                onChange={(event) => {
                  setClearNotes(event.target.checked);
                  if (event.target.checked) setNotes("");
                }}
              />
              Kontext leeren
            </label>
          </div>

          <DamCombobox
            id="bulk-add-keywords"
            label="Keywords hinzufügen"
            emptyLabel="Keine"
            placeholder="Keyword suchen oder anlegen…"
            options={keywordOptions}
            value={addKeywords}
            multiple
            remote={facets.keywordsTruncated}
            onSearch={(q) => fetchFacetOptions("keywords", q)}
            onCreate={createKeyword}
            onChange={setAddKeywords}
          />

          <DamCombobox
            id="bulk-remove-keywords"
            label="Keywords entfernen"
            emptyLabel="Keine"
            placeholder="Keyword suchen…"
            options={keywordOptions}
            value={removeKeywords}
            multiple
            remote={facets.keywordsTruncated}
            onSearch={(q) => fetchFacetOptions("keywords", q)}
            onChange={setRemoveKeywords}
          />

          <DamCombobox
            id="bulk-add-collections"
            label="Collections hinzufügen"
            emptyLabel="Keine"
            placeholder="Collection suchen oder anlegen…"
            options={collectionOptions}
            value={addCollectionIds}
            multiple
            remote={facets.collectionsTruncated}
            onSearch={(q) => fetchFacetOptions("collections", q)}
            onCreate={createCollection}
            onChange={setAddCollectionIds}
          />

          <DamCombobox
            id="bulk-remove-collections"
            label="Collections entfernen"
            emptyLabel="Keine"
            placeholder="Collection suchen…"
            options={collectionOptions}
            value={removeCollectionIds}
            multiple
            placement="top"
            remote={facets.collectionsTruncated}
            onSearch={(q) => fetchFacetOptions("collections", q)}
            onChange={setRemoveCollectionIds}
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
            className="btn btn-primary"
            disabled={busy || !hasChange}
            onClick={submit}
          >
            {saving ? "Speichert…" : "Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}
