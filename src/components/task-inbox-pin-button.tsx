"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pin } from "lucide-react";
import { toggleTaskInboxPin } from "@/lib/actions";

export function TaskInboxPinButton({
  kind,
  targetId,
  pinned,
}: {
  kind: "list" | "project";
  targetId: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={[
          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          pinned
            ? "text-[var(--accent)] hover:bg-[var(--accent)]/10"
            : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--fg)]",
        ].join(" ")}
        disabled={pending}
        aria-pressed={pinned}
        aria-label={
          pinned ? "Aus der Seitenleiste lösen" : "In der Seitenleiste pinnen"
        }
        title={
          pinned ? "Aus der Seitenleiste lösen" : "In der Seitenleiste pinnen"
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("kind", kind);
            fd.set("targetId", targetId);
            const result = await toggleTaskInboxPin(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <Pin
          aria-hidden
          className="size-3.5"
          strokeWidth={1.75}
          fill={pinned ? "currentColor" : "none"}
        />
      </button>
      {error ? (
        <span className="absolute top-full right-0 z-10 mt-1 w-max max-w-[12rem] rounded-md bg-white px-2 py-1 text-xs text-red-700 shadow">
          {error}
        </span>
      ) : null}
    </span>
  );
}
