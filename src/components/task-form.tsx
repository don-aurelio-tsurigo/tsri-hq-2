"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask } from "@/lib/actions";
import type { TaskStatus } from "@/generated/prisma/client";

type Member = { id: string; name: string; email?: string | null };

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
    if (pending || status === "cancelled") return;
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
      disabled={pending || status === "cancelled"}
      onClick={toggle}
      className="group inline-flex size-8 shrink-0 items-center justify-center rounded-md disabled:opacity-70 sm:size-auto sm:p-0.5"
      aria-pressed={displayDone}
      aria-label={displayDone ? "Als offen markieren" : "Erledigen"}
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
