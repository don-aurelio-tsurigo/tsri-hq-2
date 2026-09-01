import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DamArchiveView } from "@/components/dam-archive-view";
import {
  archiveCollectionsHref,
  archiveHref,
  countPublishedAssets,
  listArchiveCollectionCards,
  listArchiveFacets,
  parseArchiveFilters,
  parseArchivePage,
  parseArchiveView,
  searchPublishedAssets,
} from "@/lib/dam/archive-search";
import { canReviewDamArchive } from "@/lib/dam/review";
import { requireMembership } from "@/lib/session";

export default async function DamArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { membership } = await requireMembership();
  const params = await searchParams;
  const filters = parseArchiveFilters(params);
  const page = parseArchivePage(params);
  const view = parseArchiveView(params);
  const [result, collectionResult, facets, publishedCount] = await Promise.all([
    view === "photos"
      ? searchPublishedAssets(filters, page)
      : Promise.resolve(null),
    view === "collections"
      ? listArchiveCollectionCards(filters.q, page)
      : Promise.resolve(null),
    listArchiveFacets(),
    countPublishedAssets(),
  ]);

  const pageCount =
    view === "collections"
      ? (collectionResult?.pageCount ?? 0)
      : (result?.pageCount ?? 0);
  if (pageCount > 0 && page > pageCount) {
    redirect(
      view === "collections"
        ? archiveCollectionsHref(filters, pageCount)
        : archiveHref(filters, pageCount),
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Fotos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Archiv
          </h1>
        </div>
        <Link href="/dam/upload" className="btn btn-primary">
          Upload
        </Link>
      </header>

      <Suspense>
        <DamArchiveView
          view={view}
          assets={result?.assets ?? []}
          collections={collectionResult?.collections ?? []}
          facets={facets}
          publishedCount={publishedCount}
          total={
            view === "collections"
              ? (collectionResult?.total ?? 0)
              : (result?.total ?? 0)
          }
          page={
            view === "collections"
              ? (collectionResult?.page ?? 1)
              : (result?.page ?? 1)
          }
          pageCount={pageCount}
          pageSize={
            view === "collections"
              ? (collectionResult?.pageSize ?? result?.pageSize ?? 120)
              : (result?.pageSize ?? 120)
          }
          canReview={canReviewDamArchive(membership)}
        />
      </Suspense>
    </div>
  );
}
