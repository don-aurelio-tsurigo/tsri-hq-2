/**
 * Voyage query embeddings for RAG search.
 * Document-side indexing used input_type: "document"; queries must use "query".
 */

export class VoyageEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoyageEmbedError";
  }
}

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-4";
const VECTOR_DIMS = 1024;

export function getVoyageModel(): string {
  return process.env.VOYAGE_MODEL?.trim() || DEFAULT_MODEL;
}

export function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new VoyageEmbedError("VOYAGE_API_KEY fehlt in der Umgebung.");
  }

  const model = getVoyageModel();
  let res: Response;
  try {
    res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model,
        input_type: "query",
      }),
    });
  } catch {
    throw new VoyageEmbedError("Voyage API nicht erreichbar.");
  }

  if (!res.ok) {
    throw new VoyageEmbedError(
      `Voyage Embedding fehlgeschlagen (HTTP ${res.status}).`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const emb = json.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== VECTOR_DIMS) {
    throw new VoyageEmbedError(
      `Unerwartetes Embedding (dims=${emb?.length ?? 0}, erwartet ${VECTOR_DIMS}).`,
    );
  }
  return emb;
}
