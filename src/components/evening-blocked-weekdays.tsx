"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEveningBlockedWeekdays } from "@/lib/actions";
import {
  WEEKDAY_LABELS,
  type Weekday,
} from "@/lib/newsletter-constants";

const WORK_WEEKDAYS = [1, 2, 3, 4, 5] as const satisfies readonly Weekday[];

export function EveningBlockedWeekdaysSelect({
  userId,
  eveningBlockedWeekdays,
}: {
  userId: string;
  eveningBlockedWeekdays: number[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(
    [...eveningBlockedWeekdays].sort((a, b) => a - b),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(day: Weekday) {
    const next = selected.includes(day)
      ? selected.filter((d) => d !== day)
      : [...selected, day].sort((a, b) => a - b);
    setSelected(next);
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    for (const d of next) fd.append("weekdays", String(d));
    startTransition(async () => {
      const result = await setEveningBlockedWeekdays(fd);
      if (result?.error) {
        setError(result.error);
        setSelected([...eveningBlockedWeekdays].sort((a, b) => a - b));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1">
        {WORK_WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            disabled={pending}
            className={[
              "rounded-lg px-2 py-1 text-xs font-bold",
              selected.includes(day)
                ? "bg-[var(--highlight)] text-[#0a0a0a]"
                : "bg-black/5 text-[var(--muted)]",
            ].join(" ")}
            onClick={() => toggle(day)}
            aria-pressed={selected.includes(day)}
          >
            {WEEKDAY_LABELS[day]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
