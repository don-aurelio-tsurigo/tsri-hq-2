"use client";

import { useMemo, useState, useTransition } from "react";
import { generateNewsArticleAction } from "@/lib/actions";
import { sourceAutoFetchesFulltext } from "@/lib/news-feed-constants";
import {
  formatKurzmeldungForCopy,
  type KurzmeldungDraft,
} from "@/lib/rag/kurzmeldung-shared";

type DraftPanelState = {
  loading: boolean;
  error: string | null;
  ragWarning: string | null;
  ragHitCount: number | null;
  draft: KurzmeldungDraft | null;
  copyOk: boolean;
};

const emptyState = (): DraftPanelState => ({
  loading: false,
  error: null,
  ragWarning: null,
  ragHitCount: null,
  draft: null,
  copyOk: false,
});

const MIN_PASTE_CHARS = 120;

export function NewsFeedArticleGenerate({
  newsItemId,
  sourceKey,
}: {
  newsItemId: string;
  sourceKey: string;
}) {
  const autoFulltext = sourceAutoFetchesFulltext(sourceKey);
  const [pastedText, setPastedText] = useState("");
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [state, setState] = useState<DraftPanelState>(emptyState);
  const [pending, startTransition] = useTransition();

  const open = state.loading || state.error != null || state.draft != null;
  const pasteReady = autoFulltext || pastedText.trim().length >= MIN_PASTE_CHARS;

  const editableText = useMemo(() => {
    if (!state.draft) return "";
    return formatKurzmeldungForCopy(state.draft);
  }, [state.draft]);

  const [editText, setEditText] = useState("");

  function syncEditFromDraft(draft: KurzmeldungDraft) {
    setEditText(formatKurzmeldungForCopy(draft));
  }

  function generate() {
    if (!pasteReady) {
      setState({
        ...emptyState(),
        error: `Bitte mindestens ${MIN_PASTE_CHARS} Zeichen Artikeltext einfügen.`,
      });
      return;
    }
    setState({
      ...emptyState(),
      loading: true,
    });
    startTransition(async () => {
      const result = await generateNewsArticleAction(
        newsItemId,
        pastedText.trim() ? pastedText : undefined,
      );
      if ("error" in result && result.error) {
        setState({
          ...emptyState(),
          error: result.error,
        });
        return;
      }
      if (!("draft" in result) || !result.draft) {
        setState({
          ...emptyState(),
          error: "Kein Entwurf erhalten.",
        });
        return;
      }
      syncEditFromDraft(result.draft);
      setState({
        loading: false,
        error: null,
        ragWarning: result.ragWarning ?? null,
        ragHitCount: result.ragHitCount ?? null,
        draft: result.draft,
        copyOk: false,
      });
    });
  }

  async function copyText() {
    const text = editText || editableText;
    try {
      await navigator.clipboard.writeText(text);
      setState((prev) => ({ ...prev, copyOk: true }));
      window.setTimeout(() => {
        setState((prev) => ({ ...prev, copyOk: false }));
      }, 2000);
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Kopieren in die Zwischenablage fehlgeschlagen.",
      }));
    }
  }

  return (
    <div className="space-y-2">
      {autoFulltext ? (
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--muted)]">
            Stadt Zürich: Volltext wird beim Generieren automatisch geladen.
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() => setShowManualPaste((v) => !v)}
            >
              {showManualPaste ? "Fallback ausblenden" : "Text manuell einfügen"}
            </button>
          </p>
          {showManualPaste && (
            <textarea
              className="min-h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed text-[var(--fg)]"
              placeholder="Optional: Volltext manuell einfügen…"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          )}
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-[var(--muted)]">
            Vollständigen Artikeltext einfügen (Pflicht bei Paywall/Teaser-Quellen)
          </span>
          <textarea
            className="min-h-28 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed text-[var(--fg)]"
            placeholder="Artikel von der Quellseite kopieren und hier einfügen…"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
          />
          <span className="text-[11px] text-[var(--muted)]">
            {pastedText.trim().length} Zeichen
            {pastedText.trim().length < MIN_PASTE_CHARS
              ? ` (min. ${MIN_PASTE_CHARS})`
              : ""}
          </span>
        </label>
      )}

      <button
        type="button"
        className="btn btn-ghost !px-2.5 !py-1 text-xs"
        disabled={pending || state.loading || !pasteReady}
        onClick={generate}
      >
        {state.loading || pending ? "Generiere…" : "Artikel generieren"}
      </button>

      {open && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--highlight-soft)] p-3">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-[var(--fg)]">
            KI-generierter Entwurf, redaktionelle Prüfung erforderlich
          </p>

          {state.loading && (
            <p className="text-sm text-[var(--muted)]">
              {autoFulltext
                ? "Volltext laden + RAG + Claude… bitte warten."
                : "RAG-Kontext + Claude… bitte warten."}
            </p>
          )}

          {state.error && (
            <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
          )}

          {state.ragWarning && (
            <p className="text-xs text-[var(--muted)]">{state.ragWarning}</p>
          )}

          {state.draft && (
            <>
              {state.ragHitCount != null && state.ragHitCount > 0 && !state.ragWarning && (
                <p className="text-xs text-[var(--muted)]">
                  RAG-Kontext: {state.ragHitCount} Treffer einbezogen (nur wenn
                  relevant).
                </p>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[var(--muted)]">
                  Entwurf (editierbar)
                </span>
                <textarea
                  className="min-h-64 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm leading-relaxed text-[var(--fg)]"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
              </label>
              {state.draft.sourceUrl && (
                <p className="text-xs text-[var(--muted)]">
                  Originalquelle (Metadaten):{" "}
                  <a
                    href={state.draft.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    Link öffnen
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn !px-2.5 !py-1 text-xs"
                  onClick={copyText}
                >
                  {state.copyOk ? "Kopiert" : "Kopieren"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-2.5 !py-1 text-xs"
                  onClick={() => setState(emptyState())}
                >
                  Schliessen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
