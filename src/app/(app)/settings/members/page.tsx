import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  InviteMemberForm,
  RevokeInviteButton,
} from "@/components/invite-form";
import { PensumSelect } from "@/components/pensum-select";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export default async function MembersSettingsPage() {
  const { membership } = await requireAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: membership.organizationId,
        acceptedAt: null,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Einstellungen
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Mitglieder & Einladen
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Jede eingeladene Person bekommt einen vollen Account und automatisch
          einen privaten Space.
        </p>
      </header>

      <InviteMemberForm appUrl={appUrl} />

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Team ({members.length})
        </h2>
        <ul className="card divide-y divide-[var(--border)]">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{m.user.name}</p>
                <p className="text-sm text-[var(--muted)]">{m.user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <PensumSelect
                  userId={m.userId}
                  pensumPercent={m.pensumPercent}
                />
                <span className="badge">{m.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Offene Einladungen
        </h2>
        {invitations.length === 0 ? (
          <div className="card px-4 py-6 text-sm text-[var(--muted)]">
            Keine offenen Einladungen.
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{inv.email}</p>
                  <p className="text-sm text-[var(--muted)]">
                    Rolle {inv.role} · gültig bis{" "}
                    {format(inv.expiresAt, "d. MMM yyyy", { locale: de })}
                  </p>
                  <code className="mt-1 block break-all text-xs text-[var(--muted)]">
                    {appUrl}/invite/{inv.token}
                  </code>
                </div>
                <RevokeInviteButton id={inv.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
