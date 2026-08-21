"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { SlidersHorizontal, ChevronLeft, ChevronRight, X } from "lucide-react";
import { DamArchiveDeleteCollectionsDialog } from "@/components/dam-archive-delete-collections";
import { DamArchiveGrid } from "@/components/dam-archive-grid";
import { DamCombobox, type DamComboboxOption } from "@/components/dam-combobox";
import { useToast } from "@/components/toast";
import {
  EMPTY_ARCHIVE_FILTERS,
  archiveFilterChipCount,
  archiveFiltersActive,
  archiveHref,
  hiddenArchiveFilterCount,
  parseArchiveFiltersFromSearchParams,
  type ArchiveFilters,
} from "@/lib/dam/archive-filters";
import type { ArchiveFacets } from "@/lib/dam/archive-search";
import { DAM_RIGHTS_LABELS } from "@/lib/dam/types";
import type { ArchiveAssetCard } from "@/lib/dam/types";

type Chip = {
  key: string;
  label: string;
  clear: (filters: ArchiveFilters) => ArchiveFilters;
};

function chipsFor(
  filters: ArchiveFilters,
  collections: { id: string; name: string }[],
): Chip[] {
  const collectionName =
    collections.find((c) => c.id === filters.collectionId)?.name ??
    filters.collectionId;
  const chips: Chip[] = [];
  if (filters.q) {
    chips.push({
      key: "q",
      label: `Suche: ${filters.q}`,
      clear: (next) => ({ ...next, q: "" }),
    });
  }
  if (filters.collectionId) {
    chips.push({
      key: `collection:${filters.collectionId}`,
      label: `Collection: ${collectionName}`,
      clear: (next) => ({ ...next, collectionId: "" }),
    });
  }
  for (const keyword of filters.keywords) {
    chips.push({
      key: `keyword:${keyword}`,
      label: `Tag: ${keyword}`,
      clear: (next) => ({
        ...next,
        keywords: next.keywords.filter((item) => item !== keyword),
      }),
    });
  }
  if (filters.rightsType) {
    chips.push({
      key: "rights",
      label: `Rechte: ${DAM_RIGHTS_LABELS[filters.rightsType]}`,
      clear: (next) => ({ ...next, rightsType: "" }),
    });
  }
  if (filters.credit) {
    chips.push({
      key: "credit",
      label: `Credit: ${filters.credit}`,
      clear: (next) => ({ ...next, credit: "" }),
    });
  }
  if (filters.from) {
    chips.push({
      key: "from",
      label: `Von: ${filters.from}`,
      clear: (next) => ({ ...next, from: "" }),
    });
  }
  if (filters.to) {
    chips.push({
      key: "to",
      label: `Bis: ${filters.to}`,
      clear: (next) => ({ ...next, to: "" }),
    });
  }
  return chips;
}

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

export function DamArchiveView({
  assets,
  facets,
  publishedCount,
  total,
  page,
  pageCount,
  pageSize,
}: {
  assets: ArchiveAssetCard[];
  facets: ArchiveFacets;
  publishedCount: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const filters = useMemo(
    () => parseArchiveFiltersFromSearchParams(searchParams),
    [searchParams],
  );
  const [queryInput, setQueryInput] = useState(filters.q);
  const [prevQ, setPrevQ] = useState(filters.q);
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setQueryInput(filters.q);
  }
  const filtered = archiveFiltersActive(filters);
  const extraCount = hiddenArchiveFilterCount(filters);
  const chipCount = archiveFilterChipCount(filters);
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);

  const apply = useCallback(
    (next: ArchiveFilters, nextPage = 1, scroll = false) => {
      startTransition(() => {
        router.replace(archiveHref(next, nextPage), { scroll });
      });
    },
    [router],
  );

  const commit = useCallback(
    (patch: Partial<ArchiveFilters>) => {
      const q =
        patch.q !== undefined ? patch.q : queryInput.trim().slice(0, 120);
      apply({ ...filters, ...patch, q });
    },
    [apply, filters, queryInput],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = queryInput.trim().slice(0, 120);
      if (next === filters.q) return;
      apply({ ...filters, q: next });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [apply, filters, queryInput]);

  const collectionOptions = useMemo<DamComboboxOption[]>(
    () => [
      ...facets.collections.map((c) => ({ value: c.id, label: c.name })),
      ...(filters.collectionId &&
      !facets.collections.some((c) => c.id === filters.collectionId)
        ? [{ value: filters.collectionId, label: filters.collectionId }]
        : []),
    ],
    [facets.collections, filters.collectionId],
  );

  const keywordOptions = useMemo<DamComboboxOption[]>(() => {
    const seen = new Set(facets.keywords);
    const extra = filters.keywords.filter((keyword) => !seen.has(keyword));
    return [...extra, ...facets.keywords].map((keyword) => ({
      value: keyword,
      label: keyword,
    }));
  }, [facets.keywords, filters.keywords]);

  const creditOptions = useMemo<DamComboboxOption[]>(() => {
    const credits = facets.credits.includes(filters.credit) || !filters.credit
      ? facets.credits
      : [filters.credit, ...facets.credits];
    return credits.map((credit) => ({ value: credit, label: credit }));
  }, [facets.credits, filters.credit]);

  const chips = chipsFor(filters, facets.collections);
  const searchCollections = useCallback(
    (q: string) => fetchFacetOptions("collections", q),
    [],
  );
  const searchKeywords = useCallback(
    (q: string) => fetchFacetOptions("keywords", q),
    [],
  );

  if (publishedCount === 0) {
    return (
      <p className="card p-8 text-center text-[var(--muted)]">
        Noch keine publizierten Bilder. Unter{" "}
        <Link
          href="/dam/personal"
          className="font-semibold text-[var(--accent)] hover:underline"
        >
          Meine Uploads
        </Link>{" "}
        auswählen und ins Archiv verschieben.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="field min-w-[16rem] flex-1">
            <label htmlFor="dam-q">Suche</label>
            <input
              id="dam-q"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Dateiname, Keywords, Alt-Text, Credit, Kontext"
              autoComplete="off"
            />
          </div>
          <div className="min-w-[14rem] flex-1">
            <DamCombobox
              id="dam-collection"
              label="Collection"
              emptyLabel="Alle Collections"
              placeholder="Collection suchen…"
              options={collectionOptions}
              value={filters.collectionId ? [filters.collectionId] : []}
              onChange={(next) => commit({ collectionId: next[0] ?? "" })}
              remote={facets.collectionsTruncated}
              onSearch={searchCollections}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((prev) => !prev)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {extraCount > 0 ? `Filter (${extraCount})` : "Filter"}
          </button>
        </div>

        {moreOpen ? (
          <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <DamCombobox
                id="dam-keyword"
                label="Tags / Keywords"
                emptyLabel="Tags wählen"
                placeholder="Tags suchen…"
                options={keywordOptions}
                value={filters.keywords}
                multiple
                onChange={(keywords) => commit({ keywords })}
                remote={facets.keywordsTruncated}
                onSearch={searchKeywords}
              />
            </div>
            <div className="field">
              <label htmlFor="dam-rights">Rechte</label>
              <select
                id="dam-rights"
                value={filters.rightsType}
                onChange={(event) => {
                  const value = event.target.value;
                  commit({
                    rightsType:
                      value === "own" ||
                      value === "provided" ||
                      value === "free_use"
                        ? value
                        : "",
                  });
                }}
              >
                <option value="">Alle</option>
                {Object.entries(DAM_RIGHTS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <DamCombobox
              id="dam-credit"
              label="Credit"
              emptyLabel="Alle Credits"
              placeholder="Credit suchen…"
              options={creditOptions}
              value={filters.credit ? [filters.credit] : []}
              onChange={(next) => commit({ credit: next[0] ?? "" })}
            />
            <div className="field">
              <label htmlFor="dam-from">Aufgenommen von</label>
              <input
                id="dam-from"
                type="date"
                value={filters.from}
                onChange={(event) => commit({ from: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="dam-to">Aufgenommen bis</label>
              <input
                id="dam-to"
                type="date"
                value={filters.to}
                onChange={(event) => commit({ to: event.target.value })}
              />
            </div>
          </div>
        ) : null}

        {chipCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-muted)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--border)]"
                onClick={() => {
                  const next = chip.clear({
                    ...filters,
                    q: queryInput.trim().slice(0, 120),
                  });
                  if (!next.q) setQueryInput("");
                  apply(next);
                }}
              >
                {chip.label}
                <X className="size-3" aria-hidden />
                <span className="sr-only"> entfernen</span>
              </button>
            ))}
            {chipCount > 1 ? (
              <button
                type="button"
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
                onClick={() => {
                  setQueryInput("");
                  apply(EMPTY_ARCHIVE_FILTERS);
                }}
              >
                Alle Filter zurücksetzen
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {assets.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          {pending
            ? "Suche wird aktualisiert…"
            : "Keine Treffer für diese Suche. Filter anpassen oder zurücksetzen."}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--fg)]" />
                Aktualisiere…
              </span>
            ) : (
              <>
                {pageCount > 1
                  ? `${rangeFrom}–${rangeTo} von ${total} ${
                      total === 1 ? "Bild" : "Bildern"
                    }`
                  : `${total} ${total === 1 ? "Bild" : "Bilder"}`}
                {filtered ? " gefunden" : ""}. Checkbox oder Shift-Klick wählt,
                Doppelklick oder Enter öffnet die Vorschau.
              </>
            )}
          </p>
          <div className={pending ? "pointer-events-none opacity-50" : ""}>
            <DamArchiveGrid assets={assets} facets={facets} />
          </div>
          {pageCount > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-2"
              aria-label="Seiten"
            >
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending || page <= 1}
                onClick={() => apply(filters, page - 1, true)}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Zurück
              </button>
              <p className="text-sm font-medium text-[var(--muted)]">
                Seite {page} von {pageCount}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending || page >= pageCount}
                onClick={() => apply(filters, page + 1, true)}
              >
                Weiter
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </nav>
          ) : null}
        </div>
      )}

      <p className="pt-2 text-right text-xs text-[var(--muted)]">
        <button
          type="button"
          className="hover:text-[var(--fg)] hover:underline"
          onClick={() => setDeleteOpen(true)}
        >
          Collections löschen
        </button>
      </p>

      {deleteOpen ? (
        <DamArchiveDeleteCollectionsDialog
          options={collectionOptions}
          remote={facets.collectionsTruncated}
          pending={pending}
          onClose={() => setDeleteOpen(false)}
          onDeleted={({ names, ids }) => {
            setDeleteOpen(false);
            const deletedCurrent = ids.includes(filters.collectionId);
            showToast({
              message:
                names.length === 1
                  ? `Collection «${names[0]}» gelöscht.`
                  : `${names.length} Collections gelöscht.`,
            });
            startTransition(() => {
              if (deletedCurrent) {
                router.replace(archiveHref({ ...filters, collectionId: "" }));
              } else {
                router.refresh();
              }
            });
          }}
        />
      ) : null}
    </div>
  );
}
