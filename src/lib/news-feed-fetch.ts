import {
  BAUGESUCHE_MAX_AGE_DAYS,
  BAUGESUCHE_SOURCE,
  BAUGESUCHE_TOWN,
  FEED_USER_AGENT,
  FLUGHAFEN_ZUERICH_MEDIENMITTEILUNGEN_KEY,
  GEMEINDERAT_MAX_AGE_DAYS,
  RSS_SOURCES,
  STADT_MEDIENMITTEILUNGEN_KEY,
  TAGBLATT_SOURCE,
  TAGBLATT_URL,
  type FeedSource,
} from "@/lib/news-feed-constants";

export type ParsedNewsItem = {
  externalId: string;
  source: string;
  sourceLabel: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: Date | null;
};

type FetchResult = {
  source: string;
  count: number;
  error?: string;
};

function headers() {
  return { "User-Agent": FEED_USER_AGENT };
}

const ENRICH_CONCURRENCY = 3;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export type CollectFeedItemsOptions = {
  /** Fetch article HTML / Amtsblatt XML. Default true (manual refresh). */
  enrichDetails?: boolean;
};

export async function collectFeedItems(
  options?: CollectFeedItemsOptions,
): Promise<{
  items: ParsedNewsItem[];
  results: FetchResult[];
}> {
  const enrichDetails = options?.enrichDetails !== false;
  const results: FetchResult[] = [];
  const collected: ParsedNewsItem[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRssSource(source, enrichDetails);
      collected.push(...items);
      results.push({ source: source.key, count: items.length });
    } catch (err) {
      results.push({
        source: source.key,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    const items = await fetchBaugesuche(enrichDetails);
    collected.push(...items);
    results.push({ source: BAUGESUCHE_SOURCE.key, count: items.length });
  } catch (err) {
    results.push({
      source: BAUGESUCHE_SOURCE.key,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const items = await fetchTagblatt(enrichDetails);
    collected.push(...items);
    results.push({ source: TAGBLATT_SOURCE.key, count: items.length });
  } catch (err) {
    results.push({
      source: TAGBLATT_SOURCE.key,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { items: collected, results };
}

async function fetchRssSource(
  source: FeedSource,
  enrichDetails: boolean,
): Promise<ParsedNewsItem[]> {
  const res = await fetch(source.url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRss(xml, source.key, source.label);
  if (
    enrichDetails &&
    source.autoFetchFulltext &&
    source.key === STADT_MEDIENMITTEILUNGEN_KEY
  ) {
    return enrichStadtMedienmitteilungen(items);
  }
  if (
    enrichDetails &&
    source.autoFetchFulltext &&
    source.key === FLUGHAFEN_ZUERICH_MEDIENMITTEILUNGEN_KEY
  ) {
    return enrichFlughafenMedienmitteilungen(items);
  }
  return items;
}

/** Volltext für Auto-Fulltext-Quellen nachladen (Generate-Fallback). */
export async function fetchAutoFulltext(
  sourceKey: string,
  url: string,
): Promise<string | null> {
  if (sourceKey === STADT_MEDIENMITTEILUNGEN_KEY) {
    return fetchStadtMedienmitteilungFulltext(url);
  }
  if (sourceKey === FLUGHAFEN_ZUERICH_MEDIENMITTEILUNGEN_KEY) {
    return fetchFlughafenMedienmitteilungFulltext(url);
  }
  return null;
}

/** Nachladen des Volltexts von stadt-zuerich.ch Artikel-Seiten. */
export async function fetchStadtMedienmitteilungFulltext(
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const html = await res.text();
    return extractStadtMedienmitteilungBody(html);
  } catch {
    return null;
  }
}

export function extractStadtMedienmitteilungBody(html: string): string | null {
  const leadMatch = html.match(
    /<stzh-text\b[^>]*slot=["']lead["'][^>]*>([\s\S]*?)<\/stzh-text>/i,
  );
  const richMatch = html.match(
    /<stzh-richtext\b[^>]*>([\s\S]*?)<\/stzh-richtext>/i,
  );

  const parts: string[] = [];
  if (leadMatch) {
    const lead = stripHtml(leadMatch[1]!);
    if (lead) parts.push(lead);
  }
  if (richMatch) {
    const paras = [...richMatch[1]!.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(
      (m) => stripHtml(m[1]!),
    );
    for (const p of paras) {
      if (p) parts.push(p);
    }
  }

  if (parts.length === 0) {
    // Fallback: alle <p> im main
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
    const paras = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripHtml(m[1]!))
      .filter((p) => p.length > 40);
    parts.push(...paras);
  }

  const text = parts.join("\n\n").trim();
  return text.length >= 80 ? text : null;
}

function stripHtml(raw: string): string {
  return clean(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

async function enrichStadtMedienmitteilungen(
  items: ParsedNewsItem[],
): Promise<ParsedNewsItem[]> {
  const concurrency = ENRICH_CONCURRENCY;
  const out: ParsedNewsItem[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const enriched = await Promise.all(
      chunk.map(async (item) => {
        const full = await fetchStadtMedienmitteilungFulltext(item.link);
        if (!full) return item;
        return { ...item, summary: full.slice(0, 20_000) };
      }),
    );
    out.push(...enriched);
  }
  return out;
}

/** Nachladen des Volltexts von newsroom.flughafen-zuerich.ch Artikel-Seiten. */
export async function fetchFlughafenMedienmitteilungFulltext(
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const html = await res.text();
    return extractFlughafenMedienmitteilungBody(html);
  } catch {
    return null;
  }
}

export function extractFlughafenMedienmitteilungBody(
  html: string,
): string | null {
  const article =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html;
  const paras = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]!))
    .filter((p) => p.length > 40);
  const text = paras.join("\n\n").trim();
  return text.length >= 80 ? text : null;
}

/**
 * Presspage liefert den Artikel oft schon im RSS (pp:summary + description).
 * Falls der Feed-Text zu kurz ist, Artikel-Seite nachladen.
 */
async function enrichFlughafenMedienmitteilungen(
  items: ParsedNewsItem[],
): Promise<ParsedNewsItem[]> {
  const concurrency = ENRICH_CONCURRENCY;
  const out: ParsedNewsItem[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const enriched = await Promise.all(
      chunk.map(async (item) => {
        if ((item.summary?.length ?? 0) >= 200) {
          return { ...item, summary: item.summary.slice(0, 20_000) };
        }
        const full = await fetchFlughafenMedienmitteilungFulltext(item.link);
        if (!full) return item;
        return { ...item, summary: full.slice(0, 20_000) };
      }),
    );
    out.push(...enriched);
  }
  return out;
}

export function parseRss(
  xml: string,
  sourceKey: string,
  sourceLabel: string,
): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  const isGemeinderat = sourceKey === "gemeinderat-zuerich";
  const cutoff = isGemeinderat
    ? Date.now() - GEMEINDERAT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    : null;
  const isSrfRegionaljournal = sourceKey === "srf-regionaljournal-zh-sh";
  const SRF_SHOW_PAGE =
    "https://www.srf.ch/audio/regionaljournal-zuerich-schaffhausen";

  const isFlughafen =
    sourceKey === FLUGHAFEN_ZUERICH_MEDIENMITTEILUNGEN_KEY;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    let title = clean(extractTag(block, "title"));
    let link = clean(extractTag(block, "link"));
    if (!link) {
      const enclosureMatch = block.match(
        /<enclosure\b[^>]*\burl="([^"]+)"/i,
      );
      if (enclosureMatch) link = decodeEntities(enclosureMatch[1]!);
    }
    const description = clean(extractTag(block, "description"));
    const pubDateRaw = extractTag(block, "pubDate");
    const guid = clean(extractTag(block, "guid")) || link;

    if (isSrfRegionaljournal) link = SRF_SHOW_PAGE;
    if (!link || !title) continue;

    if (isFlughafen) {
      const category = clean(extractTag(block, "category"));
      if (!/medienmitteilung/i.test(category)) continue;
    }

    let publishedAt: Date | null;
    let summary: string;

    if (isGemeinderat) {
      publishedAt = parseSwissDate(pubDateRaw);
      if (description) title = `${description} – ${title}`;
      summary = "";
      if (cutoff !== null) {
        const ts = publishedAt?.getTime() ?? null;
        if (ts === null || ts < cutoff) continue;
      }
    } else if (isFlughafen) {
      publishedAt = safeDate(pubDateRaw);
      const lead = stripHtml(extractTag(block, "pp:summary"));
      const body = stripHtml(description);
      summary = [lead, body].filter(Boolean).join("\n\n").slice(0, 20_000);
    } else {
      publishedAt = safeDate(pubDateRaw);
      summary = description.slice(0, 600);
    }

    items.push({
      externalId: `${sourceKey}::${guid}`.slice(0, 500),
      source: sourceKey,
      sourceLabel,
      title,
      link,
      summary,
      publishedAt,
    });
  }

  return items;
}

async function fetchTagblatt(enrichDetails: boolean): Promise<ParsedNewsItem[]> {
  const res = await fetch(TAGBLATT_URL, { headers: headers() });
  if (!res.ok) throw new Error(`Tagblatt HTTP ${res.status}`);
  const html = await res.text();
  const basics = parseTagblattOverview(html);

  if (!enrichDetails) {
    return basics.map(({ id, url }) => ({
      externalId: `${TAGBLATT_SOURCE.key}::${id}`,
      source: TAGBLATT_SOURCE.key,
      sourceLabel: TAGBLATT_SOURCE.label,
      title: "",
      link: url,
      summary: "",
      publishedAt: null,
    }));
  }

  const enriched = await mapPool(
    basics,
    ENRICH_CONCURRENCY,
    async ({ id, url }): Promise<ParsedNewsItem | null> => {
      const detail = await fetchTagblattDetail(url);
      if (!detail?.title) return null;
      return {
        externalId: `${TAGBLATT_SOURCE.key}::${id}`,
        source: TAGBLATT_SOURCE.key,
        sourceLabel: TAGBLATT_SOURCE.label,
        title: detail.title,
        link: url,
        summary: detail.summary,
        publishedAt: detail.publishedAt,
      };
    },
  );

  return enriched.filter((item): item is ParsedNewsItem => item !== null);
}

function resolveTagblattUrl(raw: string): string {
  const domainMatch = raw.match(
    /^https?:\/\/(?:www\.)?tagblattzuerich\.ch(\/.*)$/i,
  );
  if (domainMatch) return `https://www.tagblattzuerich.ch${domainMatch[1]}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `https://www.tagblattzuerich.ch${path}`;
}

function parseTagblattOverview(
  html: string,
): { id: string; url: string }[] {
  const linkRegex =
    /<a\b[^>]*href="([^"]*tx_news_pi1%5Baction%5D=detail[^"]*news%5D=(\d+)[^"]*)"[^>]*>/gi;
  const byId = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const id = match[2]!;
    if (!byId.has(id)) {
      byId.set(id, resolveTagblattUrl(decodeEntities(match[1]!)));
    }
  }
  return [...byId.entries()].map(([id, url]) => ({ id, url }));
}

async function fetchTagblattDetail(url: string): Promise<{
  title: string;
  summary: string;
  publishedAt: Date | null;
} | null> {
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<h1>\s*([\s\S]*?)\s*<\/h1>/i);
    const title = titleMatch
      ? clean(titleMatch[1]!.replace(/<[^>]+>/g, " "))
      : "";

    const vorspannMatch = html.match(
      /<div class="vorspann">\s*<p>\s*([\s\S]*?)\s*<\/p>/i,
    );
    const summary = vorspannMatch
      ? clean(vorspannMatch[1]!.replace(/<[^>]+>/g, " ")).slice(0, 600)
      : "";

    const timestampMatch = html.match(
      /<span class="timestamp">\s*(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})\s*<\/span>/i,
    );
    let publishedAt: Date | null = null;
    if (timestampMatch) {
      const [, day, month, year, hour, minute] = timestampMatch;
      const d = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
        ),
      );
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }

    return { title, summary, publishedAt };
  } catch {
    return null;
  }
}

async function fetchBaugesuche(enrichDetails: boolean): Promise<ParsedNewsItem[]> {
  const cutoff = new Date(
    Date.now() - BAUGESUCHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  );
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const sortParam = encodeURIComponent(
    "column:PUBLICATION_DATE|direction:DESC",
  );
  const url =
    `https://amtsblattportal.ch/api/v1/publications/csv?publicationStates=PUBLISHED` +
    `&subRubrics=BP-ZH01&publicationDate.start=${cutoffStr}` +
    `&pageRequest.sortOrders=${sortParam}&pageRequest.size=200`;

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Amtsblattportal API ${res.status}`);
  const csvText = await res.text();
  const baseItems = parseBaugesucheCsv(csvText);

  if (!enrichDetails) return baseItems;

  return mapPool(baseItems, ENRICH_CONCURRENCY, enrichBaugesuchItem);
}

async function enrichBaugesuchItem(item: ParsedNewsItem): Promise<ParsedNewsItem> {
  const publicationId = item.externalId.split("::")[1]!;
  const details = await fetchBaugesucheDetails(publicationId);
  if (!details) return item;
  const parts = [
    details.projectDescription,
    details.district ? `Kreis: ${details.district}` : "",
  ].filter(Boolean);
  return {
    ...item,
    summary: parts.join(" · ") || item.summary,
  };
}

const MAX_SCHEDULED_ENRICH = 15;

/** HTML/XML details for items not yet stored (scheduled path). */
export async function enrichFeedItems(
  items: ParsedNewsItem[],
): Promise<ParsedNewsItem[]> {
  if (items.length === 0) return items;
  const limited = items.slice(0, MAX_SCHEDULED_ENRICH);
  return mapPool(limited, ENRICH_CONCURRENCY, enrichOneItem);
}

async function enrichOneItem(item: ParsedNewsItem): Promise<ParsedNewsItem> {
  if (item.source === STADT_MEDIENMITTEILUNGEN_KEY) {
    const full = await fetchStadtMedienmitteilungFulltext(item.link);
    if (!full) return item;
    return { ...item, summary: full.slice(0, 20_000) };
  }
  if (item.source === FLUGHAFEN_ZUERICH_MEDIENMITTEILUNGEN_KEY) {
    if ((item.summary?.length ?? 0) >= 200) {
      return { ...item, summary: item.summary.slice(0, 20_000) };
    }
    const full = await fetchFlughafenMedienmitteilungFulltext(item.link);
    if (!full) return item;
    return { ...item, summary: full.slice(0, 20_000) };
  }
  if (item.source === BAUGESUCHE_SOURCE.key) {
    return enrichBaugesuchItem(item);
  }
  if (item.source === TAGBLATT_SOURCE.key) {
    const detail = await fetchTagblattDetail(item.link);
    if (!detail?.title) return item;
    return {
      ...item,
      title: detail.title,
      summary: detail.summary,
      publishedAt: detail.publishedAt,
    };
  }
  return item;
}

async function fetchBaugesucheDetails(
  publicationId: string,
): Promise<{ projectDescription: string; district: string } | null> {
  try {
    const res = await fetch(
      `https://amtsblattportal.ch/api/v1/publications/${publicationId}/xml`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const projectDescription = clean(extractTag(xml, "projectDescription"));
    const district = clean(extractTag(xml, "district"));
    if (!projectDescription && !district) return null;
    return { projectDescription, district };
  } catch {
    return null;
  }
}

function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      record.push(field);
      records.push(record);
      field = "";
      record = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function parseBaugesucheCsv(csv: string): ParsedNewsItem[] {
  const records = parseCsvRecords(csv, ";").filter((r) =>
    r.some((cell) => cell.trim() !== ""),
  );
  if (records.length < 2) return [];

  const headersRow = records[0]!.map((h) => h.trim().toLowerCase());
  const idIdx = headersRow.indexOf("id");
  const dateIdx = headersRow.indexOf("publicationdate");
  const numberIdx = headersRow.indexOf("publicationnumber");
  const townIdx = headersRow.indexOf("registrationofficetown");
  const officeIdx = headersRow.indexOf("registrationofficedisplayname");
  const titleDeIdx = headersRow.indexOf("titlede");
  if (idIdx < 0) return [];

  const items: ParsedNewsItem[] = [];
  for (let i = 1; i < records.length; i++) {
    const cols = records[i]!;
    const id = cols[idIdx]?.trim();
    if (!id) continue;

    const town = townIdx >= 0 ? cols[townIdx]?.trim() : "";
    if (town !== BAUGESUCHE_TOWN) continue;

    const dateRaw = dateIdx >= 0 ? cols[dateIdx]?.trim() : "";
    const publishedAt = dateRaw ? safeDate(dateRaw) : null;
    const publicationNumber =
      numberIdx >= 0 ? cols[numberIdx]?.trim() : id.slice(0, 8);
    const titleDe = titleDeIdx >= 0 ? cols[titleDeIdx]?.trim() : "";
    const office = officeIdx >= 0 ? cols[officeIdx]?.trim() : "";

    items.push({
      externalId: `${BAUGESUCHE_SOURCE.key}::${id}`.slice(0, 500),
      source: BAUGESUCHE_SOURCE.key,
      sourceLabel: BAUGESUCHE_SOURCE.label,
      title:
        titleDe ||
        `Baugesuch publiziert – Zürich (Nr. ${publicationNumber})`,
      link: `https://amtsblattportal.ch/api/v1/publications/${id}/pdf`,
      summary: office ? `Zuständige Stelle: ${office}` : "",
      publishedAt,
    });
  }
  return items;
}

function parseSwissDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, day, month, year] = m;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const found = block.match(re);
  return found ? found[1]!.trim() : "";
}

function clean(raw: string): string {
  const withoutCdata = raw.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return decodeEntities(withoutCdata).trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    );
}

function safeDate(pubDate: string): Date | null {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d;
}
