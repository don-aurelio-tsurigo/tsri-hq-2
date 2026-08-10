/**
 * Voyage document embeddings for RAG indexing (input_type: "document").
 */

import { getVoyageModel, VoyageEmbedError } from "@/lib/rag/embed-query";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VECTOR_DIMS = 1024;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type VoyageEmbeddingItem = {
  embedding: number[];
  index: number;
};

type VoyageResponse = {
  data?: VoyageEmbeddingItem[];
};

export async function embedDocuments(
  texts: string[],
  options?: { maxRetries?: number },
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new VoyageEmbedError("VOYAGE_API_KEY fehlt in der Umgebung.");
  }

  const model = getVoyageModel();
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      const res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model,
          input_type: "document",
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text();
        const retryAfterHdr = res.headers.get("retry-after");
        const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : NaN;
        const waitMs = Number.isFinite(retryAfterSec)
          ? Math.max(1_000, retryAfterSec * 1_000)
          : res.status === 429
            ? Math.min(60_000, 20_000 * attempt)
            : Math.min(30_000, 500 * 2 ** (attempt - 1));
        lastError = new VoyageEmbedError(
          `Voyage HTTP ${res.status} (Versuch ${attempt}/${maxRetries}): ${body.slice(0, 300)}`,
        );
        if (attempt < maxRetries) {
          await sleep(waitMs);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new VoyageEmbedError(
          `Voyage Embedding fehlgeschlagen (HTTP ${res.status}): ${body.slice(0, 300)}`,
        );
      }

      const json = (await res.json()) as VoyageResponse;
      if (!Array.isArray(json.data) || json.data.length !== texts.length) {
        throw new VoyageEmbedError(
          `Unerwartete Voyage-Antwort: data.length=${json.data?.length ?? 0}, erwartet ${texts.length}`,
        );
      }

      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i]!;
        if (item.index !== i) {
          throw new VoyageEmbedError(
            `Voyage index-Lücke: Position ${i} hat index=${item.index}`,
          );
        }
        if (
          !Array.isArray(item.embedding) ||
          item.embedding.length !== VECTOR_DIMS
        ) {
          throw new VoyageEmbedError(
            `Unerwartetes Embedding (dims=${item.embedding?.length ?? 0}, erwartet ${VECTOR_DIMS}).`,
          );
        }
      }

      return sorted.map((d) => d.embedding);
    } catch (err) {
      if (err instanceof VoyageEmbedError && attempt >= maxRetries) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        !(err instanceof VoyageEmbedError) ||
        /HTTP 429|HTTP 5\d\d/.test(err.message);
      if (retryable && attempt < maxRetries) {
        await sleep(Math.min(30_000, 500 * 2 ** (attempt - 1)));
        continue;
      }
      if (err instanceof VoyageEmbedError) throw err;
      throw new VoyageEmbedError(lastError.message);
    }
  }

  throw lastError ?? new VoyageEmbedError("Voyage-Request fehlgeschlagen");
}
