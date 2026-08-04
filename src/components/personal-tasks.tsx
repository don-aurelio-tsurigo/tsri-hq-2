"use client";

import { useMemo, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  projectNotes,
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
  /** When set, shows an editable project notes field under the header. */
  projectNotes?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [addingGroup, setAddingGroup] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo" || t.status === "doing"),
    [tasks],
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done"),
    [tasks],
  );

  const openByGroup = useMemo(() => {
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (!id || pending) return;
    moveToGroup(id, groupId);
  }

  const editMembers = canEdit ? members : undefined;

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
        {!projectNotes && description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
            {description}
          </p>
        ) : null}
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          {openTasks.length} offen
          {doneTasks.length > 0 ? ` · ${doneTasks.length} erledigt` : ""}
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
          showDueDate
          members={editMembers}
          placeholder="Neue Aufgabe…"
        />
      )}

      <div className="space-y-3">
        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => toggle("__none__")}
            onDragOver={(e) => onHeaderDragOver(e, "__none__")}
            onDragLeave={() =>
              setDragOverKey((cur) => (cur === "__none__" ? null : cur))
            }
            onDrop={(e) => onHeaderDrop(e, null)}
            className={[
              "flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-colors",
              dragOverKey === "__none__"
                ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)]"
                : "",
            ].join(" ")}
          >
            <span className="text-[0.65rem] text-[var(--muted)]" aria-hidden>
              {!collapsed.has("__none__") ? "▼" : "▸"}
            </span>
            <span className="text-sm font-semibold">Ohne Gruppe</span>
            <span className="text-xs text-[var(--muted)]">
              {(openByGroup.get(null) ?? []).length}
            </span>
          </button>
          {!collapsed.has("__none__") && (
            <TaskList
              tasks={openByGroup.get(null) ?? []}
              enableDrawer
              compact
              groups={groups}
              members={editMembers}
              enableDrag={canEdit}
              dropGroupId={null}
              onMoveToGroup={canEdit ? moveToGroup : undefined}
            />
          )}
        </section>

        {groups.map((group) => {
          const items = openByGroup.get(group.id) ?? [];
          const open = !collapsed.has(group.id);
          const renaming = renameId === group.id;
          const headerOver = dragOverKey === group.id;
          return (
            <section key={group.id} className="space-y-1.5">
              <div
                className={[
                  "flex items-center gap-1 rounded-lg px-1 transition-colors",
                  headerOver
                    ? "bg-[color-mix(in_oklab,var(--accent)_12%,white)]"
                    : "",
                ].join(" ")}
                onDragOver={(e) => onHeaderDragOver(e, group.id)}
                onDragLeave={() =>
                  setDragOverKey((cur) => (cur === group.id ? null : cur))
                }
                onDrop={(e) => onHeaderDrop(e, group.id)}
              >
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
                >
                  <span className="text-[0.65rem] text-[var(--muted)]" aria-hidden>
                    {open ? "▼" : "▸"}
                  </span>
                  {renaming ? null : (
                    <>
                      <span className="truncate text-sm font-semibold">
                        {group.name}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {items.length}
                      </span>
                    </>
                  )}
                </button>
                {canEdit && !renaming && (
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
                )}
              </div>

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
                  <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
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

              {open && (
                <TaskList
                  tasks={items}
                  enableDrawer
                  compact
                  groups={groups}
                  members={editMembers}
                  enableDrag={canEdit}
                  dropGroupId={group.id}
                  onMoveToGroup={canEdit ? moveToGroup : undefined}
                />
              )}
            </section>
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
            <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
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

      {doneTasks.length > 0 && (
        <section className="space-y-1.5 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => toggle("__done__")}
            className="flex w-full items-center gap-1.5 py-0.5 text-left"
          >
            <span className="text-[0.65rem] text-[var(--muted)]" aria-hidden>
              {!collapsed.has("__done__") ? "▼" : "▸"}
            </span>
            <span className="text-sm font-semibold text-[var(--muted)]">
              Erledigt
            </span>
            <span className="text-xs text-[var(--muted)]">{doneTasks.length}</span>
          </button>
          {!collapsed.has("__done__") && (
            <TaskList
              tasks={doneTasks}
              enableDrawer
              compact
              groups={groups}
              members={editMembers}
            />
          )}
        </section>
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
