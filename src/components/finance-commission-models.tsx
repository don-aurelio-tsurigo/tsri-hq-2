"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { FinanceMonthPicker } from "@/components/finance-month-picker";
import { useToast } from "@/components/toast";
import {
  deleteFinanceCommissionAssignment,
  saveFinanceCommissionAssignment,
  saveFinanceCommissionModel,
  setFinanceCommissionModelArchived,
} from "@/lib/actions/finance";
import { calculateCommission, type CommissionBasis } from "@/lib/finance/commission";
import type {
  CommissionAssignmentRow,
  CommissionModelInput,
  CommissionModelRow,
  SalesPerson,
} from "@/lib/finance/commission-store";
import { formatChfExact, parseAmountInput, type MonthKey } from "@/lib/finance/shared";

type Result = { error: string } | { ok: true };

function useRun() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, success?: string, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if ("error" in result) showToast({ message: result.error });
      else {
        if (success) showToast({ message: success });
        onOk?.();
        router.refresh();
      }
    });
  return { pending, run };
}

// ─── Modelle ───────────────────────────────────────────────────

type ModelDraft = {
  name: string;
  baseAmount: string;
  externRate: string;
  internRateMin: string;
  internRateMax: string;
  threshold: string;
  progressionBasis: CommissionBasis;
  notes: string;
};

const pct = (rate: number) => String(Math.round(rate * 10000) / 100);

function toDraft(m: CommissionModelRow | null): ModelDraft {
  return m
    ? {
        name: m.name,
        baseAmount: String(m.baseAmount),
        externRate: pct(m.externRate),
        internRateMin: pct(m.internRateMin),
        internRateMax: pct(m.internRateMax),
        threshold: String(m.threshold),
        progressionBasis: m.progressionBasis,
        notes: m.notes ?? "",
      }
    : {
        name: "",
        baseAmount: "0",
        externRate: "25",
        internRateMin: "15",
        internRateMax: "45",
        threshold: "10000",
        progressionBasis: "intern",
        notes: "",
      };
}

function fromDraft(d: ModelDraft): CommissionModelInput | null {
  const num = (v: string) => parseAmountInput(v);
  const values = [d.baseAmount, d.externRate, d.internRateMin, d.internRateMax, d.threshold].map(num);
  if (values.some((v) => v === null || Number.isNaN(v))) return null;
  const [baseAmount, externRate, internRateMin, internRateMax, threshold] = values as number[];
  return {
    name: d.name,
    notes: d.notes || null,
    baseAmount,
    externRate: externRate / 100,
    internRateMin: internRateMin / 100,
    internRateMax: internRateMax / 100,
    threshold,
    progressionBasis: d.progressionBasis,
  };
}

export function FinanceCommissionModels({ models }: { models: CommissionModelRow[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = models.filter((m) => m.archived).length;
  const visible = models.filter((m) => showArchived || !m.archived);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Modelle</h2>
          <p className="max-w-3xl text-sm text-[var(--muted)]">
            Provision = Grundbetrag + extern × Satz extern + intern × Satz intern. Der interne Satz
            steigt linear von min. bis max. (erreicht bei der Schwelle); liegt das Total (intern +
            extern) über der Schwelle, gilt max. Änderungen wirken nur auf offene Perioden.
          </p>
        </div>
        {archivedCount ? (
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archivierte zeigen ({archivedCount})
          </label>
        ) : null}
      </div>
      {visible.map((m) => (
        <ModelCard key={`${m.id}-${m.name}-${m.baseAmount}-${m.externRate}-${m.internRateMin}-${m.internRateMax}-${m.threshold}-${m.progressionBasis}`} model={m} />
      ))}
      <details className="card p-5">
        <summary className="cursor-pointer list-none font-semibold">+ Neues Modell</summary>
        <div className="mt-4">
          <ModelForm model={null} />
        </div>
      </details>
    </section>
  );
}

function ModelCard({ model }: { model: CommissionModelRow }) {
  const { pending, run } = useRun();
  return (
    <details className={["card p-5", model.archived ? "opacity-60" : ""].join(" ")}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold">{model.name}</span>
          {model.archived ? <span className="ml-2 text-xs text-[var(--muted)]">archiviert</span> : null}
          <span className="block text-xs text-[var(--muted)]">
            Grundbetrag {formatChfExact(model.baseAmount)} · extern {pct(model.externRate)} % · intern{" "}
            {pct(model.internRateMin)}–{pct(model.internRateMax)} % bis {formatChfExact(model.threshold)} (
            {model.progressionBasis === "total" ? "nach Total" : "nach intern"}) · {model.assignmentCount}{" "}
            {model.assignmentCount === 1 ? "Zuweisung" : "Zuweisungen"}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-ghost inline-flex items-center gap-1.5 text-sm"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            run(
              () => setFinanceCommissionModelArchived({ id: model.id, archived: !model.archived }),
              model.archived ? "Modell wiederhergestellt." : "Modell archiviert.",
            );
          }}
        >
          {model.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          {model.archived ? "Wiederherstellen" : "Archivieren"}
        </button>
      </summary>
      <div className="mt-4">
        <ModelForm model={model} />
      </div>
    </details>
  );
}

function ModelForm({ model }: { model: CommissionModelRow | null }) {
  const { pending, run } = useRun();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(() => toDraft(model));
  const set = (key: keyof ModelDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [key]: e.target.value });
  const parsed = fromDraft(draft);
  const id = model?.id ?? "new";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) {
      showToast({ message: "Ungültige Zahl." });
      return;
    }
    run(
      () => saveFinanceCommissionModel({ id: model?.id ?? null, model: parsed }),
      model ? "Modell gespeichert." : `«${parsed.name}» angelegt.`,
      model ? undefined : () => setDraft(toDraft(null)),
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <div className="field sm:col-span-2">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} value={draft.name} onChange={set("name")} required maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-base`}>Grundbetrag / Monat (CHF)</label>
        <input id={`${id}-base`} inputMode="decimal" value={draft.baseAmount} onChange={set("baseAmount")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-ext`}>Satz extern (%)</label>
        <input id={`${id}-ext`} inputMode="decimal" value={draft.externRate} onChange={set("externRate")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-min`}>Satz intern min. (%)</label>
        <input id={`${id}-min`} inputMode="decimal" value={draft.internRateMin} onChange={set("internRateMin")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-max`}>Satz intern max. (%)</label>
        <input id={`${id}-max`} inputMode="decimal" value={draft.internRateMax} onChange={set("internRateMax")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-threshold`}>Schwelle (CHF)</label>
        <input id={`${id}-threshold`} inputMode="decimal" value={draft.threshold} onChange={set("threshold")} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-basis`}>Progression nach</label>
        <select id={`${id}-basis`} value={draft.progressionBasis} onChange={set("progressionBasis")}>
          <option value="intern">Intern</option>
          <option value="total">Total (intern + extern)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notes`}>Notizen</label>
        <input id={`${id}-notes`} value={draft.notes} onChange={set("notes")} maxLength={5000} />
      </div>
      {parsed ? <Examples model={parsed} /> : null}
      <div className="sm:col-span-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {model ? "Speichern" : "Anlegen"}
        </button>
      </div>
    </form>
  );
}

function Examples({ model }: { model: CommissionModelInput }) {
  const cases = [0, 5000, 10000, 20000];
  return (
    <p className="text-xs text-[var(--muted)] sm:col-span-3">
      Beispiele (nur intern):{" "}
      {cases.map((c, i) => (
        <span key={c}>
          {i > 0 ? " · " : ""}
          {formatChfExact(c)} → <b>{formatChfExact(calculateCommission(model, c, 0).amount)}</b>
        </span>
      ))}
    </p>
  );
}

// ─── Zuweisungen ───────────────────────────────────────────────

function nowPeriod(): MonthKey {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FinanceCommissionAssignments({
  assignments,
  models,
  salesPeople,
}: {
  assignments: CommissionAssignmentRow[];
  models: CommissionModelRow[];
  salesPeople: SalesPerson[];
}) {
  const activeModels = models.filter((m) => !m.archived);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Zuweisungen</h2>
        <p className="max-w-3xl text-sm text-[var(--muted)]">
          Welches Modell ab welcher Periode gilt. Solange eine Zuweisung aktiv ist, gibt es den
          Grundbetrag jeden Monat – auch ohne Deals. Zuweisungen einer Person dürfen sich nicht
          überschneiden.
        </p>
      </div>
      {salesPeople.length === 0 ? (
        <p className="card p-4 text-sm text-[var(--muted)]">
          Noch niemand ist als Sales markiert –{" "}
          <Link href="/settings/members" className="font-semibold text-[var(--accent)] hover:underline">
            Rolle «Sales» im Team vergeben
          </Link>
          .
        </p>
      ) : null}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)] text-xs text-[var(--muted)]">
              <th className="px-3 py-2 font-semibold">Person</th>
              <th className="px-3 py-2 font-semibold">Modell</th>
              <th className="px-3 py-2 font-semibold">Gültig ab Periode</th>
              <th className="px-3 py-2 font-semibold">Gültig bis Periode</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <AssignmentRow
                key={`${a.id}-${a.modelId}-${a.validFrom}-${a.validUntil}`}
                assignment={a}
                models={models}
                salesPeople={salesPeople}
              />
            ))}
            {salesPeople.length && activeModels.length ? (
              <AssignmentRow assignment={null} models={activeModels} salesPeople={salesPeople} />
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AssignmentRow({
  assignment,
  models,
  salesPeople,
}: {
  assignment: CommissionAssignmentRow | null;
  models: CommissionModelRow[];
  salesPeople: SalesPerson[];
}) {
  const { pending, run } = useRun();
  const isNew = assignment === null;
  const [userId, setUserId] = useState(assignment?.user.id ?? "");
  const [modelId, setModelId] = useState(assignment?.modelId ?? "");
  const [validFrom, setValidFrom] = useState<MonthKey>(assignment?.validFrom ?? nowPeriod());
  const [validUntil, setValidUntil] = useState<MonthKey | null>(assignment?.validUntil ?? null);
  const dirty =
    isNew ||
    modelId !== assignment.modelId ||
    validFrom !== assignment.validFrom ||
    validUntil !== assignment.validUntil;
  const people = assignment && !salesPeople.some((p) => p.id === assignment.user.id)
    ? [...salesPeople, assignment.user]
    : salesPeople;

  function save() {
    if (!userId || !modelId) return;
    run(
      () => saveFinanceCommissionAssignment({ id: assignment?.id ?? null, userId, modelId, validFrom, validUntil }),
      isNew ? "Zuweisung angelegt." : "Zuweisung gespeichert.",
      isNew
        ? () => {
            setUserId("");
            setModelId("");
            setValidUntil(null);
          }
        : undefined,
    );
  }

  return (
    <tr className={["border-b border-[var(--border)]/60 last:border-0", isNew ? "bg-[var(--panel-muted)]/40" : ""].join(" ")}>
      <td className="px-3 py-2">
        {isNew ? (
          <select aria-label="Person" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">+ Person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-semibold">{assignment.user.name}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <select aria-label="Modell" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {isNew ? <option value="">Modell…</option> : null}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.archived ? " (archiviert)" : ""}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <FinanceMonthPicker value={validFrom} onChange={setValidFrom} label="Gültig ab" compact />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={validUntil === null}
              onChange={(e) => setValidUntil(e.target.checked ? null : validFrom)}
            />
            unbefristet
          </label>
          {validUntil !== null ? (
            <FinanceMonthPicker value={validUntil} onChange={setValidUntil} label="Gültig bis" compact />
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {dirty ? (
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={pending || !userId || !modelId}
            onClick={save}
          >
            {isNew ? "Hinzufügen" : "Speichern"}
          </button>
        ) : null}
        {!isNew ? (
          <button
            type="button"
            className="btn btn-ghost ml-1 px-2 text-[var(--danger)]"
            aria-label="Zuweisung löschen"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Zuweisung von ${assignment.user.name} löschen?`)) return;
              run(() => deleteFinanceCommissionAssignment(assignment.id), "Zuweisung gelöscht.");
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
