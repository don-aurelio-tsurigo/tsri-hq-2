"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { useToast } from "@/components/toast";
import { closeFinanceCommissionPeriod, reopenFinanceCommissionPeriod } from "@/lib/actions/finance";
import { monthLabel, type MonthKey } from "@/lib/finance/shared";

export function FinanceCommissionPeriodActions({
  period,
  closed,
  canClose,
}: {
  period: MonthKey;
  closed: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error: string } | { ok: true }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) showToast({ message: result.error });
      else {
        showToast({ message: success });
        router.refresh();
      }
    });
  }

  if (closed) {
    return (
      <button
        type="button"
        className="btn btn-ghost inline-flex items-center gap-1.5 text-sm"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `Periode ${monthLabel(period)} wieder öffnen? Die eingefrorenen Abrechnungen werden verworfen und danach wieder live berechnet.`,
            )
          )
            return;
          run(() => reopenFinanceCommissionPeriod(period), "Periode wieder geöffnet.");
        }}
      >
        <LockOpen className="size-3.5" /> Wieder öffnen
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary inline-flex items-center gap-1.5"
      disabled={pending || !canClose}
      onClick={() => {
        if (
          !window.confirm(
            `Periode ${monthLabel(period)} abschliessen? Beträge werden eingefroren, die Deals der Periode sind danach gesperrt.`,
          )
        )
          return;
        run(() => closeFinanceCommissionPeriod(period), "Periode abgeschlossen.");
      }}
    >
      <Lock className="size-3.5" /> Periode abschliessen
    </button>
  );
}
