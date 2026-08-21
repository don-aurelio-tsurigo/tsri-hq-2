import Link from "next/link";
import { redirect } from "next/navigation";
import { DamArchiveGrid } from "@/components/dam-archive-grid";
import { DamArchiveReviewComplete } from "@/components/dam-archive-review-complete";
import { listArchiveFacets, parseArchivePage } from "@/lib/dam/archive-search";
import {
  canReviewDamArchive,
  getLastDamArchiveReview,
  parseReviewOpenedAt,
  reviewHref,
  searchDamArchiveReviewQueue,
} from "@/lib/dam/review";
import { requireMembership } from "@/lib/session";

export default async function DamArchiveReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { membership } = await requireMembership();
  if (!canReviewDamArchive(membership)) {
    redirect("/dam/archive");
  }

  const params = await searchParams;
  const openedRaw = Array.isArray(params.opened) ? params.opened[0] : params.opened;
  const openedAt = parseReviewOpenedAt(openedRaw) ?? new Date();
  if (!openedRaw || !parseReviewOpenedAt(openedRaw)) {
    redirect(reviewHref(openedAt));
  }

  const page = parseArchivePage(params);
  const last = await getLastDamArchiveReview();
  const reviewedUntil = last?.reviewedUntil ?? new Date(0);
  const [result, facets] = await Promise.all([
    searchDamArchiveReviewQueue(reviewedUntil, openedAt, page),
    listArchiveFacets(),
  ]);

  if (result.pageCount > 0 && page > result.pageCount) {
    redirect(reviewHref(openedAt, result.pageCount));
  }

  const sinceLabel = last
    ? last.reviewedUntil.toLocaleDateString("de-CH")
    : null;
  const rangeFrom = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const rangeTo = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Fotos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Archiv-Review
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Fotos, die seit dem letzten Review ins Archiv gekommen sind. Slop in
            den Papierkorb, Rest abschliessen.
          </p>
        </div>
        <Link href="/dam/archive" className="btn btn-ghost">
          Alle Fotos
        </Link>
      </header>

      <p className="text-sm text-[var(--muted)]">
        {result.total === 0
          ? sinceLabel
            ? `Keine ungesichteten Fotos seit ${sinceLabel}.`
            : "Keine ungesichteten Fotos."
          : `${result.total} ${
              result.total === 1 ? "Foto ungesichtet" : "Fotos ungesichtet"
            }${sinceLabel ? ` seit ${sinceLabel}` : ""}.`}
      </p>

      {result.total === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Nichts zu reviewen. Neu publizierte Fotos erscheinen hier nach dem
          nächsten Upload ins Archiv.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            {result.pageCount > 1
              ? `${rangeFrom}–${rangeTo} von ${result.total} Bildern.`
              : `${result.total} ${result.total === 1 ? "Bild" : "Bilder"}.`}{" "}
            Checkbox oder Shift-Klick wählt, Doppelklick oder Enter öffnet die
            Vorschau.
          </p>
          <DamArchiveGrid assets={result.assets} facets={facets} />
          {result.pageCount > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-2"
              aria-label="Seiten"
            >
              {page > 1 ? (
                <Link href={reviewHref(openedAt, page - 1)} className="btn btn-ghost">
                  Zurück
                </Link>
              ) : (
                <span className="btn btn-ghost pointer-events-none opacity-40">
                  Zurück
                </span>
              )}
              <p className="text-sm font-medium text-[var(--muted)]">
                Seite {result.page} von {result.pageCount}
              </p>
              {page < result.pageCount ? (
                <Link href={reviewHref(openedAt, page + 1)} className="btn btn-ghost">
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
      )}

      <DamArchiveReviewComplete
        openedAtIso={openedAt.toISOString()}
        remainingCount={result.total}
      />
    </div>
  );
}
