import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DamArchiveView } from "@/components/dam-archive-view";
import {
  archiveHref,
  countPublishedAssets,
  listArchiveFacets,
  parseArchiveFilters,
  parseArchivePage,
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
  const [result, facets, publishedCount] = await Promise.all([
    searchPublishedAssets(filters, page),
    listArchiveFacets(),
    countPublishedAssets(),
  ]);

  if (result.pageCount > 0 && page > result.pageCount) {
    redirect(archiveHref(filters, result.pageCount));
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
          assets={result.assets}
          facets={facets}
          publishedCount={publishedCount}
          total={result.total}
          page={result.page}
          pageCount={result.pageCount}
          pageSize={result.pageSize}
          canReview={canReviewDamArchive(membership)}
        />
      </Suspense>
    </div>
  );
}
