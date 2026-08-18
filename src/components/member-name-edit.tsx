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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const incomplete = nameIsIncomplete({ firstName, lastName });

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
      router.refresh();
    });
  }

  return (
    <form
      key={`${userId}-${firstName ?? ""}-${lastName ?? ""}`}
      onSubmit={onSubmit}
      className="space-y-2"
    >
      <input type="hidden" name="userId" value={userId} />
      {incomplete ? (
        <p className="text-xs font-semibold text-[var(--danger)]">
          Vor- oder Nachname fehlt
        </p>
      ) : null}
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
        {pending ? "…" : "Name speichern"}
      </button>
    </form>
  );
}
