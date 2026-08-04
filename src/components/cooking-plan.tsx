"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
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
};

type WeekBlock = {
  weekKey: string;
  weekLabel: string;
  isoWeek: number;
  monthLabel: string | null;
  days: DaySlot[];
};

export function CookingPlan({
  spaceId,
  weeks,
  periodLabel,
  prevWeek,
  nextWeek,
  currentWeek,
  members,
  currentUserId,
}: {
  spaceId: string;
  weeks: WeekBlock[];
  periodLabel: string;
  prevWeek: string;
  nextWeek: string;
  currentWeek: string;
  members: Member[];
  currentUserId: string;
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
        <div className="flex items-center gap-1">
          <Link
            href={`?week=${prevWeek}`}
            className="btn btn-ghost px-2 py-1 text-sm"
            title="4 Wochen zurück"
          >
            ←
          </Link>
          <Link href={`?week=${currentWeek}`} className="btn btn-ghost px-2 py-1 text-sm">
            Heute
          </Link>
          <Link
            href={`?week=${nextWeek}`}
            className="btn btn-ghost px-2 py-1 text-sm"
            title="4 Wochen vor"
          >
            →
          </Link>
          <p className="ml-2 font-[family-name:var(--font-display)] text-sm font-semibold capitalize">
            {periodLabel}
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">Eintragen nur Di–Fr · Navigation ±4 Wochen</p>
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
                  <th className="align-top px-2 py-2 text-xs font-semibold whitespace-nowrap">
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
                        "align-top px-1.5 py-1.5",
                        day.isToday
                          ? "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                          : "",
                        day.isPast ? "opacity-70" : "",
                        !day.canCook ? "bg-black/[0.02]" : "",
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
  const isMe = day.user?.id === currentUserId;

  if (!day.canCook) {
    return (
      <div className="flex flex-col gap-0.5">
        <span
          className={[
            "text-[0.65rem] font-medium",
            day.isToday ? "text-[var(--accent)]" : "text-[var(--muted)]",
          ].join(" ")}
        >
          {day.dayMonth}
          {day.isToday ? " · heute" : ""}
        </span>
        <p className="text-xs text-[var(--muted)]">—</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={[
          "text-[0.65rem] font-medium",
          day.isToday ? "text-[var(--accent)]" : "text-[var(--muted)]",
        ].join(" ")}
      >
        {day.dayMonth}
        {day.isToday ? " · heute" : ""}
      </span>

      <p
        className={[
          "truncate text-sm leading-snug font-semibold",
          day.user ? "text-[var(--fg)]" : "font-medium text-[var(--muted)]",
        ].join(" ")}
        title={day.user?.name}
      >
        {day.user ? day.user.name : "Offen"}
      </p>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <button
          type="button"
          className={[
            "text-[0.7rem] underline-offset-2 hover:underline disabled:opacity-50",
            isMe
              ? "font-medium text-[var(--accent)]"
              : "text-[var(--accent)]",
          ].join(" ")}
          disabled={pending}
          onClick={() => {
            if (isMe) onClear();
            else onAssign(currentUserId);
          }}
        >
          {isMe ? "Zurückziehen" : "Kochen übernehmen"}
        </button>
        <PersonPicker
          members={members}
          selectedId={day.user?.id ?? null}
          currentUserId={currentUserId}
          disabled={pending}
          onToggle={(userId) => {
            if (day.user?.id === userId) onClear();
            else onAssign(userId);
          }}
        />
      </div>
    </div>
  );
}

function PersonPicker({
  members,
  selectedId,
  currentUserId,
  disabled,
  onToggle,
}: {
  members: Member[];
  selectedId: string | null;
  currentUserId: string;
  disabled: boolean;
  onToggle: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
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
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="text-[0.7rem] text-[var(--muted)] underline-offset-2 hover:text-[var(--fg)] hover:underline disabled:opacity-50"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        Team ▾
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full left-0 z-20 mt-0.5 max-h-40 w-40 overflow-auto rounded-md border border-[var(--border)] bg-white py-0.5 shadow-md"
        >
          {members.map((member) => {
            const checked = selectedId === member.id;
            return (
              <label
                key={member.id}
                className={[
                  "flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs hover:bg-black/5",
                  checked
                    ? "bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                    : "",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  className="size-3 accent-[var(--accent)]"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    onToggle(member.id);
                    setOpen(false);
                  }}
                />
                <span className="truncate">
                  {member.name}
                  {member.id === currentUserId ? " (ich)" : ""}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
