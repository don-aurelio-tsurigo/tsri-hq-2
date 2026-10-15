import { ShiftPlanDirectory } from "@/components/shift-plan-directory";
import { pageTitle } from "@/lib/link-preview";
import {
  listMembersInTagPool,
  mergePickerMembers,
} from "@/lib/membership-grants";

export const metadata = pageTitle("Schichtplan");
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
): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || null;
}

export default async function SchichtplanPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    type?: string | string[];
    mine?: string;
  }>;
}) {
  const { session, membership } = await requireMembership();
  const {
    month: monthParam,
    type: typeParam,
    mine: mineParam,
  } = await searchParams;
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

  const typeOptions = types.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
  }));
  const validTypeId =
    typeFilter && typeOptions.some((t) => t.id === typeFilter)
      ? typeFilter
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Schichtplan
          </h1>
        </div>
        <p className="max-w-md text-xs text-[var(--muted)]">
          Vorschläge sind gestrichelt markiert, bis sie bestätigt werden.
        </p>
      </header>

      <ShiftPlanDirectory
        types={typeOptions}
        initialTypeId={validTypeId}
        initialMineOnly={mineParam === "1"}
        currentUserId={session.user.id}
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
