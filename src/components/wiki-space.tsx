"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pin } from "lucide-react";
import {
  createWikiPage,
  deleteWikiPage,
  toggleWikiPin,
  updateWikiPage,
} from "@/lib/wiki-actions";
import { buildWikiTree, type WikiPageNode } from "@/lib/wiki-shared";
import {
  WikiRichEditor,
  type WikiRichEditorHandle,
} from "@/components/wiki-rich-editor";
import { WikiMarkdown } from "@/components/wiki-markdown";

type WikiPageView = WikiPageNode & {
  body: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
};

function formatEditedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function wikiPagePath(spaceId: string, slug: string) {
  return `/spaces/${spaceId}?page=${encodeURIComponent(slug)}`;
}

function wikiPageUrl(spaceId: string, slug: string) {
  if (typeof window === "undefined") return wikiPagePath(spaceId, slug);
  return `${window.location.origin}${wikiPagePath(spaceId, slug)}`;
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CopyWikiLinkButton({
  spaceId,
  slug,
}: {
  spaceId: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wikiPageUrl(spaceId, slug));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Kopiert" : "Link kopieren"}
      aria-label={copied ? "Link kopiert" : "Link zur Seite kopieren"}
      className="btn btn-secondary inline-flex items-center justify-center !px-2.5 text-sm"
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <LinkIcon className="size-4" />
      )}
    </button>
  );
}

function TreeList({
  byParent,
  parentId,
  spaceId,
  currentSlug,
  depth = 0,
}: {
  byParent: Map<string | null, WikiPageNode[]>;
  parentId: string | null;
  spaceId: string;
  currentSlug: string | null;
  depth?: number;
}) {
  const children = byParent.get(parentId) ?? [];
  if (children.length === 0) return null;

  return (
    <ul className={depth === 0 ? "space-y-0.5" : "mt-0.5 ml-3 space-y-0.5 border-l border-[var(--border)] pl-2"}>
      {children.map((page) => {
        const active = page.slug === currentSlug;
        return (
          <li key={page.id}>
            <Link
              href={wikiPagePath(spaceId, page.slug)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-[var(--highlight)] font-semibold text-[#0a0a0a]"
                  : "text-[var(--fg)] hover:bg-black/5",
              ].join(" ")}
            >
              {page.pinned && (
                <Pin
                  aria-label="Angepinnt"
                  className="size-3.5 shrink-0 opacity-70"
                  strokeWidth={1.75}
                />
              )}
              <span className="min-w-0 truncate">{page.title}</span>
            </Link>
            <TreeList
              byParent={byParent}
              parentId={page.id}
              spaceId={spaceId}
              currentSlug={currentSlug}
              depth={depth + 1}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function WikiSpace({
  spaceId,
  pages,
  currentPage,
  rootPages,
}: {
  spaceId: string;
  pages: WikiPageNode[];
  currentPage: WikiPageView | null;
  rootPages: WikiPageNode[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(currentPage?.title ?? "");
  const [body, setBody] = useState(currentPage?.body ?? "");
  const [editorNonce, setEditorNonce] = useState(0);
  const editorRef = useRef<WikiRichEditorHandle>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byParent = useMemo(() => buildWikiTree(pages), [pages]);
  const pinned = useMemo(
    () => pages.filter((p) => p.pinned).slice(0, 8),
    [pages],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, query]);

  useEffect(() => {
    setEditing(false);
    setTitle(currentPage?.title ?? "");
    setBody(currentPage?.body ?? "");
    setEditorNonce((n) => n + 1);
    setError(null);
  }, [currentPage?.id, currentPage?.title, currentPage?.body]);

  function save() {
    if (!currentPage) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", currentPage.id);
    fd.set("title", title);
    fd.set("body", editorRef.current?.getMarkdown() ?? body);
    startTransition(async () => {
      const result = await updateWikiPage(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      if (result.slug && result.slug !== currentPage.slug) {
        router.push(
          `/spaces/${spaceId}?page=${encodeURIComponent(result.slug)}`,
        );
      } else {
        router.refresh();
      }
    });
  }

  function pin() {
    if (!currentPage) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", currentPage.id);
    startTransition(async () => {
      const result = await toggleWikiPin(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!currentPage) return;
    if (!window.confirm(`Seite «${currentPage.title}» wirklich löschen?`)) {
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("id", currentPage.id);
    startTransition(async () => {
      const result = await deleteWikiPage(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/spaces/${spaceId}`);
      router.refresh();
    });
  }

  function create() {
    setError(null);
    const fd = new FormData();
    fd.set("title", newTitle);
    if (currentPage) fd.set("parentId", currentPage.id);
    startTransition(async () => {
      const result = await createWikiPage(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setNewOpen(false);
      setNewTitle("");
      if (result.slug) {
        router.push(
          `/spaces/${spaceId}?page=${encodeURIComponent(result.slug)}`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="card h-fit space-y-3 p-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <Link
            href={`/spaces/${spaceId}`}
            className="text-sm font-bold hover:underline"
          >
            Wiki
          </Link>
          <button
            type="button"
            className="btn btn-secondary !px-2 !py-1 text-xs"
            onClick={() => {
              setNewOpen(true);
              setError(null);
            }}
          >
            + Seite
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Seiten suchen…"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
        />
        {filtered ? (
          <ul className="space-y-0.5">
            {filtered.length === 0 && (
              <li className="px-2 py-1 text-sm text-[var(--muted)]">
                Keine Treffer
              </li>
            )}
            {filtered.map((page) => (
              <li key={page.id}>
                <Link
                  href={wikiPagePath(spaceId, page.slug)}
                  className="block rounded-lg px-2 py-1.5 text-sm hover:bg-black/5"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <TreeList
            byParent={byParent}
            parentId={null}
            spaceId={spaceId}
            currentSlug={currentPage?.slug ?? null}
          />
        )}
      </aside>

      <div className="min-w-0 space-y-4">
        {error && (
          <p className="rounded-lg border border-[var(--danger)]/30 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        {!currentPage ? (
          <div className="space-y-6">
            <header>
              <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
                Wissensbasis
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-body)] text-3xl font-semibold tracking-tight">
                Wiki
              </h1>
            </header>

            {pinned.length > 0 && (
              <section>
                <h2 className="mb-2 font-[family-name:var(--font-body)] text-lg font-semibold">
                  Pins
                </h2>
                <div className="flex flex-wrap gap-2">
                  {pinned.map((p) => (
                    <Link
                      key={p.id}
                      href={`/spaces/${spaceId}?page=${encodeURIComponent(p.slug)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:border-[var(--accent)]"
                    >
                      <Pin
                        aria-hidden
                        className="size-3.5 shrink-0 opacity-70"
                        strokeWidth={1.75}
                      />
                      {p.title}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2 font-[family-name:var(--font-body)] text-lg font-semibold">
                Bereiche
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {rootPages.map((root) => (
                  <Link
                    key={root.id}
                    href={`/spaces/${spaceId}?page=${encodeURIComponent(root.slug)}`}
                    className="card block p-4 transition-shadow hover:shadow-md"
                  >
                    <p className="font-semibold">{root.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {(byParent.get(root.id) ?? []).length} Unterseiten
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <article className="card space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {editing ? (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-[family-name:var(--font-body)] text-2xl font-semibold"
                  />
                ) : (
                  <h1 className="font-[family-name:var(--font-body)] text-3xl font-semibold tracking-tight">
                    {currentPage.title}
                  </h1>
                )}
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Zuletzt bearbeitet von {currentPage.updatedBy.name} am{" "}
                  {formatEditedAt(currentPage.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyWikiLinkButton
                  spaceId={spaceId}
                  slug={currentPage.slug}
                />
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={pending}
                  onClick={pin}
                >
                  {currentPage.pinned ? "Pin lösen" : "Anpinnen"}
                </button>
                {!editing ? (
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    onClick={() => {
                      setTitle(currentPage.title);
                      setBody(currentPage.body);
                      setEditorNonce((n) => n + 1);
                      setEditing(true);
                    }}
                  >
                    Bearbeiten
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      disabled={pending}
                      onClick={() => {
                        setEditing(false);
                        setTitle(currentPage.title);
                        setBody(currentPage.body);
                        setEditorNonce((n) => n + 1);
                      }}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary text-sm"
                      disabled={pending}
                      onClick={save}
                    >
                      {pending ? "…" : "Speichern"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-secondary text-sm text-[var(--danger)]"
                  disabled={pending}
                  onClick={remove}
                >
                  Löschen
                </button>
              </div>
            </div>

            {editing ? (
              <WikiRichEditor
                ref={editorRef}
                key={`${currentPage.id}-${editorNonce}`}
                initialMarkdown={body}
                onChange={setBody}
              />
            ) : (
              <div className="wiki-prose">
                <WikiMarkdown source={currentPage.body} />
              </div>
            )}
          </article>
        )}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4 p-5">
            <h2 className="font-[family-name:var(--font-body)] text-xl font-semibold">
              Neue Seite
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {currentPage
                ? `Unter «${currentPage.title}»`
                : "Als oberster Bereich"}
            </p>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titel"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTitle.trim()) create();
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setNewOpen(false);
                  setNewTitle("");
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !newTitle.trim()}
                onClick={create}
              >
                Anlegen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
