"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function useLocalDismiss(storageKey: string) {
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
  }, [storageKey]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore quota / private mode
    }
    setHidden(true);
  }

  return { ready: hidden !== null, hidden: hidden === true, dismiss };
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-2.5 right-2.5 inline-flex size-8 items-center justify-center rounded-full text-lg leading-none text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]"
    >
      ×
    </button>
  );
}

export function TimeGapsReminder({
  weekLabel,
  weekParam,
  gaps,
}: {
  weekLabel: string;
  weekParam: string;
  gaps: { dateLabel: string; reason: "missing" | "incomplete" }[];
}) {
  const { ready, hidden, dismiss } = useLocalDismiss(
    `home-dismiss-time-gaps:${weekParam}`,
  );
  if (!ready || hidden || gaps.length === 0) return null;

  return (
    <section className="relative rounded-xl border border-[var(--danger)]/25 bg-red-50/80 px-4 py-4 pr-12">
      <CloseButton onClick={dismiss} label="Reminder schliessen" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--danger)]">
            Arbeitszeit fehlt
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Für die vergangene Woche ({weekLabel}) fehlen noch {gaps.length}{" "}
            {gaps.length === 1 ? "Tag" : "Tage"}:
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--fg)]">
            {gaps
              .map((g) =>
                g.reason === "incomplete"
                  ? `${g.dateLabel} (unvollständig)`
                  : g.dateLabel,
              )
              .join(" · ")}
          </p>
        </div>
        <Link
          href={`/hours?week=${weekParam}`}
          className="btn btn-primary shrink-0 text-sm"
        >
          Jetzt nachtragen
        </Link>
      </div>
    </section>
  );
}

export function ChoreMidweekReminder({
  weekKey,
  chores,
}: {
  weekKey: string;
  chores: { id: string; title: string; spaceId: string }[];
}) {
  const choreKey = chores
    .map((c) => c.id)
    .sort()
    .join(",");
  const { ready, hidden, dismiss } = useLocalDismiss(
    `home-dismiss-chore:${weekKey}:${choreKey}`,
  );

  if (!ready || hidden || chores.length === 0) return null;

  const spaceId = chores[0]!.spaceId;
  const titles = chores.map((c) => c.title);
  const titleList =
    titles.length === 1
      ? `«${titles[0]}»`
      : titles.length === 2
        ? `«${titles[0]}» und «${titles[1]}»`
        : `«${titles.slice(0, -1).join("», «")}» und «${titles.at(-1)}»`;

  return (
    <section className="relative rounded-xl border border-[var(--border)] bg-[var(--highlight)]/35 px-4 py-4 pr-4">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Ämtli-Check, mittwochs bis freitags
      </h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--fg)]">
        Hey — {titleList} gehört dir. Das Büro schaut nicht weg, und der Karton /
        die Pflanze / der Kompost auch nicht. Schon erledigt, oder übst du noch
        «Hoffnungsmethodik»?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary text-sm"
          onClick={dismiss}
        >
          Erledigt
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={dismiss}
        >
          Ignorieren
        </button>
        <Link
          href={`/spaces/${spaceId}`}
          className="btn btn-ghost text-sm"
        >
          Zum Ämtliplan
        </Link>
      </div>
    </section>
  );
}
