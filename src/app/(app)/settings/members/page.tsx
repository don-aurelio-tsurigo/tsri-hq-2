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

function roleLabel(role: string) {
  return role === "admin" ? "Admin" : "Mitglied";
}

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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Einstellungen
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Teamverwaltung
          </h1>
        </div>
        <InviteMemberForm appUrl={appUrl} />
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Team ({active.length})
        </h2>
        <ul className="space-y-3">
          {active.map((m) => {
            const incomplete = !m.user.firstName || !m.user.lastName;
            return (
              <li key={m.id} className="card space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
                        {m.user.name}
                      </p>
                      <span
                        className={
                          m.role === "admin" ? "badge" : "badge badge-muted"
                        }
                      >
                        {roleLabel(m.role)}
                      </span>
                      {incomplete ? (
                        <span className="text-xs font-semibold text-[var(--danger)]">
                          Name fehlt
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {m.user.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PensumSelect
                      userId={m.userId}
                      pensumPercent={m.pensumPercent}
                    />
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
            );
          })}
        </ul>
      </section>

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Archiviert ({archived.length})
          </h2>
          <ul className="space-y-3">
            {archived.map((m) => (
              <li
                key={m.id}
                className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4 opacity-80"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
                      {m.user.name}
                    </p>
                    <span className="badge badge-muted">
                      {roleLabel(m.role)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {m.user.email}
                  </p>
                  {m.archivedAt && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Archiviert am{" "}
                      {format(m.archivedAt, "d. MMM yyyy", { locale: de })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Offene Einladungen ({invitations.length})
        </h2>
        {invitations.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-[var(--muted)]">
            Keine offenen Einladungen.
          </div>
        ) : (
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="card flex flex-wrap items-start justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
                      {inv.email}
                    </p>
                    <span className="badge badge-muted">
                      {roleLabel(inv.role)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    Gültig bis{" "}
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
