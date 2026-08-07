"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { createTask, updateTask, moveArticleStage, archiveArticle, unarchiveArticle, deleteArticle } from "@/lib/actions";
import {
  EigenleistungRubrikManager,
  RubrikBadge,
  type RubrikOption,
} from "@/components/eigenleistung-rubrik-manager";
import {
  ArticleCategoryManager,
  type CategoryOption,
} from "@/components/article-category-manager";
import { DateRangeField } from "@/components/date-range-field";
import {
  ARTICLE_STAGES,
  ARTICLE_STAGE_COLORS,
  ARTICLE_STAGE_LABELS,
  DEFAULT_ARTICLE_STAGE,
  DEFAULT_KANBAN_VIEW,
  isArticleStage,
  KANBAN_VIEW_DESCRIPTIONS,
  KANBAN_VIEW_LABELS,
  KANBAN_VIEW_STAGES,
  KANBAN_VIEWS,
  KANBAN_WER_STAGES,
  type ArticleStage,
  type KanbanViewId,
} from "@/lib/editorial";

const DRAWER_MS = 280;
const UNASSIGNED_KEY = "__unassigned__";

export type KanbanArticle = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  categoryId: string | null;
  publishAt?: string | null;
  archivedAt?: string | null;
  eigenleistungRubrikId?: string | null;
  category?: {
    id: string;
    name: string;
    color: string;
    active?: boolean;
  } | null;
  eigenleistungRubrik?: {
    id: string;
    name: string;
    color: string;
  } | null;
  createdAt: string | Date;
  assigneeId: string | null;
  assignee: { id: string; name: string; email: string } | null;
  createdBy: { id: string; name: string };
};

type Member = { id: string; name: string };

export function EditorialKanban({
  spaceId,
  articles,
  members,
  rubriken,
  categories,
  canEdit,
  isAdmin = false,
}: {
  spaceId: string;
  articles: KanbanArticle[];
  members: Member[];
  rubriken: RubrikOption[];
  categories: CategoryOption[];
  canEdit: boolean;
  isAdmin?: boolean;
}) {
  const [view, setView] = useState<KanbanViewId>(DEFAULT_KANBAN_VIEW);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [rubrikId, setRubrikId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [manageCategories, setManageCategories] = useState(false);
  const [manageRubriken, setManageRubriken] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeRubriken = useMemo(
    () => rubriken.filter((r) => r.active),
    [rubriken],
  );
  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (categoryId && article.categoryId !== categoryId) return false;
      if (rubrikId && article.eigenleistungRubrikId !== rubrikId) return false;
      if (assigneeId && article.assigneeId !== assigneeId) return false;
      if (createdFrom) {
        const from = new Date(createdFrom);
        if (new Date(article.createdAt) < from) return false;
      }
      if (createdTo) {
        const to = new Date(createdTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(article.createdAt) > to) return false;
      }
      if (q) {
        const hay = `${article.title}\n${article.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [articles, query, categoryId, rubrikId, assigneeId, createdFrom, createdTo]);

  const viewArticles = useMemo(() => {
    if (view === "archiv") {
      return filtered;
    }
    const active = filtered.filter((a) => {
      if (a.archivedAt) return false;
      const stage = isArticleStage(a.stage) ? a.stage : DEFAULT_ARTICLE_STAGE;
      return stage !== "publiziert";
    });
    if (view === "wer") {
      return active.filter((a) => {
        const stage = isArticleStage(a.stage) ? a.stage : DEFAULT_ARTICLE_STAGE;
        return (KANBAN_WER_STAGES as readonly string[]).includes(stage);
      });
    }
    const stages = KANBAN_VIEW_STAGES[view];
    return active.filter((a) => {
      const stage = isArticleStage(a.stage) ? a.stage : DEFAULT_ARTICLE_STAGE;
      return (stages as readonly string[]).includes(stage);
    });
  }, [filtered, view]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(
      ARTICLE_STAGES.map((stage) => [stage, [] as KanbanArticle[]]),
    ) as Record<ArticleStage, KanbanArticle[]>;

    for (const article of viewArticles) {
      const stage = isArticleStage(article.stage)
        ? article.stage
        : DEFAULT_ARTICLE_STAGE;
      map[stage].push(article);
    }
    return map;
  }, [viewArticles]);

  const byPerson = useMemo(() => {
    const map = new Map<string, KanbanArticle[]>();
    map.set(UNASSIGNED_KEY, []);
    for (const m of members) map.set(m.id, []);

    for (const article of viewArticles) {
      const key = article.assigneeId ?? UNASSIGNED_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(article);
    }
    return map;
  }, [viewArticles, members]);

  const personColumns = useMemo(() => {
    const cols: { key: string; label: string; initial: string }[] = members.map(
      (m) => ({
        key: m.id,
        label: m.name,
        initial: m.name.trim().charAt(0).toUpperCase() || "?",
      }),
    );
    cols.push({
      key: UNASSIGNED_KEY,
      label: "Ohne Zuständig",
      initial: "?",
    });
    return cols.filter(
      (c) => (byPerson.get(c.key)?.length ?? 0) > 0 || c.key !== UNASSIGNED_KEY,
    );
  }, [members, byPerson]);

  const selected = articles.find((a) => a.id === selectedId) ?? null;

  function moveToStage(articleId: string, stage: ArticleStage) {
    const fd = new FormData();
    fd.set("id", articleId);
    fd.set("stage", stage);
    startTransition(async () => {
      await moveArticleStage(fd);
    });
  }

  function moveToAssignee(articleId: string, nextAssigneeId: string | null) {
    const fd = new FormData();
    fd.set("id", articleId);
    fd.set("assigneeId", nextAssigneeId ?? "");
    startTransition(async () => {
      await updateTask(fd);
    });
  }

  const stageColumns =
    view === "wer" || view === "archiv" ? null : KANBAN_VIEW_STAGES[view];
  const isArchiveView = view === "archiv";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1"
          role="tablist"
          aria-label="Kanban-Ansicht"
        >
          {KANBAN_VIEWS.map((id) => {
            const active = view === id;
            const label = KANBAN_VIEW_LABELS[id];
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-[var(--fg)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            Neuer Artikel
          </button>
        )}
      </div>

      {isAdmin && manageCategories && (
        <ArticleCategoryManager
          categories={categories}
          onClose={() => setManageCategories(false)}
        />
      )}
      {isAdmin && manageRubriken && (
        <EigenleistungRubrikManager
          rubriken={rubriken}
          onClose={() => setManageRubriken(false)}
        />
      )}

      <p className="text-sm text-[var(--muted)]">
        {KANBAN_VIEW_DESCRIPTIONS[view]}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="field min-w-[180px] flex-1">
          <label htmlFor="filter-q">Suche (Freitext)</label>
          <input
            id="filter-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titel oder Text…"
          />
        </div>
        <div className="field w-44">
          <label htmlFor="filter-cat">
            Kategorie
            {isAdmin && (
              <>
                {" "}
                (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[inherit] underline"
                  onClick={() => {
                    setManageRubriken(false);
                    setManageCategories(true);
                  }}
                >
                  Bearbeiten
                </button>
                )
              </>
            )}
          </label>
          <select
            id="filter-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Alle</option>
            {activeCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-44">
          <label htmlFor="filter-rubrik">
            Eigenleistung
            {isAdmin && (
              <>
                {" "}
                (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[inherit] underline"
                  onClick={() => {
                    setManageCategories(false);
                    setManageRubriken(true);
                  }}
                >
                  Bearbeiten
                </button>
                )
              </>
            )}
          </label>
          <select
            id="filter-rubrik"
            value={rubrikId}
            onChange={(e) => setRubrikId(e.target.value)}
          >
            <option value="">Alle</option>
            {activeRubriken.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {view !== "wer" && (
          <div className="field w-44">
            <label htmlFor="filter-assignee">Person</label>
            <select
              id="filter-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Alle</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <DateRangeField
          id="filter-created"
          label="Erstellt"
          from={createdFrom}
          to={createdTo}
          onChange={(from, to) => {
            setCreatedFrom(from);
            setCreatedTo(to);
          }}
        />
      </div>

      <p className="text-sm text-[var(--muted)]">
        {viewArticles.length} Artikel in dieser Ansicht
        {filtered.length !== articles.length
          ? ` · ${filtered.length} nach Filter`
          : ""}
        {pending ? " · speichern…" : ""}
      </p>

      {isArchiveView ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pb-4">
          {viewArticles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              canEdit={false}
              selected={selectedId === article.id}
              onOpen={() => setSelectedId(article.id)}
              showStage
              showAssignee
              showPublishAt
            />
          ))}
          {viewArticles.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
              Noch keine Artikel in der Datenbank.
            </p>
          )}
        </div>
      ) : stageColumns ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stageColumns.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              articles={byStage[stage]}
              canEdit={canEdit}
              selectedId={selectedId}
              isDragOver={dragOverKey === stage}
              onDragOver={() => setDragOverKey(stage)}
              onDragLeave={() =>
                setDragOverKey((s) => (s === stage ? null : s))
              }
              onDrop={(id) => {
                setDragOverKey(null);
                moveToStage(id, stage);
              }}
              onOpen={(id) => setSelectedId(id)}
              showAssignee
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {personColumns.map((col) => {
            const list = byPerson.get(col.key) ?? [];
            const dropKey = `person:${col.key}`;
            return (
              <section
                key={col.key}
                className={[
                  "flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[color-mix(in_oklab,var(--bg-elevated)_88%,var(--bg))]",
                  dragOverKey === dropKey ? "ring-2 ring-[var(--accent)]" : "",
                ].join(" ")}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverKey(dropKey);
                }}
                onDragLeave={() =>
                  setDragOverKey((s) => (s === dropKey ? null : s))
                }
                onDrop={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverKey(null);
                  const id = e.dataTransfer.getData("text/article-id");
                  if (id) {
                    moveToAssignee(
                      id,
                      col.key === UNASSIGNED_KEY ? null : col.key,
                    );
                  }
                }}
              >
                <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--fg)] text-[0.65rem] font-bold text-white"
                      aria-hidden
                    >
                      {col.initial}
                    </span>
                    <h2 className="truncate text-sm font-semibold">
                      {col.label}
                    </h2>
                  </div>
                  <span className="badge badge-muted">{list.length}</span>
                </header>
                <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
                  {list.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      canEdit={canEdit}
                      selected={selectedId === article.id}
                      onOpen={() => setSelectedId(article.id)}
                      showStage
                      showAssignee={false}
                      showPublishAt
                    />
                  ))}
                  {list.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-[var(--muted)]">
                      Leer
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showCreate && canEdit && (
        <CreateArticleDialog
          spaceId={spaceId}
          members={members}
          rubriken={activeRubriken}
          categories={activeCategories}
          onClose={() => setShowCreate(false)}
        />
      )}

      <ArticleDetailDrawer
        article={selected}
        members={members}
        rubriken={rubriken}
        categories={categories}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function StageColumn({
  stage,
  articles,
  canEdit,
  selectedId,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpen,
  showAssignee,
}: {
  stage: ArticleStage;
  articles: KanbanArticle[];
  canEdit: boolean;
  selectedId: string | null;
  isDragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (articleId: string) => void;
  onOpen: (articleId: string) => void;
  showAssignee: boolean;
}) {
  const tint = ARTICLE_STAGE_COLORS[stage];
  return (
    <section
      className={[
        "flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border)]",
        isDragOver ? "ring-2 ring-[var(--accent)]" : "",
      ].join(" ")}
      style={{
        background: `color-mix(in oklab, ${tint} 10%, white)`,
      }}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        const id = e.dataTransfer.getData("text/article-id");
        if (id) onDrop(id);
      }}
    >
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: tint }}
            aria-hidden
          />
          <h2 className="text-sm font-semibold">
            {ARTICLE_STAGE_LABELS[stage]}
          </h2>
        </div>
        <span className="badge badge-muted">{articles.length}</span>
      </header>
      <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
        {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  canEdit={canEdit}
                  selected={selectedId === article.id}
                  onOpen={() => onOpen(article.id)}
                  showAssignee={showAssignee}
                  showPublishAt
                />
        ))}
        {articles.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--muted)]">
            Leer
          </p>
        )}
      </div>
    </section>
  );
}

function ArticleCard({
  article,
  canEdit,
  selected,
  onOpen,
  showAssignee = true,
  showStage = false,
  showPublishAt = false,
}: {
  article: KanbanArticle;
  canEdit: boolean;
  selected: boolean;
  onOpen: () => void;
  showAssignee?: boolean;
  showStage?: boolean;
  showPublishAt?: boolean;
}) {
  const categoryLabel = article.category?.name ?? null;
  const stage = isArticleStage(article.stage)
    ? article.stage
    : DEFAULT_ARTICLE_STAGE;

  return (
    <button
      type="button"
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/article-id", article.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={[
        "rounded-lg border bg-white p-3 text-left shadow-sm transition",
        "border-[var(--border)] hover:border-[var(--accent)]",
        selected ? "ring-2 ring-[var(--accent)]" : "",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      ].join(" ")}
    >
      <p className="line-clamp-2 text-sm font-semibold leading-snug">
        {article.title}
      </p>
      {article.description && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--muted)]">
          {article.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {article.archivedAt && (
          <span className="badge badge-muted">Archiviert</span>
        )}
        {showStage && (
          <span
            className="badge badge-muted"
            style={{
              background: `color-mix(in oklab, ${ARTICLE_STAGE_COLORS[stage]} 22%, white)`,
            }}
          >
            {ARTICLE_STAGE_LABELS[stage]}
          </span>
        )}
        {article.eigenleistungRubrik && (
          <RubrikBadge
            name={article.eigenleistungRubrik.name}
            color={article.eigenleistungRubrik.color}
          />
        )}
        {categoryLabel && article.category && (
          <RubrikBadge
            name={article.category.name}
            color={article.category.color}
          />
        )}
        {showAssignee && article.assignee && (
          <span className="badge badge-muted">{article.assignee.name}</span>
        )}
      </div>
      <p className="mt-2 text-[0.7rem] text-[var(--muted)]">
        {showPublishAt && article.publishAt
          ? `Publikation ${format(new Date(`${article.publishAt}T12:00:00`), "d. MMM yyyy", { locale: de })}`
          : format(new Date(article.createdAt), "d. MMM yyyy", { locale: de })}
      </p>
    </button>
  );
}

function CreateArticleDialog({
  spaceId,
  members,
  rubriken,
  categories,
  onClose,
}: {
  spaceId: string;
  members: Member[];
  rubriken: RubrikOption[];
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <form
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await createTask(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            onClose();
          });
        }}
      >
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="kind" value="article" />
        <input type="hidden" name="stage" value={DEFAULT_ARTICLE_STAGE} />

        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Neuer Artikel
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Startet in «Input». Kategorie und Eigenleistungs-Rubrik sind filterbar.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="field">
            <label htmlFor="new-title">Titel</label>
            <input id="new-title" name="title" required maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="new-body">Freitext</label>
            <textarea
              id="new-body"
              name="description"
              rows={8}
              placeholder="Pitch, Notizen, Rohtext…"
            />
          </div>
          <div className="field">
            <label htmlFor="new-category">Kategorie</label>
            <select id="new-category" name="categoryId" defaultValue="">
              <option value="">— keine —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-rubrik">Eigenleistungs-Rubrik</label>
            <select
              id="new-rubrik"
              name="eigenleistungRubrikId"
              defaultValue=""
            >
              <option value="">— keine —</option>
              {rubriken.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-publish">Publikationsdatum</label>
            <input id="new-publish" name="publishAt" type="date" />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Optional — mit Datum erscheint der Artikel automatisch im
              Programm.
            </p>
          </div>
          <div className="field">
            <label htmlFor="new-assignee">Zuständig</label>
            <select id="new-assignee" name="assigneeId" defaultValue="">
              <option value="">— ich / später —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "…" : "Anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ArticleDetailDrawer({
  article,
  members,
  rubriken,
  categories,
  canEdit,
  onClose,
}: {
  article: KanbanArticle | null;
  members: Member[];
  rubriken: RubrikOption[];
  categories: CategoryOption[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [panelArticle, setPanelArticle] = useState<KanbanArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (article) {
      setPanelArticle(article);
      setError(null);
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      setPanelArticle(null);
      setError(null);
    }, DRAWER_MS);
    return () => window.clearTimeout(t);
  }, [article]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted || !panelArticle) return null;

  const stage = isArticleStage(panelArticle.stage)
    ? panelArticle.stage
    : DEFAULT_ARTICLE_STAGE;
  const fieldsEditable = canEdit && !panelArticle.archivedAt;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Schliessen"
        className={[
          "absolute inset-0 bg-black/35 transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
        onClick={onClose}
      />
      <aside
        className={[
          "relative flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)] transition-transform ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
              Artikel bearbeiten
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Erstellt{" "}
              {format(new Date(panelArticle.createdAt), "d. MMMM yyyy, HH:mm", {
                locale: de,
              })}{" "}
              · von {panelArticle.createdBy.name}
            </p>
          </div>
          <button type="button" className="btn btn-ghost shrink-0" onClick={onClose}>
            Schliessen
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form
            key={panelArticle.id}
            className="flex flex-col gap-3"
            action={(fd) => {
              if (!canEdit) return;
              setError(null);
              startTransition(async () => {
                const result = await updateTask(fd);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                onClose();
              });
            }}
          >
            <input type="hidden" name="id" value={panelArticle.id} />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <div className="field">
              <label htmlFor="edit-title">Titel</label>
              <input
                id="edit-title"
                name="title"
                defaultValue={panelArticle.title}
                required
                disabled={!fieldsEditable}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-body">Freitext</label>
              <textarea
                id="edit-body"
                name="description"
                rows={12}
                defaultValue={panelArticle.description ?? ""}
                disabled={!fieldsEditable}
                className="font-mono text-sm"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-stage">Stage</label>
              <select
                id="edit-stage"
                name="stage"
                defaultValue={stage}
                disabled={!fieldsEditable}
              >
                {ARTICLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {ARTICLE_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-category">Kategorie</label>
              <select
                id="edit-category"
                name="categoryId"
                defaultValue={panelArticle.categoryId ?? ""}
                disabled={!fieldsEditable}
              >
                <option value="">— keine —</option>
                {categories
                  .filter(
                    (c) =>
                      c.active || c.id === panelArticle.categoryId,
                  )
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                      {!cat.active ? " (inaktiv)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-rubrik">Eigenleistungs-Rubrik</label>
              <select
                id="edit-rubrik"
                name="eigenleistungRubrikId"
                defaultValue={panelArticle.eigenleistungRubrikId ?? ""}
                disabled={!fieldsEditable}
              >
                <option value="">— keine —</option>
                {rubriken
                  .filter(
                    (r) =>
                      r.active ||
                      r.id === panelArticle.eigenleistungRubrikId,
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {!r.active ? " (inaktiv)" : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-publish">Publikationsdatum</label>
              <input
                id="edit-publish"
                name="publishAt"
                type="date"
                defaultValue={panelArticle.publishAt ?? ""}
                disabled={!fieldsEditable}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Mit Datum erscheint der Artikel im Programm-Kalender.
              </p>
            </div>
            <div className="field">
              <label htmlFor="edit-assignee">Zuständig</label>
              <select
                id="edit-assignee"
                name="assigneeId"
                defaultValue={panelArticle.assigneeId ?? ""}
                disabled={!fieldsEditable}
              >
                <option value="">— niemand —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {canEdit && (
              <div className="sticky bottom-0 space-y-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] pt-4 pb-1">
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={onClose}>
                    Abbrechen
                  </button>
                  {!panelArticle.archivedAt && (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={pending}
                    >
                      {pending ? "…" : "Speichern"}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-3">
                  {panelArticle.archivedAt ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        const fd = new FormData();
                        fd.set("id", panelArticle.id);
                        startTransition(async () => {
                          const result = await unarchiveArticle(fd);
                          if (result?.error) {
                            setError(result.error);
                            return;
                          }
                          onClose();
                        });
                      }}
                    >
                      Wiederherstellen
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        const fd = new FormData();
                        fd.set("id", panelArticle.id);
                        startTransition(async () => {
                          const result = await archiveArticle(fd);
                          if (result?.error) {
                            setError(result.error);
                            return;
                          }
                          onClose();
                        });
                      }}
                    >
                      Archivieren
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Artikel «${panelArticle.title}» endgültig löschen?`,
                        )
                      ) {
                        return;
                      }
                      setError(null);
                      const fd = new FormData();
                      fd.set("id", panelArticle.id);
                      startTransition(async () => {
                        const result = await deleteArticle(fd);
                        if (result?.error) {
                          setError(result.error);
                          return;
                        }
                        onClose();
                      });
                    }}
                  >
                    Löschen
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </aside>
    </div>
  );
}
