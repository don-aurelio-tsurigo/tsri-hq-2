"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isPast, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { TaskAssigneeSelect, TaskDoneCheckbox } from "@/components/task-form";
import { updateTask } from "@/lib/actions";
import type { TaskStatus } from "@/generated/prisma/client";

const DRAWER_MS = 280;
export const TASK_DRAG_TYPE = "text/task-id";

export type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueAt: Date | string | null;
  dueOffsetDays?: number | null;
  kind: string;
  stage: string | null;
  assigneeId?: string | null;
  groupId?: string | null;
  createdAt?: Date | string;
  space?: { id: string; name: string; type: string };
  assignee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
};

type Member = { id: string; name: string };
type TaskGroupOption = { id: string; name: string };

function dueLabel(dueAt: Date | string | null) {
  if (!dueAt) return null;
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const label = format(date, "d. MMM", { locale: de });
  if (isToday(date)) return { label: "Heute", tone: "warn" as const };
  if (isPast(date)) return { label, tone: "late" as const };
  return { label, tone: "ok" as const };
}

function offsetLabel(dueOffsetDays: number | null | undefined) {
  if (dueOffsetDays == null) return null;
  if (dueOffsetDays === 0) return "Event-Tag";
  if (dueOffsetDays < 0) return `${Math.abs(dueOffsetDays)}d vorher`;
  return `${dueOffsetDays}d nachher`;
}

function toDateInputValue(dueAt: Date | string | null) {
  if (!dueAt) return "";
  const date = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
}

export function TaskList({
  tasks,
  showSpace = false,
  members,
  groups,
  showDescription = false,
  enableDrawer = false,
  compact = false,
  enableDrag = false,
  dropGroupId,
  onMoveToGroup,
  /** Template mode: show/edit relative day offsets instead of absolute dates */
  showDueOffset = false,
}: {
  tasks: TaskRow[];
  showSpace?: boolean;
  members?: Member[];
  groups?: TaskGroupOption[];
  showDescription?: boolean;
  enableDrawer?: boolean;
  compact?: boolean;
  enableDrag?: boolean;
  /** Target group for drops (`null` = ohne Gruppe). Requires onMoveToGroup. */
  dropGroupId?: string | null;
  onMoveToGroup?: (taskId: string, groupId: string | null) => void;
  showDueOffset?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const canDrop = enableDrag && !!onMoveToGroup && dropGroupId !== undefined;

  function saveTask(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateTask(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSelectedId(null);
      router.refresh();
    });
  }

  function handleDragOver(e: DragEvent) {
    if (!canDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: DragEvent) {
    if (!canDrop || !onMoveToGroup) return;
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    if (!id) return;
    onMoveToGroup(id, dropGroupId ?? null);
  }

  const dropClass = dragOver
    ? "ring-2 ring-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,white)]"
    : "";

  if (tasks.length === 0) {
    return (
      <>
        <div
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            "card text-center text-[var(--muted)] transition-colors",
            compact ? "px-3 py-3 text-sm" : "px-5 py-10",
            dropClass,
          ].join(" ")}
        >
          {canDrop ? "Hierhin ziehen" : "Noch keine Aufgaben hier."}
        </div>
        {enableDrawer && (
          <TaskDrawer
            task={selected}
            members={members}
            groups={groups}
            pending={pending}
            error={error}
            showDueOffset={showDueOffset}
            onClose={() => {
              setError(null);
              setSelectedId(null);
            }}
            onSave={saveTask}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ul
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          "card divide-y divide-[var(--border)] overflow-hidden transition-colors",
          compact ? "text-sm" : "",
          dropClass,
        ].join(" ")}
      >
        {tasks.map((task) => {
          const due = showDueOffset
            ? null
            : dueLabel(task.dueAt);
          const offset = showDueOffset
            ? offsetLabel(task.dueOffsetDays)
            : null;
          const active = selectedId === task.id;
          return (
            <li
              key={task.id}
              draggable={enableDrag}
              onDragStart={(e) => {
                if (!enableDrag) return;
                e.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className={[
                "flex items-center gap-2.5 transition-opacity duration-200",
                compact ? "px-3 py-1.5" : "px-4 py-3 gap-3",
                active ? "bg-[color-mix(in_oklab,var(--accent)_8%,white)]" : "",
                enableDrag
                  ? "cursor-grab active:cursor-grabbing"
                  : "",
                "has-[button[aria-pressed=true]]:opacity-70",
                "has-[button[aria-pressed=true]]:[&_.task-title]:text-[var(--muted)]",
                "has-[button[aria-pressed=true]]:[&_.task-title]:line-through",
              ].join(" ")}
            >
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <TaskDoneCheckbox id={task.id} status={task.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    compact
                      ? "flex min-w-0 items-baseline gap-2"
                      : undefined
                  }
                >
                  {enableDrawer ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedId(task.id)}
                    >
                      <p
                        className={[
                          "task-title truncate leading-snug font-medium underline-offset-2 hover:underline",
                          compact ? "text-sm" : "",
                          task.status === "done"
                            ? "text-[var(--muted)] line-through"
                            : "",
                        ].join(" ")}
                      >
                        {task.title}
                      </p>
                    </button>
                  ) : (
                    <p
                      className={[
                        "task-title min-w-0 flex-1 truncate leading-snug font-medium",
                        compact ? "text-sm" : "",
                        task.status === "done"
                          ? "text-[var(--muted)] line-through"
                          : "",
                      ].join(" ")}
                    >
                      {task.title}
                    </p>
                  )}
                  {compact && due && (
                    <span
                      className={[
                        "shrink-0 text-[0.7rem]",
                        due.tone === "late"
                          ? "text-[var(--danger)]"
                          : due.tone === "warn"
                            ? "text-[var(--warn,#9a6700)]"
                            : "text-[var(--muted)]",
                      ].join(" ")}
                    >
                      {due.label}
                    </span>
                  )}
                  {compact && offset && (
                    <span className="shrink-0 text-[0.7rem] text-[var(--muted)]">
                      {offset}
                    </span>
                  )}
                  {compact && showSpace && task.space && (
                    task.space.type === "project" ? (
                      <Link
                        href={`/projects/${task.space.id}`}
                        className="shrink-0 text-[0.7rem] text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.space.name}
                      </Link>
                    ) : (
                      <span className="shrink-0 text-[0.7rem] text-[var(--muted)]">
                        {task.space.name}
                      </span>
                    )
                  )}
                </div>
                {showDescription && task.description && !compact && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
                    {task.description}
                  </p>
                )}
                {!compact && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    {showSpace && task.space && (
                      <span className="badge badge-muted">{task.space.name}</span>
                    )}
                    {task.kind !== "generic" && (
                      <span className="badge">{task.kind}</span>
                    )}
                    {task.stage && (
                      <span className="badge badge-muted">Stage: {task.stage}</span>
                    )}
                    {!members &&
                      task.assignee &&
                      task.space?.type !== "personal" && (
                        <span>→ {task.assignee.name}</span>
                      )}
                    {due && (
                      <span
                        className={
                          due.tone === "late"
                            ? "text-[var(--danger)]"
                            : due.tone === "warn"
                              ? "text-[var(--warn,#9a6700)]"
                              : ""
                        }
                      >
                        Fällig {due.label}
                      </span>
                    )}
                    {offset && <span>Relativ: {offset}</span>}
                  </div>
                )}
              </div>
              {members ? (
                <div
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <TaskAssigneeSelect
                    id={task.id}
                    assigneeId={task.assigneeId ?? task.assignee?.id ?? null}
                    members={members}
                    compact={compact}
                  />
                </div>
              ) : (
                task.assignee &&
                task.space?.type !== "personal" && (
                  <span className="shrink-0 text-[0.65rem] text-[var(--muted)]">
                    {task.assignee.name.split(" ")[0]}
                  </span>
                )
              )}
            </li>
          );
        })}
      </ul>

      {enableDrawer && (
        <TaskDrawer
          task={selected}
          members={members}
          groups={groups}
          pending={pending}
          error={error}
          showDueOffset={showDueOffset}
          onClose={() => {
            setError(null);
            setSelectedId(null);
          }}
          onSave={saveTask}
        />
      )}
    </>
  );
}

function TaskDrawer({
  task,
  members,
  groups,
  pending,
  error,
  showDueOffset = false,
  onClose,
  onSave,
}: {
  task: TaskRow | null;
  members?: Member[];
  groups?: TaskGroupOption[];
  pending: boolean;
  error: string | null;
  showDueOffset?: boolean;
  onClose: () => void;
  onSave: (fd: FormData) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [panelTask, setPanelTask] = useState<TaskRow | null>(null);

  useEffect(() => {
    if (task) {
      setPanelTask(task);
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      setPanelTask(null);
    }, DRAWER_MS);
    return () => window.clearTimeout(t);
  }, [task]);

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

  if (!mounted || !panelTask) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
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
              Task bearbeiten
            </p>
            {panelTask.createdAt && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Erstellt{" "}
                {format(new Date(panelTask.createdAt), "d. MMMM yyyy, HH:mm", {
                  locale: de,
                })}
                {panelTask.createdBy ? ` · von ${panelTask.createdBy.name}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={onClose}
          >
            Schliessen
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form
            key={panelTask.id}
            className="flex flex-col gap-3"
            action={(fd) => onSave(fd)}
          >
            <input type="hidden" name="id" value={panelTask.id} />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <div className="field">
              <label htmlFor={`task-title-${panelTask.id}`}>Titel</label>
              <input
                id={`task-title-${panelTask.id}`}
                name="title"
                defaultValue={panelTask.title}
                required
                disabled={pending}
              />
            </div>
            <div className="field">
              <label htmlFor={`task-body-${panelTask.id}`}>Beschreibung</label>
              <textarea
                id={`task-body-${panelTask.id}`}
                name="description"
                rows={8}
                defaultValue={panelTask.description ?? ""}
                disabled={pending}
              />
            </div>
            <div className="field">
              <label htmlFor={`task-due-${panelTask.id}`}>
                {showDueOffset ? "Tage relativ zum Event" : "Fällig am"}
              </label>
              {showDueOffset ? (
                <>
                  <input
                    id={`task-due-${panelTask.id}`}
                    type="number"
                    name="dueOffsetDays"
                    defaultValue={
                      panelTask.dueOffsetDays != null
                        ? String(panelTask.dueOffsetDays)
                        : ""
                    }
                    placeholder="z.B. -14"
                    disabled={pending}
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Negativ = vor dem Event (−14 = 2 Wochen vorher).
                  </p>
                </>
              ) : (
                <input
                  id={`task-due-${panelTask.id}`}
                  type="date"
                  name="dueAt"
                  defaultValue={toDateInputValue(panelTask.dueAt)}
                  disabled={pending}
                />
              )}
            </div>
            {groups && (
              <div className="field">
                <label htmlFor={`task-group-${panelTask.id}`}>Gruppe</label>
                <select
                  id={`task-group-${panelTask.id}`}
                  name="groupId"
                  defaultValue={
                    panelTask.groupId ?? panelTask.group?.id ?? ""
                  }
                  disabled={pending}
                >
                  <option value="">— keine Gruppe —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-[var(--border)] accent-[var(--accent)]"
                defaultChecked={panelTask.status === "done"}
                disabled={pending}
                onChange={(e) => {
                  const hidden = e.currentTarget.form?.elements.namedItem(
                    "status",
                  ) as HTMLInputElement | null;
                  if (hidden) hidden.value = e.currentTarget.checked ? "done" : "todo";
                }}
              />
              <input
                type="hidden"
                name="status"
                defaultValue={panelTask.status === "done" ? "done" : "todo"}
              />
              Erledigt (archivieren)
            </label>
            {members && members.length > 0 && (
              <div className="field">
                <label htmlFor={`task-assignee-${panelTask.id}`}>Zuständig</label>
                <select
                  id={`task-assignee-${panelTask.id}`}
                  name="assigneeId"
                  defaultValue={
                    panelTask.assigneeId ?? panelTask.assignee?.id ?? ""
                  }
                  disabled={pending}
                >
                  <option value="">— niemand —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] pt-4 pb-1">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pending}
              >
                {pending ? "…" : "Speichern"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
