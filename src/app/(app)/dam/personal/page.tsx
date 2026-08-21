import Link from "next/link";
import { DamPersonalGrid } from "@/components/dam-personal-grid";
import { enqueueDamProcessing } from "@/lib/dam/process-queue";
import { listCollections, listPersonalStagingAssets, toPersonalAssetCard } from "@/lib/dam/queries";
import { requireMembership } from "@/lib/session";

export default async function DamPersonalPage() {
  const { session } = await requireMembership();
  const [rows, collections] = await Promise.all([
    listPersonalStagingAssets(session.user.id),
    listCollections(),
  ]);

  const recent = Date.now() - 30 * 60 * 1000;
  enqueueDamProcessing(
    rows
      .filter((row) => !row.altText?.trim() && row.createdAt.getTime() >= recent)
      .map((row) => row.id),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Fotos
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Meine Uploads
          </h1>
        </div>
        <Link href="/dam/upload" className="btn btn-primary">
          Upload
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="card p-8 text-center text-[var(--muted)]">
          Noch keine eigenen Staging-Bilder. Über Upload neue Fotos hinzufügen.
        </p>
      ) : (
        <DamPersonalGrid
          initialAssets={rows.map(toPersonalAssetCard)}
          allCollections={collections}
        />
      )}
    </div>
  );
}
