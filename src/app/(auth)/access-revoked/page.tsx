import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getArchivedMembership,
  getMembership,
  getSession,
} from "@/lib/session";
import { AccessRevokedSignOut } from "@/components/access-revoked-sign-out";

export default async function AccessRevokedPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const active = await getMembership(session.user.id);
  if (active) {
    redirect("/home");
  }

  const archived = await getArchivedMembership(session.user.id);
  if (!archived) {
    redirect("/onboarding");
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
        style={{ background: "var(--gradient-blue)" }}
        aria-hidden
      />
      <div className="relative card space-y-4 p-6">
        <p className="brand-mark text-sm tracking-[0.04em] uppercase">
          Tsüri HQ 2.0
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight">
          Zugang deaktiviert
        </h1>
        <p className="text-[var(--muted)]">
          Dein Account bei{" "}
          <span className="font-semibold text-[var(--fg)]">
            {archived.organization.name}
          </span>{" "}
          wurde archiviert. Du siehst keine Team-Inhalte mehr. Bei Fragen bitte
          eine Admin-Person kontaktieren.
        </p>
        <AccessRevokedSignOut />
        <p className="text-center text-sm text-[var(--muted)]">
          <Link href="/login" className="font-semibold underline underline-offset-2">
            Zur Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
