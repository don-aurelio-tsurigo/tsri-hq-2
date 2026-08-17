import Link from "next/link";
import { DamArchiveGrid } from "@/components/dam-archive-grid";
import {
  archiveFiltersActive,
  countPublishedAssets,
  listArchiveFacets,
  parseArchiveFilters,
  searchPublishedAssets,
} from "@/lib/dam/archive-search";
import { DAM_RIGHTS_LABELS } from "@/lib/dam/types";
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
  const filtered = archiveFiltersActive(filters);
  const keywordOptions = facets.keywords.includes(filters.keyword) || !filters.keyword
    ? facets.keywords
    : [filters.keyword, ...facets.keywords];
  const creditOptions = facets.credits.includes(filters.credit) || !filters.credit
    ? facets.credits
    : [filters.credit, ...facets.credits];

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

      {publishedCount > 0 ? (
        <form method="get" action="/dam/archive" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="field sm:col-span-2 lg:col-span-4">
            <label htmlFor="dam-q">Suche</label>
            <input
              id="dam-q"
              name="q"
              defaultValue={filters.q}
              placeholder="Dateiname, Keywords, Alt-Text, Credit"
            />
          </div>
          <div className="field">
            <label htmlFor="dam-keyword">Tags / Keywords</label>
            <select id="dam-keyword" name="keyword" defaultValue={filters.keyword}>
              <option value="">Alle</option>
              {keywordOptions.map((keyword) => (
                <option key={keyword} value={keyword}>
                  {keyword}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dam-collection">Collection</label>
            <select
              id="dam-collection"
              name="collection"
              defaultValue={filters.collectionId}
            >
              <option value="">Alle</option>
              {facets.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dam-rights">Rechte</label>
            <select id="dam-rights" name="rights" defaultValue={filters.rightsType}>
              <option value="">Alle</option>
              {Object.entries(DAM_RIGHTS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dam-credit">Credit</label>
            <select id="dam-credit" name="credit" defaultValue={filters.credit}>
              <option value="">Alle</option>
              {creditOptions.map((credit) => (
                <option key={credit} value={credit}>
                  {credit}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="dam-from">Aufgenommen von</label>
            <input id="dam-from" type="date" name="from" defaultValue={filters.from} />
          </div>
          <div className="field">
            <label htmlFor="dam-to">Aufgenommen bis</label>
            <input id="dam-to" type="date" name="to" defaultValue={filters.to} />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary">
              Filtern
            </button>
            {filtered ? (
              <Link href="/dam/archive" className="btn btn-ghost">
                Zurücksetzen
              </Link>
            ) : null}
          </div>
        </form>
      ) : null}

      {publishedCount === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Noch keine publizierten Bilder. Unter{" "}
          <Link href="/dam/personal" className="font-semibold text-[var(--accent)] hover:underline">
            Meine Fotos
          </Link>{" "}
          auswählen und ins Archiv verschieben.
        </p>
      ) : assets.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Keine Treffer für diese Suche. Filter anpassen oder zurücksetzen.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            {assets.length} {assets.length === 1 ? "Bild" : "Bilder"}
            {filtered ? " gefunden" : ""}
            . Checkbox oder Shift-Klick wählt, Doppelklick oder Enter öffnet die Vorschau.
          </p>
          <DamArchiveGrid assets={assets} />
        </div>
      )}
    </div>
  );
}
