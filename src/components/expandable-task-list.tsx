"use client";

import { useState } from "react";
import { TaskList, type TaskRow } from "@/components/task-list";

const PREVIEW_COUNT = 5;

export function ExpandableTaskList({
  tasks,
  showSpace,
  enableDrawer,
  compact,
}: {
  tasks: TaskRow[];
  showSpace?: boolean;
  enableDrawer?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = tasks.length > PREVIEW_COUNT;
  const visible =
    expanded || !needsCollapse ? tasks : tasks.slice(0, PREVIEW_COUNT);

  return (
    <div className="space-y-2">
      <TaskList
        tasks={visible}
        showSpace={showSpace}
        enableDrawer={enableDrawer}
        compact={compact}
      />
      {needsCollapse && !expanded && (
        <button
          type="button"
          className="text-sm font-semibold text-[var(--accent)] hover:underline"
          onClick={() => setExpanded(true)}
        >
          Alle anzeigen ({tasks.length})
        </button>
      )}
      {needsCollapse && expanded && (
        <button
          type="button"
          className="text-sm font-medium text-[var(--muted)] hover:text-[var(--fg)] hover:underline"
          onClick={() => setExpanded(false)}
        >
          Weniger anzeigen
        </button>
      )}
    </div>
  );
}
