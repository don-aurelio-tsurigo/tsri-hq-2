"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { TaskAssigneePicker } from "@/components/task-assignee-picker";
import { TaskDuePicker } from "@/components/task-due-picker";
import { TaskDoneCheckbox } from "@/components/task-form";
import { useDeleteTaskWithUndo } from "@/components/use-delete-task-with-undo";
import { TaskEditorDialog } from "@/components/task-editor-dialog";
import { cancelTask, updateTask } from "@/lib/actions";
import { markdownToPlainText } from "@/lib/markdown-plain";
import { useFinePointer } from "@/lib/use-media-query";
import type { TaskStatus } from "@/generated/prisma/client";

export const TASK_DRAG_TYPE = "text/task-id";

export type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueAt: Date | string | null;
  dueOffsetDays?: number | null;
  recurrence?: unknown;
  assigneeId?: string | null;
  groupId?: string | null;
  createdAt?: Date | string;
  space?: { id: string; name: string; type: string };
  assignee?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  group?: { id: string; name: string } | null;
};

type Member = { id: string; name: string; email?: string | null };
type TaskGroupOption = { id: string; name: string };

function offsetLabel(dueOffsetDays: number | null | undefined) {
  if (dueOffsetDays == null) return null;
  if (dueOffsetDays === 0) return "Event-Tag";
  if (dueOffsetDays < 0) return `${Math.abs(dueOffsetDays)}d vorher`;
  return `${dueOffsetDays}d nachher`;
}

function TaskRowMenu({ task }: { task: TaskRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteWithUndo = useDeleteTaskWithUndo();

  const showComplete = task.status !== "done" && task.status !== "cancelled";
  const showCancel = task.status !== "cancelled";

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    function updatePos() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setMenuPos({
        top: r.bottom + 4,
        right: Math.max(8, window.innerWidth - r.right),
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markDone() {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("status", "done");
    startTransition(async () => {
      const result = await updateTask(fd);
      setOpen(false);
      if (result && "error" in result && result.error) return;
      router.refresh();
    });
  }

  function markCancelled() {
    startTransition(async () => {
      const result = await cancelTask(task.id);
      setOpen(false);
      if (result && "error" in result && result.error) return;
      router.refresh();
    });
  }

  function markDeleted() {
    startTransition(async () => {
      setOpen(false);
      await deleteWithUndo(task.id);
    });
  }

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[80] min-w-[9.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          >
            {showComplete && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  markDone();
                }}
              >
                Erledigen
              </button>
            )}
            {showCancel && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5"
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  markCancelled();
                }}
              >
                Abbrechen
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-black/5"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                markDeleted();
              }}
            >
              Löschen
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)] sm:size-7"
        aria-label="Task-Aktionen"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {menu}
    </div>
  );
}

export function TaskList({
  tasks,
  showSpace = false,
  members,
  currentUserId: _currentUserId,
  groups,
  showDescription = false,
  enableDrawer = false,
  compact = false,
  enableDrag = false,
  dropGroupId,
  onMoveToGroup,
  /** Template mode: show/edit relative day offsets instead of absolute dates */
  showDueOffset = false,
  /** Renders as last row inside the same card (e.g. inline add). */
  footer,
}: {
  tasks: TaskRow[];
  showSpace?: boolean;
  members?: Member[];
  /** Reserved for callers; assignee picker is always available when members are set. */
  currentUserId?: string;
  groups?: TaskGroupOption[];
  showDescription?: boolean;
  enableDrawer?: boolean;
  compact?: boolean;
  enableDrag?: boolean;
  /** Target group for drops (`null` = ohne Gruppe). Requires onMoveToGroup. */
  dropGroupId?: string | null;
  onMoveToGroup?: (taskId: string, groupId: string | null) => void;
  showDueOffset?: boolean;
  footer?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Keeps the editor open when the task leaves this list (e.g. marked done).
  const [selectedSnapshot, setSelectedSnapshot] = useState<TaskRow | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);

  const selected =
    tasks.find((t) => t.id === selectedId) ??
    (selectedSnapshot?.id === selectedId ? selectedSnapshot : null);

  function openTask(task: TaskRow) {
    setSelectedSnapshot(task);
    setSelectedId(task.id);
  }
  const canDrop = enableDrag && !!onMoveToGroup && dropGroupId !== undefined;
  const finePointer = useFinePointer();
  const allowDrag = enableDrag && finePointer;

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
    if (footer) {
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
            <li className={compact ? "px-3 py-1.5" : "px-4 py-3"}>
              {footer}
            </li>
          </ul>
          {enableDrawer && (
            <TaskEditorDialog
              task={selected}
              members={members}
              groups={groups}
              showDueOffset={showDueOffset}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      );
    }
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
          <TaskEditorDialog
            task={selected}
            members={members}
            groups={groups}
            showDueOffset={showDueOffset}
            onClose={() => setSelectedId(null)}
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
          const offset = showDueOffset
            ? offsetLabel(task.dueOffsetDays)
            : null;
          const active = selectedId === task.id;
          const assigneeId = task.assigneeId ?? task.assignee?.id ?? null;
          return (
            <li
              key={task.id}
              draggable={allowDrag}
              onDragStart={(e) => {
                if (!allowDrag) return;
                e.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className={[
                "flex items-center gap-2 transition-opacity duration-200",
                compact ? "px-3 py-1.5" : "px-4 py-3 gap-3",
                active ? "bg-[color-mix(in_oklab,var(--accent)_8%,white)]" : "",
                allowDrag ? "sm:cursor-grab sm:active:cursor-grabbing" : "",
                "has-[button[aria-pressed=true]]:opacity-70",
                "has-[button[aria-pressed=true]]:[&_.task-title]:text-[var(--muted)]",
                "has-[button[aria-pressed=true]]:[&_.task-title]:line-through",
              ].join(" ")}
            >
              <div
                className="flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <TaskDoneCheckbox id={task.id} status={task.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    compact
                      ? "flex min-w-0 items-center gap-1.5"
                      : undefined
                  }
                >
                  {enableDrawer ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openTask(task)}
                    >
                      <p
                        className={[
                          "task-title truncate leading-none font-medium underline-offset-2 hover:underline",
                          compact ? "text-sm" : "leading-snug",
                          task.status === "done" ||
                          task.status === "cancelled"
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
                        "task-title min-w-0 flex-1 truncate font-medium",
                        compact ? "text-sm leading-none" : "leading-snug",
                        task.status === "done" ||
                        task.status === "cancelled"
                          ? "text-[var(--muted)] line-through"
                          : "",
                      ].join(" ")}
                    >
                      {task.title}
                    </p>
                  )}
                  {compact && !showDueOffset && (
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <TaskDuePicker
                        taskId={task.id}
                        dueAt={task.dueAt}
                        recurrence={task.recurrence}
                        allowRecurrence={!showDueOffset}
                        compact
                      />
                    </div>
                  )}
                  {compact && offset && (
                    <span className="shrink-0 text-[0.7rem] leading-none text-[var(--muted)]">
                      {offset}
                    </span>
                  )}
                  {compact && showSpace && task.space && (
                    task.space.type === "project" ? (
                      <Link
                        href={`/projects/${task.space.id}`}
                        className="badge badge-space-project max-w-[5.5rem] shrink-0 truncate !px-1.5 !py-0 text-[0.65rem] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.space.name}
                      </Link>
                    ) : (
                      <span className="badge badge-muted max-w-[5.5rem] shrink-0 truncate !px-1.5 !py-0 text-[0.65rem]">
                        {task.space.name}
                      </span>
                    )
                  )}
                </div>
                {showDescription && task.description && !compact && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-[var(--muted)]">
                    {markdownToPlainText(task.description)}
                  </p>
                )}
                {!compact && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    {showSpace && task.space && (
                      <span
                        className={[
                          "badge",
                          task.space.type === "project"
                            ? "badge-space-project"
                            : "badge-muted",
                        ].join(" ")}
                      >
                        {task.space.name}
                      </span>
                    )}
                    {!members &&
                      task.assignee &&
                      task.space?.type !== "personal" && (
                        <span>→ {task.assignee.name}</span>
                      )}
                    {!showDueOffset && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <TaskDuePicker
                          taskId={task.id}
                          dueAt={task.dueAt}
                        recurrence={task.recurrence}
                        allowRecurrence={!showDueOffset}
                          compact={false}
                        />
                      </div>
                    )}
                    {offset && <span>Relativ: {offset}</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {members && members.length > 0 ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <TaskAssigneePicker
                      taskId={task.id}
                      assigneeId={assigneeId}
                      assigneeName={task.assignee?.name}
                      members={members}
                      compact={compact}
                    />
                  </div>
                ) : (
                  task.assignee &&
                  task.space?.type !== "personal" && (
                    <span className="px-1 text-[0.65rem] text-[var(--muted)]">
                      {task.assignee.name.split(" ")[0]}
                    </span>
                  )
                )}
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <TaskRowMenu task={task} />
                </div>
              </div>
            </li>
          );
        })}
        {footer ? (
          <li className={compact ? "px-3 py-1.5" : "px-4 py-3"}>{footer}</li>
        ) : null}
      </ul>

      {enableDrawer && (
        <TaskEditorDialog
          task={selected}
          members={members}
          groups={groups}
          showDueOffset={showDueOffset}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
