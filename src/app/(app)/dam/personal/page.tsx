import Link from "next/link";
import { DamPersonalGrid } from "@/components/dam-personal-grid";
import { parseEditParams } from "@/lib/dam/edit-params";
import { listCollections, listPersonalStagingAssets } from "@/lib/dam/queries";
import { requireMembership } from "@/lib/session";

export default async function DamPersonalPage() {
  const { session } = await requireMembership();
  const [rows, collections] = await Promise.all([
    listPersonalStagingAssets(session.user.id),
    listCollections(),
  ]);

  const assets = rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    credit: row.credit,
    rating: row.rating,
    editParams: parseEditParams(row.editParams),
    collections: row.collections.map((link) => link.collection),
    altText: row.altText,
    keywords: row.keywords,
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    width: row.width,
    height: row.height,
    rightsType: row.rightsType,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Fotos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Meine Fotos
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Deine Staging-Bilder: bewerten, schneiden, Collections zuweisen oder ins
            Archiv verschieben.
          </p>
        </div>
        <Link href="/dam/upload" className="btn btn-primary">
          Upload
        </Link>
      </header>
      {assets.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Noch keine eigenen Staging-Bilder. Über Upload neue Fotos hinzufügen.
        </p>
      ) : (
        <DamPersonalGrid initialAssets={assets} allCollections={collections} />
      )}
    </div>
  );
}
