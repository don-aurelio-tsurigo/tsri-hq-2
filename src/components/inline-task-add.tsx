"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  TaskAssigneePicker,
  type AssigneeMember,
} from "@/components/task-assignee-picker";
import { TaskDuePicker } from "@/components/task-due-picker";
import type { TaskRow } from "@/components/task-list";

export type InlineTaskCreateDefaults = {
  spaceId: string;
  dueAt?: string | null;
  dueOffsetDays?: number | null;
  groupId?: string | null;
  assigneeId?: string | null;
  /** Used for optimistic row display */
  space?: TaskRow["space"];
  group?: TaskRow["group"];
  assigneeName?: string | null;
};

export type InlineTaskCreateResult = { error: string } | { ok: true };

type InlineTaskAddProps = InlineTaskCreateDefaults & {
  placeholder?: string;
  members?: AssigneeMember[];
  onCreate: (
    title: string,
    defaults: InlineTaskCreateDefaults,
  ) => Promise<InlineTaskCreateResult>;
};

function parseDueProp(dueAt?: string | null): Date | null {
  if (!dueAt || dueAt.length === 0) return null;
  const date = new Date(`${dueAt}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function InlineTaskAdd({
  spaceId,
  dueAt,
  dueOffsetDays,
  groupId,
  assigneeId,
  space,
  group,
  assigneeName,
  members,
  placeholder = "Aufgabe…",
  onCreate,
}: InlineTaskAddProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [localDueAt, setLocalDueAt] = useState<Date | null>(null);
  const [localAssigneeId, setLocalAssigneeId] = useState<string | null>(null);
  const [localAssigneeName, setLocalAssigneeName] = useState<string | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ignoreBlurCloseRef = useRef(false);

  const showAssignee = Boolean(members && members.length > 0);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function initLocalMeta() {
    setLocalDueAt(parseDueProp(dueAt));
    setLocalAssigneeId(assigneeId ?? null);
    setLocalAssigneeName(
      assigneeName ??
        members?.find((m) => m.id === assigneeId)?.name ??
        null,
    );
  }

  function close() {
    setTitle("");
    setError(null);
    setLocalDueAt(null);
    setLocalAssigneeId(null);
    setLocalAssigneeName(null);
    setPickerOpen(false);
    setOpen(false);
  }

  function focusTitle() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || pending) return;

    setError(null);
    setPending(true);
    // Clear input immediately for snappy UX; restore on failure
    setTitle("");

    const result = await onCreate(trimmed, {
      spaceId,
      dueAt: localDueAt ? format(localDueAt, "yyyy-MM-dd") : null,
      dueOffsetDays,
      groupId,
      assigneeId: localAssigneeId,
      space,
      group,
      assigneeName: localAssigneeName,
    });

    setPending(false);

    if ("error" in result) {
      setTitle(trimmed);
      setOpen(true);
      setError(result.error);
      focusTitle();
      return;
    }

    focusTitle();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-[var(--muted)] transition hover:text-[var(--fg)]"
        onClick={() => {
          initLocalMeta();
          setOpen(true);
        }}
      >
        <span
          className="flex size-[1.15rem] shrink-0 items-center justify-center text-base leading-none"
          aria-hidden
        >
          +
        </span>
        <span>Aufgabe hinzufügen</span>
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span
          className="flex size-[1.15rem] shrink-0 items-center justify-center text-base leading-none text-[var(--muted)]"
          aria-hidden
        >
          +
        </span>
        <input
          ref={inputRef}
          value={title}
          disabled={pending}
          placeholder={placeholder}
          aria-label="Neue Aufgabe"
          aria-invalid={!!error}
          // 16px prevents iOS Safari from zooming on focus
          className={[
            "min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 text-[16px] font-medium leading-snug outline-none transition sm:py-1 sm:text-sm",
            "placeholder:font-normal placeholder:text-[var(--muted)]",
            "disabled:opacity-60",
            error
              ? "border-red-300 focus:border-[var(--danger)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_22%,transparent)]"
              : "border-[var(--border)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_28%,transparent)]",
          ].join(" ")}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              if (!pending && !pickerOpen) close();
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (ignoreBlurCloseRef.current) {
                ignoreBlurCloseRef.current = false;
                return;
              }
              if (pickerOpen || pending || error) return;
              if (!title.trim()) close();
            }, 0);
          }}
        />
        <div
          className="flex shrink-0 items-center gap-0.5"
          onMouseDown={() => {
            ignoreBlurCloseRef.current = true;
          }}
        >
          <TaskDuePicker
            dueAt={localDueAt}
            compact
            onChange={(next) => {
              setLocalDueAt(next);
              focusTitle();
            }}
            onOpenChange={(next) => {
              setPickerOpen(next);
              if (!next) focusTitle();
            }}
          />
          {showAssignee && (
            <TaskAssigneePicker
              assigneeId={localAssigneeId}
              assigneeName={localAssigneeName}
              members={members!}
              compact
              onChange={(nextId, member) => {
                setLocalAssigneeId(nextId);
                setLocalAssigneeName(member?.name ?? null);
                focusTitle();
              }}
              onOpenChange={(next) => {
                setPickerOpen(next);
                if (!next) focusTitle();
              }}
            />
          )}
        </div>
      </div>
      {error && (
        <p className="pl-[1.9rem] text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}

export function buildOptimisticTask(
  title: string,
  defaults: InlineTaskCreateDefaults,
): TaskRow {
  const dueAt =
    defaults.dueAt && defaults.dueAt.length > 0
      ? new Date(`${defaults.dueAt}T12:00:00`)
      : null;

  return {
    id: `optimistic-${crypto.randomUUID()}`,
    title,
    status: "todo",
    dueAt,
    dueOffsetDays: defaults.dueOffsetDays ?? null,
    assigneeId: defaults.assigneeId ?? null,
    groupId:
      defaults.groupId === undefined ? null : defaults.groupId || null,
    createdAt: new Date(),
    space: defaults.space,
    assignee:
      defaults.assigneeId != null
        ? {
            id: defaults.assigneeId,
            name: defaults.assigneeName?.trim() || "Ich",
          }
        : null,
    createdBy: null,
    group:
      defaults.groupId && defaults.groupId.length > 0
        ? (defaults.group ?? { id: defaults.groupId, name: "" })
        : null,
  };
}

export function buildCreateTaskFormData(
  title: string,
  defaults: InlineTaskCreateDefaults,
): FormData {
  const fd = new FormData();
  fd.set("spaceId", defaults.spaceId);
  fd.set("title", title);
  if (defaults.groupId !== undefined) {
    fd.set("groupId", defaults.groupId ?? "");
  }
  if (defaults.dueAt) {
    fd.set("dueAt", defaults.dueAt);
  }
  if (defaults.dueOffsetDays != null) {
    fd.set("dueOffsetDays", String(defaults.dueOffsetDays));
  }
  if (defaults.assigneeId) {
    fd.set("assigneeId", defaults.assigneeId);
  }
  return fd;
}
