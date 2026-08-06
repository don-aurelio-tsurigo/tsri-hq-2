import type { ReactNode } from "react";

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

export function CookingMonthQuota({
  count,
  target,
  className,
}: {
  count: number;
  target: number;
  className?: string;
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
        "min-w-[9.5rem] rounded-lg px-2.5 py-1.5",
        reached ? "badge-done border border-transparent" : "bg-[var(--panel-muted)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
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
