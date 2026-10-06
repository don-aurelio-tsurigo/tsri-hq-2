"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { createFinanceYear } from "@/lib/actions/finance";

export function FinanceNewYearDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [copyPrevious, setCopyPrevious] = useState(false);

  function create() {
    startTransition(async () => {
      const result = await createFinanceYear({ year, copyPrevious });
      if ("error" in result) {
        showToast({ message: result.error });
        return;
      }
      showToast({
        message: copyPrevious
          ? `${year} angelegt, ${result.copied} Budget-Werte aus ${year - 1} übernommen.`
          : `${year} angelegt.`,
      });
      onClose();
      router.push(`/finance?jahr=${year}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-new-year-title"
      onClick={onClose}
    >
      <div className="card w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="finance-new-year-title" className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Budgetjahr {year} anlegen
        </h2>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Startwerte</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="start" checked={!copyPrevious} onChange={() => setCopyPrevious(false)} className="mt-1" />
            <span>
              <b>Leer starten</b>
              <span className="block text-[var(--muted)]">Budget und Forecast werden von Hand eingetragen.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="start" checked={copyPrevious} onChange={() => setCopyPrevious(true)} className="mt-1" />
            <span>
              <b>Budget und Forecast aus {year - 1} übernehmen</b>
              <span className="block text-[var(--muted)]">
                Monat für Monat als Startwerte, danach frei änderbar. Nur für Kategorien, die {year} gültig sind.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="text-xs text-[var(--muted)]">
          Welche Kategorien {year} gelten, legst du unter Finance → Kategorien fest («gültig ab/bis»).
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={pending}>
            {pending ? "Lege an…" : `${year} anlegen`}
          </button>
        </div>
      </div>
    </div>
  );
}
