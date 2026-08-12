import * as XLSX from "xlsx";
import type { LineItem } from "./types";
import { roundMoney } from "./types";

const HEADER_MAP: Record<string, string> = {
  typ: "typ",
  id: "transactionId",
  datum: "date",
  zeit: "time",
  transaktionsbetrag: "txAmount",
  "transaktionswährung": "txCurrency",
  transaktionswaehrung: "txCurrency",
  betrag: "amount",
  "währung": "currency",
  waehrung: "currency",
  "transaktionsgebühren": "fees",
  transaktionsgebuehren: "fees",
  total: "total",
  beschreibung: "description",
  zahlungskanal: "channel",
  zahlungsart: "paymentMethod",
  kunde: "customer",
  "externe referenz": "externalReference",
  instanz: "instance",
  "api referenz-id": "apiRef",
};

function normalizeHeader(name: unknown): string {
  if (name == null) return "";
  return String(name).trim().toLowerCase();
}

function toMoney(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return roundMoney(value);
  const s = String(value).trim().replace(/'/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function formatDateCell(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
  }
  return strOrNull(value);
}

function formatTimeCell(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  if (typeof value === "number" && value < 1) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const h = String(parsed.H).padStart(2, "0");
      const m = String(parsed.M).padStart(2, "0");
      const s = String(Math.floor(parsed.S)).padStart(2, "0");
      return `${h}:${m}:${s}`;
    }
  }
  return strOrNull(value);
}

type MappedRow = Record<string, unknown>;

function rowToLine(mapped: MappedRow): LineItem | null {
  const typ = strOrNull(mapped.typ);
  if (!typ) return null;

  let amount = toMoney(mapped.amount);
  if (amount === 0 && mapped.txAmount != null) {
    amount = toMoney(mapped.txAmount);
  }

  const fees = toMoney(mapped.fees);
  const total = toMoney(mapped.total);
  const currency =
    strOrNull(mapped.currency) || strOrNull(mapped.txCurrency) || "CHF";

  return {
    typ,
    transactionId: strOrNull(mapped.transactionId),
    date: formatDateCell(mapped.date),
    time: formatTimeCell(mapped.time),
    amount,
    fees,
    total,
    currency,
    description: strOrNull(mapped.description),
    channel: strOrNull(mapped.channel),
    paymentMethod: strOrNull(mapped.paymentMethod),
    customer: strOrNull(mapped.customer),
    externalReference: strOrNull(mapped.externalReference),
    instance: strOrNull(mapped.instance),
  };
}

function mapHeaders(headerRow: unknown[]): (string | null)[] {
  return headerRow.map((h) => HEADER_MAP[normalizeHeader(h)] ?? null);
}

export function parseXlsxBuffer(buffer: ArrayBuffer | Buffer): LineItem[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    { header: 1, defval: null, raw: true },
  );
  if (!rows.length) return [];

  const keys = mapHeaders(rows[0] ?? []);
  const lines: LineItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const mapped: MappedRow = {};
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c];
      if (key) mapped[key] = row[c];
    }
    const item = rowToLine(mapped);
    if (item) lines.push(item);
  }
  return lines;
}

export function parseCsvText(text: string): LineItem[] {
  const wb = XLSX.read(text, { type: "string", FS: ";" });
  // Try auto-detect: if first sheet has few columns, retry with comma
  let sheet = wb.Sheets[wb.SheetNames[0]!];
  let rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  if ((rows[0]?.length ?? 0) < 3) {
    const wb2 = XLSX.read(text, { type: "string", FS: "," });
    sheet = wb2.Sheets[wb2.SheetNames[0]!];
    rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });
  }
  if (!rows.length) return [];

  const keys = mapHeaders(rows[0] ?? []);
  const lines: LineItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const mapped: MappedRow = {};
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c];
      if (key) mapped[key] = row[c];
    }
    const item = rowToLine(mapped);
    if (item) lines.push(item);
  }
  return lines;
}

export function parseExport(
  buffer: ArrayBuffer | Buffer,
  filename: string,
): LineItem[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text =
      typeof buffer === "string"
        ? buffer
        : new TextDecoder("utf-8").decode(
            buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer,
          );
    return parseCsvText(text.replace(/^\uFEFF/, ""));
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return parseXlsxBuffer(buffer);
  }
  throw new Error(`Unsupported file type: ${filename}`);
}
