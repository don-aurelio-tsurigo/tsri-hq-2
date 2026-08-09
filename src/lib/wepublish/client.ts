type GraphQLError = { message: string };

export class WepublishApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WepublishApiError";
  }
}

export function getWepublishApiUrl(): string {
  const base =
    process.env.WEPUBLISH_API_URL?.trim() ||
    "https://api-tsri.wepublish.cloud";
  return base.replace(/\/$/, "") + "/v1";
}

export async function wepublishGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = getWepublishApiUrl();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new WepublishApiError(
      "we.publish API ist nicht erreichbar. Bitte später erneut versuchen.",
    );
  }

  if (!response.ok) {
    throw new WepublishApiError(
      `we.publish API antwortete mit HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: GraphQLError[];
  };

  if (payload.errors?.length) {
    throw new WepublishApiError(
      payload.errors.map((e) => e.message).join("; ") ||
        "GraphQL-Fehler von we.publish.",
    );
  }

  if (!payload.data) {
    throw new WepublishApiError("Leere Antwort von we.publish.");
  }

  return payload.data;
}
