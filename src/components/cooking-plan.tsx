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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className ?? "size-3.5 shrink-0"}
    >
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CookingMonthQuota({
  count,
  target,
}: {
  count: number;
  target: number;
}) {
  const reached = count >= target;
  const progress = Math.min(100, Math.round((count / target) * 100));
  const remaining = Math.ceil(target - count);
  const targetLabel = Number.isInteger(target)
    ? String(target)
    : String(target).replace(".", ",");

  let status: ReactNode;
  if (count === 0) {
    status = "Noch nicht eingetragen";
  } else if (!reached) {
    status =
      remaining === 1
        ? "Noch 1 offener Slot diesen Monat"
        : `Noch ${remaining} offene Slots diesen Monat`;
  } else {
    status = (
      <span className="inline-flex items-center gap-1">
        <CheckIcon className="size-3" />
        Quote erreicht
      </span>
    );
  }

  return (
    <div
      className={[
        "ml-2 min-w-[9.5rem] rounded-lg px-2.5 py-1.5",
        reached ? "badge-done border border-transparent" : "bg-[var(--panel-muted)]",
      ].join(" ")}
      title="Deine Self-Koch-Einträge im laufenden Monat"
    >
      <p
        className={[
          "text-[0.7rem] font-semibold tabular-nums",
          reached ? "" : "text-[var(--fg)]",
        ].join(" ")}
      >
        {count} von ø{targetLabel}
      </p>
      <div
        className={[
          "mt-1 h-1 overflow-hidden rounded-full",
          reached ? "bg-white/50" : "bg-black/10",
        ].join(" ")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Monatsquote Kochen"
      >
        <div
          className={[
            "h-full rounded-full transition-[width]",
            reached ? "bg-[var(--fg)]/40" : "bg-[var(--muted)]",
          ].join(" ")}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p
        className={[
          "mt-1 text-[0.65rem] leading-snug",
          reached ? "" : "text-[var(--muted)]",
        ].join(" ")}
      >
        {status}
      </p>
    </div>
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

  if (isOpen) {
    return (
      <div className="flex min-h-[2.75rem] flex-col gap-1">
        {dateLabel}
        <div className="mt-auto flex flex-col gap-0.5">
          <button
            type="button"
            className="btn btn-ghost w-full px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => onAssign(currentUserId)}
          >
            Ich koche
          </button>
          <PersonPicker
            label="Jemand anderen"
            members={members}
            currentUserId={currentUserId}
            selectedId={null}
            disabled={pending}
            onSelect={onAssign}
            variant="link"
          />
        </div>
      </div>
    );
  }

  if (isMe) {
    return (
      <div className="flex min-h-[2.75rem] flex-col gap-1">
        {dateLabel}
        <div className="flex items-start gap-1.5">
          <PersonAvatar name={day.user!.name} />
          <div className="min-w-0">
            <p className="truncate text-xs leading-snug font-semibold">
              {day.user!.name}
            </p>
            <p className="text-[0.65rem] text-[var(--muted)]">Du kochst</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost mt-auto w-full px-2 py-1 text-xs"
          disabled={pending}
          onClick={onClear}
        >
          Zurückziehen
        </button>
      </div>
    );
  }

  const assignerLabel =
    day.assignedBy && day.assignedBy.id !== day.user!.id
      ? day.assignedBy.id === currentUserId
        ? "von dir eingetragen"
        : `von ${day.assignedBy.name} eingetragen`
      : null;

  return (
    <div className="flex min-h-[2.75rem] flex-col gap-1">
      {dateLabel}
      <div className="flex items-start gap-1.5">
        <PersonAvatar name={day.user!.name} />
        <div className="min-w-0">
          <p
            className="truncate text-xs leading-snug font-semibold"
            title={day.user!.name}
          >
            {day.user!.name}
          </p>
          {assignerLabel && (
            <p className="text-[0.65rem] leading-snug text-[var(--muted)]">
              {assignerLabel}
            </p>
          )}
        </div>
      </div>
      <PersonPicker
        label="Tauschen"
        members={members}
        currentUserId={currentUserId}
        selectedId={day.user!.id}
        disabled={pending}
        onSelect={onAssign}
        triggerClassName="btn btn-ghost mt-auto w-full px-2 py-1 text-xs"
      />
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
  triggerClassName,
  variant = "button",
}: {
  label: string;
  members: Member[];
  currentUserId: string;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (userId: string) => void;
  triggerClassName?: string;
  variant?: "button" | "link";
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

  const linkTrigger =
    "inline-flex w-full items-center justify-start gap-0.5 py-0.5 text-left text-[0.75rem] font-medium text-[var(--muted)] hover:underline disabled:opacity-55";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={
          triggerClassName ??
          (variant === "link"
            ? linkTrigger
            : "btn btn-ghost w-full px-2 py-1 text-xs font-semibold text-[var(--muted)]")
        }
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{label}</span>
        {variant !== "link" && <ChevronDownIcon />}
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
                      checked
                        ? "bg-[var(--accent-soft)] font-semibold"
                        : "",
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
