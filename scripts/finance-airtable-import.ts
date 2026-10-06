/**
 * Airtable «Budget Tsüri» → Finance (Kategorien, Budget/Forecast, Buchungen, Deals, Monatsabschluss).
 *
 * Env:
 *   AIRTABLE_TOKEN   Personal Access Token mit data.records:read auf die Base
 *   DATABASE_URL
 *
 * Usage:
 *   npm run finance:airtable-import                 # Dry-Run: nur Bericht
 *   npm run finance:airtable-import -- --apply      # schreibt in die DB
 *   npm run finance:airtable-import -- --apply --org tsri
 *
 * Wiederholbar: Datensätze werden über die Airtable-ID abgeglichen. Buchungen, die aus
 * Airtable stammen und dort gelöscht wurden, werden beim --apply entfernt. Im Tool
 * erfasste Buchungen (ohne airtableId) bleiben unberührt.
 *
 * Zuordnung einer Buchung (Monat × Kategorie):
 *   1. Kategorie + Monat des Datums auf der Buchung
 *   2. fehlt etwas davon: aus dem Budget-Link (Budget_Master-Zeile)
 *   3. sonst: übersprungen und im Bericht aufgeführt
 */

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { monthKey, monthKeyToDate, type MonthKey } from "../src/lib/finance/shared";

const BASE_ID = "appYVePAGbxLDOkAF";

const T = {
  categories: "tblANGTgzxPRouMAg",
  budget: "tblkxdk3gvZbkqgpK",
  bookings: "tblap3Rscz9Mt2ziW",
  organisations: "tbldID3ghH1dn56fY",
  people: "tblWIqgj73hj9gdRm",
} as const;

const F = {
  cat: {
    name: "fldviZ1AeCQzUAbxa",
    kind: "fld2MzPNP3HInIOaN",
    group: "fldoop7fXhcjcJcz4",
    liquidityOnly: "fldqgyHKd14HNeJ2y",
    sort: "fldjpnapoipwmtnXI",
  },
  budget: {
    category: "fldoxRbYbuGBjaNN0",
    budget: "fldls889nmHsgoIGu",
    forecast: "fldnzd5XJXtEovvYL",
    month: "fldTgsSrCHzstX7JM",
    closed: "fldOZOl8wu0HpRVXa",
  },
  booking: {
    title: "fldJB3B7aOrO6KbTk",
    amount: "fldYonJE96b5C1KNj",
    organisation: "fldsFaXygPevke8ad",
    category: "fldTJCuF5bo95NZBa",
    responsible: "fldu58iKkxPOhFrcD",
    date: "fld5kJ9ixcTf7T7ir",
    notes: "fldkuSvBfOOuqRyAU",
    budgetLink: "fldTMM7XoXSTksswK",
    bexio: "fldNknOzZkfcNIZQO",
  },
  name: {
    organisation: "fldk0PVpvyVkggXst",
    person: "fldlVFMMWdSPc7gf9",
  },
} as const;

type AirtableRecord = { id: string; fields: Record<string, unknown> };

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const orgIdx = argv.indexOf("--org");
  const orgSlug = orgIdx >= 0 ? argv[orgIdx + 1] : undefined;
  return { apply, orgSlug };
}

async function fetchAll(table: string, fieldIds: string[]): Promise<AirtableRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN fehlt (.env)");
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  let networkRetries = 0;
  for (;;) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${table}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const f of fieldIds) url.searchParams.append("fields[]", f);
    if (offset) url.searchParams.set("offset", offset);

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      // Netzwerkfehler (z.B. «fetch failed»): bis zu 3 Mal erneut versuchen
      if (++networkRetries > 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * networkRetries));
      continue;
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    out.push(...body.records);
    offset = body.offset;
    if (!offset) return out;
    // Airtable: max 5 Requests/s pro Base
    await new Promise((r) => setTimeout(r, 220));
  }
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const round2 = (n: number) => Math.round(n * 100) / 100;

function monthOfIsoDate(v: unknown): MonthKey | null {
  const s = str(v);
  const m = s ? /^(\d{4})-(\d{2})-\d{2}/.exec(s) : null;
  return m ? monthKey(Number(m[1]), Number(m[2]) - 1) : null;
}

function bexioOrderId(url: string | null): string | null {
  return url?.match(/kb_order\/show\/id\/(\d+)/)?.[1] ?? null;
}

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function resolveOrganization(slug: string | undefined) {
  if (slug) {
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) throw new Error(`Organisation «${slug}» nicht gefunden`);
    return org;
  }
  const orgs = await prisma.organization.findMany({ take: 2 });
  if (orgs.length !== 1) {
    throw new Error("Mehrere Organisationen vorhanden – bitte --org <slug> angeben");
  }
  return orgs[0];
}

async function main() {
  const { apply, orgSlug } = parseArgs(process.argv.slice(2));
  const org = await resolveOrganization(orgSlug);
  console.log(`Organisation: ${org.name} (${org.slug}) · ${apply ? "APPLY" : "Dry-Run"}\n`);

  const [catRecs, budgetRecs, bookingRecs, orgRecs, peopleRecs] = await Promise.all([
    fetchAll(T.categories, Object.values(F.cat)),
    fetchAll(T.budget, Object.values(F.budget)),
    fetchAll(T.bookings, Object.values(F.booking)),
    fetchAll(T.organisations, [F.name.organisation]),
    fetchAll(T.people, [F.name.person]),
  ]);
  console.log(
    `Airtable: ${catRecs.length} Kategorien, ${budgetRecs.length} Budget-Zeilen, ${bookingRecs.length} Buchungen\n`,
  );

  const orgName = new Map(orgRecs.map((r) => [r.id, str(r.fields[F.name.organisation])]));
  const personName = new Map(peopleRecs.map((r) => [r.id, str(r.fields[F.name.person])]));

  // ── Kategorien ──────────────────────────────────────────────
  const categories = catRecs
    .map((r) => {
      const f = r.fields;
      const name = str(f[F.cat.name]);
      const kindRaw = str(f[F.cat.kind]);
      if (!name || !kindRaw) return null;
      const groups = Array.isArray(f[F.cat.group]) ? (f[F.cat.group] as string[]) : [];
      return {
        airtableId: r.id,
        name,
        kind: kindRaw === "Einnahme" ? ("income" as const) : ("expense" as const),
        group: groups[0] ?? null,
        sortOrder: typeof f[F.cat.sort] === "number" ? (f[F.cat.sort] as number) : 1000,
        liquidityOnly: f[F.cat.liquidityOnly] === true,
      };
    })
    .filter((c) => c !== null);
  const skippedCategories = catRecs.length - categories.length;

  // ── Budget-Zeilen ───────────────────────────────────────────
  type BudgetRow = { airtableId: string; catAirtableId: string; month: MonthKey; budget: number; forecast: number; closed: boolean };
  const budgetRows: BudgetRow[] = [];
  for (const r of budgetRecs) {
    const cat = ids(r.fields[F.budget.category])[0];
    const month = monthOfIsoDate(r.fields[F.budget.month]);
    if (!cat || !month) continue;
    budgetRows.push({
      airtableId: r.id,
      catAirtableId: cat,
      month,
      budget: round2(num(r.fields[F.budget.budget])),
      forecast: round2(num(r.fields[F.budget.forecast])),
      closed: r.fields[F.budget.closed] === true,
    });
  }
  const budgetById = new Map(budgetRows.map((b) => [b.airtableId, b]));

  const closeStats = new Map<MonthKey, { closed: number; total: number }>();
  for (const b of budgetRows) {
    const s = closeStats.get(b.month) ?? { closed: 0, total: 0 };
    s.total += 1;
    if (b.closed) s.closed += 1;
    closeStats.set(b.month, s);
  }
  const closedMonths = [...closeStats].filter(([, s]) => s.closed > 0).map(([m]) => m).sort();

  // ── Buchungen ───────────────────────────────────────────────
  type Booking = {
    airtableId: string;
    catAirtableId: string;
    month: MonthKey;
    title: string;
    amount: number;
    organisation: string | null;
    responsibleName: string | null;
    bexioUrl: string | null;
    notes: string | null;
    source: "booking" | "budget-link";
  };
  const bookings: Booking[] = [];
  const skipped: { id: string; title: string; amount: number; date: string | null }[] = [];
  const mismatches: { title: string; own: string; link: string }[] = [];

  for (const r of bookingRecs) {
    const f = r.fields;
    const title = str(f[F.booking.title]) ?? "(ohne Titel)";
    const amount = round2(num(f[F.booking.amount]));
    const ownCat = ids(f[F.booking.category])[0] ?? null;
    const ownMonth = monthOfIsoDate(f[F.booking.date]);
    const link = budgetById.get(ids(f[F.booking.budgetLink])[0] ?? "");

    const catAirtableId = ownCat ?? link?.catAirtableId ?? null;
    const month = ownMonth ?? link?.month ?? null;
    if (!catAirtableId || !month) {
      skipped.push({ id: r.id, title, amount, date: str(f[F.booking.date]) });
      continue;
    }
    if (link && ownCat && ownMonth && (link.catAirtableId !== ownCat || link.month !== ownMonth)) {
      mismatches.push({ title, own: `${ownCat} ${ownMonth}`, link: `${link.catAirtableId} ${link.month}` });
    }

    bookings.push({
      airtableId: r.id,
      catAirtableId,
      month,
      title,
      amount,
      organisation: orgName.get(ids(f[F.booking.organisation])[0] ?? "")?.replace(/\s+/g, " ") ?? null,
      responsibleName: personName.get(ids(f[F.booking.responsible])[0] ?? "") ?? null,
      bexioUrl: str(f[F.booking.bexio]),
      notes: str(f[F.booking.notes]),
      source: ownCat && ownMonth ? "booking" : "budget-link",
    });
  }

  // ── Deals: Buchungen mit demselben Bexio-Auftrag ────────────
  const dealGroups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const orderId = bexioOrderId(b.bexioUrl);
    if (!orderId) continue;
    const list = dealGroups.get(orderId) ?? [];
    list.push(b);
    dealGroups.set(orderId, list);
  }
  const multiRate = [...dealGroups.values()].filter((g) => g.length > 1).length;

  // ── Bericht ─────────────────────────────────────────────────
  const catName = new Map(categories.map((c) => [c.airtableId, c.name]));
  console.log(`Kategorien:        ${categories.length} (davon ${categories.filter((c) => c.liquidityOnly).length} nur Liquidität)${skippedCategories ? `, ${skippedCategories} ohne Name/Art übersprungen` : ""}`);
  console.log(`Budget-Zeilen:     ${budgetRows.filter((b) => b.budget || b.forecast).length} mit Werten`);
  console.log(`Buchungen:         ${bookings.length} importierbar, davon ${bookings.filter((b) => b.source === "budget-link").length} über Budget-Link zugeordnet`);
  console.log(`Deals (Bexio):     ${dealGroups.size}, davon ${multiRate} mit mehreren Raten`);
  console.log(`Abgeschl. Monate:  ${closedMonths.length ? closedMonths.map((m) => { const s = closeStats.get(m)!; return `${m} (${s.closed}/${s.total})`; }).join(", ") : "keine"}`);

  if (mismatches.length) {
    console.log(`\n⚠️  ${mismatches.length} Buchung(en): Budget-Link passt nicht zu Kategorie/Datum – verwendet wird Kategorie/Datum der Buchung:`);
    for (const m of mismatches) {
      const [oc, om] = m.own.split(" ");
      const [lc, lm] = m.link.split(" ");
      console.log(`   - ${m.title}: Buchung ${catName.get(oc) ?? oc} ${om} ≠ Link ${catName.get(lc) ?? lc} ${lm}`);
    }
  }
  if (skipped.length) {
    console.log(`\n⚠️  ${skipped.length} Buchung(en) ohne Kategorie/Monat – NICHT importiert:`);
    for (const s of skipped) {
      console.log(`   - ${s.title} · ${s.amount} CHF · Datum ${s.date ?? "—"} · https://airtable.com/${BASE_ID}/${T.bookings}/${s.id}`);
    }
  }

  if (!apply) {
    console.log("\nDry-Run – nichts geschrieben. Mit --apply importieren.");
    return;
  }

  // ── Schreiben ───────────────────────────────────────────────
  const organizationId = org.id;
  const catIdByAirtable = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.financeCategory.upsert({
      where: { organizationId_airtableId: { organizationId, airtableId: c.airtableId } },
      create: { organizationId, ...c },
      update: {
        name: c.name,
        kind: c.kind,
        group: c.group,
        sortOrder: c.sortOrder,
        liquidityOnly: c.liquidityOnly,
      },
      select: { id: true },
    });
    catIdByAirtable.set(c.airtableId, row.id);
  }

  const budgetWithValues = budgetRows.filter(
    (b) => (b.budget || b.forecast) && catIdByAirtable.has(b.catAirtableId),
  );
  await inChunks(budgetWithValues, 20, (b) => {
    const categoryId = catIdByAirtable.get(b.catAirtableId)!;
    const month = monthKeyToDate(b.month);
    return prisma.financeBudgetEntry.upsert({
      where: { categoryId_month: { categoryId, month } },
      create: { organizationId, categoryId, month, budget: b.budget, forecast: b.forecast },
      update: { budget: b.budget, forecast: b.forecast },
    });
  });

  for (const m of closedMonths) {
    const month = monthKeyToDate(m);
    await prisma.financeMonthClose.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: { organizationId, month },
      update: {},
    });
  }

  const dealIdByOrder = new Map<string, string>();
  for (const [orderId, group] of dealGroups) {
    const first = group[0];
    const data = {
      title: first.title,
      organisation: group.find((b) => b.organisation)?.organisation ?? null,
      responsibleName: group.find((b) => b.responsibleName)?.responsibleName ?? null,
      totalAmount: round2(group.reduce((s, b) => s + b.amount, 0)),
      bexioUrl: first.bexioUrl,
      status: "split" as const,
    };
    const deal = await prisma.financeDeal.upsert({
      where: {
        organizationId_source_externalId: {
          organizationId,
          source: "airtable",
          externalId: `bexio-order-${orderId}`,
        },
      },
      create: { organizationId, source: "airtable", externalId: `bexio-order-${orderId}`, ...data },
      update: data,
      select: { id: true },
    });
    dealIdByOrder.set(orderId, deal.id);
  }

  const importable = bookings.filter((b) => catIdByAirtable.has(b.catAirtableId));
  await inChunks(importable, 20, (b) => {
    const orderId = bexioOrderId(b.bexioUrl);
    const data = {
      categoryId: catIdByAirtable.get(b.catAirtableId)!,
      month: monthKeyToDate(b.month),
      title: b.title,
      amount: b.amount,
      organisation: b.organisation,
      responsibleName: b.responsibleName,
      bexioUrl: b.bexioUrl,
      notes: b.notes,
      dealId: orderId ? (dealIdByOrder.get(orderId) ?? null) : null,
    };
    return prisma.financeBooking.upsert({
      where: { organizationId_airtableId: { organizationId, airtableId: b.airtableId } },
      create: { organizationId, airtableId: b.airtableId, ...data },
      update: data,
    });
  });

  const removed = await prisma.financeBooking.deleteMany({
    where: {
      organizationId,
      airtableId: { not: null, notIn: importable.map((b) => b.airtableId) },
    },
  });
  const orphanDeals = await prisma.financeDeal.deleteMany({
    where: { organizationId, source: "airtable", bookings: { none: {} } },
  });

  console.log(
    `\n✓ Importiert: ${categories.length} Kategorien, ${budgetWithValues.length} Budget-Zeilen, ${importable.length} Buchungen, ${dealGroups.size} Deals, ${closedMonths.length} abgeschlossene Monate.`,
  );
  if (removed.count || orphanDeals.count) {
    console.log(`  Entfernt (in Airtable gelöscht): ${removed.count} Buchungen, ${orphanDeals.count} Deals.`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
