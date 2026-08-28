import { ShiftPlanDirectory } from "@/components/shift-plan-directory";
import {
  listMembersInTagPool,
  mergePickerMembers,
} from "@/lib/membership-grants";
import { canManageEditorial } from "@/lib/permissions";
import {
  ensureShiftPlanTypes,
  listShiftPlanMonth,
  listShiftPlanTypes,
  parseMonthParam,
} from "@/lib/shift-plan";
import { requireMembership } from "@/lib/session";

function parseTypeFilterParam(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function SchichtplanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string | string[] }>;
}) {
  const { membership } = await requireMembership();
  const { month: monthParam, type: typeParam } = await searchParams;
  await ensureShiftPlanTypes(membership.organizationId);

  const monthAnchor = parseMonthParam(monthParam);
  const typeFilter = parseTypeFilterParam(typeParam);

  const [types, calendar, editorialMembers] = await Promise.all([
    listShiftPlanTypes(membership.organizationId),
    listShiftPlanMonth(membership.organizationId, monthAnchor),
    listMembersInTagPool(membership.organizationId, "editorial"),
  ]);

  const members = mergePickerMembers(
    editorialMembers.map((m) => m.user),
    calendar.days.flatMap((day) =>
      day.slots.map((slot) =>
        slot.campaign?.authorId
          ? {
              id: slot.campaign.authorId,
              name: slot.campaign.authorName ?? "Unbekannt",
            }
          : null,
      ),
    ),
  );

  const typeOptions = types.map((t) => ({ id: t.id, name: t.name }));
  const validFilter = typeFilter.filter((id) =>
    typeOptions.some((t) => t.id === id),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Schichtplan
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Monatliche Einsatzplanung für Repo, Briefings und weitere Schichten.
          Vorschläge sind gelb markiert, bis sie bestätigt werden.
        </p>
      </header>

      <ShiftPlanDirectory
        types={typeOptions}
        initialTypeIds={validFilter}
        members={members}
        canManage={canManageEditorial(membership)}
        calendar={{
          monthLabel: calendar.monthLabel,
          monthKey: calendar.monthKey,
          prevMonth: calendar.prevMonth,
          nextMonth: calendar.nextMonth,
          days: calendar.days,
        }}
      />
    </div>
  );
}
