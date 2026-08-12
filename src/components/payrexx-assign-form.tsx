"use client";

import { useTransition } from "react";
import { assignPayrexxLine } from "@/lib/actions/payrexx";
import { assignableCategoryKeys, categoryLabel } from "@/lib/payrexx/categories";

const OPTIONS = assignableCategoryKeys();

export function PayrexxAssignForm({
  lineId,
  next,
  showRemember = true,
  channel,
}: {
  lineId: string;
  next: string;
  showRemember?: boolean;
  channel?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await assignPayrexxLine(fd);
        });
      }}
    >
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="next" value={next} />
      <select
        name="categoryKey"
        required
        defaultValue=""
        className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Kategorie…
        </option>
        {OPTIONS.map((key) => (
          <option key={key} value={key}>
            {categoryLabel(key)}
          </option>
        ))}
      </select>
      {showRemember && channel ? (
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input type="checkbox" name="rememberChannel" value="1" />
          Kanal merken
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "…" : "Zuordnen"}
      </button>
    </form>
  );
}
