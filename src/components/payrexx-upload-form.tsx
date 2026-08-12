"use client";

import { useState, useTransition } from "react";
import { uploadPayrexxExport } from "@/lib/actions/payrexx";

export function PayrexxUploadForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            const result = await uploadPayrexxExport(fd);
            if (result?.error) setError(result.error);
          } catch {
            /* redirect() from server action */
          }
        });
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
        <span className="font-semibold">Payrexx-Export (XLSX / CSV)</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv"
          required
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary shrink-0 disabled:opacity-60"
      >
        {pending ? "Importiert…" : "Importieren"}
      </button>
      {error ? (
        <p className="basis-full text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
