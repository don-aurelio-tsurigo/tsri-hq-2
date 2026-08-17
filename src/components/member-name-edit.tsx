"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminUpdateMemberName } from "@/lib/actions";
import { nameIsIncomplete } from "@/lib/user-name";

export function MemberNameEdit({
  userId,
  firstName,
  lastName,
}: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const incomplete = nameIsIncomplete({ firstName, lastName });

  function close() {
    setOpen(false);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await adminUpdateMemberName(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-ghost text-sm"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        Name
        {incomplete ? " *" : ""}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-[var(--border)] bg-white p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Name anpassen</p>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--fg)]"
              onClick={close}
            >
              Schliessen
            </button>
          </div>
          <form onSubmit={onSubmit} className="space-y-2">
            <input type="hidden" name="userId" value={userId} />
            <label className="field text-xs font-semibold text-[var(--muted)]">
              Vorname
              <input
                name="firstName"
                autoComplete="given-name"
                required
                minLength={1}
                maxLength={80}
                defaultValue={firstName ?? ""}
              />
            </label>
            <label className="field text-xs font-semibold text-[var(--muted)]">
              Nachname
              <input
                name="lastName"
                autoComplete="family-name"
                required
                minLength={1}
                maxLength={80}
                defaultValue={lastName ?? ""}
              />
            </label>
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary w-full text-sm"
              disabled={pending}
            >
              {pending ? "…" : "Speichern"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
