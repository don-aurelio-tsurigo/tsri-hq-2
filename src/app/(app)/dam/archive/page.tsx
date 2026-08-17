import { Suspense } from "react";
import Link from "next/link";
import { DamArchiveView } from "@/components/dam-archive-view";
import {
  countPublishedAssets,
  listArchiveFacets,
  parseArchiveFilters,
  searchPublishedAssets,
} from "@/lib/dam/archive-search";
import { requireMembership } from "@/lib/session";

export default async function DamArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMembership();
  const filters = parseArchiveFilters(await searchParams);
  const [assets, facets, publishedCount] = await Promise.all([
    searchPublishedAssets(filters),
    listArchiveFacets(),
    countPublishedAssets(),
  ]);

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
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Publizierte Bilder für alle eingeloggten User. Suche und Filter, Doppelklick
            öffnet die Vorschau.
          </p>
        </div>
        <Link href="/dam/upload" className="btn btn-primary">
          Upload
        </Link>
      </header>

      <Suspense>
        <DamArchiveView
          assets={assets}
          facets={facets}
          publishedCount={publishedCount}
        />
      </Suspense>
    </div>
  );
}
