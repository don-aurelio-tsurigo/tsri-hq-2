"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMemberCapability } from "@/lib/actions";
import { ASSIGNABLE_CAPABILITIES } from "@/lib/permissions";
import type { AppCapability } from "@/generated/prisma/client";

export function MemberCapabilityGrants({
  userId,
  isAdmin = false,
  granted,
}: {
  userId: string;
  isAdmin?: boolean;
  granted: AppCapability[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tags = ASSIGNABLE_CAPABILITIES.filter(
    (cap) => cap.kind === "group" || !isAdmin,
  );

  function toggle(capability: AppCapability, enabled: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("capability", capability);
    fd.set("enabled", enabled ? "true" : "false");
    startTransition(async () => {
      const result = await setMemberCapability(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <fieldset disabled={pending}>
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Tags
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((cap) => {
            const checked = granted.includes(cap.key);
            return (
              <button
                key={cap.key}
                type="button"
                aria-pressed={checked}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  checked
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => toggle(cap.key, !checked)}
              >
                {cap.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
