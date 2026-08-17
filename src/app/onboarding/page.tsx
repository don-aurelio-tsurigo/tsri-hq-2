import { redirect } from "next/navigation";
import { createBootstrapOrganization } from "@/lib/actions";
import { getMembership, requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { nameIsIncomplete } from "@/lib/user-name";

export default async function OnboardingPage() {
  const session = await requireSession();
  const membership = await getMembership(session.user.id);
  if (membership) {
    if (nameIsIncomplete(membership.user)) {
      redirect("/complete-profile");
    }
    redirect("/home");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  });
  if (nameIsIncomplete(user ?? {})) {
    redirect("/complete-profile");
  }

  const orgCount = await prisma.organization.count();

  if (orgCount > 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
        <p className="brand-mark text-sm text-[var(--accent)] uppercase">
          Tsüri HQ 2.0
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Warte auf Einladung
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Es gibt bereits ein Team. Ein Admin muss dich einladen, damit du
          deinen privaten Space bekommst.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <p className="brand-mark text-sm text-[var(--accent)] uppercase">
        Tsüri HQ 2.0
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        Team anlegen
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Noch keine Organisation vorhanden. Als erste Person wirst du Admin.
      </p>
      <form action={createBootstrapOrganization} className="card mt-6 flex flex-col gap-4 p-6">
        <div className="field">
          <label htmlFor="name">Team-Name</label>
          <input id="name" name="name" defaultValue="Tsüri-Team" required />
        </div>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input id="slug" name="slug" defaultValue="team" required />
        </div>
        <button className="btn btn-primary" type="submit">
          Team erstellen
        </button>
      </form>
    </div>
  );
}
