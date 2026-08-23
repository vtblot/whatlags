const TOKEN_HEADER = "x-whatlags-token";

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

async function loadLocalToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (!inflight) {
    inflight = fetch("/api/session", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || typeof data.token !== "string" || !data.token) {
          throw new Error(data.error || "Session locale impossible.");
        }
        cachedToken = data.token;
        return cachedToken;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function localPostInit(body: unknown): Promise<RequestInit> {
  const token = await loadLocalToken();
  return {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      [TOKEN_HEADER]: token,
    },
    body: JSON.stringify(body),
  };
}
