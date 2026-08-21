const HOST_RE =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google.internal.",
  "instance-data",
]);

export function normalizeTarget(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0] ?? "";
}

export function isBlockedTarget(target: string): boolean {
  const host = normalizeTarget(target).toLowerCase();
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host === "169.254.169.254" || host.startsWith("169.254.")) return true;
  return false;
}

export function isValidTarget(raw: string): boolean {
  const host = normalizeTarget(raw);
  if (!host || isBlockedTarget(host)) return false;
  return IPV4_RE.test(host) || HOST_RE.test(host);
}

export function assertValidTarget(raw: string): string {
  const host = normalizeTarget(raw);
  if (!isValidTarget(host)) {
    throw new Error("Cible invalide. Utilise un nom d’hôte ou une IPv4 (ex. 1.1.1.1, google.com).");
  }
  return host;
}
