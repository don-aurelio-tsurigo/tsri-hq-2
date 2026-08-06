"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { CookingMonthQuota } from "@/components/cooking-month-quota";
import { clearCookingSlot, setCookingSlot } from "@/lib/actions";

type Member = { id: string; name: string };
type DaySlot = {
  dateKey: string;
  weekdayShort: string;
  dayMonth: string;
  isToday: boolean;
  isPast: boolean;
  canCook: boolean;
  user: { id: string; name: string } | null;
  assignedBy: { id: string; name: string } | null;
};

type WeekBlock = {
  weekKey: string;
  weekLabel: string;
  isoWeek: number;
  monthLabel: string | null;
  days: DaySlot[];
};

function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function PersonAvatar({ name }: { name: string }) {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[0.65rem] font-semibold text-[var(--fg)]"
      aria-hidden
    >
      {personInitials(name)}
    </span>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className ?? "size-3.5 shrink-0"}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CookingPlan({
  spaceId,
  weeks,
  periodLabel,
  prevWeek,
  nextWeek,
  currentWeek,
  members,
  currentUserId,
  monthSelfCookCount,
  monthCookTarget,
}: {
  spaceId: string;
  weeks: WeekBlock[];
  periodLabel: string;
  prevWeek: string;
  nextWeek: string;
  currentWeek: string;
  members: Member[];
  currentUserId: string;
  monthSelfCookCount: number;
  monthCookTarget: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function assign(dateKey: string, userId: string) {
    const fd = new FormData();
    fd.set("spaceId", spaceId);
    fd.set("date", dateKey);
    fd.set("userId", userId);
    startTransition(async () => {
      await setCookingSlot(fd);
      router.refresh();
    });
  }

  function clear(dateKey: string) {
    const fd = new FormData();
    fd.set("spaceId", spaceId);
    fd.set("date", dateKey);
    startTransition(async () => {
      await clearCookingSlot(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`?week=${prevWeek}`}
            className="btn btn-ghost px-2 py-1 text-sm"
            title="4 Wochen zurück"
          >
            ←
          </Link>
          <Link
            href={`?week=${currentWeek}`}
            className="btn btn-ghost px-2 py-1 text-sm"
          >
            Heute
          </Link>
          <Link
            href={`?week=${nextWeek}`}
            className="btn btn-ghost px-2 py-1 text-sm"
            title="4 Wochen vor"
          >
            →
          </Link>
          <CookingMonthQuota
            className="ml-2"
            count={monthSelfCookCount}
            target={monthCookTarget}
          />
          <p className="ml-1 font-[family-name:var(--font-display)] text-sm font-semibold capitalize">
            {periodLabel}
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Eintragen nur Di–Fr · Navigation ±4 Wochen
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white/70">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)] text-[0.65rem] tracking-wide text-[var(--muted)] uppercase">
              <th className="w-16 px-2 py-1.5 font-semibold">Woche</th>
              {weeks[0]?.days.map((d) => (
                <th
                  key={d.dateKey}
                  className={[
                    "px-2 py-1.5 font-semibold",
                    d.canCook ? "" : "text-[var(--muted)]/70",
                  ].join(" ")}
                >
                  {d.weekdayShort}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <Fragment key={week.weekKey}>
                {week.monthLabel && (
                  <tr className="bg-black/[0.03]">
                    <td
                      colSpan={(weeks[0]?.days.length ?? 7) + 1}
                      className="px-2 py-1 font-[family-name:var(--font-display)] text-xs font-semibold tracking-wide text-[var(--muted)] capitalize"
                    >
                      {week.monthLabel}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-[var(--border)] last:border-b-0">
                  <th className="align-top px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                    <span className="font-[family-name:var(--font-display)]">
                      KW {week.isoWeek}
                    </span>
                    <span className="mt-0.5 block text-[0.65rem] font-normal text-[var(--muted)]">
                      {week.weekLabel}
                    </span>
                  </th>
                  {week.days.map((day) => (
                    <td
                      key={day.dateKey}
                      className={[
                        "align-top px-1.5 py-1",
                        day.user
                          ? "bg-[var(--accent-soft)]/50"
                          : day.isToday
                            ? "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                            : "",
                        day.isPast && day.canCook ? "opacity-70" : "",
                        !day.canCook ? "bg-black/[0.035]" : "",
                      ].join(" ")}
                    >
                      <CookDayCell
                        day={day}
                        members={members}
                        currentUserId={currentUserId}
                        pending={pending}
                        onAssign={(userId) => assign(day.dateKey, userId)}
                        onClear={() => clear(day.dateKey)}
                      />
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CookDayCell({
  day,
  members,
  currentUserId,
  pending,
  onAssign,
  onClear,
}: {
  day: DaySlot;
  members: Member[];
  currentUserId: string;
  pending: boolean;
  onAssign: (userId: string) => void;
  onClear: () => void;
}) {
  const dateLabel = (
    <span
      className={[
        "text-[0.65rem] font-medium",
        day.isToday ? "text-[var(--accent)]" : "text-[var(--muted)]",
      ].join(" ")}
    >
      {day.dayMonth}
      {day.isToday ? " · heute" : ""}
    </span>
  );

  if (!day.canCook) {
    return (
      <div
        className="min-h-[2.75rem]"
        aria-label={`${day.weekdayShort} ${day.dayMonth}${day.isToday ? ", heute" : ""}: kein Kochtag`}
      />
    );
  }

  const isMe = day.user?.id === currentUserId;
  const isOpen = !day.user;

  const assignerLabel =
    day.user && day.assignedBy && day.assignedBy.id !== day.user.id
      ? day.assignedBy.id === currentUserId
        ? "von dir eingetragen"
        : `von ${day.assignedBy.name} eingetragen`
      : null;

  const infoBlock = isOpen ? (
    <PersonPicker
      label="Person eintragen"
      members={members}
      currentUserId={currentUserId}
      selectedId={null}
      disabled={pending}
      onSelect={onAssign}
      variant="select"
    />
  ) : (
    <div className="flex h-full min-w-0 items-center gap-1.5">
      <PersonAvatar name={day.user!.name} />
      <div className="min-w-0">
        <p
          className="truncate text-xs leading-snug font-semibold"
          title={day.user!.name}
        >
          {day.user!.name}
        </p>
        <p className="truncate text-[0.65rem] leading-snug text-[var(--muted)]">
          {isMe ? "Du kochst" : (assignerLabel ?? "\u00a0")}
        </p>
      </div>
    </div>
  );

  let action: ReactNode;
  if (isOpen) {
    action = (
      <button
        type="button"
        className="btn btn-ghost w-full px-2 py-1 text-xs"
        disabled={pending}
        onClick={() => onAssign(currentUserId)}
      >
        Ich koche
      </button>
    );
  } else if (isMe) {
    action = (
      <button
        type="button"
        className="btn btn-ghost w-full px-2 py-1 text-xs"
        disabled={pending}
        onClick={onClear}
      >
        Abmelden
      </button>
    );
  } else {
    action = (
      <PersonPicker
        label="Person ändern"
        members={members}
        currentUserId={currentUserId}
        selectedId={day.user!.id}
        disabled={pending}
        onSelect={onAssign}
        variant="button"
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {dateLabel}
      <div className="h-11 shrink-0">{infoBlock}</div>
      <div className="mt-auto">{action}</div>
    </div>
  );
}

function PersonPicker({
  label,
  members,
  currentUserId,
  selectedId,
  disabled,
  onSelect,
  variant = "button",
}: {
  label: string;
  members: Member[];
  currentUserId: string;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (userId: string) => void;
  variant?: "button" | "select";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const showSearch = members.length >= 5;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    if (showSearch) {
      queueMicrotask(() => searchRef.current?.focus());
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, showSearch]);

  const triggerClass =
    variant === "select"
      ? "flex h-full w-full items-center justify-between gap-1 rounded-lg border border-[var(--border)] bg-white px-2 text-left text-xs font-medium text-[var(--muted)] hover:border-[var(--fg)]/35 disabled:opacity-55"
      : "btn btn-ghost flex w-full items-center justify-center gap-1 px-2 py-1 text-xs";

  return (
    <div className="relative h-full" ref={rootRef}>
      <button
        type="button"
        className={triggerClass}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon
          className={
            variant === "select"
              ? "size-3.5 shrink-0 text-[var(--muted)]"
              : "size-3.5 shrink-0"
          }
        />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg sm:left-0 sm:w-52"
        >
          {showSearch && (
            <div className="border-b border-[var(--border)] p-1.5">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen…"
                className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}
          <ul className="max-h-48 overflow-auto py-0.5">
            {filtered.map((member) => {
              const checked = selectedId === member.id;
              return (
                <li key={member.id} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    className={[
                      "flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-black/5",
                      checked ? "bg-[var(--accent-soft)] font-semibold" : "",
                    ].join(" ")}
                    disabled={disabled}
                    onClick={() => {
                      onSelect(member.id);
                      setOpen(false);
                    }}
                  >
                    <PersonAvatar name={member.name} />
                    <span className="min-w-0 truncate">
                      {member.name}
                      {member.id === currentUserId ? " (ich)" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-3 text-xs text-[var(--muted)]">
                Niemand gefunden.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
