import Link from "next/link";
import { DamFaceTileGrid, DamPersonCards } from "@/components/dam-persons";
import { listDamPersons } from "@/lib/dam/face-assign";
import {
  FACE_PAGE_SIZE,
  faceTabCounts,
  listFaceTiles,
  listPersonCards,
} from "@/lib/dam/face-overview";
import { pageTitle } from "@/lib/link-preview";
import { requireMembership } from "@/lib/session";

export const metadata = pageTitle("Personen");

const TABS = [
  { key: "personen", label: "Personen" },
  { key: "unbenannt", label: "Unbenannt" },
  { key: "ignoriert", label: "Ignoriert" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function tabHref(tab: TabKey, page = 1) {
  const params = new URLSearchParams({ tab });
  if (page > 1) params.set("page", String(page));
  return `/dam/personen?${params}`;
}

export default async function DamPersonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireMembership();
  const userId = session.user.id;
  const params = await searchParams;
  const rawTab = first(params.tab);
  const tab: TabKey = TABS.some((item) => item.key === rawTab) ? (rawTab as TabKey) : "personen";
  const page = Math.max(1, Number(first(params.page)) || 1);

  const counts = await faceTabCounts(userId);
  const countFor: Record<TabKey, number> = {
    personen: counts.persons,
    unbenannt: counts.unassigned,
    ignoriert: counts.ignored,
  };

  const [persons, tiles, allPersons] = await Promise.all([
    tab === "personen" ? listPersonCards(userId) : Promise.resolve([]),
    tab === "personen"
      ? Promise.resolve([])
      : listFaceTiles(userId, tab === "unbenannt" ? "unassigned" : "ignored", page),
    tab === "unbenannt" ? listDamPersons() : Promise.resolve([]),
  ]);
  const total = countFor[tab];
  const pageCount = Math.max(1, Math.ceil(total / FACE_PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Fotos
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Personen
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Erkannte Gesichter aus Mediathek und deinen Uploads. Benannte Personen stehen
          auf den Fotos im Feld «Personen» und als Keyword.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Ansicht">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            className={`btn px-4 py-1.5 text-sm ${item.key === tab ? "btn-primary" : "btn-ghost"}`}
            aria-current={item.key === tab ? "page" : undefined}
          >
            {item.label} ({countFor[item.key]})
          </Link>
        ))}
      </nav>

      {tab === "personen" ? (
        persons.length === 0 ? (
          <p className="card p-8 text-center text-[var(--muted)]">
            Noch keine Personen. Benenne unter{" "}
            <Link href={tabHref("unbenannt")} className="font-semibold text-[var(--accent)] hover:underline">
              Unbenannt
            </Link>{" "}
            ein Gesicht oder in der Bildvorschau über «Gesichter».
          </p>
        ) : (
          <DamPersonCards persons={persons} />
        )
      ) : tiles.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          {tab === "unbenannt"
            ? "Keine unbenannten Gesichter."
            : "Keine ignorierten Gesichter."}
        </p>
      ) : (
        <>
          <DamFaceTileGrid
            key={`${tab}-${page}`}
            faces={tiles}
            mode={tab === "unbenannt" ? "unassigned" : "ignored"}
            allPersons={allPersons}
          />
          {pageCount > 1 ? (
            <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Seiten">
              {page > 1 ? (
                <Link href={tabHref(tab, page - 1)} className="btn btn-ghost px-3 py-1.5">
                  ← Zurück
                </Link>
              ) : null}
              <span className="text-[var(--muted)]">
                Seite {page} / {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={tabHref(tab, page + 1)} className="btn btn-ghost px-3 py-1.5">
                  Weiter →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
