"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { Image as TiptapImage } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { marked } from "marked";
import {
  Bold,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Table2,
  Trash2,
  Unlink,
  Video,
} from "lucide-react";
import {
  canonicalizeWikiHref,
  isExternalWikiHref,
  normalizeWikiHref,
} from "@/lib/wiki-links";
import { resolveVideoEmbed } from "@/lib/wiki-embeds";
import { htmlToWikiMarkdown, normalizeWikiMarkdownTables } from "@/lib/wiki-markdown-tables";

function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown || "", { async: false });
  return typeof html === "string" ? html : "";
}

type BlockStyle = "paragraph" | "heading2" | "heading3";

function getBlockStyle(editor: Editor): BlockStyle {
  if (editor.isActive("heading", { level: 2 })) return "heading2";
  if (editor.isActive("heading", { level: 3 })) return "heading3";
  return "paragraph";
}

function setBlockStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === "heading2") {
    chain.setHeading({ level: 2 }).run();
    return;
  }
  if (style === "heading3") {
    chain.setHeading({ level: 3 }).run();
    return;
  }
  chain.setParagraph().run();
}

function ToolbarDivider() {
  return (
    <span
      className="mx-0.5 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:block"
      aria-hidden
    />
  );
}

function ToolbarIconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-[var(--highlight)] text-[#0a0a0a]"
          : "text-[var(--fg)] hover:bg-black/5",
        disabled ? "cursor-not-allowed opacity-35" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToolbarTextButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-semibold text-[var(--fg)] transition-colors hover:bg-black/5"
    >
      {label}
    </button>
  );
}

function BlockStyleSelect({
  value,
  onChange,
}: {
  value: BlockStyle;
  onChange: (style: BlockStyle) => void;
}) {
  return (
    <label className="relative inline-flex min-w-[9.5rem] items-center">
      <span className="sr-only">Textstil</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BlockStyle)}
        title="Textstil — steuert die Schriftgröße über Überschriften"
        className="h-8 w-full cursor-pointer appearance-none rounded-md border border-[var(--border)] bg-white py-1 pl-2.5 pr-7 text-sm font-medium text-[var(--fg)] outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
      >
        <option value="paragraph">Normaler Text</option>
        <option value="heading2">Überschrift (groß)</option>
        <option value="heading3">Zwischenüberschrift</option>
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2 size-3.5 text-[var(--muted)]"
      >
        <path
          fill="currentColor"
          d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06Z"
        />
      </svg>
    </label>
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
        },
      }),
      TiptapImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "wiki-editor-image",
        },
      }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: {
            class: "wiki-table",
          },
        },
      }),
    ],
    content: markdownToHtml(normalizeWikiMarkdownTables(initialMarkdown)),
    editorProps: {
      attributes: {
        class:
          "wiki-prose wiki-editor-surface min-h-[280px] px-3 py-2 outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(htmlToWikiMarkdown(ed.getHTML()));
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  if (!editor) {
    return (
      <div className="min-h-[320px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
        Editor lädt…
      </div>
    );
  }

  const ed = editor;
  const inTable = ed.isActive("table");
  const iconClass = "size-4";

  async function uploadAndInsertImage(file: File) {
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/wiki/images", {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.url) {
        window.alert(data?.error || "Bild-Upload fehlgeschlagen.");
        return;
      }
      ed.chain()
        .focus()
        .setImage({ src: data.url, alt: file.name.replace(/\.[^.]+$/, "") })
        .run();
    } catch {
      window.alert("Bild-Upload fehlgeschlagen.");
    } finally {
      setUploadingImage(false);
    }
  }

  function setLink() {
    const previous = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      "Link-Adresse (Website oder Wiki-URL aus der Adresszeile):",
      previous ?? "",
    );
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = canonicalizeWikiHref(trimmed, window.location.origin);
    const external = isExternalWikiHref(href, window.location.origin);
    ed.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href,
        target: external ? "_blank" : null,
        rel: external ? "noopener noreferrer" : null,
      })
      .run();
  }

  function insertVideo() {
    const url = window.prompt("YouTube-, Vimeo- oder Loom-Link einfügen:");
    if (url === null) return;
    const href = normalizeWikiHref(url.trim());
    if (!href || !resolveVideoEmbed(href)) {
      window.alert(
        "Bitte einen gültigen YouTube-, Vimeo- oder Loom-Link einfügen.",
      );
      return;
    }
    ed.chain()
      .focus()
      .insertContent({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: href,
            marks: [{ type: "link", attrs: { href } }],
          },
        ],
      })
      .run();
  }

  function insertTable() {
    ed.chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] bg-[var(--bg)]/60">
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
          <BlockStyleSelect
            value={getBlockStyle(ed)}
            onChange={(style) => setBlockStyle(ed, style)}
          />

          <ToolbarDivider />

          <ToolbarIconButton
            label="Fett (⌘B)"
            active={ed.isActive("bold")}
            onClick={() => ed.chain().focus().toggleBold().run()}
          >
            <Bold className={iconClass} strokeWidth={2.5} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Kursiv (⌘I)"
            active={ed.isActive("italic")}
            onClick={() => ed.chain().focus().toggleItalic().run()}
          >
            <Italic className={iconClass} strokeWidth={2.5} />
          </ToolbarIconButton>

          <ToolbarDivider />

          <ToolbarIconButton
            label="Aufzählung"
            active={ed.isActive("bulletList")}
            onClick={() => ed.chain().focus().toggleBulletList().run()}
          >
            <List className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Nummerierte Liste"
            active={ed.isActive("orderedList")}
            onClick={() => ed.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Zitat"
            active={ed.isActive("blockquote")}
            onClick={() => ed.chain().focus().toggleBlockquote().run()}
          >
            <Quote className={iconClass} />
          </ToolbarIconButton>

          <ToolbarDivider />

          <ToolbarIconButton
            label="Tabelle einfügen"
            active={inTable}
            onClick={insertTable}
          >
            <Table2 className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Link setzen"
            active={ed.isActive("link")}
            onClick={setLink}
          >
            <Link2 className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Link entfernen"
            disabled={!ed.isActive("link")}
            onClick={() => ed.chain().focus().unsetLink().run()}
          >
            <Unlink className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Bild hochladen"
            disabled={uploadingImage}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className={iconClass} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="YouTube-, Vimeo- oder Loom-Video einbetten"
            onClick={insertVideo}
          >
            <Video className={iconClass} />
          </ToolbarIconButton>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadAndInsertImage(file);
          }}
        />

        {inTable ? (
          <div className="flex flex-wrap items-center gap-0.5 border-t border-[var(--border)] bg-white/70 px-2 py-1">
            <span className="mr-1 px-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
              Tabelle
            </span>
            <ToolbarTextButton
              label="+ Zeile"
              title="Zeile darunter einfügen"
              onClick={() => ed.chain().focus().addRowAfter().run()}
            />
            <ToolbarTextButton
              label="+ Spalte"
              title="Spalte rechts einfügen"
              onClick={() => ed.chain().focus().addColumnAfter().run()}
            />
            <ToolbarTextButton
              label="− Zeile"
              title="Aktuelle Zeile löschen"
              onClick={() => ed.chain().focus().deleteRow().run()}
            />
            <ToolbarTextButton
              label="− Spalte"
              title="Aktuelle Spalte löschen"
              onClick={() => ed.chain().focus().deleteColumn().run()}
            />
            <ToolbarDivider />
            <ToolbarIconButton
              label="Tabelle löschen"
              onClick={() => ed.chain().focus().deleteTable().run()}
            >
              <Trash2 className={iconClass} />
            </ToolbarIconButton>
          </div>
        ) : null}
      </div>
      <EditorContent editor={ed} />
      <p className="border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]">
        Schriftgröße über «Normaler Text / Überschrift». Bild: JPEG/PNG/WebP/GIF
        (max. 8 MB). Video: YouTube-, Vimeo- oder Loom-Link allein in einer Zeile.
      </p>
    </div>
  );
}
