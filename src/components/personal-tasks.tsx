"use client";

import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  endOfWeek,
  format,
  isBefore,
  isToday,
  startOfDay,
} from "date-fns";
import {
  InlineTaskAdd,
  buildCreateTaskFormData,
  buildOptimisticTask,
  type InlineTaskCreateDefaults,
  type InlineTaskCreateResult,
} from "@/components/inline-task-add";
import { TaskList, TASK_DRAG_TYPE, type TaskRow } from "@/components/task-list";
import { ProjectNotes } from "@/components/project-notes";
import { TaskInboxPinButton } from "@/components/task-inbox-pin-button";
import {
  createTask,
  createTaskGroup,
  deleteTaskGroup,
  updateTask,
  updateTaskGroup,
} from "@/lib/actions";

type Group = { id: string; name: string; pinned?: boolean };
type Member = { id: string; name: string };
type InboxMode = "list" | "project" | "due";

type BucketKey = "overdue" | "today" | "week" | "later" | "none";

function isPersonalSpaceTask(
  task: TaskRow,
  personalSpaceId: string,
): boolean {
  const space = task.space;
  return !space || space.type === "personal" || space.id === personalSpaceId;
}

const DUE_BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "overdue", label: "Überfällig" },
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "later", label: "Später" },
  { key: "none", label: "Kein Datum" },
];

/** Default due date (`yyyy-MM-dd`) when creating into a due bucket. */
function dueAtForBucket(key: BucketKey): string | null {
  const today = format(new Date(), "yyyy-MM-dd");
  switch (key) {
    case "none":
      return null;
    case "overdue":
      // Not overdue — today's date (user preference)
      return today;
    case "today":
      return today;
    case "week":
      return format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    case "later":
      return format(addDays(new Date(), 14), "yyyy-MM-dd");
  }
}
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
  tone,
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
  /** Visual emphasis for section header (e.g. overdue). */
  tone?: "danger";
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
          tone === "danger"
            ? "bg-[color-mix(in_oklab,var(--danger)_8%,white)]"
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
          <span
            className={[
              "text-[0.65rem]",
              tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]",
            ].join(" ")}
            aria-hidden
          >
            {open ? "▼" : "▸"}
          </span>
          <span
            className={[
              "truncate text-sm font-semibold",
              mutedLabel ? "text-[var(--muted)]" : "",
              tone === "danger" ? "text-[var(--danger)]" : "",
            ].join(" ")}
          >
            {label}
          </span>
          <span
            className={[
              "text-xs",
              tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]",
            ].join(" ")}
          >
            {count}
          </span>
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
  currentUserId,
  canEdit = true,
  eyebrow = "Tasks",
  title,
  description,
  headerExtra,
  belowTitle,
  projectNotes,
  isTemplate = false,
  variant = "space",
  pinnedProjectIds = [],
  initialMode,
  focusListId = null,
  focusProjectId = null,
}: {
  spaceId: string;
  groups: Group[];
  tasks: TaskRow[];
  members?: Member[];
  currentUserId?: string;
  canEdit?: boolean;
  eyebrow?: string;
  title: string;
  description?: string | null;
  headerExtra?: ReactNode;
  /** Rendered directly under the page title. */
  belowTitle?: ReactNode;
  /** When set, shows an editable project notes field under the header. */
  projectNotes?: boolean;
  /** Template projects edit relative offsets instead of absolute due dates. */
  isTemplate?: boolean;
  /**
   * `space` = TaskGroup sections (project detail / single space).
   * `inbox` = Meine Tasks: Listen (privat), Projekte, Fällig (alles).
   */
  variant?: "space" | "inbox";
  pinnedProjectIds?: string[];
  initialMode?: InboxMode;
  focusListId?: string | null;
  focusProjectId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => {
      const next = new Set(
        variant === "inbox"
          ? ["__done__", "__cancelled__"]
          : ["__cancelled__"],
      );
      if (focusListId) {
        next.add("__none__");
        for (const g of groups) {
          if (g.id !== focusListId) next.add(g.id);
        }
      }
      if (focusProjectId) {
        next.add(`proj:__personal__:${spaceId}`);
      }
      return next;
    },
  );
  const [addingGroup, setAddingGroup] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [inboxMode, setInboxMode] = useState<InboxMode>(
    () => initialMode ?? "list",
  );

  const isInbox = variant === "inbox";

  const [optimisticTasks, addOptimisticTask] = useOptimistic(
    tasks,
    (current, newTask: TaskRow) => {
      if (current.some((t) => t.id === newTask.id)) return current;
      return [newTask, ...current];
    },
  );

  const selfName =
    members?.find((m) => m.id === currentUserId)?.name ?? "Ich";

  function createInlineTask(
    title: string,
    defaults: InlineTaskCreateDefaults,
  ): Promise<InlineTaskCreateResult> {
    const optimistic = buildOptimisticTask(title, {
      ...defaults,
      assigneeName: defaults.assigneeName ?? selfName,
    });
    const fd = buildCreateTaskFormData(title, defaults);

    return new Promise((resolve) => {
      startTransition(async () => {
        addOptimisticTask(optimistic);
        const result = await createTask(fd);
        if (result && "error" in result && result.error) {
          resolve({ error: result.error });
          return;
        }
        await router.refresh();
        resolve({ ok: true });
      });
    });
  }

  const viewCounts = useMemo(() => {
    let list = 0;
    let project = 0;
    let due = 0;
    for (const task of optimisticTasks) {
      if (task.status !== "todo" && task.status !== "doing") continue;
      due += 1;
      if (isPersonalSpaceTask(task, spaceId)) list += 1;
      else if (task.space?.type === "project") project += 1;
    }
    return { list, project, due };
  }, [optimisticTasks, spaceId]);

  const scopedTasks = useMemo(() => {
    if (!isInbox || inboxMode === "due") return optimisticTasks;
    return optimisticTasks.filter((task) => {
      if (inboxMode === "list") return isPersonalSpaceTask(task, spaceId);
      return task.space?.type === "project";
    });
  }, [optimisticTasks, isInbox, inboxMode, spaceId]);

  const openTasks = useMemo(
    () =>
      scopedTasks.filter((t) => t.status === "todo" || t.status === "doing"),
    [scopedTasks],
  );
  const doneTasks = useMemo(
    () => scopedTasks.filter((t) => t.status === "done"),
    [scopedTasks],
  );
  const cancelledTasks = useMemo(
    () => scopedTasks.filter((t) => t.status === "cancelled"),
    [scopedTasks],
  );

  const openByTaskGroup = useMemo(() => {
    const source =
      isInbox
        ? openTasks.filter((t) => isPersonalSpaceTask(t, spaceId))
        : openTasks;
    const map = new Map<string | null, TaskRow[]>();
    map.set(null, []);
    for (const g of groups) map.set(g.id, []);
    for (const task of source) {
      const key = task.groupId ?? task.group?.id ?? null;
      // Only place into known personal/project groups; unknown ids → ohne Liste
      const bucket = key != null && map.has(key) ? key : null;
      map.get(bucket)!.push(task);
    }
    return map;
  }, [openTasks, groups, isInbox, spaceId]);

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
    type ProjBucket = {
      key: string;
      label: string;
      spaceId: string;
      tasks: TaskRow[];
    };
    const map = new Map<string, ProjBucket>();
    for (const task of openTasks) {
      const space = task.space;
      const isPersonal =
        !space || space.type === "personal" || space.id === spaceId;
      const key = isPersonal ? `__personal__:${spaceId}` : space.id;
      const label = isPersonal ? "Privat" : space.name;
      const targetSpaceId = isPersonal ? spaceId : space.id;
      if (!map.has(key)) {
        map.set(key, { key, label, spaceId: targetSpaceId, tasks: [] });
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

  const inboxCreateSpace = {
    id: spaceId,
    name: "Privat",
    type: "personal" as const,
  };
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
    if (!canManageGroups) return;
    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (isInbox && !isPersonalSpaceTask(task, spaceId)) return;
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
    if (!canManageGroups) return;
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
    if (!canManageGroups) return;
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (!id || pending) return;
    moveToGroup(id, groupId);
  }

  const canManageGroups = canEdit && (!isInbox || inboxMode === "list");
  const editMembers = canEdit ? members : undefined;
  const listGroups = canManageGroups ? groups : undefined;
  const groupNoun = isInbox ? "Liste" : "Gruppe";
  const personalSpaceMeta = {
    id: spaceId,
    name: isInbox ? "Privat" : title,
    type: isInbox ? ("personal" as const) : ("project" as const),
  };

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
          {isInbox && inboxMode === "list"
            ? " · private Listen"
            : isInbox && inboxMode === "project"
              ? " · zugewiesene Projekt-Tasks"
              : isInbox
                ? " · privat & Projekte nach Fälligkeit"
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

      {isInbox && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "list", label: "Listen", count: viewCounts.list },
              { id: "project", label: "Projekte", count: viewCounts.project },
              { id: "due", label: "Fällig", count: viewCounts.due },
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
                {mode.label} ({mode.count})
              </button>
            );
          })}
        </div>
      )}

      {isInbox && inboxMode === "due" && (
        <div className="space-y-3">
          {DUE_BUCKETS.map((bucket) => {
            const items = openByDue.get(bucket.key) ?? [];
            if (items.length === 0 && !canEdit) return null;
            return (
              <CollapsibleSection
                key={bucket.key}
                sectionKey={`due:${bucket.key}`}
                label={bucket.label}
                count={items.length}
                collapsed={collapsed}
                onToggle={toggle}
                tone={bucket.key === "overdue" ? "danger" : undefined}
              >
                <TaskList
                  tasks={items}
                  enableDrawer
                  compact
                  showSpace
                  members={editMembers}
                  currentUserId={currentUserId}
                  footer={
                    canEdit ? (
                      <InlineTaskAdd
                        spaceId={spaceId}
                        dueAt={dueAtForBucket(bucket.key)}
                        assigneeId={currentUserId}
                        space={inboxCreateSpace}
                        onCreate={createInlineTask}
                      />
                    ) : undefined
                  }
                />
              </CollapsibleSection>
            );
          })}
          {openTasks.length === 0 && !canEdit && (
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
              headerExtra={
                bucket.label !== "Privat" ? (
                  <TaskInboxPinButton
                    kind="project"
                    targetId={bucket.spaceId}
                    pinned={pinnedProjectIds.includes(bucket.spaceId)}
                  />
                ) : undefined
              }
            >
              <TaskList
                tasks={bucket.tasks}
                enableDrawer
                compact
                showSpace={bucket.label !== "Privat"}
                members={editMembers}
                currentUserId={currentUserId}
                footer={
                  canEdit ? (
                    <InlineTaskAdd
                      spaceId={bucket.spaceId}
                      assigneeId={currentUserId}
                      space={{
                        id: bucket.spaceId,
                        name: bucket.label,
                        type:
                          bucket.label === "Privat" ? "personal" : "project",
                      }}
                      onCreate={createInlineTask}
                    />
                  ) : undefined
                }
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

      {(!isInbox || inboxMode === "list") && (
        <>
          <div className="space-y-3">
            <CollapsibleSection
              sectionKey="__none__"
              label={isInbox ? "Ohne Liste" : "Ohne Gruppe"}
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
                currentUserId={currentUserId}
                enableDrag={canManageGroups}
                dropGroupId={null}
                onMoveToGroup={canManageGroups ? moveToGroup : undefined}
                showDueOffset={isTemplate}
                footer={
                  canEdit ? (
                    <InlineTaskAdd
                      spaceId={spaceId}
                      groupId=""
                      assigneeId={currentUserId}
                      space={personalSpaceMeta}
                      onCreate={createInlineTask}
                    />
                  ) : undefined
                }
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
                    !renaming ? (
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isInbox && (
                          <TaskInboxPinButton
                            kind="list"
                            targetId={group.id}
                            pinned={!!group.pinned}
                          />
                        )}
                        {canManageGroups && (
                          <>
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
                                `${groupNoun} «${group.name}» löschen? Tasks bleiben ohne ${groupNoun.toLowerCase()}.`,
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
                          </>
                        )}
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
                      currentUserId={currentUserId}
                      enableDrag={canManageGroups}
                      dropGroupId={group.id}
                      onMoveToGroup={canManageGroups ? moveToGroup : undefined}
                      showDueOffset={isTemplate}
                      footer={
                        canEdit ? (
                          <InlineTaskAdd
                            spaceId={spaceId}
                            groupId={group.id}
                            assigneeId={currentUserId}
                            space={personalSpaceMeta}
                            group={{ id: group.id, name: group.name }}
                            onCreate={createInlineTask}
                          />
                        ) : undefined
                      }
                    />
                  )}
                </CollapsibleSection>
              );
            })}
          </div>

          {canManageGroups &&
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
                  placeholder={`Name der ${groupNoun}…`}
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
                + Neue {groupNoun}
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
            currentUserId={currentUserId}
            showDueOffset={isTemplate}
          />
        </CollapsibleSection>
      )}

      {cancelledTasks.length > 0 && (
        <CollapsibleSection
          sectionKey="__cancelled__"
          label="Abgebrochen"
          count={cancelledTasks.length}
          collapsed={collapsed}
          onToggle={toggle}
          mutedLabel
        >
          <TaskList
            tasks={cancelledTasks}
            enableDrawer
            compact
            showSpace={isInbox}
            groups={listGroups}
            members={editMembers}
            currentUserId={currentUserId}
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
