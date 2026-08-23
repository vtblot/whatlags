import { randomBytes } from "node:crypto";
import { AGENT_HOST, AGENT_PORT } from "./budget";

const TOKEN_KEY = "__WHATLAGS_LOCAL_TOKEN__";

export const LOCAL_TOKEN_HEADER = "x-whatlags-token";

export const LOCAL_AGENT_ORIGINS = [
  `http://${AGENT_HOST}:${AGENT_PORT}`,
  `http://localhost:${AGENT_PORT}`,
] as const;

type TokenStore = typeof globalThis & { [TOKEN_KEY]?: string };

/** In-memory token, generated once per process (boot / first import). */
export function getLocalAgentToken(): string {
  const g = globalThis as TokenStore;
  if (!g[TOKEN_KEY]) {
    g[TOKEN_KEY] = randomBytes(32).toString("hex");
  }
  return g[TOKEN_KEY];
}

export function callerOrigin(
  originHeader: string | null,
  referer: string | null,
): string | null {
  if (originHeader && originHeader !== "null") {
    try {
      return new URL(originHeader).origin;
    } catch {
      return null;
    }
  }
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export function isAllowedLocalOrigin(
  originHeader: string | null,
  referer: string | null,
): boolean {
  const origin = callerOrigin(originHeader, referer);
  return origin != null && (LOCAL_AGENT_ORIGINS as readonly string[]).includes(origin);
}

export function allowLanFromRequest(
  request: { nextUrl: { searchParams: URLSearchParams } },
  body?: { allowLan?: unknown; private?: unknown },
): boolean {
  if (body?.allowLan === true || body?.private === true) return true;
  const q =
    request.nextUrl.searchParams.get("allowLan") ??
    request.nextUrl.searchParams.get("private");
  return q === "1" || q === "true";
}

export function rejectUnlessLocalOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (isAllowedLocalOrigin(origin, referer)) return null;
  return Response.json({ error: "Origine non autorisée." }, { status: 403 });
}

export function rejectUnlessLocalWrite(request: Request): Response | null {
  const originDenied = rejectUnlessLocalOrigin(request);
  if (originDenied) return originDenied;
  const sent = request.headers.get(LOCAL_TOKEN_HEADER);
  if (!sent || sent !== getLocalAgentToken()) {
    return Response.json({ error: "Jeton local manquant." }, { status: 403 });
  }
  return null;
}
