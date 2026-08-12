"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAdCampaign,
  toggleAdCampaignStatus,
  updateAdCampaign,
} from "@/lib/actions/ads";
import { defaultAdDateRange, type AdCampaignRow } from "@/lib/ads-shared";

type Props = {
  campaigns: AdCampaignRow[];
};

function statusBadge(
  status: AdCampaignRow["status"],
  endDate: string,
): { label: string; className: string } {
  const expired = new Date(`${endDate}T23:59:59.999`).getTime() < Date.now();
  if (expired) return { label: "abgelaufen", className: "badge badge-muted" };
  if (status === "ACTIVE")
    return { label: "aktiv", className: "badge badge-done" };
  return { label: "pausiert", className: "badge badge-doing" };
}

function formatRange(start: string, end: string) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function AdsAdmin({ campaigns }: Props) {
  const router = useRouter();
  const defaults = defaultAdDateRange();
  const [name, setName] = useState("");
  const [type, setType] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [mediaUrl, setMediaUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [impressionLimit, setImpressionLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editImpressionLimit, setEditImpressionLimit] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  function resetForm(prefill?: Partial<AdCampaignRow>) {
    const range = defaultAdDateRange();
    setName(prefill?.name ? `${prefill.name} (Kopie)` : "");
    setType(prefill?.type ?? "IMAGE");
    setMediaUrl(prefill?.mediaUrl ?? "");
    setTargetUrl(prefill?.targetUrl ?? "");
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setImpressionLimit(
      prefill?.impressionLimit != null ? String(prefill.impressionLimit) : "",
    );
    setError(null);
  }

  function startEdit(c: AdCampaignRow) {
    setEditingId(c.id);
    setEditTargetUrl(c.targetUrl);
    setEditStartDate(c.startDate);
    setEditEndDate(c.endDate);
    setEditImpressionLimit(
      c.impressionLimit != null ? String(c.impressionLimit) : "",
    );
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("type", type);
    fd.set("mediaUrl", mediaUrl);
    fd.set("targetUrl", targetUrl);
    fd.set("startDate", startDate);
    fd.set("endDate", endDate);
    fd.set("impressionLimit", impressionLimit);
    startTransition(async () => {
      const result = await createAdCampaign(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function onSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId) return;
    setEditError(null);
    const fd = new FormData();
    fd.set("id", editingId);
    fd.set("targetUrl", editTargetUrl);
    fd.set("startDate", editStartDate);
    fd.set("endDate", editEndDate);
    fd.set("impressionLimit", editImpressionLimit);
    startTransition(async () => {
      const result = await updateAdCampaign(fd);
      if (result.error) {
        setEditError(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="card p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Neue Kampagne
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Direct-Sold für Slot <code>article-top</code>. Keine Formatprüfung —
          Media-URL oder Vimeo-Embed eintragen.
        </p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <div className="field">
            <label htmlFor="campaign-name">Kampagnenname</label>
            <input
              id="campaign-name"
              name="campaignName"
              type="text"
              className="w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <span className="text-sm font-bold text-[var(--muted)]">
              Creative-Typ
            </span>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="creativeType"
                  checked={type === "IMAGE"}
                  onChange={() => setType("IMAGE")}
                />
                Bild
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="creativeType"
                  checked={type === "VIDEO"}
                  onChange={() => setType("VIDEO")}
                />
                Vimeo-Video
              </label>
            </div>
          </div>

          <div className="field">
            <label htmlFor="campaign-media-url">
              {type === "VIDEO" ? "Vimeo-Embed-URL" : "Bild-URL"}
            </label>
            <input
              id="campaign-media-url"
              name="mediaUrl"
              type="text"
              className="w-full"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder={
                type === "VIDEO"
                  ? "https://player.vimeo.com/video/…"
                  : "https://…"
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="campaign-click-url">Ziel-URL</label>
            <input
              id="campaign-click-url"
              name="targetUrl"
              type="text"
              className="w-full"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://…"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="campaign-start">Startdatum</label>
              <input
                id="campaign-start"
                name="startDate"
                type="date"
                className="w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="campaign-end">Enddatum</label>
              <input
                id="campaign-end"
                name="endDate"
                type="date"
                className="w-full"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="campaign-impression-limit">
              Impression-Limit (optional)
            </label>
            <input
              id="campaign-impression-limit"
              name="impressionLimit"
              type="number"
              min={1}
              step={1}
              className="w-full"
              value={impressionLimit}
              onChange={(e) => setImpressionLimit(e.target.value)}
              placeholder="leer = unbegrenzt"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "…" : "Kampagne anlegen"}
            </button>
            {error && (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Kampagnen ({campaigns.length})
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Noch keine Kampagnen.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Zeitraum</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold tabular-nums">
                    Impr. / Limit
                  </th>
                  <th className="px-4 py-3 font-bold tabular-nums">Klicks</th>
                  <th className="px-4 py-3 font-bold">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {campaigns.map((c) => {
                  const badge = statusBadge(c.status, c.endDate);
                  const expired =
                    new Date(`${c.endDate}T23:59:59.999`).getTime() <
                    Date.now();
                  const isEditing = editingId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr>
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {formatRange(c.startDate, c.endDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {c.impressions}
                          {" / "}
                          {c.impressionLimit ?? "∞"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{c.clicks}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={pending}
                              onClick={() =>
                                isEditing ? cancelEdit() : startEdit(c)
                              }
                            >
                              {isEditing ? "Abbrechen" : "Bearbeiten"}
                            </button>
                            {!expired && (
                              <form
                                action={(fd) => {
                                  startTransition(async () => {
                                    await toggleAdCampaignStatus(fd);
                                    router.refresh();
                                  });
                                }}
                              >
                                <input type="hidden" name="id" value={c.id} />
                                <button
                                  className="btn btn-ghost"
                                  type="submit"
                                  disabled={pending}
                                >
                                  {c.status === "ACTIVE"
                                    ? "Pausieren"
                                    : "Aktivieren"}
                                </button>
                              </form>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                resetForm(c);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Duplizieren
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr>
                          <td colSpan={6} className="bg-[var(--panel-muted)] px-4 py-4">
                            <form
                              onSubmit={onSaveEdit}
                              className="flex flex-col gap-3"
                            >
                              <p className="text-sm font-semibold">
                                Bearbeiten: {c.name}
                              </p>
                              <div className="field">
                                <label htmlFor={`edit-target-${c.id}`}>
                                  Ziel-URL
                                </label>
                                <input
                                  id={`edit-target-${c.id}`}
                                  type="text"
                                  className="w-full"
                                  value={editTargetUrl}
                                  onChange={(e) =>
                                    setEditTargetUrl(e.target.value)
                                  }
                                  required
                                />
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="field">
                                  <label htmlFor={`edit-start-${c.id}`}>
                                    Startdatum
                                  </label>
                                  <input
                                    id={`edit-start-${c.id}`}
                                    type="date"
                                    className="w-full"
                                    value={editStartDate}
                                    onChange={(e) =>
                                      setEditStartDate(e.target.value)
                                    }
                                    required
                                  />
                                </div>
                                <div className="field">
                                  <label htmlFor={`edit-end-${c.id}`}>
                                    Enddatum
                                  </label>
                                  <input
                                    id={`edit-end-${c.id}`}
                                    type="date"
                                    className="w-full"
                                    value={editEndDate}
                                    onChange={(e) =>
                                      setEditEndDate(e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </div>
                              <div className="field">
                                <label htmlFor={`edit-limit-${c.id}`}>
                                  Impression-Limit (optional)
                                </label>
                                <input
                                  id={`edit-limit-${c.id}`}
                                  type="number"
                                  min={1}
                                  step={1}
                                  className="w-full"
                                  value={editImpressionLimit}
                                  onChange={(e) =>
                                    setEditImpressionLimit(e.target.value)
                                  }
                                  placeholder="leer = unbegrenzt"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  className="btn btn-primary"
                                  type="submit"
                                  disabled={pending}
                                >
                                  {pending ? "…" : "Speichern"}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  type="button"
                                  disabled={pending}
                                  onClick={cancelEdit}
                                >
                                  Abbrechen
                                </button>
                                {editError && (
                                  <p className="text-sm text-[var(--danger)]">
                                    {editError}
                                  </p>
                                )}
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
