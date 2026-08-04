"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateMemberPensum } from "@/lib/actions";

export function PensumSelect({
  userId,
  pensumPercent,
  compact = false,
}: {
  userId: string;
  pensumPercent: number;
  /** Kein «Pensum»-Label — z.B. in Tabellenspalte mit eigenem Header. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(pensumPercent));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setValue(next);
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("pensumPercent", next);
    startTransition(async () => {
      const result = await updateMemberPensum(fd);
      if (result?.error) {
        setError(result.error);
        setValue(String(pensumPercent));
        return;
      }
      router.refresh();
    });
  }

  const select = (
    <select
      className="rounded-lg border-2 border-[var(--border)] bg-white px-2 py-1 text-sm font-semibold"
      value={value}
      disabled={pending}
      onChange={(e) => save(e.target.value)}
      aria-label="Pensum"
    >
      {Array.from(
        new Set([100, 90, 80, 70, 60, 50, 40, 30, 20, pensumPercent]),
      )
        .sort((a, b) => b - a)
        .map((p) => (
          <option key={p} value={p}>
            {p}%
          </option>
        ))}
    </select>
  );

  return (
    <div
      className={
        compact
          ? "flex flex-col items-start gap-1"
          : "flex flex-col items-end gap-1"
      }
    >
      {compact ? (
        select
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Pensum</span>
          {select}
        </label>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
