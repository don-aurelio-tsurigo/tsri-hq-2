import { ShiftPlanSettings } from "@/components/shift-plan-settings";
import { listMembersInTagPool } from "@/lib/membership-grants";
import {
  ensureShiftPlanTypes,
  listCouncilSessionStubs,
  listShiftPlanTypes,
  listShiftQuotas,
} from "@/lib/shift-plan";
import { requireEditorialLead } from "@/lib/session";

export default async function ShiftPlanSettingsPage() {
  const { membership } = await requireEditorialLead();
  await ensureShiftPlanTypes(membership.organizationId);

  const [types, members, quotas, councilStubs] = await Promise.all([
    listShiftPlanTypes(membership.organizationId),
    listMembersInTagPool(membership.organizationId, "editorial"),
    listShiftQuotas(membership.organizationId),
    listCouncilSessionStubs(membership.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Schichtplan-Einstellungen
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Schichtregeln pro Person und Gemeinderats-Termine für die monatliche
          Einsatzplanung. Fixe freie Tage setzt die Admin-Teamverwaltung. Repo
          erscheint nur im Schichtplan, nicht im Newsletter-Kalender.
        </p>
      </header>

      <ShiftPlanSettings
        members={members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
        }))}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          isEveningShift: t.isEveningShift,
          isNewsletter: t.isNewsletter,
        }))}
        quotas={quotas.map((q) => ({
          id: q.id,
          userId: q.userId,
          newsletterTypeId: q.newsletterTypeId,
          minCount: q.minCount,
          maxCount: q.maxCount,
          isFixed: q.isFixed,
        }))}
        councilStubs={councilStubs.map((s) => ({
          id: s.id,
          dateKey: s.date.toISOString().slice(0, 10),
          status: s.status,
          note: s.note,
          authorName: s.author?.name ?? null,
        }))}
      />
    </div>
  );
}
