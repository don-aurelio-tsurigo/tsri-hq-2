import { NewsletterDirectory } from "@/components/newsletter-directory";
import { pageTitle } from "@/lib/link-preview";
import {
  listMembersInTagPool,
  mergePickerMembers,
} from "@/lib/membership-grants";

export const metadata = pageTitle("Newsletter");
import {
  ensureDefaultNewsletterTypes,
  listNewsletterCalendarMonth,
  listNewsletterTypes,
  monthParamKey,
  parseMonthParam,
} from "@/lib/newsletter";
import { ensureShiftPlanTypes } from "@/lib/shift-plan";
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

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string | string[] }>;
}) {
  const { membership } = await requireMembership();
  const { month: monthParam, type: typeParam } = await searchParams;
  await ensureDefaultNewsletterTypes(membership.organizationId);
  await ensureShiftPlanTypes(membership.organizationId);

  const monthAnchor = parseMonthParam(monthParam);
  const typeFilter = parseTypeFilterParam(typeParam);

  const [types, calendar, editorialMembers] = await Promise.all([
    listNewsletterTypes(membership.organizationId),
    listNewsletterCalendarMonth(
      membership.organizationId,
      monthAnchor,
    ),
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
  const validFilter = typeFilter.filter((id) =>
    typeOptions.some((t) => t.id === id),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Newsletter-Plan
          </h1>
        </div>
        <p className="max-w-md text-xs text-[var(--muted)]">
          Autor, Kampagnen-Link und Wordle — gleiche Tabellenansicht wie der
          Schichtplan.
        </p>
      </header>

      <NewsletterDirectory
        types={typeOptions}
        initialTypeIds={validFilter}
        members={members}
        calendar={{
          monthLabel: calendar.monthLabel,
          monthKey: monthParamKey(monthAnchor),
          prevMonth: calendar.prevMonth,
          nextMonth: calendar.nextMonth,
          currentMonth: monthParamKey(new Date()),
          days: calendar.days,
        }}
      />
    </div>
  );
}
