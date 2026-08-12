import { NextResponse } from "next/server";

const DEFAULT_ORIGINS = [
  "https://tsri.ch",
  "https://www.tsri.ch",
  "https://tsri-hub.online",
  "http://localhost:3000",
  "http://localhost:3001",
];

function allowedOrigins(): Set<string> {
  const fromEnv = (process.env.ADS_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const fromTrusted = (process.env.ADDITIONAL_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...fromEnv, ...fromTrusted]);
}

export function adsCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

export function withAdsCors(request: Request, response: NextResponse) {
  const cors = adsCorsHeaders(request);
  for (const [key, value] of Object.entries(cors)) {
    response.headers.set(key, value);
  }
  return response;
}

export function adsCorsPreflight(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: adsCorsHeaders(request),
  });
}
