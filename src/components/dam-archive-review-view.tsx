"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { X } from "lucide-react";
import { DamArchiveCollectionsGrid } from "@/components/dam-archive-collections-grid";
import { DamArchiveGrid } from "@/components/dam-archive-grid";
import type { ArchiveView } from "@/lib/dam/archive-filters";
import type { ArchiveCollectionCard, ArchiveFacets } from "@/lib/dam/archive-search";
import {
  RATING_FILTERS,
  ratingFilterLabel,
  type RatingFilter,
} from "@/lib/dam/rating-filter";
import {
  parseReviewFilters,
  reviewHref,
} from "@/lib/dam/review-params";
import type { ArchiveAssetCard } from "@/lib/dam/types";

export function DamArchiveReviewView({
  openedAtIso,
  view: initialView,
  assets,
  collections,
  facets,
  total,
  page,
  pageCount,
  pageSize,
}: {
  openedAtIso: string;
  view: ArchiveView;
  assets: ArchiveAssetCard[];
  collections: ArchiveCollectionCard[];
  facets: ArchiveFacets;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const openedAt = useMemo(() => new Date(openedAtIso), [openedAtIso]);
  const filters = useMemo(
    () =>
      parseReviewFilters(
        Object.fromEntries([...searchParams.entries()].map(([k, v]) => [k, v])),
      ),
    [searchParams],
  );
  const view = useMemo((): ArchiveView => {
    return searchParams.get("view") === "photos" ? "photos" : initialView;
  }, [initialView, searchParams]);

  const navigate = useCallback(
    (opts: {
      view?: ArchiveView;
      rating?: RatingFilter;
      collectionId?: string;
      page?: number;
    }) => {
      startTransition(() => {
        router.replace(
          reviewHref(openedAt, {
            view: opts.view ?? view,
            rating: opts.rating ?? filters.rating,
            collectionId:
              opts.collectionId !== undefined
                ? opts.collectionId
                : filters.collectionId,
            page: opts.page ?? 1,
          }),
          { scroll: false },
        );
      });
    },
    [filters.collectionId, filters.rating, openedAt, router, view],
  );

  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);
  const collectionName =
    facets.collections.find((c) => c.id === filters.collectionId)?.name ??
    filters.collectionId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={view === "photos" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => navigate({ view: "photos", collectionId: "" })}
        >
          Bilder
        </button>
        <button
          type="button"
          className={view === "collections" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => navigate({ view: "collections", collectionId: "" })}
        >
          Collections
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-[10rem]">
          <label htmlFor="dam-review-rating">Sterne</label>
          <select
            id="dam-review-rating"
            value={filters.rating}
            onChange={(event) => {
              const option = RATING_FILTERS.find(
                (item) => item.value === event.target.value,
              );
              navigate({ rating: option?.value ?? "all" });
            }}
          >
            {RATING_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(filters.rating !== "all" || filters.collectionId) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.rating !== "all" ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-muted)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--border)]"
              onClick={() => navigate({ rating: "all" })}
            >
              Sterne: {ratingFilterLabel(filters.rating)}
              <X className="size-3" aria-hidden />
              <span className="sr-only"> entfernen</span>
            </button>
          ) : null}
          {filters.collectionId ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-[var(--panel-muted)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--border)]"
              onClick={() => navigate({ collectionId: "", view: "photos" })}
            >
              Collection: {collectionName}
              <X className="size-3" aria-hidden />
              <span className="sr-only"> entfernen</span>
            </button>
          ) : null}
        </div>
      )}

      <p className="text-sm text-[var(--muted)]">
        {pending
          ? "Suche wird aktualisiert…"
          : total === 0
            ? view === "collections"
              ? "Keine Collections für diesen Review."
              : "Keine Bilder für diesen Filter."
            : view === "collections"
              ? pageCount > 1
                ? `${rangeFrom}–${rangeTo} von ${total} Collections.`
                : `${total} ${total === 1 ? "Collection" : "Collections"}.`
              : pageCount > 1
                ? `${rangeFrom}–${rangeTo} von ${total} Bildern.`
                : `${total} ${total === 1 ? "Bild" : "Bilder"}.`}{" "}
        {view === "photos"
          ? "Checkbox oder Shift-Klick wählt, Doppelklick oder Enter öffnet die Vorschau."
          : "Collection öffnen zeigt die zugehörigen ungesichteten Bilder."}
      </p>

      {view === "collections" ? (
        collections.length === 0 ? (
          <p className="card p-8 text-center text-[var(--muted)]">
            Keine Collections mit ungesichteten Fotos.
          </p>
        ) : (
          <DamArchiveCollectionsGrid
            collections={collections}
            hrefForCollection={(collectionId) =>
              reviewHref(openedAt, {
                view: "photos",
                collectionId,
                rating: filters.rating,
              })
            }
          />
        )
      ) : (
        <DamArchiveGrid assets={assets} facets={facets} />
      )}

      {pageCount > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-2"
          aria-label="Seiten"
        >
          {page > 1 ? (
            <Link
              href={reviewHref(openedAt, {
                view,
                rating: filters.rating,
                collectionId: filters.collectionId,
                page: page - 1,
              })}
              className="btn btn-ghost"
            >
              Zurück
            </Link>
          ) : (
            <span className="btn btn-ghost pointer-events-none opacity-40">
              Zurück
            </span>
          )}
          <p className="text-sm font-medium text-[var(--muted)]">
            Seite {page} von {pageCount}
          </p>
          {page < pageCount ? (
            <Link
              href={reviewHref(openedAt, {
                view,
                rating: filters.rating,
                collectionId: filters.collectionId,
                page: page + 1,
              })}
              className="btn btn-ghost"
            >
              Weiter
            </Link>
          ) : (
            <span className="btn btn-ghost pointer-events-none opacity-40">
              Weiter
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
