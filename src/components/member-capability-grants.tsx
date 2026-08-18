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
    <div className="flex flex-col gap-1">
      <fieldset
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
        disabled={pending}
      >
        <legend className="sr-only">Tags</legend>
        {tags.map((cap) => {
          const checked = granted.includes(cap.key);
          return (
            <label
              key={cap.key}
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--accent)]"
                checked={checked}
                onChange={(e) => toggle(cap.key, e.target.checked)}
              />
              <span className="text-[var(--muted)]">{cap.label}</span>
            </label>
          );
        })}
      </fieldset>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
