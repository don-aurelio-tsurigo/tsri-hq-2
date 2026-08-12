"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { deleteTask, restoreTask } from "@/lib/actions";
import { useToast } from "@/components/toast";

const UNDO_MS = 7000;

/** Soft-deletes a task and shows an undo toast (7s). */
export function useDeleteTaskWithUndo() {
  const { showToast } = useToast();
  const router = useRouter();

  return useCallback(
    async (taskId: string) => {
      const result = await deleteTask(taskId);
      if (result && "error" in result && result.error) {
        return result;
      }

      showToast({
        message: "Task gelöscht",
        durationMs: UNDO_MS,
        action: {
          label: "Rückgängig",
          onClick: async () => {
            await restoreTask(taskId);
            router.refresh();
          },
        },
      });
      router.refresh();
      return result;
    },
    [router, showToast],
  );
}
