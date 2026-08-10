import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForRag = globalThis as unknown as {
  ragPool: Pool | undefined;
};

/**
 * Pool for RAG vector queries.
 * Prefer RAG_DATABASE_URL (e.g. Render with imported embeddings) so local HQ
 * can keep DATABASE_URL on Prisma Postgres while still searching the archive.
 */
export function getRagPool(): Pool {
  if (globalForRag.ragPool) return globalForRag.ragPool;

  const connectionString =
    process.env.RAG_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("RAG_DATABASE_URL oder DATABASE_URL fehlt.");
  }

  const isRemote = /render\.com/i.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

  globalForRag.ragPool = pool;
  return pool;
}

export function ragDatabaseHost(): string {
  const connectionString =
    process.env.RAG_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  try {
    const u = new URL(connectionString.replace(/^postgres(ql)?:/, "http:"));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unbekannt)";
  }
}

export async function ragQuery<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const pool = getRagPool();
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function withRagClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getRagPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
