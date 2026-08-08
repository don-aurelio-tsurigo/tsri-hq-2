export const ARTICLE_STAGES = [
  "input",
  "weiter",
  "warteliste",
  "abgelehnt",
  "in_arbeit",
  "bereit",
  "publiziert",
] as const;

export type ArticleStage = (typeof ARTICLE_STAGES)[number];

export const ARTICLE_STAGE_LABELS: Record<ArticleStage, string> = {
  input: "Input",
  weiter: "Weiter",
  warteliste: "Warteliste",
  abgelehnt: "Abgelehnt",
  in_arbeit: "In Arbeit",
  bereit: "Bereit",
  publiziert: "Publiziert",
};

/** Accent color for column/header dots (Notion-like). */
export const ARTICLE_STAGE_COLORS: Record<ArticleStage, string> = {
  input: "#9ca3af",
  weiter: "#6b7280",
  warteliste: "#eab308",
  abgelehnt: "#ef4444",
  in_arbeit: "#f97316",
  bereit: "#22c55e",
  publiziert: "#2b9fe0",
};

export const DEFAULT_ARTICLE_STAGE: ArticleStage = "input";

export const KANBAN_VIEWS = ["inputs", "alle", "wer", "archiv"] as const;
export type KanbanViewId = (typeof KANBAN_VIEWS)[number];

export const KANBAN_VIEW_LABELS: Record<KanbanViewId, string> = {
  inputs: "Inputs",
  alle: "Alle Artikel",
  wer: "Wer macht was?",
  archiv: "Archiv",
};

export const KANBAN_VIEW_DESCRIPTIONS: Record<KanbanViewId, string> = {
  inputs: "Entscheid: Input, Weiter, Warteliste oder Abgelehnt.",
  alle: "Aktive Pipeline: Weiter, In Arbeit und Bereit.",
  wer: "Nach Person — Weiter, In Arbeit und Bereit.",
  archiv:
    "Gesamte Artikeldatenbank. Publizierte und manuell Archivierte bleiben hier sichtbar, verschwinden aber aus dem Kanban.",
};

/** Stage columns for stage-based views. */
export const KANBAN_VIEW_STAGES: Record<
  Exclude<KanbanViewId, "wer" | "archiv">,
  readonly ArticleStage[]
> = {
  inputs: ["input", "weiter", "warteliste", "abgelehnt"],
  alle: ["weiter", "in_arbeit", "bereit"],
};

/** Stages shown in the person-grouped board. */
export const KANBAN_WER_STAGES: readonly ArticleStage[] = [
  "weiter",
  "in_arbeit",
  "bereit",
];

export const DEFAULT_KANBAN_VIEW: KanbanViewId = "inputs";

export function isArticleStage(value: string | null | undefined): value is ArticleStage {
  return !!value && (ARTICLE_STAGES as readonly string[]).includes(value);
}

export function isKanbanViewId(value: string | null | undefined): value is KanbanViewId {
  return !!value && (KANBAN_VIEWS as readonly string[]).includes(value);
}
