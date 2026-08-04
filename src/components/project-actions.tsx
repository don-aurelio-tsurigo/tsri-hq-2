"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveProject,
  deleteProjectTemplate,
  saveProjectAsTemplate,
  unarchiveProject,
} from "@/lib/actions";

export function ProjectActions({
  projectId,
  projectName,
  isTemplate,
  archived,
  canEdit,
}: {
  projectId: string;
  projectName: string;
  isTemplate: boolean;
  archived: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!canEdit) return null;

  function run(
    action: () => Promise<{ error?: string; ok?: true; id?: string }>,
    opts?: { redirectTo?: string; success?: string },
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (opts?.success) setMessage(opts.success);
      if (opts?.redirectTo) {
        router.push(opts.redirectTo);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isTemplate && !archived && (
        <>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `«${projectName}» als Vorlage speichern? Es wird eine Kopie mit den To-Do-Titeln angelegt.`,
                )
              ) {
                return;
              }
              run(
                async () => {
                  const fd = new FormData();
                  fd.set("id", projectId);
                  return saveProjectAsTemplate(fd);
                },
                { success: "Vorlage gespeichert." },
              );
            }}
          >
            Als Vorlage speichern
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Projekt «${projectName}» archivieren?`)) return;
              run(
                async () => {
                  const fd = new FormData();
                  fd.set("id", projectId);
                  return archiveProject(fd);
                },
                { redirectTo: "/projects" },
              );
            }}
          >
            Archivieren
          </button>
        </>
      )}
      {!isTemplate && archived && (
        <button
          type="button"
          className="btn btn-primary px-3 py-1.5 text-sm"
          disabled={pending}
          onClick={() => {
            run(async () => {
              const fd = new FormData();
              fd.set("id", projectId);
              return unarchiveProject(fd);
            });
          }}
        >
          Wiederherstellen
        </button>
      )}
      {isTemplate && (
        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Vorlage «${projectName}» wirklich löschen?`)) return;
            run(
              async () => {
                const fd = new FormData();
                fd.set("id", projectId);
                return deleteProjectTemplate(fd);
              },
              { redirectTo: "/projects" },
            );
          }}
        >
          Vorlage löschen
        </button>
      )}
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
      {message && (
        <p className="w-full text-sm text-[var(--accent)]">{message}</p>
      )}
    </div>
  );
}
