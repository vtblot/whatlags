const HOST_RE =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google.internal.",
  "instance-data",
]);

export type TargetOptions = {
  /** When false (default), RFC1918 and loopback targets are rejected. */
  allowLan?: boolean;
};

export function normalizeTarget(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0] ?? "";
}

function ipv4Octets(host: string): [number, number, number, number] | null {
  if (!IPV4_RE.test(host)) return null;
  const parts = host.split(".").map(Number);
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

/** Cloud / link-local metadata. Always blocked, even with allowLan. */
export function isCloudMetadataHost(target: string): boolean {
  const host = normalizeTarget(target).toLowerCase();
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host === "169.254.169.254" || host.startsWith("169.254.")) return true;
  return false;
}

/** RFC1918 or IPv4/hostname loopback. */
export function isPrivateLanHost(target: string): boolean {
  const host = normalizeTarget(target).toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "localhost.") return true;
  const o = ipv4Octets(host);
  if (!o) return false;
  const [a, b] = o;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isBlockedTarget(target: string, opts?: TargetOptions): boolean {
  const host = normalizeTarget(target).toLowerCase();
  if (!host) return true;
  if (isCloudMetadataHost(host)) return true;
  if (!opts?.allowLan && isPrivateLanHost(host)) return true;
  return false;
}

export function isValidTarget(raw: string, opts?: TargetOptions): boolean {
  const host = normalizeTarget(raw);
  if (!host || isBlockedTarget(host, opts)) return false;
  return IPV4_RE.test(host) || HOST_RE.test(host);
}

export function assertValidTarget(raw: string, opts?: TargetOptions): string {
  const host = normalizeTarget(raw);
  if (isCloudMetadataHost(host) || !host) {
    throw new Error("Cible invalide. Utilise un nom d’hôte ou une IPv4 (ex. 1.1.1.1, google.com).");
  }
  if (!opts?.allowLan && isPrivateLanHost(host)) {
    throw new Error("Cible LAN/loopback bloquée. Active « Autoriser LAN / privé ».");
  }
  if (!isValidTarget(host, opts)) {
    throw new Error("Cible invalide. Utilise un nom d’hôte ou une IPv4 (ex. 1.1.1.1, google.com).");
  }
  return host;
}
