import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { findOrganizationByWebhookToken, upsertDealFromWebhook } from "@/lib/finance/deals";
import { tokenFromHeaders } from "@/lib/finance/shared";
import { parseWebhookDeal } from "@/lib/finance/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function tokenFrom(request: Request): string | null {
  return tokenFromHeaders(request.headers);
}

/**
 * Deal-Eingang für Zapier (Pipedrive → Tool).
 *
 *   POST /api/finance/deals/webhook
 *   Authorization: Bearer <Token aus /finance/deals>
 *   { "id": 123, "title": "…", "value": 12000, "organisation": "…",
 *     "owner": "…", "bexio_url": "…", "start_month": "2027-01", "months": 12,
 *     "category": "Tipp des Tages / Newsletter" }
 *
 * Gleiche id → bestehender Deal wird aktualisiert (keine Duplikate).
 */
export async function POST(request: Request) {
  const token = tokenFrom(request);
  const org = token ? await findOrganizationByWebhookToken(token) : null;
  if (!org) return json({ ok: false, error: "Ungültiger oder fehlender Token." }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Body zu gross." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Body ist kein gültiges JSON." }, 400);
  }

  const parsed = parseWebhookDeal(body);
  if (!parsed.ok) return json({ ok: false, errors: parsed.errors }, 422);

  const result = await upsertDealFromWebhook(
    org.id,
    parsed.deal,
    body as Prisma.InputJsonValue,
  );
  return json({ ok: true, dealId: result.id, created: result.created, status: result.status }, result.created ? 201 : 200);
}
