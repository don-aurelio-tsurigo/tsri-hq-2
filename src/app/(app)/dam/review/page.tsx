import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DamArchiveReviewComplete } from "@/components/dam-archive-review-complete";
import { DamArchiveReviewView } from "@/components/dam-archive-review-view";
import { listArchiveFacets } from "@/lib/dam/archive-search";
import { pageTitle } from "@/lib/link-preview";
import {
  getLastDamArchiveReview,
  listDamArchiveReviewCollectionCards,
  parseReviewFilters,
  parseReviewOpenedAt,
  parseReviewView,
  reviewHref,
  searchDamArchiveReviewQueue,
} from "@/lib/dam/review";
import { ARCHIVE_NO_COLLECTION, parseArchivePage } from "@/lib/dam/archive-filters";
import { requireMembership } from "@/lib/session";

export const metadata = pageTitle("Mediathek-Review");

export default async function DamArchiveReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMembership();

  const params = await searchParams;
  const openedRaw = Array.isArray(params.opened) ? params.opened[0] : params.opened;
  const openedAt = parseReviewOpenedAt(openedRaw) ?? new Date();
  const view = parseReviewView(params);
  const filters = parseReviewFilters(params);
  const needsCanonical =
    !openedRaw ||
    !parseReviewOpenedAt(openedRaw) ||
    params.view === undefined;
  if (needsCanonical) {
    redirect(
      reviewHref(openedAt, {
        view,
        rating: filters.rating,
        collectionId: filters.collectionId,
      }),
    );
  }

  const page = parseArchivePage(params);
  const last = await getLastDamArchiveReview();
  const reviewedUntil = last?.reviewedUntil ?? new Date(0);
  const [photoResult, collectionResult, facets, queueTotal] = await Promise.all([
    view === "photos"
      ? searchDamArchiveReviewQueue(
          reviewedUntil,
          openedAt,
          page,
          undefined,
          filters,
        )
      : Promise.resolve(null),
    view === "collections"
      ? listDamArchiveReviewCollectionCards(
          reviewedUntil,
          openedAt,
          page,
          undefined,
          { rating: filters.rating },
        )
      : Promise.resolve(null),
    listArchiveFacets({
      ensureCollectionIds:
        filters.collectionId && filters.collectionId !== ARCHIVE_NO_COLLECTION
          ? [filters.collectionId]
          : [],
    }),
    searchDamArchiveReviewQueue(reviewedUntil, openedAt, 1, 1).then((r) => r.total),
  ]);

  const result =
    view === "collections"
      ? {
          total: collectionResult?.total ?? 0,
          page: collectionResult?.page ?? 1,
          pageCount: collectionResult?.pageCount ?? 0,
          pageSize: collectionResult?.pageSize ?? 120,
        }
      : {
          total: photoResult?.total ?? 0,
          page: photoResult?.page ?? 1,
          pageCount: photoResult?.pageCount ?? 0,
          pageSize: photoResult?.pageSize ?? 120,
        };

  if (result.pageCount > 0 && page > result.pageCount) {
    redirect(
      reviewHref(openedAt, {
        view,
        rating: filters.rating,
        collectionId: filters.collectionId,
        page: result.pageCount,
      }),
    );
  }

  const sinceLabel = last
    ? last.reviewedUntil.toLocaleDateString("de-CH")
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Fotos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Mediathek-Review
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Fotos, die seit dem letzten Review in die Mediathek gekommen sind. Slop in
            den Papierkorb, Rest abschliessen.
          </p>
        </div>
        <Link href="/dam/archive" className="btn btn-ghost">
          Mediathek
        </Link>
      </header>

      <p className="text-sm text-[var(--muted)]">
        {queueTotal === 0
          ? sinceLabel
            ? `Keine ungesichteten Fotos seit ${sinceLabel}.`
            : "Keine ungesichteten Fotos."
          : `${queueTotal} ${
              queueTotal === 1 ? "Foto ungesichtet" : "Fotos ungesichtet"
            }${sinceLabel ? ` seit ${sinceLabel}` : ""}.`}
      </p>

      {queueTotal === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Nichts zu reviewen. Neu publizierte Fotos erscheinen hier nach dem
          nächsten Upload in die Mediathek.
        </p>
      ) : (
        <Suspense>
          <DamArchiveReviewView
            openedAtIso={openedAt.toISOString()}
            view={view}
            assets={photoResult?.assets ?? []}
            collections={collectionResult?.collections ?? []}
            facets={facets}
            total={result.total}
            page={result.page}
            pageCount={result.pageCount}
            pageSize={result.pageSize}
          />
        </Suspense>
      )}

      <DamArchiveReviewComplete
        openedAtIso={openedAt.toISOString()}
        remainingCount={queueTotal}
      />
    </div>
  );
}
