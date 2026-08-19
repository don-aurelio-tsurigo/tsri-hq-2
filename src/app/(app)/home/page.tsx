import Link from "next/link";
import { format, getISOWeek, getISOWeekYear, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { Check, TriangleAlert } from "lucide-react";
import { TaskList } from "@/components/task-list";
import { PrivateNotes } from "@/components/private-notes";
import { HomeBirthday } from "@/components/home-birthday";
import {
  ChoreMidweekReminder,
  TimeGapsReminder,
} from "@/components/home-reminders";
import { listTodaysBirthdays } from "@/lib/birthdays";
import { listAssignedChoresForUser } from "@/lib/chores";
import {
  countUserCookingSlotsInMonth,
  getKochplanSpaceId,
  listUpcomingCookingForUser,
  MONTHLY_COOKING_TARGET,
} from "@/lib/cooking";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { getCurrentDashboardItems } from "@/lib/tasks";
import { listMyHomeArticles } from "@/lib/articles";
import { ARTICLE_STAGE_LABELS, isArticleStage } from "@/lib/editorial";
import { listTodaysTsueriArticles } from "@/lib/editorial-program";
import {
  getFerienplanSpaceId,
  listPendingVacationApprovals,
  listUpcomingOwnVacations,
  VACATION_STATUS_LABELS,
} from "@/lib/vacation";
import { toVacationDateKey } from "@/lib/vacation-constants";
import { formatHours } from "@/lib/time-tracking-constants";
import {
  getCurrentWeekProgress,
  getPastWeekTimeGaps,
} from "@/lib/time-tracking";
function isMidweekChoreReminderDay(date: Date = new Date()) {
  const day = date.getDay(); // 0=So … 3=Mi … 5=Fr
  return day >= 3 && day <= 5;
}

function formatVacationRange(start: Date, end: Date) {
  const sameDay =
    toVacationDateKey(start) === toVacationDateKey(end);
  if (sameDay) {
    return format(start, "d. MMMM yyyy", { locale: de });
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (sameYear) {
    return `${format(start, "d. MMM", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
  }
  return `${format(start, "d. MMM yyyy", { locale: de })} – ${format(end, "d. MMM yyyy", { locale: de })}`;
}

export default async function HomePage() {
  const { session, membership } = await requireMembership();
  const isAdmin = membership.role === "admin";

  const today = new Date();
  const showChoreReminder = isMidweekChoreReminderDay(today);

  const [
    items,
    todaysArticles,
    myArticles,
    redaktionSpace,
    user,
    cookingSlots,
    cookingMonth,
    upcomingVacations,
    ferienplanId,
    pendingVacations,
    weekHours,
    pastWeekGaps,
    assignedChores,
    todaysBirthdays,
  ] = await Promise.all([
    getCurrentDashboardItems(
      membership.organizationId,
      session.user.id,
      session.user.firstName?.trim() || session.user.name,
    ),
    listTodaysTsueriArticles(membership.organizationId),
    listMyHomeArticles(membership.organizationId, session.user.id),
    prisma.space.findFirst({
      where: {
        organizationId: membership.organizationId,
        slug: "redaktion",
      },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { privateNotes: true },
    }),
    listUpcomingCookingForUser(
      membership.organizationId,
      session.user.id,
      startOfDay(today),
      4,
    ),
    getKochplanSpaceId(membership.organizationId).then(async (spaceId) => {
      if (!spaceId) return { spaceId: null, count: 0 };
      const count = await countUserCookingSlotsInMonth(
        spaceId,
        session.user.id,
      );
      return { spaceId, count };
    }),
    listUpcomingOwnVacations(
      membership.organizationId,
      session.user.id,
      3,
    ),
    getFerienplanSpaceId(membership.organizationId),
    isAdmin
      ? listPendingVacationApprovals(membership.organizationId)
      : Promise.resolve([]),
    getCurrentWeekProgress(
      membership.organizationId,
      session.user.id,
      membership.pensumPercent,
    ),
    getPastWeekTimeGaps(
      membership.organizationId,
      session.user.id,
      membership.pensumPercent,
    ),
    showChoreReminder
      ? listAssignedChoresForUser(
          membership.organizationId,
          session.user.id,
        )
      : Promise.resolve([]),
    listTodaysBirthdays(membership.organizationId),
  ]);

  const ownBirthday = todaysBirthdays.some((p) => p.id === session.user.id);
  const otherBirthdayNames = todaysBirthdays
    .filter((p) => p.id !== session.user.id)
    .map((p) => p.name);

  const kochplanId = cookingMonth.spaceId;
  const cookingMonthCount = cookingMonth.count;

  const HOME_TASK_LIMIT = 10;
  const tasks = items;
  const visibleTasks = tasks.slice(0, HOME_TASK_LIMIT);
  const taskCountLabel =
    tasks.length > HOME_TASK_LIMIT
      ? `${HOME_TASK_LIMIT} von ${tasks.length}`
      : String(tasks.length);
  const choreWeekKey = `${getISOWeekYear(today)}-W${String(getISOWeek(today)).padStart(2, "0")}`;
  const redaktionLink = redaktionSpace?.id ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Privat
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Home
        </h1>
      </header>

      <HomeBirthday
        isOwnBirthday={ownBirthday}
        otherNames={otherBirthdayNames}
      />

      {isAdmin && pendingVacations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
              Admin To-Dos ({pendingVacations.length})
            </h2>
            {ferienplanId && (
              <Link
                href={`/spaces/${ferienplanId}`}
                className="text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Zum Ferienplan
              </Link>
            )}
          </div>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {pendingVacations.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">Ferien genehmigen</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {request.user.name} ·{" "}
                    {formatVacationRange(request.startDate, request.endDate)}
                    {request.note ? ` · ${request.note}` : ""}
                  </p>
                </div>
                {ferienplanId && (
                  <Link
                    href={`/spaces/${ferienplanId}`}
                    className="shrink-0 text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    Prüfen
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pastWeekGaps.gaps.length > 0 && (
        <TimeGapsReminder
          weekLabel={pastWeekGaps.weekLabel}
          weekParam={pastWeekGaps.weekParam}
          gaps={pastWeekGaps.gaps}
        />
      )}

      {showChoreReminder && assignedChores.length > 0 && (
        <ChoreMidweekReminder
          weekKey={choreWeekKey}
          chores={assignedChores.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
          }))}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Heute auf Tsüri
          </h2>
          {redaktionLink && (
            <Link
              href={`/spaces/${redaktionLink}#programm`}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Zum Programm
            </Link>
          )}
        </div>
        {todaysArticles.length === 0 ? (
          <div className="card px-5 py-8 text-center text-[var(--muted)]">
            Heute keine Artikel geplant
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {todaysArticles.map((article) => (
              <li
                key={article.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{article.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {article.stage && isArticleStage(article.stage)
                      ? ARTICLE_STAGE_LABELS[article.stage]
                      : article.stage ?? "—"}
                    {article.assignee ? ` · ${article.assignee.name}` : ""}
                  </p>
                </div>
                {article.space && (
                  <Link
                    href={`/spaces/${article.space.id}`}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Öffnen
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {myArticles.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
              Meine Artikel ({myArticles.length})
            </h2>
            {myArticles[0]?.space && (
              <Link
                href={`/spaces/${myArticles[0].space.id}`}
                className="text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Zur Redaktion
              </Link>
            )}
          </div>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {myArticles.map((article) => (
              <li
                key={article.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{article.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {article.stage && isArticleStage(article.stage)
                      ? ARTICLE_STAGE_LABELS[article.stage]
                      : article.stage ?? "—"}
                    {article.publishAt
                      ? ` · ${format(article.publishAt, "d. MMM yyyy", { locale: de })}`
                      : ""}
                  </p>
                </div>
                {article.space && (
                  <Link
                    href={`/spaces/${article.space.id}`}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Öffnen
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Aktuelle Aufgaben ({taskCountLabel})
          </h2>
          <Link
            href="/tasks"
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Zu Tasks
          </Link>
        </div>
        <TaskList tasks={visibleTasks} showSpace compact />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Deine Arbeitszeit
          </h2>
          <Link
            href="/hours"
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Zur Erfassung
          </Link>
        </div>
        <div className="card grid grid-cols-3 gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Ist
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums">
              {formatHours(weekHours.istHours)} h
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Soll
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums">
              {formatHours(weekHours.sollHours)} h
            </p>
            <p className="text-xs text-[var(--muted)]">
              {membership.pensumPercent}% Pensum
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Differenz
            </p>
            <p
              className={[
                "mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums",
                weekHours.diffHours > 0.01
                  ? "text-emerald-700"
                  : weekHours.diffHours < -0.01
                    ? "text-[var(--danger)]"
                    : "",
              ].join(" ")}
            >
              {weekHours.diffHours > 0 ? "+" : ""}
              {formatHours(weekHours.diffHours)} h
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Deine nächsten Ferien
          </h2>
          {ferienplanId && (
            <Link
              href={`/spaces/${ferienplanId}`}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Zum Ferienplan
            </Link>
          )}
        </div>
        {upcomingVacations.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-[var(--muted)]">
            Keine kommenden Ferien eingetragen.
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {upcomingVacations.map((vac) => (
              <li
                key={vac.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {formatVacationRange(vac.startDate, vac.endDate)}
                  </p>
                  {vac.note && (
                    <p className="mt-1 text-xs text-[var(--muted)]">{vac.note}</p>
                  )}
                </div>
                <span
                  className={
                    vac.status === "approved"
                      ? "badge badge-done"
                      : "badge badge-doing"
                  }
                >
                  {VACATION_STATUS_LABELS[vac.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {kochplanId && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] uppercase">
              Deine Kochtage
              <span
                className="inline-flex items-center gap-1 font-normal normal-case tabular-nums"
                title="Self-Koch-Einträge im laufenden Monat"
              >
                ({cookingMonthCount} · Ø{" "}
                {Number.isInteger(MONTHLY_COOKING_TARGET)
                  ? MONTHLY_COOKING_TARGET
                  : String(MONTHLY_COOKING_TARGET).replace(".", ",")}
                /Monat)
                {cookingMonthCount >= MONTHLY_COOKING_TARGET ? (
                  <Check
                    className="size-3.5 text-emerald-700"
                    aria-label="Monatsquote erreicht"
                  />
                ) : (
                  <TriangleAlert
                    className="size-3.5 text-amber-600"
                    aria-label="Monatsquote noch nicht erreicht"
                  />
                )}
              </span>
            </h2>
            <Link
              href={`/spaces/${kochplanId}`}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Zum Kochplan
            </Link>
          </div>
          {cookingSlots.length === 0 ? (
            <div className="card px-5 py-6 text-center text-sm text-[var(--muted)]">
              Keine kommenden Kochtage eingetragen.
            </div>
          ) : (
            <ul className="card divide-y divide-[var(--border)] overflow-hidden">
              {cookingSlots.map((slot) => (
                <li key={slot.id} className="px-4 py-3 text-sm">
                  {format(slot.date, "EEEE, d. MMMM", { locale: de })}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <PrivateNotes initialNotes={user?.privateNotes ?? ""} />
    </div>
  );
}
