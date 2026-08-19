"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { updateTask } from "@/lib/actions";

export type AssigneeMember = {
  id: string;
  name: string;
  email?: string | null;
};

const AVATAR_COLORS = [
  "#5b8def",
  "#e07a5f",
  "#81b29a",
  "#f2cc8f",
  "#9b5de5",
  "#00bbf9",
  "#f15bb5",
  "#00f5d4",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function matchesQuery(member: AssigneeMember, q: string) {
  if (!q) return true;
  const hay = `${member.name} ${member.email ?? ""}`.toLowerCase();
  return hay.includes(q);
}

export function TaskAssigneePicker({
  taskId,
  assigneeId,
  assigneeName,
  members,
  compact = true,
}: {
  taskId: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  members: AssigneeMember[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    assigneeId != null
      ? (members.find((m) => m.id === assigneeId) ??
        (assigneeName
          ? { id: assigneeId, name: assigneeName, email: null }
          : null))
      : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => matchesQuery(m, q));
  }, [members, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    function updatePos() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = 300;
      const left = Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      );
      setPos({ top: r.bottom + 6, left: Math.max(8, left) });
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
      if (popoverRef.current?.contains(target)) return;
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

  function saveAssignee(nextId: string | null) {
    const fd = new FormData();
    fd.set("id", taskId);
    fd.set("assigneeId", nextId ?? "");
    startTransition(async () => {
      const result = await updateTask(fd);
      setOpen(false);
      if (result && "error" in result && result.error) return;
      router.refresh();
    });
  }

  const trigger = selected ? (
    <button
      ref={buttonRef}
      type="button"
      disabled={pending}
      aria-label={`Zuständig: ${selected.name}, ändern`}
      aria-expanded={open}
      title={selected.name}
      className={[
        "inline-flex shrink-0 items-center gap-1.5 rounded-full transition hover:opacity-90 disabled:opacity-60",
        compact ? "" : "pr-1.5",
      ].join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span
        className="inline-flex size-7 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white"
        style={{ backgroundColor: avatarColor(selected.id) }}
        aria-hidden
      >
        {initials(selected.name)}
      </span>
      {!compact && (
        <span className="max-w-[7rem] truncate text-xs text-[var(--muted)]">
          {selected.name.split(" ")[0]}
        </span>
      )}
    </button>
  ) : (
    <button
      ref={buttonRef}
      type="button"
      disabled={pending}
      aria-label="Zuständigkeit setzen"
      aria-expanded={open}
      title="Zuständig"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--fg)] hover:text-[var(--fg)] disabled:opacity-60"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <User className="size-3.5" strokeWidth={1.75} />
    </button>
  );

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            aria-label="Zuständig"
            style={{ top: pos.top, left: pos.left, width: 300 }}
            className="fixed z-[80] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name oder E-Mail…"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_28%,transparent)]"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selected}
                  disabled={pending}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-60"
                  onClick={() => saveAssignee(null)}
                >
                  <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)]">
                    <User className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="font-medium text-[var(--muted)]">
                    Niemand
                  </span>
                </button>
              </li>
              {filtered.map((member) => {
                const active = member.id === selected?.id;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={pending}
                      className={[
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-black/5 disabled:opacity-60",
                        active ? "bg-[color-mix(in_oklab,var(--accent)_10%,white)]" : "",
                      ].join(" ")}
                      onClick={() => saveAssignee(member.id)}
                    >
                      <span
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white"
                        style={{ backgroundColor: avatarColor(member.id) }}
                        aria-hidden
                      >
                        {initials(member.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {member.name}
                        </span>
                        {member.email ? (
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {member.email}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-[var(--muted)]">
                  Keine Treffer
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {popover}
    </>
  );
}
