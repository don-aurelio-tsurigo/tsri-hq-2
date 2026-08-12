import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { aggregate, computeDayCategoryBreakdown, computeTotals, recomputePayoutMeta } from "./aggregator";
import { assignableCategoryKeys, categoryLabel, CATEGORIES } from "./categories";
import { parseExport } from "./parser";
import type { DayCategoryRow, LineItem, PayoutSummary } from "./types";
import { PAYOUT_FEE_KEY, UNMAPPED_KEY, isPayoutFee } from "./types";

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

function num(d: Prisma.Decimal | number | string): number {
  return Number(d);
}

export async function getLearnedRules(
  organizationId: string,
): Promise<Record<string, string>> {
  const rows = await prisma.payrexxChannelRule.findMany({
    where: { organizationId },
    select: { channel: true, categoryKey: true },
  });
  return Object.fromEntries(rows.map((r) => [r.channel, r.categoryKey]));
}

export async function listPayouts(organizationId: string) {
  const rows = await prisma.payrexxPayout.findMany({
    where: { organizationId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      uuid: true,
      date: true,
      currency: true,
      status: true,
      grandTotal: true,
      unmappedCount: true,
      statement: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    grandTotal: num(r.grandTotal),
  }));
}

export async function countUnmapped(organizationId: string) {
  return prisma.payrexxPayoutLine.count({
    where: {
      categoryKey: UNMAPPED_KEY,
      payout: { organizationId },
    },
  });
}

function dbLineToItem(row: {
  typ: string;
  transactionId: string | null;
  date: string | null;
  time: string | null;
  amount: Prisma.Decimal;
  fees: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
  description: string | null;
  channel: string | null;
  paymentMethod: string | null;
  customer: string | null;
  externalReference: string | null;
  instance: string | null;
  categoryKey: string | null;
  categorySource: string | null;
}): LineItem {
  return {
    typ: row.typ,
    transactionId: row.transactionId,
    date: row.date,
    time: row.time,
    amount: num(row.amount),
    fees: num(row.fees),
    total: num(row.total),
    currency: row.currency || "CHF",
    description: row.description,
    channel: row.channel,
    paymentMethod: row.paymentMethod,
    customer: row.customer,
    externalReference: row.externalReference,
    instance: row.instance,
    categoryKey: row.categoryKey,
    categorySource: row.categorySource,
  };
}

export type PayoutDetail = {
  id: string;
  uuid: string;
  date: string;
  currency: string;
  status: string;
  statement: string | null;
  payoutFee: number;
  grandTotal: number;
  unmappedCount: number;
  lines: (LineItem & { id: string })[];
  totals: PayoutSummary["totals"];
  dayTotals: DayCategoryRow[];
};

export async function getPayoutDetail(
  organizationId: string,
  payoutId: string,
): Promise<PayoutDetail | null> {
  const payout = await prisma.payrexxPayout.findFirst({
    where: { id: payoutId, organizationId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!payout) return null;

  const lines = payout.lines.map((l) => ({
    id: l.id,
    ...dbLineToItem(l),
  }));
  const items = lines.map(({ id: _id, ...rest }) => rest);
  const { totals } = computeTotals(items);
  const dayTotals = computeDayCategoryBreakdown(items);

  return {
    id: payout.id,
    uuid: payout.uuid,
    date: payout.date,
    currency: payout.currency,
    status: payout.status,
    statement: payout.statement,
    payoutFee: num(payout.payoutFee),
    grandTotal: num(payout.grandTotal),
    unmappedCount: payout.unmappedCount,
    lines,
    totals,
    dayTotals,
  };
}

export async function ingestExport(
  organizationId: string,
  buffer: Buffer,
  filename: string,
): Promise<{ id: string; uuid: string }> {
  const learned = await getLearnedRules(organizationId);
  const parsed = parseExport(buffer, filename);
  if (!parsed.length) {
    throw new Error("Keine Zeilen im Export gefunden.");
  }

  const baseName = filename.replace(/\.[^.]+$/, "").slice(0, 40);
  let uuid = `file-${baseName}-${Date.now().toString(36)}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  );
  const exists = await prisma.payrexxPayout.findUnique({
    where: {
      organizationId_uuid: { organizationId, uuid },
    },
  });
  if (exists) {
    uuid = `file-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  const summary = aggregate(parsed, { uuid, learned });

  const created = await prisma.payrexxPayout.create({
    data: {
      organizationId,
      uuid: summary.uuid,
      date: summary.date,
      currency: summary.currency,
      status: summary.status,
      statement: summary.statement,
      payoutFee: dec(summary.payoutFee),
      grandTotal: dec(summary.grandTotal),
      unmappedCount: summary.unmappedCount,
      lines: {
        create: summary.lines.map((line) => ({
          typ: line.typ,
          transactionId: line.transactionId,
          date: line.date,
          time: line.time,
          amount: dec(line.amount),
          fees: dec(line.fees),
          total: dec(line.total),
          currency: line.currency,
          description: line.description,
          channel: line.channel,
          paymentMethod: line.paymentMethod,
          customer: line.customer,
          externalReference: line.externalReference,
          instance: line.instance,
          categoryKey: line.categoryKey ?? UNMAPPED_KEY,
          categorySource: line.categorySource ?? "auto",
        })),
      },
    },
    select: { id: true, uuid: true },
  });

  return created;
}

async function refreshPayoutMeta(payoutId: string) {
  const lines = await prisma.payrexxPayoutLine.findMany({
    where: { payoutId },
    select: { total: true, categoryKey: true, typ: true },
  });
  const meta = recomputePayoutMeta(
    lines.map((l) => ({
      total: num(l.total),
      categoryKey: l.categoryKey,
      typ: l.typ,
    })),
  );
  await prisma.payrexxPayout.update({
    where: { id: payoutId },
    data: {
      grandTotal: dec(meta.grandTotal),
      payoutFee: dec(meta.payoutFee),
      unmappedCount: meta.unmappedCount,
      status: meta.status,
    },
  });
}

export async function assignLineCategory(opts: {
  organizationId: string;
  lineId: string;
  categoryKey: string;
  rememberChannel: boolean;
}): Promise<{ payoutId: string } | null> {
  const { organizationId, lineId, categoryKey, rememberChannel } = opts;
  if (!(categoryKey in CATEGORIES) || categoryKey === UNMAPPED_KEY) {
    throw new Error("Ungültige Kategorie.");
  }

  const line = await prisma.payrexxPayoutLine.findFirst({
    where: {
      id: lineId,
      payout: { organizationId },
    },
    include: { payout: { select: { id: true } } },
  });
  if (!line) return null;

  await prisma.payrexxPayoutLine.update({
    where: { id: lineId },
    data: { categoryKey, categorySource: "manual" },
  });

  if (rememberChannel && line.channel) {
    await prisma.payrexxChannelRule.upsert({
      where: {
        organizationId_channel: {
          organizationId,
          channel: line.channel,
        },
      },
      create: {
        organizationId,
        channel: line.channel,
        categoryKey,
      },
      update: { categoryKey },
    });

    await prisma.payrexxPayoutLine.updateMany({
      where: {
        payoutId: line.payoutId,
        channel: line.channel,
        categoryKey: UNMAPPED_KEY,
        id: { not: lineId },
      },
      data: { categoryKey, categorySource: "learned" },
    });
  }

  await refreshPayoutMeta(line.payoutId);
  return { payoutId: line.payoutId };
}

export async function deletePayout(
  organizationId: string,
  payoutId: string,
): Promise<boolean> {
  const result = await prisma.payrexxPayout.deleteMany({
    where: { id: payoutId, organizationId },
  });
  return result.count > 0;
}

export async function listUnmappedLines(organizationId: string) {
  const rows = await prisma.payrexxPayoutLine.findMany({
    where: {
      categoryKey: UNMAPPED_KEY,
      payout: { organizationId },
    },
    orderBy: [{ payoutId: "asc" }, { createdAt: "asc" }],
    include: {
      payout: { select: { id: true, uuid: true, date: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    channel: r.channel,
    description: r.description,
    paymentMethod: r.paymentMethod,
    customer: r.customer,
    total: num(r.total),
    amount: num(r.amount),
    payoutId: r.payout.id,
    payoutUuid: r.payout.uuid,
    payoutDate: r.payout.date,
  }));
}

export async function listChannelRules(organizationId: string) {
  return prisma.payrexxChannelRule.findMany({
    where: { organizationId },
    orderBy: { channel: "asc" },
  });
}

export async function upsertChannelRule(
  organizationId: string,
  channel: string,
  categoryKey: string,
) {
  const ch = channel.trim();
  if (!ch) throw new Error("Kanal erforderlich.");
  if (!(categoryKey in CATEGORIES) || categoryKey === UNMAPPED_KEY) {
    throw new Error("Ungültige Kategorie.");
  }
  await prisma.payrexxChannelRule.upsert({
    where: {
      organizationId_channel: { organizationId, channel: ch },
    },
    create: { organizationId, channel: ch, categoryKey },
    update: { categoryKey },
  });
}

export async function deleteChannelRule(
  organizationId: string,
  ruleId: string,
) {
  await prisma.payrexxChannelRule.deleteMany({
    where: { id: ruleId, organizationId },
  });
}

export function formatMoney(n: number, currency = "CHF"): string {
  return `${n.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function buildDayCsv(detail: PayoutDetail): string {
  const rows = [
    ["Datum", "Kategorie", "MWST", "Anzahl", "Betrag"].join(";"),
  ];
  for (const t of detail.dayTotals) {
    if (!t.count || t.key === PAYOUT_FEE_KEY) continue;
    rows.push(
      [
        t.date,
        t.label,
        t.mwst ?? "",
        String(t.count),
        t.netto.toFixed(2).replace(".", ","),
      ].join(";"),
    );
  }
  rows.push(
    ["", "Auszahlung gesamt", "", "", detail.grandTotal.toFixed(2).replace(".", ",")].join(
      ";",
    ),
  );
  return "\uFEFF" + rows.join("\n");
}

export function buildShopifyCsv(detail: PayoutDetail): string {
  const rows = [
    ["Datum", "Kunde", "Zahlungsart", "Brutto", "Gebühren", "Netto", "ID"].join(
      ";",
    ),
  ];
  for (const line of detail.lines) {
    if (line.categoryKey !== "shopify") continue;
    if (isPayoutFee(line)) continue;
    rows.push(
      [
        line.date ?? "",
        line.customer ?? "",
        line.paymentMethod ?? "",
        line.amount.toFixed(2).replace(".", ","),
        line.fees.toFixed(2).replace(".", ","),
        line.total.toFixed(2).replace(".", ","),
        line.transactionId ?? "",
      ].join(";"),
    );
  }
  return "\uFEFF" + rows.join("\n");
}

export function buildJsonExport(detail: PayoutDetail) {
  const { totals } = detail;
  return {
    uuid: detail.uuid,
    date: detail.date,
    currency: detail.currency,
    status: detail.status,
    statement: detail.statement,
    payout_fee: detail.payoutFee.toFixed(2),
    grand_total: detail.grandTotal.toFixed(2),
    unmapped_count: detail.unmappedCount,
    by_date: detail.dayTotals
      .filter((t) => t.count && t.key !== PAYOUT_FEE_KEY)
      .map((t) => ({
        date: t.date,
        key: t.key,
        label: t.label,
        mwst: t.mwst,
        count: t.count,
        netto: t.netto.toFixed(2),
      })),
    categories: Object.values(totals)
      .filter((t) => t.count && t.key !== PAYOUT_FEE_KEY)
      .map((t) => ({
        key: t.key,
        label: t.label,
        mwst: t.mwst,
        count: t.count,
        brutto: t.brutto.toFixed(2),
        fees: t.fees.toFixed(2),
        netto: t.netto.toFixed(2),
      })),
  };
}

export { assignableCategoryKeys, categoryLabel, CATEGORIES };
