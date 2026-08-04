import { NewsletterDirectory } from "@/components/newsletter-directory";
import { prisma } from "@/lib/db";
import {
  ensureDefaultNewsletterTypes,
  listNewsletterCalendarMonth,
  listNewsletterTypes,
  monthParamKey,
  parseMonthParam,
  type NewsletterFrequencyValue,
} from "@/lib/newsletter";
import { requireMembership } from "@/lib/session";

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { session, membership } = await requireMembership();
  const { month: monthParam } = await searchParams;
  await ensureDefaultNewsletterTypes(membership.organizationId);

  const monthAnchor = parseMonthParam(monthParam);

  const [types, calendar, members] = await Promise.all([
    listNewsletterTypes(membership.organizationId),
    listNewsletterCalendarMonth(
      membership.organizationId,
      monthAnchor,
    ),
    prisma.membership.findMany({
      where: {
        organizationId: membership.organizationId,
        archivedAt: null,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Newsletter-Plan
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Feste Erscheinungstage im Kalender — Slots mit Autor und Link buchen
          oder bei Feiertag/Sommerpause ausfallen lassen.
        </p>
      </header>

      <NewsletterDirectory
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          frequency: t.frequency as NewsletterFrequencyValue,
          weekdays: t.weekdays,
        }))}
        members={members.map((m) => m.user)}
        currentUserId={session.user.id}
        calendar={{
          monthLabel: calendar.monthLabel,
          prevMonth: calendar.prevMonth,
          nextMonth: calendar.nextMonth,
          currentMonth: monthParamKey(new Date()),
          days: calendar.days,
        }}
      />
    </div>
  );
}
