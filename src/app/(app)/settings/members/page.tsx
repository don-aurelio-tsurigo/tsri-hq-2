import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  InviteMemberForm,
  RevokeInviteButton,
} from "@/components/invite-form";
import { TeamMembersPanel } from "@/components/team-members";
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

      <TeamMembersPanel
        currentUserId={session.user.id}
        active={active.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          pensumPercent: m.pensumPercent,
          archivedAt: null,
          user: {
            name: m.user.name,
            email: m.user.email,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
          },
          grants: m.grants.map((g) => g.capability),
        }))}
        archived={archived.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          pensumPercent: m.pensumPercent,
          archivedAt: m.archivedAt?.toISOString() ?? null,
          user: {
            name: m.user.name,
            email: m.user.email,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
          },
          grants: m.grants.map((g) => g.capability),
        }))}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Offene Einladungen ({invitations.length})
        </h2>
        {invitations.length === 0 ? (
          <div className="card px-4 py-3 text-sm text-[var(--muted)]">
            Keine offenen Einladungen.
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 px-4 py-1.5"
              >
                <span className="min-w-0 truncate font-medium">
                  {inv.email}
                </span>
                <span className="badge badge-muted shrink-0">
                  {roleLabel(inv.role)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)]">
                  bis {format(inv.expiresAt, "d. MMM yyyy", { locale: de })}
                </span>
                <RevokeInviteButton id={inv.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
