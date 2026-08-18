import { DamUploadWizard } from "@/components/dam-upload-wizard";
import { listCollections, listRecentCredits } from "@/lib/dam/queries";
import { requireMembership } from "@/lib/session";

export default async function DamUploadPage() {
  const { session } = await requireMembership();
  const [recentCredits, collections] = await Promise.all([
    listRecentCredits(session.user.id),
    listCollections(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Fotos
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Upload
        </h1>
      </header>
      <DamUploadWizard
        userName={session.user.name}
        recentCredits={recentCredits}
        collections={collections}
      />
    </div>
  );
}
