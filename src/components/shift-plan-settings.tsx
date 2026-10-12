"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearMemberShiftQuotas,
  saveMemberShiftQuotas,
} from "@/lib/actions";

type MemberRow = {
  userId: string;
  name: string;
};

type TypeRow = {
  id: string;
  name: string;
  isEveningShift: boolean;
  isNewsletter: boolean;
};

type QuotaRow = {
  id: string;
  userId: string;
  newsletterTypeId: string;
  minCount: number;
  maxCount: number;
  isFixed: boolean;
};

type QuotaMode = "open" | "off" | "fixed" | "range";

type TypeQuotaDraft = {
  mode: QuotaMode;
  minCount: string;
  maxCount: string;
};

function quotaModeFromRow(q: QuotaRow): QuotaMode {
  if (q.maxCount === 0 && q.minCount === 0) return "off";
  if (q.isFixed) return "fixed";
  return "range";
}

function buildTypeDrafts(
  userId: string,
  types: TypeRow[],
  quotas: QuotaRow[],
): Record<string, TypeQuotaDraft> {
  const userQuotas = quotas.filter((q) => q.userId === userId);
  const byType = new Map(userQuotas.map((q) => [q.newsletterTypeId, q]));

  const drafts: Record<string, TypeQuotaDraft> = {};
  for (const type of types) {
    const q = byType.get(type.id);
    if (!q) {
      drafts[type.id] = {
        mode: "open",
        minCount: "0",
        maxCount: "0",
      };
      continue;
    }
    drafts[type.id] = {
      mode: quotaModeFromRow(q),
      minCount: String(q.minCount),
      maxCount: String(q.maxCount),
    };
  }

  return drafts;
}

function MemberQuotaCard({
  member,
  types,
  quotas,
  pending,
  onPending,
  onError,
  onMessage,
}: {
  member: MemberRow;
  types: TypeRow[];
  quotas: QuotaRow[];
  pending: boolean;
  onPending: (fn: () => Promise<void>) => void;
  onError: (msg: string | null) => void;
  onMessage: (msg: string | null) => void;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => buildTypeDrafts(member.userId, types, quotas),
    [member.userId, types, quotas],
  );
  const [drafts, setDrafts] = useState(initial);

  const hasCustomRules = useMemo(() => {
    return quotas.some((q) => q.userId === member.userId);
  }, [member.userId, quotas]);

  function setDraft(typeId: string, patch: Partial<TypeQuotaDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [typeId]: { ...prev[typeId]!, ...patch },
    }));
  }

  function save() {
    onError(null);
    onMessage(null);

    const entries = types.map((type) => {
      const draft = drafts[type.id]!;
      const minCount = Number.parseInt(draft.minCount, 10);
      const maxCount = Number.parseInt(draft.maxCount, 10);
      return {
        newsletterTypeId: type.id,
        mode: draft.mode,
        minCount: Number.isFinite(minCount) ? minCount : undefined,
        maxCount: Number.isFinite(maxCount) ? maxCount : undefined,
      };
    });

    for (const entry of entries) {
      if (entry.mode === "fixed" && entry.minCount == null) {
        onError(`Anzahl für ${member.name} prüfen.`);
        return;
      }
      if (
        entry.mode === "range" &&
        (entry.minCount == null || entry.maxCount == null)
      ) {
        onError(`Min/Max für ${member.name} prüfen.`);
        return;
      }
      if (
        entry.mode === "range" &&
        entry.maxCount != null &&
        entry.minCount != null &&
        entry.maxCount < entry.minCount
      ) {
        onError(`Maximum darf nicht kleiner als Minimum sein (${member.name}).`);
        return;
      }
    }

    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        userId: member.userId,
        entries,
      }),
    );

    onPending(async () => {
      const result = await saveMemberShiftQuotas(fd);
      if (result?.error) {
        onError(result.error);
        return;
      }
      onMessage(`Schichtregeln für ${member.name} gespeichert.`);
      router.refresh();
    });
  }

  function clearRules() {
    if (
      !window.confirm(
        `Alle Schichtregeln für ${member.name} entfernen? Die Person gilt danach wieder als ohne Limits.`,
      )
    ) {
      return;
    }
    onError(null);
    onMessage(null);
    const fd = new FormData();
    fd.set("userId", member.userId);
    onPending(async () => {
      const result = await clearMemberShiftQuotas(fd);
      if (result?.error) {
        onError(result.error);
        return;
      }
      setDrafts(
        Object.fromEntries(
          types.map((t) => [
            t.id,
            { mode: "open" as const, minCount: "0", maxCount: "0" },
          ]),
        ),
      );
      onMessage(`Schichtregeln für ${member.name} entfernt.`);
      router.refresh();
    });
  }

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h3 className="font-medium">{member.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {hasCustomRules
              ? "Individuelle Regeln — «Offen» = ohne Limit"
              : "Keine Sonderregeln — nimmt am normalen Pool teil"}
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="px-4 py-2 font-normal">Schichttyp</th>
              <th className="px-4 py-2 font-normal">Regel</th>
              <th className="px-4 py-2 font-normal">Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const draft = drafts[type.id]!;
              return (
                <tr
                  key={type.id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-4 py-2 align-middle">
                    <span className="font-medium">{type.name}</span>
                    {!type.isNewsletter ? (
                      <span className="ml-1 text-xs text-[var(--muted)]">
                        (nur Schichtplan)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <select
                      className="input min-w-[10rem]"
                      value={draft.mode}
                      onChange={(e) =>
                        setDraft(type.id, {
                          mode: e.target.value as QuotaMode,
                          ...(e.target.value === "fixed"
                            ? { minCount: "1", maxCount: "1" }
                            : {}),
                          ...(e.target.value === "range"
                            ? { minCount: "1", maxCount: "2" }
                            : {}),
                        })
                      }
                    >
                      <option value="open">Offen</option>
                      <option value="off">Ausgeschlossen (0)</option>
                      <option value="fixed">Fix</option>
                      <option value="range">Bereich (min–max)</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    {draft.mode === "fixed" ? (
                      <input
                        className="input w-20"
                        type="number"
                        min={0}
                        max={31}
                        value={draft.minCount}
                        onChange={(e) =>
                          setDraft(type.id, {
                            minCount: e.target.value,
                            maxCount: e.target.value,
                          })
                        }
                      />
                    ) : draft.mode === "range" ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="input w-16"
                          type="number"
                          min={0}
                          max={31}
                          value={draft.minCount}
                          onChange={(e) =>
                            setDraft(type.id, { minCount: e.target.value })
                          }
                        />
                        <span className="text-[var(--muted)]">–</span>
                        <input
                          className="input w-16"
                          type="number"
                          min={0}
                          max={31}
                          value={draft.maxCount}
                          onChange={(e) =>
                            setDraft(type.id, { maxCount: e.target.value })
                          }
                        />
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={save}
        >
          Speichern
        </button>
        {hasCustomRules ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={clearRules}
          >
            Alle Regeln entfernen
          </button>
        ) : null}
      </footer>
    </article>
  );
}

export function ShiftPlanSettings({
  members,
  types,
  quotas,
}: {
  members: MemberRow[];
  types: TypeRow[];
  quotas: QuotaRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function runPending(fn: () => Promise<void>) {
    startTransition(fn);
  }

  return (
    <div className="space-y-10">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Schichtregeln pro Person
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pro Person alle Schichttypen auf einer Karte. «Offen» heisst ohne
            Limit, «Ausgeschlossen» heisst nie. Für Teilzeit z. B. Briefing auf
            Fix 4 setzen, Rest auf «Ausgeschlossen». Wer alle Abendschichten
            ausgeschlossen hat, bekommt keinen Pflicht-Abendeinsatz.
          </p>
        </div>

        <div className="space-y-4">
          {members.map((member) => {
            const quotaKey = quotas
              .filter((q) => q.userId === member.userId)
              .map(
                (q) =>
                  `${q.newsletterTypeId}:${q.minCount}:${q.maxCount}:${q.isFixed}`,
              )
              .join("|");
            return (
              <MemberQuotaCard
                key={`${member.userId}:${quotaKey}`}
                member={member}
                types={types}
                quotas={quotas}
                pending={pending}
                onPending={runPending}
                onError={setError}
                onMessage={setMessage}
              />
            );
          })}
          {members.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Keine Redaktions-Mitglieder gefunden.
            </p>
          )}
        </div>
      </section>

    </div>
  );
}
