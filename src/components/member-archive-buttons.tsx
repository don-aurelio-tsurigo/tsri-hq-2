"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveMember, restoreMember } from "@/lib/actions";

export function ArchiveMemberButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onArchive() {
    if (
      !window.confirm(
        `«${name}» archivieren? Die Person verliert den Zugang; Historie bleibt erhalten.`,
      )
    ) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const result = await archiveMember(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
        disabled={pending}
        onClick={onArchive}
      >
        {pending ? "…" : "Archivieren"}
      </button>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function RestoreMemberButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRestore() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      const result = await restoreMember(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-primary text-sm"
        disabled={pending}
        onClick={onRestore}
      >
        {pending ? "…" : "Wiederherstellen"}
      </button>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
