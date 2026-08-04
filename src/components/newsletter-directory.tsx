"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkAssignNewsletterCampaignAuthor,
  bulkDeleteNewsletterCampaigns,
  createNewsletterCampaign,
  createNewsletterType,
  deleteNewsletterCampaign,
  generateNewsletterCampaigns,
  updateNewsletterCampaign,
  updateNewsletterType,
} from "@/lib/actions";
import {
  DEFAULT_WEEKDAYS_BY_FREQUENCY,
  formatWeekdays,
  GENERATE_HORIZON_LABELS,
  GENERATE_HORIZON_WEEKS,
  NEWSLETTER_CAMPAIGN_STATUS_LABELS,
  NEWSLETTER_FREQUENCY_LABELS,
  nextScheduledDateKey,
  scheduledDateKeysForWeeks,
  todayDateKey,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type GenerateHorizonWeeks,
  type NewsletterCampaignStatusValue,
  type NewsletterFrequencyValue,
  type Weekday,
} from "@/lib/newsletter-constants";

type Member = { id: string; name: string };
type NewsletterType = {
  id: string;
  name: string;
  frequency: NewsletterFrequencyValue;
  weekdays: number[];
};
type Campaign = {
  id: string;
  date: string;
  campaignUrl: string | null;
  status: NewsletterCampaignStatusValue;
  note: string | null;
  type: NewsletterType;
  author: Member | null;
};

const DRAWER_MS = 280;

export function NewsletterDirectory({
  campaigns,
  types,
  members,
  currentUserId,
}: {
  campaigns: Campaign[];
  types: NewsletterType[];
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState(todayDateKey);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkAuthorId, setBulkAuthorId] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCampaign =
    campaigns.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const today = todayDateKey();
    return campaigns
      .filter((c) => {
        if (typeFilter !== "all" && c.type.id !== typeFilter) return false;
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (fromDate && c.date < fromDate) return false;
        return true;
      })
      .sort((a, b) => {
        // Nächste/aktuelle Ausgaben zuerst (aufsteigend ab heute),
        // danach vergangene mit dem jüngsten Datum oben.
        const aUpcoming = a.date >= today;
        const bUpcoming = b.date >= today;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        if (aUpcoming && bUpcoming) return a.date.localeCompare(b.date);
        return b.date.localeCompare(a.date);
      });
  }, [campaigns, typeFilter, statusFilter, fromDate]);

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const selectedCount = filteredIds.filter((id) => selected.has(id)).length;
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of filteredIds) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkError(null);
  }

  function runBulk(
    action: () => Promise<{ error?: string; ok?: true; count?: number }>,
  ) {
    setBulkError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setBulkError(result.error);
        return;
      }
      clearSelection();
      router.refresh();
    });
  }

  function selectedIdsPayload() {
    return filteredIds.filter((id) => selected.has(id)).join(",");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="field">
          <span className="mb-1.5 block text-sm font-medium">Typ</span>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Newsletter-Typ filtern"
          >
            <button
              type="button"
              aria-pressed={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              className={[
                "rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors",
                typeFilter === "all"
                  ? "border-[var(--fg)] bg-[var(--highlight)] text-[var(--fg)]"
                  : "border-[var(--border)] bg-white text-[var(--fg)] hover:border-[var(--fg)]",
              ].join(" ")}
            >
              Alle
            </button>
            {types.map((t) => {
              const active = typeFilter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTypeFilter(t.id)}
                  className={[
                    "rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors",
                    active
                      ? "border-[var(--fg)] bg-[var(--highlight)] text-[var(--fg)]"
                      : "border-[var(--border)] bg-white text-[var(--fg)] hover:border-[var(--fg)]",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label htmlFor="filter-from">Ab Datum</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              id="filter-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            {fromDate !== todayDateKey() && (
              <button
                type="button"
                className="btn btn-ghost px-2 py-1.5 text-xs"
                onClick={() => setFromDate(todayDateKey())}
              >
                Heute
              </button>
            )}
            {fromDate && (
              <button
                type="button"
                className="btn btn-ghost px-2 py-1.5 text-xs"
                onClick={() => setFromDate("")}
                title="Auch vergangene Kampagnen anzeigen"
              >
                Alle
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Alle</option>
            <option value="planned">Geplant</option>
            <option value="published">Erschienen</option>
            <option value="skipped">Nicht erschienen</option>
          </select>
        </div>
        <p className="pb-2 text-sm text-[var(--muted)]">
          {filtered.length} von {campaigns.length}
        </p>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_8%,white)] px-3 py-2">
          <p className="mr-1 text-sm font-medium">
            {selectedCount} ausgewählt
          </p>
          <select
            value={bulkAuthorId}
            onChange={(e) => setBulkAuthorId(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            aria-label="Autor:in zuweisen"
          >
            <option value="">— niemand —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={() => {
              runBulk(async () => {
                const fd = new FormData();
                fd.set("ids", selectedIdsPayload());
                fd.set("authorId", bulkAuthorId);
                return bulkAssignNewsletterCampaignAuthor(fd);
              });
            }}
          >
            Autor:in zuweisen
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `${selectedCount} Kampagne${selectedCount === 1 ? "" : "n"} wirklich löschen?`,
                )
              ) {
                return;
              }
              runBulk(async () => {
                const fd = new FormData();
                fd.set("ids", selectedIdsPayload());
                return bulkDeleteNewsletterCampaigns(fd);
              });
            }}
          >
            Löschen
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-sm"
            disabled={pending}
            onClick={clearSelection}
          >
            Auswahl aufheben
          </button>
          {bulkError && (
            <p className="w-full text-sm text-[var(--danger)]">{bulkError}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_70%,white)] text-xs tracking-wide text-[var(--muted)] uppercase">
            <tr>
              <th className="w-10 px-3 py-3 font-semibold">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--accent)]"
                  checked={allFilteredSelected}
                  disabled={filteredIds.length === 0 || pending}
                  onChange={toggleAllFiltered}
                  aria-label="Alle sichtbaren auswählen"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Datum</th>
              <th className="px-4 py-3 font-semibold">Typ</th>
              <th className="px-4 py-3 font-semibold">Autor:in</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Kampagne</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                selected={selected.has(campaign.id)}
                active={selectedId === campaign.id}
                onToggleSelect={() => toggleOne(campaign.id)}
                onOpen={() => setSelectedId(campaign.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--muted)]"
                >
                  Noch keine Newsletterkampagnen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddCampaignForm
        types={types}
        members={members}
        currentUserId={currentUserId}
      />

      <TypesPanel
        types={types}
        members={members}
        currentUserId={currentUserId}
      />

      <CampaignDrawer
        campaign={selectedCampaign}
        types={types}
        members={members}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function TypesPanel({
  types,
  members,
  currentUserId,
}: {
  types: NewsletterType[];
  members: Member[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)]/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <span className="text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">
            Typen & Planung
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted)]">
            {types.length} Typ
            {types.length === 1 ? "" : "en"} · Erscheinungstage & Vorbefüllung
          </span>
        </span>
        <span className="text-sm text-[var(--muted)]" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-4 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!adding && (
              <button
                type="button"
                className="btn btn-ghost px-2.5 py-1.5 text-sm"
                onClick={() => setAdding(true)}
              >
                + Typ
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_70%,white)] text-xs tracking-wide text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Frequenz</th>
                  <th className="px-4 py-3 font-semibold">Wochentage</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {types.map((type) => (
                  <TypeRow
                    key={type.id}
                    type={type}
                    members={members}
                    currentUserId={currentUserId}
                  />
                ))}
                {types.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-[var(--muted)]"
                    >
                      Noch keine Typen. Lege den ersten an.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {adding && <AddTypeForm onClose={() => setAdding(false)} />}
        </div>
      )}
    </section>
  );
}

function TypeRow({
  type,
  members,
  currentUserId,
}: {
  type: NewsletterType;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr className="bg-[var(--accent-soft)]/25">
        <td colSpan={4} className="px-4 py-4">
          <div className="space-y-5">
            <TypeFormFields
              defaults={type}
              error={error}
              pending={pending}
              submitLabel="Speichern"
              onCancel={() => setEditing(false)}
              onSubmit={(fd) => {
                setError(null);
                fd.set("id", type.id);
                startTransition(async () => {
                  const result = await updateNewsletterType(fd);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  setEditing(false);
                  router.refresh();
                });
              }}
            />
            <GenerateCampaignsPanel
              type={type}
              members={members}
              currentUserId={currentUserId}
            />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-medium align-top">{type.name}</td>
      <td className="px-4 py-3 align-top text-[var(--muted)]">
        {NEWSLETTER_FREQUENCY_LABELS[type.frequency]}
      </td>
      <td className="px-4 py-3 align-top">
        <span className="font-medium">{formatWeekdays(type.weekdays)}</span>
      </td>
      <td className="px-4 py-3 align-top text-right">
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={() => setEditing(true)}
        >
          Bearbeiten
        </button>
      </td>
    </tr>
  );
}

function GenerateCampaignsPanel({
  type,
  members,
}: {
  type: NewsletterType;
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [weeksAhead, setWeeksAhead] = useState<GenerateHorizonWeeks>(4);
  const [startDate, setStartDate] = useState(
    () => nextScheduledDateKey(type.weekdays) ?? todayDateKey(),
  );
  const [authorId, setAuthorId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const previewCount = scheduledDateKeysForWeeks(
    type.weekdays,
    weeksAhead,
    startDate,
  ).length;

  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-white/50 p-4">
      <h4 className="font-[family-name:var(--font-display)] text-base font-semibold">
        Kampagnen vorausplanen
      </h4>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Erzeugt fehlende Ausgaben ab dem Startdatum nach den gespeicherten
        Erscheinungstagen ({formatWeekdays(type.weekdays)}). Bestehende Daten
        bleiben unverändert. Erscheinungstage zuerst speichern, falls geändert.
        Autor:in ist optional.
      </p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        action={(fd) => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await generateNewsletterCampaigns(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            if (result?.ok) {
              setMessage(
                `${result.created} neu · ${result.skippedExisting} schon vorhanden`,
              );
              router.refresh();
            }
          });
        }}
      >
        <input type="hidden" name="typeId" value={type.id} />
        <div className="field">
          <label htmlFor={`start-${type.id}`}>Ab Datum</label>
          <input
            id={`start-${type.id}`}
            type="date"
            name="startDate"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`horizon-${type.id}`}>Zeitraum</label>
          <select
            id={`horizon-${type.id}`}
            name="weeksAhead"
            value={weeksAhead}
            onChange={(e) =>
              setWeeksAhead(Number(e.target.value) as GenerateHorizonWeeks)
            }
          >
            {GENERATE_HORIZON_WEEKS.map((w) => (
              <option key={w} value={w}>
                {GENERATE_HORIZON_LABELS[w]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`gen-author-${type.id}`}>Autor:in (optional)</label>
          <select
            id={`gen-author-${type.id}`}
            name="authorId"
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
          >
            <option value="">Keine Vorbelegung</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <p className="text-xs text-[var(--muted)]">
            ca. {previewCount} Erscheinungstage
          </p>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || type.weekdays.length === 0}
          >
            {pending ? "Generiere…" : "Kampagnen generieren"}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-[var(--accent)] sm:col-span-2 lg:col-span-4">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}

function AddTypeForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card space-y-3 p-4">
      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Newsletter-Typ anlegen
      </h3>
      <TypeFormFields
        defaults={{
          name: "",
          frequency: "weekly",
          weekdays: DEFAULT_WEEKDAYS_BY_FREQUENCY.weekly,
        }}
        error={error}
        pending={pending}
        submitLabel="Anlegen"
        onCancel={onClose}
        onSubmit={(fd) => {
          setError(null);
          startTransition(async () => {
            const result = await createNewsletterType(fd);
            if (result?.error) {
              setError(result.error);
              return;
            }
            onClose();
            router.refresh();
          });
        }}
      />
    </div>
  );
}

function TypeFormFields({
  defaults,
  error,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  defaults: {
    name: string;
    frequency: NewsletterFrequencyValue;
    weekdays: number[];
  };
  error: string | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [frequency, setFrequency] = useState(defaults.frequency);
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    defaults.weekdays.filter((d): d is Weekday =>
      (WEEKDAYS as readonly number[]).includes(d),
    ),
  );

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      action={(fd) => {
        for (const day of weekdays) fd.append("weekdays", String(day));
        onSubmit(fd);
      }}
    >
      <div className="field">
        <label htmlFor="type-name">Name</label>
        <input
          id="type-name"
          name="name"
          required
          defaultValue={defaults.name}
          placeholder="z. B. Züri Briefing"
        />
      </div>
      <div className="field">
        <label htmlFor="type-freq">Erscheinungsfrequenz</label>
        <select
          id="type-freq"
          name="frequency"
          value={frequency}
          onChange={(e) => {
            const next = e.target.value as NewsletterFrequencyValue;
            setFrequency(next);
            setWeekdays(DEFAULT_WEEKDAYS_BY_FREQUENCY[next]);
          }}
        >
          <option value="weekly">Wöchentlich</option>
          <option value="daily">Täglich</option>
        </select>
      </div>
      <div className="field sm:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-[var(--muted)]">
          Erscheinungstage
        </span>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Vorschau: {formatWeekdays(weekdays)}
        </p>
      </div>
      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || weekdays.length === 0}
        >
          {submitLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
}) {
  const selected = new Set(value);

  function toggle(day: Weekday) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort((a, b) => a - b) as Weekday[]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => {
          const active = selected.has(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(day)}
              className={[
                "min-w-10 rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors",
                active
                  ? "border-[var(--fg)] bg-[var(--highlight)] text-[var(--fg)]"
                  : "border-[var(--border)] bg-white text-[var(--fg)] hover:border-[var(--fg)]",
              ].join(" ")}
            >
              {WEEKDAY_LABELS[day]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={() => onChange([1, 2, 3, 4, 5])}
        >
          Mo–Fr
        </button>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={() => onChange([1, 2, 3, 4, 5, 6, 7])}
        >
          Alle
        </button>
      </div>
    </div>
  );
}

function CampaignLinkActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        title={copied ? "Kopiert" : "Link kopieren"}
        aria-label={copied ? "Kopiert" : "Link kopieren"}
        className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--fg)]"
      >
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            className="size-4 text-[var(--accent)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Kampagne öffnen"
        aria-label="Kampagne öffnen"
        className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--fg)]"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>
  );
}

function CampaignDrawer({
  campaign,
  types,
  members,
  onClose,
}: {
  campaign: Campaign | null;
  types: NewsletterType[];
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [panelCampaign, setPanelCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (campaign) {
      setPanelCampaign(campaign);
      setError(null);
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setMounted(false);
      setPanelCampaign(null);
      setError(null);
    }, DRAWER_MS);
    return () => window.clearTimeout(t);
  }, [campaign]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted || !panelCampaign) return null;

  const skipped = panelCampaign.status === "skipped";
  const planned = panelCampaign.status === "planned";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Schliessen"
        className={[
          "absolute inset-0 bg-black/35 transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
        onClick={onClose}
      />
      <aside
        className={[
          "relative flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[-12px_0_40px_rgba(0,0,0,0.12)] transition-transform ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ transitionDuration: `${DRAWER_MS}ms` }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
              Kampagne bearbeiten
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold">
              {panelCampaign.type.name}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {formatDate(panelCampaign.date)}
            </p>
            <span
              className={[
                "mt-2 inline-flex",
                skipped
                  ? "badge badge-muted"
                  : planned
                    ? "badge badge-doing"
                    : "badge badge-done",
              ].join(" ")}
            >
              {NEWSLETTER_CAMPAIGN_STATUS_LABELS[panelCampaign.status]}
            </span>
          </div>
          <button type="button" className="btn btn-ghost shrink-0" onClick={onClose}>
            Schliessen
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form
            key={panelCampaign.id}
            className="flex flex-col gap-3"
            action={(fd) => {
              setError(null);
              startTransition(async () => {
                const result = await updateNewsletterCampaign(fd);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                onClose();
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="id" value={panelCampaign.id} />
            <CampaignFields
              idPrefix={`edit-${panelCampaign.id}`}
              types={types}
              members={members}
              defaults={{
                typeId: panelCampaign.type.id,
                authorId: panelCampaign.author?.id ?? "",
                date: panelCampaign.date,
                campaignUrl: panelCampaign.campaignUrl ?? "",
                status: panelCampaign.status,
                note: panelCampaign.note ?? "",
              }}
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-elevated)] pt-4 pb-1">
              <button
                type="button"
                className="btn btn-danger mr-auto"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Kampagne wirklich löschen?")) return;
                  const fd = new FormData();
                  fd.set("id", panelCampaign.id);
                  startTransition(async () => {
                    const result = await deleteNewsletterCampaign(fd);
                    if (result?.error) {
                      setError(result.error);
                      return;
                    }
                    onClose();
                    router.refresh();
                  });
                }}
              >
                Löschen
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "…" : "Speichern"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}

function CampaignRow({
  campaign,
  selected,
  active,
  onToggleSelect,
  onOpen,
}: {
  campaign: Campaign;
  selected: boolean;
  active: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skipped = campaign.status === "skipped";
  const planned = campaign.status === "planned";

  return (
    <tr
      className={[
        "cursor-pointer transition-colors hover:bg-black/[0.03]",
        active ? "bg-[var(--accent-soft)]/40" : "",
        !active && skipped
          ? "bg-[color-mix(in_oklab,#c45c26_6%,transparent)]"
          : "",
        !active && planned
          ? "bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onOpen}
    >
      <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="size-3.5 accent-[var(--accent)]"
          checked={selected}
          disabled={pending}
          onChange={onToggleSelect}
          aria-label={`${campaign.type.name} am ${campaign.date} auswählen`}
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-top font-medium">
        {formatDate(campaign.date)}
      </td>
      <td className="px-4 py-3 align-top">
        <p className="font-medium">{campaign.type.name}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {formatWeekdays(campaign.type.weekdays)} ·{" "}
          {NEWSLETTER_FREQUENCY_LABELS[campaign.type.frequency]}
        </p>
      </td>
      <td className="px-4 py-3 align-top">
        {campaign.author?.name ?? (
          <span className="text-[var(--muted)]">Offen</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <span
          className={
            skipped
              ? "badge badge-muted"
              : planned
                ? "badge badge-doing"
                : "badge badge-done"
          }
        >
          {NEWSLETTER_CAMPAIGN_STATUS_LABELS[campaign.status]}
        </span>
        {campaign.note && (
          <p className="mt-1 text-xs text-[var(--muted)]">{campaign.note}</p>
        )}
      </td>
      <td
        className="px-4 py-3 align-top"
        onClick={(e) => e.stopPropagation()}
      >
        {campaign.campaignUrl ? (
          <CampaignLinkActions url={campaign.campaignUrl} />
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td
        className="px-4 py-3 align-top text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Kampagne löschen"
          aria-label="Kampagne löschen"
          disabled={pending}
          className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-[var(--danger)] disabled:opacity-50"
          onClick={() => {
            if (!confirm("Kampagne wirklich löschen?")) return;
            const fd = new FormData();
            fd.set("id", campaign.id);
            startTransition(async () => {
              const result = await deleteNewsletterCampaign(fd);
              if (result?.error) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
        {error && (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        )}
      </td>
    </tr>
  );
}

function AddCampaignForm({
  types,
  members,
  currentUserId,
}: {
  types: NewsletterType[];
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        disabled={types.length === 0}
      >
        Newsletter erfassen
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Newsletter erfassen
      </h2>
      {types.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Zuerst einen Newsletter-Typ anlegen.
        </p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const result = await createNewsletterCampaign(fd);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <CampaignFields
            types={types}
            members={members}
            defaults={{
              typeId: types[0]!.id,
              authorId: "",
              date: new Date().toISOString().slice(0, 10),
              campaignUrl: "",
              status: "published",
              note: "",
            }}
          />
          {error && (
            <p className="text-sm text-red-700 sm:col-span-2">{error}</p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              Speichern
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function CampaignFields({
  types,
  members,
  defaults,
  idPrefix = "camp",
}: {
  types: NewsletterType[];
  members: Member[];
  idPrefix?: string;
  defaults: {
    typeId: string;
    authorId: string;
    date: string;
    campaignUrl: string;
    status: NewsletterCampaignStatusValue;
    note: string;
  };
}) {
  const [status, setStatus] = useState(defaults.status);
  const [typeId, setTypeId] = useState(defaults.typeId);
  const selectedType = types.find((t) => t.id === typeId) ?? types[0];

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-type`}>Newsletter-Typ</label>
        <select
          id={`${idPrefix}-type`}
          name="typeId"
          required
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({formatWeekdays(t.weekdays)})
            </option>
          ))}
        </select>
        {selectedType && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Erscheint: {formatWeekdays(selectedType.weekdays)}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-date`}>Datum</label>
        <input
          id={`${idPrefix}-date`}
          name="date"
          type="date"
          required
          defaultValue={defaults.date}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-author`}>Autor:in (optional)</label>
        <select
          id={`${idPrefix}-author`}
          name="authorId"
          defaultValue={defaults.authorId}
        >
          <option value="">Keine</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-status`}>Status</label>
        <select
          id={`${idPrefix}-status`}
          name="status"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as NewsletterCampaignStatusValue)
          }
        >
          <option value="planned">Geplant</option>
          <option value="published">Erschienen</option>
          <option value="skipped">Nicht erschienen (z. B. Sommerpause)</option>
        </select>
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-url`}>Kampagnenlink</label>
        <input
          id={`${idPrefix}-url`}
          name="campaignUrl"
          type="url"
          placeholder="https://… (Mailchimp o. Ä.)"
          defaultValue={defaults.campaignUrl}
        />
      </div>
      {status === "skipped" && (
        <div className="field sm:col-span-2">
          <label htmlFor={`${idPrefix}-note`}>Bemerkung</label>
          <input
            id={`${idPrefix}-note`}
            name="note"
            placeholder="z. B. Sommerpause"
            defaultValue={defaults.note}
          />
        </div>
      )}
      {status !== "skipped" && (
        <input type="hidden" name="note" value={defaults.note} />
      )}
    </>
  );
}

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
