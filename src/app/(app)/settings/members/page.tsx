import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  InviteMemberForm,
  RevokeInviteButton,
} from "@/components/invite-form";
import {
  ArchiveMemberButton,
  RestoreMemberButton,
} from "@/components/member-archive-buttons";
import { MemberPasswordHelp } from "@/components/member-password-help";
import { MemberNameEdit } from "@/components/member-name-edit";
import { MemberCapabilityGrants } from "@/components/member-capability-grants";
import { PensumSelect } from "@/components/pensum-select";
import { prisma } from "@/lib/db";
import { getPublicAppOrigin } from "@/lib/app-url";
import { requireAdmin } from "@/lib/session";

export default async function MembersSettingsPage() {
  const { session, membership } = await requireAdmin();
  const appUrl = getPublicAppOrigin();

  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: true, grants: true },
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

  const active = members.filter((m) => !m.archivedAt);
  const archived = members.filter((m) => m.archivedAt);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Einstellungen
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Teamverwaltung
        </h1>
      </header>

      <InviteMemberForm appUrl={appUrl} />

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Team ({active.length})
        </h2>
        <ul className="card divide-y divide-[var(--border)]">
          {active.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-3 px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{m.user.name}</p>
                <p className="text-sm text-[var(--muted)]">{m.user.email}</p>
                {(!m.user.firstName || !m.user.lastName) && (
                  <p className="mt-0.5 text-xs font-semibold text-[var(--danger)]">
                    Vor- oder Nachname fehlt
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <PensumSelect
                  userId={m.userId}
                  pensumPercent={m.pensumPercent}
                />
                <span className="badge">{m.role}</span>
                <MemberNameEdit
                  userId={m.userId}
                  firstName={m.user.firstName}
                  lastName={m.user.lastName}
                />
                <MemberPasswordHelp
                  userId={m.userId}
                  name={m.user.name}
                />
                {m.userId !== session.user.id && (
                  <ArchiveMemberButton
                    userId={m.userId}
                    name={m.user.name}
                  />
                )}
              </div>
              </div>
              <MemberCapabilityGrants
                userId={m.userId}
                isAdmin={m.role === "admin"}
                granted={m.grants.map((g) => g.capability)}
              />
            </li>
          ))}
        </ul>
      </section>

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Archiviert ({archived.length})
          </h2>
          <ul className="card divide-y divide-[var(--border)]">
            {archived.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-[var(--muted)]">
                    {m.user.name}
                  </p>
                  <p className="text-sm text-[var(--muted)]">{m.user.email}</p>
                  {m.archivedAt && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Archiviert am{" "}
                      {format(m.archivedAt, "d. MMM yyyy", { locale: de })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="badge">{m.role}</span>
                  <MemberNameEdit
                    userId={m.userId}
                    firstName={m.user.firstName}
                    lastName={m.user.lastName}
                  />
                  <RestoreMemberButton userId={m.userId} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
