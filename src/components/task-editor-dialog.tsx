"use client";

import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";
import { updateTask } from "@/lib/actions";
import { TASK_STATUS_LABELS } from "@/lib/task-status";
import type { TaskStatus } from "@/generated/prisma/client";
import { ArticleRichEditor, countWords } from "@/components/article-rich-editor";
import { CommentsSection } from "@/components/article-comments";
import { TaskDuePicker } from "@/components/task-due-picker";
import { useDeleteTaskWithUndo } from "@/components/use-delete-task-with-undo";
import { useTaskComments } from "@/components/use-comments";
import {
  createdMeta,
  EditorDialogShell,
  EditorError,
  MenuItem,
  pillClass,
  PillSelect,
  TitleInput,
  useAutosave,
  type PillOption,
} from "@/components/editor-dialog";
import type { TaskRow } from "@/components/task-list";

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done", "cancelled"];
const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#a3a3a3",
  doing: "#2b9fe0",
  done: "#22a06b",
  cancelled: "#d1453b",
};

export function TaskEditorDialog({
  task,
  members,
  groups,
  showDueOffset = false,
  onClose,
}: {
  task: TaskRow | null;
  members?: PillOption[];
  groups?: PillOption[];
  /** Template mode: relative day offset to the event instead of a date. */
  showDueOffset?: boolean;
  onClose: () => void;
}) {
  if (!task) return null;
  return (
    <TaskPanel
      key={task.id}
      task={task}
      members={members}
      groups={groups}
      showDueOffset={showDueOffset}
      onClose={onClose}
    />
  );
}

function TaskPanel({
  task,
  members,
  groups,
  showDueOffset,
  onClose,
}: {
  task: TaskRow;
  members?: PillOption[];
  groups?: PillOption[];
  showDueOffset: boolean;
  onClose: () => void;
}) {
  const deleteWithUndo = useDeleteTaskWithUndo();
  const [fullscreen, setFullscreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const comments = useTaskComments(task.id);

  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.description ?? "");
  const [props, setProps] = useState({
    status: task.status,
    assigneeId: task.assigneeId ?? task.assignee?.id ?? "",
    groupId: task.groupId ?? task.group?.id ?? "",
    dueOffsetDays: task.dueOffsetDays != null ? String(task.dueOffsetDays) : "",
  });

  const { saveState, error, setError, queueChange, flush } = useAutosave(
    async (changes) => {
      const fd = new FormData();
      fd.set("id", task.id);
      for (const [k, v] of Object.entries(changes)) fd.set(k, v);
      const result = await updateTask(fd);
      // Assigning a personal task to someone else moves it to their list.
      if (result && "handedOff" in result && result.handedOff) onClose();
      return result;
    },
  );

  const close = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  const onEscape = useCallback(() => pickerOpen, [pickerOpen]);

  function setProp<K extends keyof typeof props>(
    key: K,
    value: string,
    immediate = true,
  ) {
    setProps((p) => ({ ...p, [key]: value }));
    queueChange(key, value, immediate);
  }

  const words = countWords(body);

  return (
    <EditorDialogShell
      label="Task bearbeiten"
      meta={
        <>
          {task.space ? `${task.space.name} · ` : ""}
          {createdMeta(task.createdAt, task.createdBy)}
        </>
      }
      saveState={saveState}
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
      onEscape={onEscape}
      onClose={close}
      menu={(closeMenu) => (
        <MenuItem
          icon={<Trash2 className="size-4" />}
          danger
          onClick={async () => {
            closeMenu();
            await flush();
            const result = await deleteWithUndo(task.id);
            if (result && "error" in result && result.error) {
              setError(result.error);
              return;
            }
            onClose();
          }}
        >
          Löschen
        </MenuItem>
      )}
      footerStart={`${words} ${words === 1 ? "Wort" : "Wörter"}`}
      footerEnd="Änderungen werden automatisch gespeichert"
    >
      <EditorError message={error} />

      <TitleInput
        value={title}
        disabled={false}
        onChange={(v) => {
          setTitle(v);
          if (v.trim()) queueChange("title", v.trim());
        }}
      />

      {!fullscreen && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <PillSelect
            label="Status"
            value={props.status}
            disabled={false}
            dot={STATUS_COLORS[props.status]}
            onChange={(v) => setProp("status", v)}
            options={STATUS_ORDER.map((s) => ({
              id: s,
              name: TASK_STATUS_LABELS[s],
            }))}
          />
          {showDueOffset ? (
            <label className={`${pillClass} border-[var(--border)]`} title="Tage relativ zum Event (negativ = vorher)">
              <span className="text-[var(--muted)]">Tage zum Event</span>
              <input
                type="number"
                value={props.dueOffsetDays}
                placeholder="z.B. -14"
                onChange={(e) => setProp("dueOffsetDays", e.target.value, false)}
                className="w-14 border-0 bg-transparent p-0 text-xs outline-none"
              />
            </label>
          ) : (
            <TaskDuePicker
              taskId={task.id}
              dueAt={task.dueAt}
              recurrence={task.recurrence}
              allowRecurrence
              variant="pill"
              onOpenChange={setPickerOpen}
            />
          )}
          {members && members.length > 0 && (
            <PillSelect
              label="Zuständig"
              value={props.assigneeId}
              disabled={false}
              emptyLabel="Zuständig"
              onChange={(v) => setProp("assigneeId", v)}
              options={members}
            />
          )}
          {groups && (
            <PillSelect
              label="Gruppe"
              value={props.groupId}
              disabled={false}
              emptyLabel="Gruppe"
              onChange={(v) => setProp("groupId", v)}
              options={groups}
            />
          )}
        </div>
      )}

      {!fullscreen && <CommentsSection state={comments} />}

      <ArticleRichEditor
        initialMarkdown={task.description ?? ""}
        editable
        placeholder="Beschreibung, Notizen, Links…"
        toolbarClassName="sticky top-0 z-10 mt-4"
        contentClassName="pt-4"
        onChange={(md) => {
          setBody(md);
          queueChange("description", md);
        }}
      />
    </EditorDialogShell>
  );
}
