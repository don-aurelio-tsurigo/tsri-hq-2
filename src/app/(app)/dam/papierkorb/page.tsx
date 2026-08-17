import Link from "next/link";
import { DamTrashGrid } from "@/components/dam-trash-grid";
import { listTrashedAssets } from "@/lib/dam/trash";
import { requireMembership } from "@/lib/session";

export default async function DamTrashPage() {
  await requireMembership();
  const rows = await listTrashedAssets();
  const assets = rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    credit: row.credit,
    altText: row.altText,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    width: row.width,
    height: row.height,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Fotos
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Papierkorb
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Gelöschte Archiv-Bilder. Nach 30 Tagen werden Datei und Eintrag endgültig
          entfernt.
        </p>
      </header>

      {assets.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Der Papierkorb ist leer. Im{" "}
          <Link
            href="/dam/archive"
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            Archiv
          </Link>{" "}
          kannst du Bilder in den Papierkorb verschieben.
        </p>
      ) : (
        <DamTrashGrid assets={assets} />
      )}
    </div>
  );
}
