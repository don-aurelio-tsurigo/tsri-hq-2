"use client";

import {
  useMemo,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  endOfWeek,
  isBefore,
  isToday,
  startOfDay,
} from "date-fns";
import { CreateTaskForm } from "@/components/task-form";
import { TaskList, TASK_DRAG_TYPE, type TaskRow } from "@/components/task-list";
import { ProjectNotes } from "@/components/project-notes";
import {
  createTaskGroup,
  deleteTaskGroup,
  updateTask,
  updateTaskGroup,
} from "@/lib/actions";

type Group = { id: string; name: string };
type Member = { id: string; name: string };
type InboxMode = "due" | "project";

type BucketKey = "overdue" | "today" | "week" | "later" | "none";

const DUE_BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "overdue", label: "Überfällig" },
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "later", label: "Später" },
  { key: "none", label: "Kein Datum" },
];

function dueBucket(dueAt: Date | string | null): BucketKey {
  if (!dueAt) return "none";
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(date.getTime())) return "none";
  if (isToday(date)) return "today";
  const todayStart = startOfDay(new Date());
  if (isBefore(date, todayStart)) return "overdue";
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  if (!isBefore(weekEnd, date)) return "week"; // date <= weekEnd
  return "later";
}

function sortByDueAsc(a: TaskRow, b: TaskRow) {
  const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return (a.title ?? "").localeCompare(b.title ?? "", "de");
}

function CollapsibleSection({
  sectionKey,
  label,
  count,
  collapsed,
  onToggle,
  children,
  mutedLabel,
  headerExtra,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOver,
}: {
  sectionKey: string;
  label: string;
  count: number;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  children: ReactNode;
  mutedLabel?: boolean;
  headerExtra?: ReactNode;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => void;
  dragOver?: boolean;
}) {
  const open = !collapsed.has(sectionKey);
  return (
    <section className="space-y-1.5">
      <div
        className={[
          "flex items-center gap-1 rounded-lg px-1 transition-colors",
          dragOver
            ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)]"
            : "",
        ].join(" ")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <button
          type="button"
          onClick={() => onToggle(sectionKey)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
        >
          <span className="text-[0.65rem] text-[var(--muted)]" aria-hidden>
            {open ? "▼" : "▸"}
          </span>
          <span
            className={[
              "truncate text-sm font-semibold",
              mutedLabel ? "text-[var(--muted)]" : "",
            ].join(" ")}
          >
            {label}
          </span>
          <span className="text-xs text-[var(--muted)]">{count}</span>
        </button>
        {headerExtra}
      </div>
      {open && children}
    </section>
  );
}

export function GroupedTasksBoard({
  spaceId,
  groups,
  tasks,
  members,
  canEdit = true,
  eyebrow = "Tasks",
  title,
  description,
  headerExtra,
  belowTitle,
  projectNotes,
  isTemplate = false,
  variant = "space",
}: {
  spaceId: string;
  groups: Group[];
  tasks: TaskRow[];
  members?: Member[];
  canEdit?: boolean;
  eyebrow?: string;
  title: string;
  description?: string | null;
  headerExtra?: ReactNode;
  /** Rendered directly under the page title (e.g. phase progress). */
  belowTitle?: ReactNode;
  /** When set, shows an editable project notes field under the header. */
  projectNotes?: boolean;
  /** Template projects edit relative offsets instead of absolute due dates. */
  isTemplate?: boolean;
  /**
   * `space` = TaskGroup sections (project detail / single space).
   * `inbox` = merged personal + assigned project tasks with due/project modes.
   */
  variant?: "space" | "inbox";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [addingGroup, setAddingGroup] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [inboxMode, setInboxMode] = useState<InboxMode>("due");

  const isInbox = variant === "inbox";

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo" || t.status === "doing"),
    [tasks],
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done"),
    [tasks],
  );

  const openByTaskGroup = useMemo(() => {
    const map = new Map<string | null, TaskRow[]>();
    map.set(null, []);
    for (const g of groups) map.set(g.id, []);
    for (const task of openTasks) {
      const key = task.groupId ?? task.group?.id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return map;
  }, [openTasks, groups]);

  const openByDue = useMemo(() => {
    const map = new Map<BucketKey, TaskRow[]>();
    for (const b of DUE_BUCKETS) map.set(b.key, []);
    for (const task of openTasks) {
      map.get(dueBucket(task.dueAt))!.push(task);
    }
    for (const list of map.values()) list.sort(sortByDueAsc);
    return map;
  }, [openTasks]);

  const openByProject = useMemo(() => {
    type ProjBucket = { key: string; label: string; tasks: TaskRow[] };
    const map = new Map<string, ProjBucket>();
    for (const task of openTasks) {
      const space = task.space;
      const isPersonal =
        !space || space.type === "personal" || space.id === spaceId;
      const key = isPersonal ? `__personal__:${spaceId}` : space.id;
      const label = isPersonal ? "Privat" : space.name;
      if (!map.has(key)) {
        map.set(key, { key, label, tasks: [] });
      }
      map.get(key)!.tasks.push(task);
    }
    for (const b of map.values()) b.tasks.sort(sortByDueAsc);
    return [...map.values()].sort((a, b) => {
      if (a.label === "Privat") return -1;
      if (b.label === "Privat") return 1;
      return a.label.localeCompare(b.label, "de");
    });
  }, [openTasks, spaceId]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function run(action: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setAddingGroup(false);
      setRenameId(null);
      router.refresh();
    });
  }

  function moveToGroup(taskId: string, groupId: string | null) {
    if (!canEdit || isInbox) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const current = task.groupId ?? task.group?.id ?? null;
    if (current === groupId) return;

    run(async () => {
      const fd = new FormData();
      fd.set("id", taskId);
      fd.set("groupId", groupId ?? "");
      return updateTask(fd);
    });
  }

  function onHeaderDragOver(e: DragEvent, key: string) {
    if (!canEdit || isInbox) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
    if (collapsed.has(key)) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function onHeaderDrop(e: DragEvent, groupId: string | null) {
    if (!canEdit || isInbox) return;
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (!id || pending) return;
    moveToGroup(id, groupId);
  }

  const editMembers = canEdit ? members : undefined;
  const listGroups = isInbox ? undefined : groups;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {headerExtra}
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {belowTitle}
        {!projectNotes && description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {description}
          </p>
        ) : null}
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          {openTasks.length} offen
          {doneTasks.length > 0 ? ` · ${doneTasks.length} erledigt` : ""}
          {isInbox
            ? " · privat & zugewiesene Projekt-Tasks"
            : ""}
        </p>
      </header>

      {projectNotes && (
        <ProjectNotes
          key={spaceId}
          spaceId={spaceId}
          initialNotes={description ?? ""}
          canEdit={canEdit}
        />
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {canEdit && (
        <CreateTaskForm
          spaceId={spaceId}
          compact
          showDueDate={!isTemplate}
          showDueOffset={isTemplate}
          members={editMembers}
          placeholder={
            isTemplate ? "Neuer Vorlagen-Task…" : "Neue Aufgabe…"
          }
        />
      )}

      {isInbox && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Gruppierung
          </span>
          {(
            [
              { id: "due", label: "Nach Fälligkeit" },
              { id: "project", label: "Nach Projekt" },
            ] as const
          ).map((mode) => {
            const active = inboxMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  active
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => setInboxMode(mode.id)}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      )}

      {isInbox && inboxMode === "due" && (
        <div className="space-y-3">
          {DUE_BUCKETS.map((bucket) => {
            const items = openByDue.get(bucket.key) ?? [];
            if (items.length === 0) return null;
            return (
              <CollapsibleSection
                key={bucket.key}
                sectionKey={`due:${bucket.key}`}
                label={bucket.label}
                count={items.length}
                collapsed={collapsed}
                onToggle={toggle}
              >
                <TaskList
                  tasks={items}
                  enableDrawer
                  compact
                  showSpace
                  members={editMembers}
                />
              </CollapsibleSection>
            );
          })}
          {openTasks.length === 0 && (
            <div className="card px-4 py-8 text-center text-sm text-[var(--muted)]">
              Keine offenen Tasks.
            </div>
          )}
        </div>
      )}

      {isInbox && inboxMode === "project" && (
        <div className="space-y-3">
          {openByProject.map((bucket) => (
            <CollapsibleSection
              key={bucket.key}
              sectionKey={`proj:${bucket.key}`}
              label={bucket.label}
              count={bucket.tasks.length}
              collapsed={collapsed}
              onToggle={toggle}
            >
              <TaskList
                tasks={bucket.tasks}
                enableDrawer
                compact
                showSpace={bucket.label !== "Privat"}
                members={editMembers}
              />
            </CollapsibleSection>
          ))}
          {openTasks.length === 0 && (
            <div className="card px-4 py-8 text-center text-sm text-[var(--muted)]">
              Keine offenen Tasks.
            </div>
          )}
        </div>
      )}

      {!isInbox && (
        <>
          <div className="space-y-3">
            <CollapsibleSection
              sectionKey="__none__"
              label="Ohne Gruppe"
              count={(openByTaskGroup.get(null) ?? []).length}
              collapsed={collapsed}
              onToggle={toggle}
              dragOver={dragOverKey === "__none__"}
              onDragOver={(e) => onHeaderDragOver(e, "__none__")}
              onDragLeave={() =>
                setDragOverKey((cur) => (cur === "__none__" ? null : cur))
              }
              onDrop={(e) => onHeaderDrop(e, null)}
            >
              <TaskList
                tasks={openByTaskGroup.get(null) ?? []}
                enableDrawer
                compact
                groups={listGroups}
                members={editMembers}
                enableDrag={canEdit}
                dropGroupId={null}
                onMoveToGroup={canEdit ? moveToGroup : undefined}
                showDueOffset={isTemplate}
              />
            </CollapsibleSection>

            {groups.map((group) => {
              const items = openByTaskGroup.get(group.id) ?? [];
              const renaming = renameId === group.id;
              return (
                <CollapsibleSection
                  key={group.id}
                  sectionKey={group.id}
                  label={renaming ? "" : group.name}
                  count={items.length}
                  collapsed={collapsed}
                  onToggle={toggle}
                  dragOver={dragOverKey === group.id}
                  onDragOver={(e) => onHeaderDragOver(e, group.id)}
                  onDragLeave={() =>
                    setDragOverKey((cur) => (cur === group.id ? null : cur))
                  }
                  onDrop={(e) => onHeaderDrop(e, group.id)}
                  headerExtra={
                    canEdit && !renaming ? (
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[0.65rem] text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
                          disabled={pending}
                          onClick={() => setRenameId(group.id)}
                        >
                          Umbenennen
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[0.65rem] text-[var(--muted)] hover:bg-black/5 hover:text-red-700"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !confirm(
                                `Gruppe «${group.name}» löschen? Tasks bleiben ohne Gruppe.`,
                              )
                            ) {
                              return;
                            }
                            run(async () => {
                              const fd = new FormData();
                              fd.set("id", group.id);
                              return deleteTaskGroup(fd);
                            });
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                    ) : undefined
                  }
                >
                  {renaming && (
                    <form
                      className="flex gap-2"
                      action={(fd) => {
                        run(async () => updateTaskGroup(fd));
                      }}
                    >
                      <input type="hidden" name="id" value={group.id} />
                      <input
                        name="name"
                        required
                        defaultValue={group.name}
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="btn btn-primary text-sm"
                        disabled={pending}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost text-sm"
                        onClick={() => setRenameId(null)}
                      >
                        Abbrechen
                      </button>
                    </form>
                  )}
                  {!renaming && (
                    <TaskList
                      tasks={items}
                      enableDrawer
                      compact
                      groups={listGroups}
                      members={editMembers}
                      enableDrag={canEdit}
                      dropGroupId={group.id}
                      onMoveToGroup={canEdit ? moveToGroup : undefined}
                      showDueOffset={isTemplate}
                    />
                  )}
                </CollapsibleSection>
              );
            })}
          </div>

          {canEdit &&
            (addingGroup ? (
              <form
                className="flex gap-2"
                action={(fd) => {
                  run(async () => createTaskGroup(fd));
                }}
              >
                <input type="hidden" name="spaceId" value={spaceId} />
                <input
                  name="name"
                  required
                  placeholder="Name der Gruppe…"
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-primary text-sm"
                  disabled={pending}
                >
                  Anlegen
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => setAddingGroup(false)}
                >
                  Abbrechen
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="text-sm font-medium text-[var(--accent)] hover:underline"
                onClick={() => setAddingGroup(true)}
              >
                + Neue Gruppe
              </button>
            ))}
        </>
      )}

      {doneTasks.length > 0 && (
        <CollapsibleSection
          sectionKey="__done__"
          label="Erledigt"
          count={doneTasks.length}
          collapsed={collapsed}
          onToggle={toggle}
          mutedLabel
        >
          <TaskList
            tasks={doneTasks}
            enableDrawer
            compact
            showSpace={isInbox}
            groups={listGroups}
            members={editMembers}
            showDueOffset={isTemplate}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}

/** @deprecated Use GroupedTasksBoard */
export function PersonalTasksBoard(
  props: Omit<
    Parameters<typeof GroupedTasksBoard>[0],
    "title" | "eyebrow"
  > & { title?: string; eyebrow?: string },
) {
  return (
    <GroupedTasksBoard
      {...props}
      eyebrow={props.eyebrow ?? "Tasks"}
      title={props.title ?? "Persönliche Tasks"}
    />
  );
}
