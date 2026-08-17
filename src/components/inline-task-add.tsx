"use client";

import { useEffect, useRef, useState } from "react";
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
  onCreate: (
    title: string,
    defaults: InlineTaskCreateDefaults,
  ) => Promise<InlineTaskCreateResult>;
};

export function InlineTaskAdd({
  spaceId,
  dueAt,
  dueOffsetDays,
  groupId,
  assigneeId,
  space,
  group,
  assigneeName,
  placeholder = "Aufgabe…",
  onCreate,
}: InlineTaskAddProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setTitle("");
    setError(null);
    setOpen(false);
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
      dueAt,
      dueOffsetDays,
      groupId,
      assigneeId,
      space,
      group,
      assigneeName,
    });

    setPending(false);

    if ("error" in result) {
      setTitle(trimmed);
      setOpen(true);
      setError(result.error);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2.5 py-0.5 text-left text-sm text-[var(--muted)] transition hover:text-[var(--fg)]"
        onClick={() => setOpen(true)}
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
      <div className="flex items-center gap-2.5">
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
          className={[
            "min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-sm font-medium leading-snug outline-none transition",
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
              if (!pending) close();
            }
          }}
          onBlur={() => {
            if (!title.trim() && !pending && !error) close();
          }}
        />
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
