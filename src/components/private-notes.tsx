"use client";

import { useState, useTransition } from "react";
import { updatePrivateNotes } from "@/lib/actions";

export function PrivateNotes({ initialNotes }: { initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("notes", notes);
    startTransition(async () => {
      const result = await updatePrivateNotes(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Notizen
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Nur für dich — persönliche Notizen und Erinnerungen.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || saved}
          onClick={save}
        >
          {pending ? "…" : saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>
      {error && (
        <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>
      )}
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={10}
        placeholder="Was willst du dir merken?"
        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm"
      />
    </section>
  );
}
