import Link from "next/link";
import { ShiftPlanSettings } from "@/components/shift-plan-settings";
import { pageTitle } from "@/lib/link-preview";
import { listMembersInTagPool } from "@/lib/membership-grants";
import {
  ensureShiftPlanTypes,
  listShiftPlanTypes,
  listShiftQuotas,
} from "@/lib/shift-plan";
import { requireEditorialLead } from "@/lib/session";

export const metadata = pageTitle("Schichtplan-Einstellungen");

export default async function ShiftPlanSettingsPage() {
  const { membership } = await requireEditorialLead();
  await ensureShiftPlanTypes(membership.organizationId);

  const [types, members, quotas] = await Promise.all([
    listShiftPlanTypes(membership.organizationId),
    listMembersInTagPool(membership.organizationId, "editorial"),
    listShiftQuotas(membership.organizationId),
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
          Schichtregeln pro Person für die monatliche Einsatzplanung. Fixe
          freie Tage setzt die Admin-Teamverwaltung. Repo erscheint nur im
          Schichtplan, nicht im Newsletter-Kalender. Sitzungsfreie
          Gemeinderats-Wochen und Sommerpausen als Pausen in den{" "}
          <Link
            href="/settings/newsletter"
            className="underline underline-offset-2"
          >
            Newsletter-Einstellungen
          </Link>{" "}
          eintragen.
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
      />
    </div>
  );
}
