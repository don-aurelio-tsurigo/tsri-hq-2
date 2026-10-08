"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { setArticlePublishAt, updateArticle } from "@/lib/actions";
import { ARTICLE_STAGE_LABELS, isArticleStage } from "@/lib/editorial";
import { ArticleEditorDialog } from "@/components/article-editor-dialog";

type ProgramCategory = {
  id: string;
  name: string;
  color: string;
};

type ProgramArticle = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  categoryId: string | null;
  category: ProgramCategory | null;
  publishAt: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

type Member = { id: string; name: string };

type DayColumn = {
  dateKey: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
};

type ViewMode = "woche" | "liste";

function categoryCardStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return {
    borderColor: color,
    background: `color-mix(in oklab, ${color} 22%, white)`,
  } as const;
}

function categoryRowStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return {
    background: `color-mix(in oklab, ${color} 28%, white)`,
  } as const;
}

function categoryPillStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return {
    background: color,
    color: "#1a1a1a",
  } as const;
}

export function EditorialProgram({
  weekLabel,
  prevWeek,
  nextWeek,
  currentWeek,
  days,
  articles,
  members,
  categories,
}: {
  weekLabel: string;
  prevWeek: string;
  nextWeek: string;
  currentWeek: string;
  days: DayColumn[];
  articles: ProgramArticle[];
  members: Member[];
  categories: ProgramCategory[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("woche");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scheduled = useMemo(
    () =>
      [...articles]
        .filter((a) => a.publishAt)
        .sort((a, b) => (a.publishAt! < b.publishAt! ? -1 : 1)),
    [articles],
  );

  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; items: ProgramArticle[] }[] =
      [];
    const byKey = new Map<string, ProgramArticle[]>();
    for (const article of scheduled) {
      const key = article.publishAt!.slice(0, 7);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(article);
    }
    for (const [key, items] of byKey) {
      const [y, m] = key.split("-").map(Number);
      const label = format(new Date(y!, m! - 1, 1), "MMM yyyy", { locale: de });
      groups.push({ key, label, items });
    }
    return groups;
  }, [scheduled]);

  const weekScheduled = useMemo(() => {
    const map = new Map<string, ProgramArticle[]>();
    for (const day of days) map.set(day.dateKey, []);
    for (const article of articles) {
      if (!article.publishAt) continue;
      map.get(article.publishAt)?.push(article);
    }
    return map;
  }, [articles, days]);

  const selectedArticle =
    articles.find((a) => a.id === selectedId) ?? null;

  function run(action: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function assign(articleId: string, publishAt: string | null) {
    run(async () => {
      const fd = new FormData();
      fd.set("id", articleId);
      fd.set("publishAt", publishAt ?? "");
      return setArticlePublishAt(fd);
    });
  }

  function setAssignee(articleId: string, assigneeId: string) {
    run(async () => {
      const fd = new FormData();
      fd.set("id", articleId);
      fd.set("assigneeId", assigneeId);
      return updateArticle(fd);
    });
  }

  function setCategory(articleId: string, categoryId: string) {
    run(async () => {
      const fd = new FormData();
      fd.set("id", articleId);
      fd.set("categoryId", categoryId);
      return updateArticle(fd);
    });
  }

  function toggleMonth(key: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
          {(
            [
              ["woche", "Kalender"],
              ["liste", "Liste"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === id
                  ? "bg-[var(--fg)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--fg)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {view === "woche" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Link
                href={`?week=${prevWeek}`}
                className="btn btn-ghost px-2.5 py-1.5 text-sm"
              >
                ←
              </Link>
              <Link
                href={`?week=${currentWeek}`}
                className="btn btn-ghost px-2.5 py-1.5 text-sm"
              >
                Heute
              </Link>
              <Link
                href={`?week=${nextWeek}`}
                className="btn btn-ghost px-2.5 py-1.5 text-sm"
              >
                →
              </Link>
            </div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
              {weekLabel}
            </p>
            <p className="hidden text-sm text-[var(--muted)] sm:block">
              Artikel mit Publikationsdatum aus der Redaktion · Klick zum
              Bearbeiten
            </p>
          </div>

          <div className="grid gap-2 lg:grid-cols-7">
            {days.map((day) => {
              const items = weekScheduled.get(day.dateKey) ?? [];
              return (
                <section
                  key={day.dateKey}
                  className={[
                    "flex flex-col rounded-[var(--radius)] lg:min-h-[260px] border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5",
                    day.isToday ? "ring-2 ring-[var(--accent)]" : "",
                    day.isPast ? "opacity-80" : "",
                  ].join(" ")}
                >
                  <header className="mb-2 flex items-baseline justify-between gap-2 px-0.5 lg:block">
                    <p
                      className={[
                        "text-xs font-semibold tracking-wide uppercase",
                        day.isToday
                          ? "text-[var(--accent)]"
                          : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {day.label}
                      {day.isToday ? " · heute" : ""}
                    </p>
                    <p className="text-[0.7rem] text-[var(--muted)]">
                      {items.length} Artikel
                    </p>
                  </header>

                  <ul className="flex flex-1 flex-col gap-2">
                    {items.map((article) => (
                      <li key={article.id}>
                        <ArticleChip
                          article={article}
                          disabled={pending}
                          active={selectedId === article.id}
                          onOpen={() => setSelectedId(article.id)}
                        />
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-2 py-2 text-center text-xs text-[var(--muted)] lg:py-6">
                        Keine Artikel
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {monthGroups.map((group) => {
            const open = !collapsedMonths.has(group.key);
            return (
              <section key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleMonth(group.key)}
                  className="mb-1 flex items-center gap-2 px-1 py-1 text-left"
                >
                  <span className="text-xs text-[var(--muted)]" aria-hidden>
                    {open ? "▼" : "▸"}
                  </span>
                  <span className="font-[family-name:var(--font-display)] text-base font-semibold capitalize">
                    {group.label}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {group.items.length}
                  </span>
                </button>
                {open && (
                  <ProgramTable
                    articles={group.items}
                    members={members}
                    categories={categories}
                    pending={pending}
                    selectedId={selectedId}
                    onOpen={(id) => setSelectedId(id)}
                    onAssign={assign}
                    onAssignee={setAssignee}
                    onCategory={setCategory}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      <ArticleEditorDialog
        article={selectedArticle}
        members={members}
        categories={categories}
        canEdit
        onClose={() => {
          setSelectedId(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ArticleChip({
  article,
  disabled,
  active,
  onOpen,
}: {
  article: ProgramArticle;
  disabled?: boolean;
  active?: boolean;
  onOpen: () => void;
}) {
  const cat = article.category;
  return (
    <div
      className={[
        "rounded-lg border px-2.5 py-2 shadow-sm",
        disabled ? "cursor-default opacity-70" : "",
        active ? "ring-2 ring-[var(--accent)]" : "",
        cat ? "" : "border-[var(--border)] bg-white",
      ].join(" ")}
      style={categoryCardStyle(cat?.color)}
    >
      <button
        type="button"
        className="w-full text-left"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <p className="text-sm font-medium leading-snug">{article.title}</p>
        <p className="mt-1 text-[0.7rem] text-[var(--muted)]">
          {stageLabel(article.stage)}
          {article.assignee ? ` · ${article.assignee.name}` : ""}
        </p>
      </button>
      {cat && (
        <span
          className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
          style={categoryPillStyle(cat.color)}
        >
          {cat.name}
        </span>
      )}
    </div>
  );
}

function ProgramTable({
  articles,
  members,
  categories,
  pending,
  selectedId,
  onOpen,
  onAssign,
  onAssignee,
  onCategory,
}: {
  articles: ProgramArticle[];
  members: Member[];
  categories: ProgramCategory[];
  pending: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onAssign: (id: string, date: string | null) => void;
  onAssignee: (id: string, assigneeId: string) => void;
  onCategory: (id: string, categoryId: string) => void;
}) {
  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {articles.map((article) => {
          const cat = article.category;
          const active = selectedId === article.id;
          return (
            <li
              key={article.id}
              className={[
                "rounded-[var(--radius)] border border-[var(--border)] p-3 shadow-sm",
                cat ? "" : "bg-white",
                active ? "ring-2 ring-[var(--accent)]" : "",
              ].join(" ")}
              style={categoryRowStyle(cat?.color)}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span className="capitalize">
                  {article.publishAt
                    ? format(new Date(`${article.publishAt}T12:00:00`), "EEEE", {
                        locale: de,
                      })
                    : "—"}
                </span>
                <input
                  type="date"
                  aria-label="Publikationsdatum"
                  className="border-0 bg-transparent p-0 text-right text-sm text-[var(--fg)]"
                  disabled={pending}
                  value={article.publishAt ?? ""}
                  onChange={(e) => onAssign(article.id, e.target.value || null)}
                />
              </div>
              <button
                type="button"
                className="mt-1 w-full text-left"
                onClick={() => onOpen(article.id)}
              >
                <p className="font-medium leading-snug">{article.title}</p>
                <p className="mt-0.5 text-[0.7rem] text-[var(--muted)]">
                  {stageLabel(article.stage)}
                </p>
              </button>
              <div className="mt-2 flex items-center gap-2">
                <PersonAvatar name={article.assignee?.name} />
                <select
                  aria-label="Person"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm"
                  disabled={pending}
                  value={article.assignee?.id ?? ""}
                  onChange={(e) => onAssignee(article.id, e.target.value)}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Rubrik"
                  className={[
                    "max-w-[45%] rounded-full border-0 px-2.5 py-1 text-xs font-medium",
                    cat ? "" : "bg-black/5 text-[var(--muted)]",
                  ].join(" ")}
                  style={categoryPillStyle(cat?.color)}
                  disabled={pending}
                  value={article.categoryId ?? ""}
                  onChange={(e) => onCategory(article.id, e.target.value)}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow)] md:block">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs font-semibold tracking-wide text-[var(--muted)]">
              <th className="w-32 px-3 py-2.5 font-semibold">Wochentag</th>
              <th className="w-40 px-3 py-2.5 font-semibold">Datum</th>
              <th className="px-3 py-2.5 font-semibold">Titel</th>
              <th className="w-44 px-3 py-2.5 font-semibold">Person</th>
              <th className="w-48 px-3 py-2.5 font-semibold">Rubrik</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const cat = article.category;
              const active = selectedId === article.id;
              return (
                <tr
                  key={article.id}
                  className={`group border-b border-[var(--border)] last:border-b-0 ${
                    cat ? "" : "bg-white"
                  } ${active ? "ring-inset ring-2 ring-[var(--accent)]" : ""}`}
                  style={categoryRowStyle(cat?.color)}
                >
                  <td className="px-3 py-2.5 align-middle text-[var(--muted)] capitalize">
                    {article.publishAt
                      ? format(new Date(`${article.publishAt}T12:00:00`), "EEEE", {
                          locale: de,
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <input
                      type="date"
                      className="w-full min-w-[9.5rem] border-0 bg-transparent p-0 text-sm"
                      disabled={pending}
                      value={article.publishAt ?? ""}
                      onChange={(e) =>
                        onAssign(article.id, e.target.value || null)
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => onOpen(article.id)}
                    >
                      <p className="font-medium leading-snug underline-offset-2 hover:underline">
                        {article.title}
                      </p>
                      <p className="mt-0.5 text-[0.7rem] text-[var(--muted)]">
                        {stageLabel(article.stage)}
                      </p>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex items-center gap-2">
                      <PersonAvatar name={article.assignee?.name} />
                      <select
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm"
                        disabled={pending}
                        value={article.assignee?.id ?? ""}
                        onChange={(e) => onAssignee(article.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <select
                      className={[
                        "rounded-full border-0 px-2.5 py-1 text-xs font-medium",
                        cat ? "" : "bg-black/5 text-[var(--muted)]",
                      ].join(" ")}
                      style={categoryPillStyle(cat?.color)}
                      disabled={pending}
                      value={article.categoryId ?? ""}
                      onChange={(e) => onCategory(article.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PersonAvatar({ name }: { name?: string | null }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--accent)_25%,white)] text-[0.65rem] font-semibold text-[var(--fg)]"
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

function stageLabel(stage: string | null) {
  if (stage && isArticleStage(stage)) return ARTICLE_STAGE_LABELS[stage];
  return stage ?? "—";
}
