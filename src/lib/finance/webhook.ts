/** Parsing of the Zapier/Pipedrive deal webhook body (no DB access, testable). */

import { parseLooseAmount, parseLooseMonth, type MonthKey } from "./shared";

export type WebhookDeal = {
  externalId: string;
  title: string;
  totalAmount: number;
  organisation: string | null;
  /** Pipedrive organisation ID – optional, makes matching robust against renames */
  organisationId: string | null;
  responsibleName: string | null;
  bexioUrl: string | null;
  startMonth: MonthKey | null;
  months: number | null;
  categoryName: string | null;
};

function pick(body: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function text(v: unknown, max = 500): string | null {
  // Zapier sometimes passes Pipedrive references as { value, name }
  if (v && typeof v === "object" && "value" in v) v = (v as { value: unknown }).value;
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    const t = v.trim();
    if (!t.startsWith("{")) return null;
    try {
      v = JSON.parse(t);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Zapier variants: JSON pasted as one «Data» value ({"data": "{…}"}),
 * as a key with empty value ({"{…}": ""}), or nested ({"data": {…}}).
 */
export function unwrapWebhookBody(raw: unknown): Record<string, unknown> | null {
  const body = asObject(raw);
  if (!body) return null;
  if ("id" in body || "deal_id" in body || "title" in body) return body;
  const keys = Object.keys(body);
  if (keys.length === 1) {
    const [key] = keys;
    return asObject(body[key]) ?? asObject(key) ?? body;
  }
  return asObject(body.data) ?? body;
}

/** Normalise a Zapier/Pipedrive JSON body. Field names are matched leniently. */
export function parseWebhookDeal(
  raw: unknown,
): { ok: true; deal: WebhookDeal } | { ok: false; errors: string[] } {
  const body = unwrapWebhookBody(raw);
  if (!body) {
    return { ok: false, errors: ["Body muss ein JSON-Objekt sein."] };
  }
  const errors: string[] = [];

  const externalId = text(pick(body, ["id", "deal_id", "dealId", "external_id", "externalId"]), 100);
  const title = text(pick(body, ["title", "name", "deal_title"]));
  const totalAmount = parseLooseAmount(pick(body, ["value", "amount", "total", "betrag"]));
  if (!externalId) errors.push("«id» (Deal-ID aus Pipedrive) fehlt.");
  if (!title) errors.push("«title» fehlt.");
  if (totalAmount === null) errors.push("«value» (Betrag) fehlt oder ist keine Zahl.");

  const monthsRaw = pick(body, ["months", "duration_months", "laufzeit_monate", "rates"]);
  const months = monthsRaw === undefined ? null : Number(monthsRaw);

  if (errors.length > 0 || !externalId || !title || totalAmount === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    deal: {
      externalId,
      title,
      totalAmount,
      organisation: text(pick(body, ["organisation", "organization", "org_name", "org", "firma"])),
      organisationId: text(
        pick(body, ["org_id", "organization_id", "organisation_id", "orgId", "pipedrive_org_id"]),
        100,
      ),
      responsibleName: text(pick(body, ["owner", "owner_name", "responsible", "zustaendig"]), 200),
      bexioUrl: text(pick(body, ["bexio_url", "bexioUrl", "bexio"]), 1000),
      startMonth: parseLooseMonth(pick(body, ["start_month", "startMonth", "start", "start_date"])),
      months: months !== null && Number.isInteger(months) && months >= 1 && months <= 60 ? months : null,
      categoryName: text(pick(body, ["category", "kategorie"]), 200),
    },
  };
}
