import { DamUploadWizard } from "@/components/dam-upload-wizard";
import { listCollections, listKnownCredits } from "@/lib/dam/queries";
import { requireMembership } from "@/lib/session";

export default async function DamUploadPage() {
  const { session } = await requireMembership();
  const [knownCredits, collections] = await Promise.all([
    listKnownCredits(),
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
        knownCredits={knownCredits}
        collections={collections}
      />
    </div>
  );
}
