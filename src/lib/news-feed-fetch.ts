import {
  BAUGESUCHE_MAX_AGE_DAYS,
  BAUGESUCHE_SOURCE,
  BAUGESUCHE_TOWN,
  FEED_USER_AGENT,
  GEMEINDERAT_MAX_AGE_DAYS,
  RSS_SOURCES,
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

export async function collectFeedItems(): Promise<{
  items: ParsedNewsItem[];
  results: FetchResult[];
}> {
  const results: FetchResult[] = [];
  const collected: ParsedNewsItem[] = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRssSource(source);
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
    const items = await fetchBaugesuche();
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
    const items = await fetchTagblatt();
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

async function fetchRssSource(source: FeedSource): Promise<ParsedNewsItem[]> {
  const res = await fetch(source.url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, source.key, source.label);
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

async function fetchTagblatt(): Promise<ParsedNewsItem[]> {
  const res = await fetch(TAGBLATT_URL, { headers: headers() });
  if (!res.ok) throw new Error(`Tagblatt HTTP ${res.status}`);
  const html = await res.text();
  const basics = parseTagblattOverview(html);

  const enriched = await Promise.all(
    basics.map(async ({ id, url }): Promise<ParsedNewsItem | null> => {
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
    }),
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

async function fetchBaugesuche(): Promise<ParsedNewsItem[]> {
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

  const enriched = await Promise.all(
    baseItems.map(async (item) => {
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
    }),
  );

  return enriched;
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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function safeDate(pubDate: string): Date | null {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d;
}
