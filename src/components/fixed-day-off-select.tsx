"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFixedDayOff } from "@/lib/actions";
import {
  WEEKDAY_FULL_LABELS,
  type Weekday,
} from "@/lib/newsletter-constants";

const WORK_WEEKDAYS = [1, 2, 3, 4, 5] as const satisfies readonly Weekday[];

export function FixedDayOffSelect({
  userId,
  fixedDayOff,
}: {
  userId: string;
  fixedDayOff: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    fixedDayOff != null ? String(fixedDayOff) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setValue(next);
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("weekday", next);
    startTransition(async () => {
      const result = await setFixedDayOff(fd);
      if (result?.error) {
        setError(result.error);
        setValue(fixedDayOff != null ? String(fixedDayOff) : "");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        className="rounded-lg border-2 border-[var(--border)] bg-white px-2 py-1 text-sm font-semibold"
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        aria-label="Fixer freier Tag"
      >
        <option value="">Kein fixer freier Tag</option>
        {WORK_WEEKDAYS.map((d) => (
          <option key={d} value={d}>
            {WEEKDAY_FULL_LABELS[d]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
