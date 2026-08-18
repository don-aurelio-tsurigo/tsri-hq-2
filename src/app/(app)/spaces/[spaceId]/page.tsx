import { addDays, format, getISOWeek, isBefore, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { notFound, redirect } from "next/navigation";
import { CreateTaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { EditorialKanban } from "@/components/editorial-kanban";
import { EditorialProgram } from "@/components/editorial-program";
import { OfficeDirectory } from "@/components/office-directory";
import { ChorePlan } from "@/components/chore-plan";
import { CookingPlan } from "@/components/cooking-plan";
import { VacationPlan } from "@/components/vacation-plan";
import { WikiSpace } from "@/components/wiki-space";
import { NewsFeed } from "@/components/news-feed";
import { canEditSpace, canViewSpace, canManageEditorial } from "@/lib/permissions";
import { requireMembership } from "@/lib/session";
import {
  listMembersInTagPool,
  mergePickerMembers,
} from "@/lib/membership-grants";
import { listSpaceTasks } from "@/lib/tasks";
import { listArticles } from "@/lib/articles";
import {
  ensureDefaultEigenleistungRubriken,
  listEigenleistungRubriken,
} from "@/lib/eigenleistung";
import {
  ensureDefaultArticleCategories,
  listArticleCategories,
} from "@/lib/article-categories";
import {
  formatProgramDay,
  formatWeekRange,
  getWeekMonday as getProgramWeekMonday,
  listProgramArticles,
  parseWeekParam as parseProgramWeekParam,
  toDateKey as programDateKey,
  weekDays,
} from "@/lib/editorial-program";
import { ensureDefaultChores, listChores } from "@/lib/chores";
import {
  getWeekMonday,
  isCookingWeekday,
  listCookingSlots,
  countUserCookingSlotsInMonth,
  MONTHLY_COOKING_TARGET,
  parseWeekParam,
  toDateKey,
  weekDatesForWeek,
} from "@/lib/cooking";
import { listVisibleVacationRequests, toDateKey as vacationDateKey } from "@/lib/vacation";
import {
  ensureWikiStarterPages,
  getWikiPageBySlug,
  listWikiPages,
} from "@/lib/wiki";
import {
  countNewsItemsByStatus,
  listConfiguredSources,
  listNewsItems,
} from "@/lib/news-feed";
import { isNewsItemStatus } from "@/lib/news-feed-constants";
import { prisma } from "@/lib/db";

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{
    week?: string;
    page?: string;
    status?: string;
    source?: string;
  }>;
}) {
  const { spaceId } = await params;
  const {
    week: weekParam,
    page: pageSlug,
    status: statusParam,
    source: sourceParam,
  } = await searchParams;
  const { session, membership } = await requireMembership();

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { access: true },
  });

  if (!space || !canViewSpace(session.user, space, membership)) {
    notFound();
  }

  if (space.type === "personal") {
    notFound();
  }

  if (space.type === "project") {
    redirect(`/projects/${space.id}`);
  }

  if (space.slug === "projekte") {
    redirect("/projects");
  }

  if (space.slug === "buero") {
    const teamInfos = await prisma.space.findFirst({
      where: {
        organizationId: membership.organizationId,
        slug: "team-infos",
      },
      select: { id: true },
    });
    redirect(teamInfos ? `/spaces/${teamInfos.id}` : "/home");
  }

  const canEdit = canEditSpace(session.user, space, membership);

  if (space.slug === "wiki") {
    await ensureWikiStarterPages(
      membership.organizationId,
      session.user.id,
    );

    const pages = await listWikiPages(membership.organizationId, space.id);
    const rootPages = pages.filter((p) => p.parentId === null);

    let currentPage = null;
    if (pageSlug) {
      const detail = await getWikiPageBySlug(
        membership.organizationId,
        pageSlug,
      );
      if (!detail || detail.slug !== pageSlug) {
        notFound();
      }
      // Ensure page belongs to this wiki space
      const inSpace = pages.some((p) => p.id === detail.id);
      if (!inSpace) notFound();

      currentPage = {
        id: detail.id,
        title: detail.title,
        slug: detail.slug,
        parentId: detail.parentId,
        sortOrder: detail.sortOrder,
        pinned: detail.pinned,
        body: detail.body,
        updatedAt: detail.updatedAt.toISOString(),
        createdBy: detail.createdBy,
        updatedBy: detail.updatedBy,
      };
    }

    return (
      <WikiSpace
        spaceId={space.id}
        pages={pages}
        currentPage={currentPage}
        rootPages={rootPages}
      />
    );
  }

  if (space.slug === "redaktion") {
    await Promise.all([
      ensureDefaultEigenleistungRubriken(membership.organizationId),
      ensureDefaultArticleCategories(membership.organizationId),
    ]);

    const monday = parseProgramWeekParam(weekParam);
    const days = weekDays(monday);
    const today = startOfDay(new Date());

    const [allArticles, programArticles, editorialMembers, rubriken, categories] =
      await Promise.all([
        listArticles(space.id),
        listProgramArticles(space.id),
        listMembersInTagPool(membership.organizationId, "editorial"),
        listEigenleistungRubriken(membership.organizationId),
        listArticleCategories(membership.organizationId),
      ]);

    const memberUsers = mergePickerMembers(
      editorialMembers.map((m) => m.user),
      [
        ...allArticles.map((a) => a.assignee),
        ...programArticles.map((a) => a.assignee),
      ],
    );

    const serialized = allArticles.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      publishAt: a.publishAt ? a.publishAt.toISOString().slice(0, 10) : null,
      archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
    }));

    return (
      <div className="mx-auto max-w-7xl space-y-10">
        <header id="artikel">
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {space.name}
          </h1>
          <p className="mt-2 max-w-3xl text-[var(--muted)]">
            Artikel-Kanban oben — mit Publikationsdatum erscheinen Beiträge
            automatisch im Programm darunter.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
            Artikel
          </h2>
          <EditorialKanban
            spaceId={space.id}
            articles={serialized}
            members={memberUsers}
            rubriken={rubriken}
            categories={categories}
            canEdit={canEdit}
            isAdmin={canManageEditorial(membership)}
          />
        </section>

        <section id="programm" className="space-y-4 border-t border-[var(--border)] pt-8">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              Programm
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Kalender der Artikel mit Publikationsdatum.
            </p>
          </div>
          <EditorialProgram
            weekLabel={formatWeekRange(monday)}
            prevWeek={programDateKey(addDays(monday, -7))}
            nextWeek={programDateKey(addDays(monday, 7))}
            currentWeek={programDateKey(getProgramWeekMonday())}
            days={days.map((date) => {
              const day = startOfDay(date);
              return {
                dateKey: programDateKey(date),
                label: formatProgramDay(date),
                isToday: day.getTime() === today.getTime(),
                isPast: isBefore(day, today),
              };
            })}
            articles={programArticles.map((a) => ({
              id: a.id,
              title: a.title,
              description: a.description,
              stage: a.stage,
              categoryId: a.categoryId,
              category: a.category,
              publishAt: a.publishAt ? programDateKey(a.publishAt) : null,
              assigneeId: a.assigneeId,
              assignee: a.assignee,
              createdAt: a.createdAt.toISOString(),
              createdBy: a.createdBy,
            }))}
            members={memberUsers}
            categories={categories.filter((c) => c.active)}
          />
        </section>
      </div>
    );
  }

  if (space.slug === "team-infos") {
    const members = await prisma.membership.findMany({
      where: {
            organizationId: membership.organizationId,
            archivedAt: null,
          },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            birthDate: true,
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    const people = members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      birthDate: m.user.birthDate
        ? m.user.birthDate.toISOString().slice(0, 10)
        : null,
      pensumPercent: m.pensumPercent,
    }));

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Team
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Team Infos
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Kontaktdaten, Pensum und Geburtstage aller Teammitglieder.
          </p>
        </header>

        <OfficeDirectory
          people={people}
          currentUserId={session.user.id}
          isAdmin={membership.role === "admin"}
        />
      </div>
    );
  }

  if (space.slug === "aemliplan") {
    await ensureDefaultChores(space.id, session.user.id);
    const [chores, members] = await Promise.all([
      listChores(space.id),
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
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Team
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Ämtliplan
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Büro-Ämtli mit Beschreibung und Zuweisung an mehrere Personen.
          </p>
        </header>

        <ChorePlan
          spaceId={space.id}
          chores={chores.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            assignments: c.assignments.map((a) => ({
              user: { id: a.user.id, name: a.user.name },
            })),
          }))}
          members={members.map((m) => m.user)}
          canEdit={canEdit}
        />
      </div>
    );
  }

  if (space.slug === "kochplan") {
    const monday = parseWeekParam(weekParam);
    const weekMondays = [0, 1, 2, 3].map((offset) => addDays(monday, offset * 7));
    const allDates = weekMondays.flatMap((m) => weekDatesForWeek(m));
    const from = allDates[0]!;
    const to = allDates[allDates.length - 1]!;
    const today = startOfDay(new Date());

    const [slots, members, monthSelfCookCount] = await Promise.all([
      listCookingSlots(space.id, from, to),
      prisma.membership.findMany({
        where: {
            organizationId: membership.organizationId,
            archivedAt: null,
          },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      countUserCookingSlotsInMonth(space.id, session.user.id),
    ]);

    const byDate = new Map(
      slots.map((s) => [
        toDateKey(s.date),
        {
          user: s.user,
          assignedBy: s.assignedBy,
        },
      ] as const),
    );

    const weeks = weekMondays.map((weekMonday, index) => {
      const dates = weekDatesForWeek(weekMonday);
      const prevMonday = index > 0 ? weekMondays[index - 1]! : null;
      const showMonth =
        !prevMonday ||
        format(weekMonday, "yyyy-MM") !== format(prevMonday, "yyyy-MM");
      return {
        weekKey: toDateKey(weekMonday),
        isoWeek: getISOWeek(weekMonday),
        weekLabel: `${format(dates[0]!, "d.M.", { locale: de })}–${format(
          dates[dates.length - 1]!,
          "d.M.",
          { locale: de },
        )}`,
        monthLabel: showMonth
          ? format(weekMonday, "MMMM yyyy", { locale: de })
          : null,
        days: dates.map((date) => {
          const dateKey = toDateKey(date);
          const day = startOfDay(date);
          const slot = byDate.get(dateKey) ?? null;
          const canCook = isCookingWeekday(date);
          return {
            dateKey,
            weekdayShort: format(date, "EEEEEE", { locale: de }),
            dayMonth: format(date, "d.M.", { locale: de }),
            isToday: day.getTime() === today.getTime(),
            isPast: isBefore(day, today),
            canCook,
            user: slot?.user
              ? { id: slot.user.id, name: slot.user.name }
              : null,
            assignedBy: slot?.assignedBy
              ? { id: slot.assignedBy.id, name: slot.assignedBy.name }
              : null,
          };
        }),
      };
    });

    const periodLabel = (() => {
      const startMonth = format(from, "MMMM yyyy", { locale: de });
      const endMonth = format(to, "MMMM yyyy", { locale: de });
      return startMonth === endMonth
        ? startMonth
        : `${format(from, "MMM", { locale: de })} – ${format(to, "MMM yyyy", { locale: de })}`;
    })();

    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <header>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Team
          </p>
          <h1 className="mt-0.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Kochplan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Woche Mo–So — eintragen nur Dienstag bis Freitag.
          </p>
        </header>

        <CookingPlan
          spaceId={space.id}
          weeks={weeks}
          periodLabel={periodLabel}
          prevWeek={toDateKey(addDays(monday, -28))}
          nextWeek={toDateKey(addDays(monday, 28))}
          currentWeek={toDateKey(getWeekMonday())}
          members={members.map((m) => m.user)}
          currentUserId={session.user.id}
          monthSelfCookCount={monthSelfCookCount}
          monthCookTarget={MONTHLY_COOKING_TARGET}
        />
      </div>
    );
  }

  if (space.slug === "quellen") {
    const resolvedStatus =
      statusParam === "all"
        ? null
        : statusParam && isNewsItemStatus(statusParam)
          ? statusParam
          : "neu";
    const sourceFilter =
      sourceParam && sourceParam.length > 0 ? sourceParam : "";

    const [items, statusCounts] = await Promise.all([
      listNewsItems(membership.organizationId, {
        status: resolvedStatus,
        source: sourceFilter || null,
      }),
      countNewsItemsByStatus(membership.organizationId),
    ]);
    const sources = listConfiguredSources();

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Newsfeed
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Lokale Zürich-Quellen alle paar Minuten einlesen und reviewen —
            getrennt vom Redaktions-Kanban.
          </p>
        </header>

        <NewsFeed
          items={items}
          sources={sources.map((s) => ({ key: s.key, label: s.label }))}
          statusCounts={statusCounts}
          initialStatus={resolvedStatus ?? ""}
          initialSource={sourceFilter}
        />
      </div>
    );
  }

  if (space.slug === "ferienplan") {
    const isAdmin = membership.role === "admin";
    const requests = await listVisibleVacationRequests(
      membership.organizationId,
      session.user.id,
      isAdmin,
    );

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Team
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Ferienplan
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Trage deine Ferien ein. Admins freigeben die Anfragen — genehmigte
            Einträge sieht das ganze Team im Monatskalender.
          </p>
        </header>

        <VacationPlan
          currentUserId={session.user.id}
          isAdmin={isAdmin}
          requests={requests.map((r) => ({
            id: r.id,
            startDate: vacationDateKey(r.startDate),
            endDate: vacationDateKey(r.endDate),
            note: r.note,
            status: r.status,
            user: r.user,
            reviewedBy: r.reviewedBy,
          }))}
        />
      </div>
    );
  }

  const tasks = await listSpaceTasks(space.id);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Team
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {space.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          {space.description ?? "Geteilter Space für euer Team."}
        </p>
      </header>

      {canEdit && <CreateTaskForm spaceId={space.id} />}

      <TaskList tasks={tasks} />
    </div>
  );
}
