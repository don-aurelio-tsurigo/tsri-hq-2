"use client";

import { useMemo, useState } from "react";
import { ExpandableTaskList } from "@/components/expandable-task-list";
import type { TaskRow } from "@/components/task-list";

type Scope = "mine" | "all";
type GroupBy = "person" | "project";

type Bucket = {
  key: string;
  label: string;
  tasks: TaskRow[];
};

function assigneeIdOf(task: TaskRow) {
  return task.assigneeId ?? task.assignee?.id ?? null;
}

export function ProjectTasksOverview({
  tasks,
  currentUserId,
  members,
}: {
  tasks: TaskRow[];
  currentUserId: string;
  members?: { id: string; name: string; email?: string | null }[];
}) {
  const [scope, setScope] = useState<Scope>("mine");
  const [groupBy, setGroupBy] = useState<GroupBy>("person");

  const mineCount = useMemo(
    () => tasks.filter((t) => assigneeIdOf(t) === currentUserId).length,
    [tasks, currentUserId],
  );

  const visibleTasks = useMemo(() => {
    if (scope === "mine") {
      return tasks.filter((t) => assigneeIdOf(t) === currentUserId);
    }
    return tasks;
  }, [tasks, scope, currentUserId]);

  const buckets = useMemo((): Bucket[] | null => {
    if (scope !== "all") return null;

    const map = new Map<string, Bucket>();
    for (const task of visibleTasks) {
      let key: string;
      let label: string;
      if (groupBy === "person") {
        const id = assigneeIdOf(task);
        key = id ?? "__unassigned__";
        if (!id) label = "Unzugewiesen";
        else if (id === currentUserId) {
          label = `Ich (${task.assignee?.name ?? "mir"})`;
        } else {
          label = task.assignee?.name ?? "Unbekannt";
        }
      } else {
        key = task.space?.id ?? "__none__";
        label = task.space?.name ?? "Ohne Projekt";
      }
      if (!map.has(key)) map.set(key, { key, label, tasks: [] });
      map.get(key)!.tasks.push(task);
    }

    return [...map.values()].sort((a, b) => {
      if (groupBy === "person") {
        if (a.key === currentUserId) return -1;
        if (b.key === currentUserId) return 1;
        if (a.key === "__unassigned__") return 1;
        if (b.key === "__unassigned__") return -1;
      }
      return a.label.localeCompare(b.label, "de");
    });
  }, [visibleTasks, scope, groupBy, currentUserId]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase">
          Projekt-Tasks ({visibleTasks.length}
          {scope === "all" ? ` · ${mineCount} mir` : ""})
        </h2>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Anzeige
          </span>
          {(
            [
              { id: "mine", label: "Mir zugewiesen", count: mineCount },
              { id: "all", label: "Alle offenen", count: tasks.length },
            ] as const
          ).map((opt) => {
            const active = scope === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  active
                    ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                ].join(" ")}
                onClick={() => setScope(opt.id)}
              >
                {opt.label} ({opt.count})
              </button>
            );
          })}
        </div>

        {scope === "all" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Gruppierung
            </span>
            {(
              [
                { id: "person", label: "Nach Person" },
                { id: "project", label: "Nach Projekt" },
              ] as const
            ).map((opt) => {
              const active = groupBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                    active
                      ? "border-[var(--fg)] bg-[var(--fg)] text-white"
                      : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]",
                  ].join(" ")}
                  onClick={() => setGroupBy(opt.id)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="card px-4 py-6 text-center text-sm text-[var(--muted)]">
          {scope === "mine"
            ? "Dir sind aktuell keine offenen Tasks in Projekten zugewiesen."
            : "Keine offenen Projekt-Tasks."}
        </div>
      ) : scope === "mine" ? (
        <ExpandableTaskList
          tasks={visibleTasks}
          showSpace
          enableDrawer
          compact
          members={members}
          currentUserId={currentUserId}
        />
      ) : (
        <div className="space-y-3">
          {(buckets ?? []).map((bucket) => (
            <div key={bucket.key} className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                <h3 className="text-sm font-semibold">{bucket.label}</h3>
                <span className="text-xs text-[var(--muted)]">
                  {bucket.tasks.length}
                </span>
              </div>
              <ExpandableTaskList
                tasks={bucket.tasks}
                showSpace
                enableDrawer
                compact
                members={members}
                currentUserId={currentUserId}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
