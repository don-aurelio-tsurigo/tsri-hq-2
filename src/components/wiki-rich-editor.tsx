"use client";

import { useEffect, useReducer } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { marked } from "marked";
import TurndownService from "turndown";
import { normalizeWikiHref } from "@/lib/wiki-links";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown || "", { async: false });
  return typeof html === "string" ? html : "";
}

function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";
  return turndown.turndown(html).trim();
}

function ToolbarButton({
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-md px-2 py-1 text-sm font-semibold transition-colors",
        active
          ? "bg-[var(--highlight)] text-[#0a0a0a]"
          : "text-[var(--fg)] hover:bg-black/5",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function WikiRichEditor({
  initialMarkdown,
  onChange,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "wiki-editor-link",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    content: markdownToHtml(initialMarkdown),
    editorProps: {
      attributes: {
        class:
          "wiki-prose wiki-editor-surface min-h-[280px] px-3 py-2 outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(htmlToMarkdown(ed.getHTML()));
      bump();
    },
    onSelectionUpdate: () => {
      bump();
    },
  });

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-[320px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
        Editor lädt…
      </div>
    );
  }

  const ed = editor;

  function setLink() {
    const previous = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Link-Adresse (Website oder Wiki-URL aus der Adresszeile):",
      previous ?? "https://",
    );
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = normalizeWikiHref(trimmed);
    ed.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg)]/60 px-2 py-1.5">
        <ToolbarButton
          label="Fett"
          title="Fett"
          active={ed.isActive("bold")}
          onClick={() => ed.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Kursiv"
          title="Kursiv"
          active={ed.isActive("italic")}
          onClick={() => ed.chain().focus().toggleItalic().run()}
        />
        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
        <ToolbarButton
          label="Titel"
          title="Überschrift"
          active={ed.isActive("heading", { level: 2 })}
          onClick={() =>
            ed.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarButton
          label="Untertitel"
          title="Unterüberschrift"
          active={ed.isActive("heading", { level: 3 })}
          onClick={() =>
            ed.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
        <ToolbarButton
          label="• Liste"
          title="Aufzählung"
          active={ed.isActive("bulletList")}
          onClick={() => ed.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1. Liste"
          title="Nummerierte Liste"
          active={ed.isActive("orderedList")}
          onClick={() => ed.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Zitat"
          title="Zitat"
          active={ed.isActive("blockquote")}
          onClick={() => ed.chain().focus().toggleBlockquote().run()}
        />
        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
        <ToolbarButton
          label="Link"
          title="Link setzen oder entfernen"
          active={ed.isActive("link")}
          onClick={setLink}
        />
        <ToolbarButton
          label="Link weg"
          title="Link entfernen"
          disabled={!ed.isActive("link")}
          onClick={() => ed.chain().focus().unsetLink().run()}
        />
      </div>
      <EditorContent editor={ed} />
      <p className="border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]">
        Text markieren → Format wählen. Für Links: Text markieren, dann «Link».
      </p>
    </div>
  );
}
