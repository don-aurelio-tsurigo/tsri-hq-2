"use client";

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { Mark, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import { marked } from "marked";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { htmlToWikiMarkdown } from "@/lib/wiki-markdown-tables";

// `breaks` keeps single line breaks from older plain-text notes intact.
function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown || "", { async: false, breaks: true });
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
  if (style === "heading2") chain.setHeading({ level: 2 }).run();
  else if (style === "heading3") chain.setHeading({ level: 3 }).run();
  else chain.setParagraph().run();
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-[var(--highlight)] text-[#0a0a0a]"
          : "text-[var(--fg)] hover:bg-black/5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
  );
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/<\/?span\b[^>]*>/g, "")
    .replace(/[#>*_~`\-[\]()]/g, " ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Anchor of a comment thread on a text passage (`commentId` = thread start). */
const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment"),
        renderHTML: (attrs) => ({ "data-comment": attrs.commentId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "article-comment-mark" }),
      0,
    ];
  },
});

export type CommentSelection = { from: number; to: number; quote: string };

export function addCommentMark(
  editor: Editor,
  range: { from: number; to: number },
  commentId: string,
) {
  editor
    .chain()
    .setTextSelection(range)
    .setMark("comment", { commentId })
    .setTextSelection(range.to)
    .run();
}

export function removeCommentMark(editor: Editor, commentId: string) {
  const type = editor.schema.marks.comment;
  if (!type) return;
  const { tr, doc } = editor.state;
  doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (mark.type === type && mark.attrs.commentId === commentId) {
        tr.removeMark(pos, pos + node.nodeSize, mark);
      }
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function ArticleRichEditor({
  initialMarkdown,
  editable,
  onChange,
  onReady,
  onStartComment,
  onCommentClick,
  placeholder = "Notizen, Pitch oder ganzer Artikeltext…",
  toolbarClassName = "",
  contentClassName = "",
}: {
  initialMarkdown: string;
  editable: boolean;
  onChange: (markdown: string) => void;
  onReady?: (editor: Editor) => void;
  /** Shows «Kommentieren» on text selections (needs `editable`). */
  onStartComment?: (selection: CommentSelection) => void;
  onCommentClick?: (commentId: string) => void;
  placeholder?: string;
  toolbarClassName?: string;
  contentClassName?: string;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // Last emitted markdown; transactions that don't change it aren't edits.
  const lastRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      TiptapLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: "wiki-editor-link" },
      }),
      Placeholder.configure({ placeholder }),
      CommentMark,
    ],
    content: markdownToHtml(initialMarkdown),
    editorProps: {
      attributes: {
        class: `article-prose wiki-prose min-h-[40vh] outline-none ${contentClassName}`,
      },
    },
    onCreate: ({ editor: ed }) => {
      lastRef.current = htmlToWikiMarkdown(ed.getHTML());
      onReady?.(ed);
    },
    onUpdate: ({ editor: ed }) => {
      const md = htmlToWikiMarkdown(ed.getHTML());
      if (md !== lastRef.current) {
        lastRef.current = md;
        onChange(md);
      }
      bump();
    },
    onSelectionUpdate: () => bump(),
  });

  useEffect(() => {
    // emitUpdate=false: toggling editability is not a content change.
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  if (!editor) {
    return (
      <p className="min-h-[40vh] py-4 text-sm text-[var(--muted)]">
        Editor lädt…
      </p>
    );
  }

  const ed = editor;
  const icon = "size-4";

  function setLink() {
    const previous = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link-Adresse:", previous ?? "");
    if (url === null) return;
    const href = url.trim();
    if (href === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    ed.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: /^[a-z]+:/i.test(href) ? href : `https://${href}`,
        target: "_blank",
        rel: "noopener noreferrer",
      })
      .run();
  }

  return (
    <div>
      {editable && (
        <div
          className={`flex items-center gap-0.5 overflow-x-auto border-y border-[var(--border)] bg-[var(--bg-elevated)] py-1 [scrollbar-width:none] ${toolbarClassName}`}
          role="toolbar"
          aria-label="Formatierung"
        >
          <label className="shrink-0">
            <span className="sr-only">Textstil</span>
            <select
              value={getBlockStyle(ed)}
              onChange={(e) => setBlockStyle(ed, e.target.value as BlockStyle)}
              className="h-8 cursor-pointer rounded-md border-0 bg-transparent py-0 pr-7 pl-2 text-sm font-medium hover:bg-black/5"
            >
              <option value="paragraph">Text</option>
              <option value="heading2">Titel</option>
              <option value="heading3">Untertitel</option>
            </select>
          </label>
          <ToolbarDivider />
          <ToolbarButton
            label="Fett (⌘B)"
            active={ed.isActive("bold")}
            onClick={() => ed.chain().focus().toggleBold().run()}
          >
            <Bold className={icon} strokeWidth={2.5} />
          </ToolbarButton>
          <ToolbarButton
            label="Kursiv (⌘I)"
            active={ed.isActive("italic")}
            onClick={() => ed.chain().focus().toggleItalic().run()}
          >
            <Italic className={icon} strokeWidth={2.5} />
          </ToolbarButton>
          <ToolbarButton
            label="Durchgestrichen"
            active={ed.isActive("strike")}
            onClick={() => ed.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className={icon} />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            active={ed.isActive("link")}
            onClick={setLink}
          >
            <Link2 className={icon} />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="Aufzählung"
            active={ed.isActive("bulletList")}
            onClick={() => ed.chain().focus().toggleBulletList().run()}
          >
            <List className={icon} />
          </ToolbarButton>
          <ToolbarButton
            label="Nummerierte Liste"
            active={ed.isActive("orderedList")}
            onClick={() => ed.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className={icon} />
          </ToolbarButton>
          <ToolbarButton
            label="Zitat"
            active={ed.isActive("blockquote")}
            onClick={() => ed.chain().focus().toggleBlockquote().run()}
          >
            <Quote className={icon} />
          </ToolbarButton>
          <ToolbarButton
            label="Trennlinie"
            onClick={() => ed.chain().focus().setHorizontalRule().run()}
          >
            <Minus className={icon} />
          </ToolbarButton>
        </div>
      )}
      {editable && onStartComment && (
        <BubbleMenu
          editor={ed}
          shouldShow={({ editor: e, state }) =>
            e.isEditable && !state.selection.empty && !e.isActive("codeBlock")
          }
          className="z-30 flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 shadow-[var(--shadow)]"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const { from, to } = ed.state.selection;
              const quote = ed.state.doc.textBetween(from, to, " ").trim();
              if (quote) onStartComment({ from, to, quote });
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[var(--fg)] hover:bg-black/5"
          >
            <MessageSquarePlus className="size-4" />
            Kommentieren
          </button>
        </BubbleMenu>
      )}
      <div
        onClick={(e) => {
          const anchor = (e.target as HTMLElement).closest("[data-comment]");
          const id = anchor?.getAttribute("data-comment");
          if (id && onCommentClick) onCommentClick(id);
        }}
      >
        <EditorContent editor={ed} />
      </div>
    </div>
  );
}
