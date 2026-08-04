import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { TaskList } from "@/components/task-list";
import { PrivateNotes } from "@/components/private-notes";
import { listUpcomingCookingForUser } from "@/lib/cooking";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { getCurrentDashboardItems } from "@/lib/tasks";
import { ARTICLE_STAGE_LABELS, isArticleStage } from "@/lib/editorial";
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

  const [
    items,
    user,
    cookingSlots,
    upcomingVacations,
    ferienplanId,
    pendingVacations,
    weekHours,
    pastWeekGaps,
  ] = await Promise.all([
    getCurrentDashboardItems(membership.organizationId, session.user.id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { privateNotes: true },
    }),
    listUpcomingCookingForUser(
      membership.organizationId,
      session.user.id,
      startOfDay(new Date()),
      4,
    ),
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
  ]);

  const tasks = items.filter((i) => i.kind !== "article");
  const articles = items.filter((i) => i.kind === "article");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Privat
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Home
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Hallo {session.user.name.split(" ")[0]} — deine aktuellen Aufgaben und
          Artikel.
        </p>
      </header>

      {isAdmin && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
              Admin To-Dos
              {pendingVacations.length > 0
                ? ` (${pendingVacations.length})`
                : ""}
            </h2>
            {ferienplanId && pendingVacations.length > 0 && (
              <Link
                href={`/spaces/${ferienplanId}`}
                className="text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Zum Ferienplan
              </Link>
            )}
          </div>
          {pendingVacations.length === 0 ? (
            <div className="card px-5 py-6 text-center text-sm text-[var(--muted)]">
              Keine offenen Admin-To-Dos.
            </div>
          ) : (
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
          )}
        </section>
      )}

      {pastWeekGaps.gaps.length > 0 && (
        <section className="rounded-xl border border-[var(--danger)]/25 bg-red-50/80 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--danger)]">
                Arbeitszeit fehlt
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Für die vergangene Woche ({pastWeekGaps.weekLabel}) fehlen noch{" "}
                {pastWeekGaps.gaps.length}{" "}
                {pastWeekGaps.gaps.length === 1 ? "Tag" : "Tage"}:
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--fg)]">
                {pastWeekGaps.gaps
                  .map((g) =>
                    g.reason === "incomplete"
                      ? `${g.dateLabel} (unvollständig)`
                      : g.dateLabel,
                  )
                  .join(" · ")}
              </p>
            </div>
            <Link
              href={`/hours?week=${pastWeekGaps.weekParam}`}
              className="btn btn-primary shrink-0 text-sm"
            >
              Jetzt nachtragen
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Arbeitszeit diese Woche
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
            Aktuelle Artikel ({articles.length})
          </h2>
          {articles[0]?.space && (
            <Link
              href={`/spaces/${articles[0].space.id}`}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Zur Redaktion
            </Link>
          )}
        </div>
        {articles.length === 0 ? (
          <div className="card px-5 py-8 text-center text-[var(--muted)]">
            Keine offenen Artikel zugewiesen.
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {articles.map((article) => (
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
                    {article.space ? ` · ${article.space.name}` : ""}
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
            Aktuelle Aufgaben ({tasks.length})
          </h2>
          <Link
            href="/tasks"
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Zu Tasks
          </Link>
        </div>
        <TaskList tasks={tasks} showSpace />
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

      {cookingSlots.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
              Deine Kochtage
            </h2>
            <Link
              href={`/spaces/${cookingSlots[0]!.space.id}`}
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Zum Kochplan
            </Link>
          </div>
          <ul className="card divide-y divide-[var(--border)] overflow-hidden">
            {cookingSlots.map((slot) => (
              <li key={slot.id} className="px-4 py-3 text-sm">
                {format(slot.date, "EEEE, d. MMMM", { locale: de })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PrivateNotes initialNotes={user?.privateNotes ?? ""} />
    </div>
  );
}
