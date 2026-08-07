"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask, updateTask } from "@/lib/actions";
import type { TaskStatus } from "@/generated/prisma/client";

type Member = { id: string; name: string };

export function CreateTaskForm({
  spaceId,
  compact,
  members,
  groups,
  groupId,
  placeholder = "Neue private Aufgabe…",
  showDueDate,
  showDueOffset,
}: {
  spaceId: string;
  compact?: boolean;
  members?: Member[];
  groups?: { id: string; name: string }[];
  groupId?: string;
  placeholder?: string;
  /** Compact: show date input instead of group select */
  showDueDate?: boolean;
  /** Compact/full: relative days to event (templates) */
  showDueOffset?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const showAssignee = !!members && members.length > 0;

  return (
    <form
      className={compact ? "flex flex-wrap gap-2" : "card flex flex-col gap-3 p-4"}
      action={(fd) => {
        startTransition(async () => {
          await createTask(fd);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="kind" value="generic" />
      {groupId !== undefined && (
        <input type="hidden" name="groupId" value={groupId} />
      )}
      {compact ? (
        <>
          <input
            name="title"
            required
            placeholder={placeholder}
            className="min-w-0 flex-1 basis-[10rem] rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm"
          />
          {showDueOffset ? (
            <input
              type="number"
              name="dueOffsetDays"
              aria-label="Tage relativ zum Event"
              title="Negativ = vor dem Event"
              placeholder="−Tage"
              className="w-[5.5rem] shrink-0 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            />
          ) : (
            showDueDate && (
              <input
                type="date"
                name="dueAt"
                aria-label="Fällig am"
                className="w-[9.5rem] shrink-0 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              />
            )
          )}
          {showAssignee && (
            <select
              name="assigneeId"
              defaultValue=""
              aria-label="Zuständig"
              title="Zuständig"
              className="max-w-[9.5rem] shrink-0 truncate rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            >
              <option value="">— ich —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary shrink-0 px-3 py-1.5" type="submit" disabled={pending}>
            +
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="title">Aufgabe</label>
            <input id="title" name="title" required placeholder="Was ist zu tun?" />
          </div>
          <div className="field">
            <label htmlFor="description">Beschreibung</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Optionaler Freitext…"
            />
          </div>
          <div className={`grid gap-3 ${showAssignee ? "sm:grid-cols-2" : ""}`}>
            {showAssignee && (
              <div className="field">
                <label htmlFor="assigneeId">Zuständig</label>
                <select id="assigneeId" name="assigneeId" defaultValue="">
                  <option value="">— ich / später —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor={showDueOffset ? "dueOffsetDays" : "dueAt"}>
                {showDueOffset ? "Tage relativ zum Event" : "Fällig am"}
              </label>
              {showDueOffset ? (
                <input
                  id="dueOffsetDays"
                  name="dueOffsetDays"
                  type="number"
                  placeholder="z.B. -14"
                />
              ) : (
                <input id="dueAt" name="dueAt" type="date" />
              )}
            </div>
          </div>
          {groups && groups.length > 0 && groupId === undefined && (
            <div className="field">
              <label htmlFor="groupId">Gruppe</label>
              <select id="groupId" name="groupId" defaultValue="">
                <option value="">— keine Gruppe —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary self-start" type="submit" disabled={pending}>
            Task anlegen
          </button>
        </>
      )}
    </form>
  );
}

/** Brief pause so the checkmark is visible before the task leaves the open list. */
const DONE_CONFIRM_MS = 480;

export function TaskDoneCheckbox({
  id,
  status,
}: {
  id: string;
  status: TaskStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const done = status === "done";
  const displayDone = optimisticDone ?? done;

  useEffect(() => {
    setOptimisticDone(null);
  }, [status]);

  function toggle() {
    if (pending) return;
    const nextDone = !displayDone;
    setOptimisticDone(nextDone);

    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", nextDone ? "done" : "todo");

    startTransition(async () => {
      if (nextDone) {
        await new Promise((resolve) => setTimeout(resolve, DONE_CONFIRM_MS));
      }
      const result = await updateTask(fd);
      if (result?.error) {
        setOptimisticDone(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      className="group inline-flex shrink-0 items-center justify-center rounded-md p-0.5 disabled:opacity-70"
      aria-pressed={displayDone}
      aria-label={
        displayDone ? "Als offen markieren" : "Erledigen und archivieren"
      }
      title={displayDone ? "Als offen markieren" : "Erledigen"}
    >
      <span
        className={[
          "inline-flex size-[1.15rem] items-center justify-center rounded-[5px] border-2 transition-[transform,background-color,border-color] duration-150",
          displayDone
            ? "task-check-pop border-[var(--fg)] bg-[var(--highlight)] text-[var(--fg)]"
            : "border-[var(--border)] bg-white group-hover:border-[var(--fg)]",
        ].join(" ")}
      >
        {displayDone && (
          <svg
            viewBox="0 0 16 16"
            className="task-check-mark size-3"
            aria-hidden
          >
            <path
              d="M3.2 8.2 6.5 11.4 12.8 4.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

export function TaskStatusSelect(props: {
  id: string;
  status: TaskStatus;
}) {
  return <TaskDoneCheckbox {...props} />;
}

export function TaskAssigneeSelect({
  id,
  assigneeId,
  members,
  compact = false,
}: {
  id: string;
  assigneeId: string | null;
  members: Member[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="inline"
      action={(fd) => {
        startTransition(async () => {
          await updateTask(fd);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <select
        key={`${id}-${assigneeId ?? ""}`}
        name="assigneeId"
        defaultValue={assigneeId ?? ""}
        disabled={pending}
        aria-label="Zuständig"
        title="Zuständig"
        className={[
          "max-w-[9.5rem] truncate rounded-md border border-[var(--border)] bg-white text-[var(--fg)]",
          compact ? "px-1.5 py-0.5 text-[0.7rem]" : "px-2 py-1 text-xs",
        ].join(" ")}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">— niemand —</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </form>
  );
}
