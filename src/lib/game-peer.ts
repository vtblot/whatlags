import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GamePeer } from "./suspects";

const execFileAsync = promisify(execFile);

export type UdpPeerRow = {
  pid: number;
  ip: string;
  port: number | null;
};

const SKIP_PORTS = new Set([53, 80, 123, 443, 853, 1900, 5353, 5355]);

export function isPublicIPv4(ip: string): boolean {
  if (!/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(ip)) {
    return false;
  }
  const a = Number(ip.split(".")[0]);
  const b = Number(ip.split(".")[1]);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

export function parseNetstatUdp(stdout: string): UdpPeerRow[] {
  const rows: UdpPeerRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!/\bUDP\b/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const foreign = parts[2] ?? "";
    const pid = Number(parts[parts.length - 1]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const ip = foreign.split(":")[0]?.replace(/[\[\]]/g, "") ?? "";
    const portRaw = foreign.includes(":") ? foreign.slice(foreign.lastIndexOf(":") + 1) : "";
    const port = Number(portRaw);
    if (!isPublicIPv4(ip)) continue;
    if (Number.isFinite(port) && SKIP_PORTS.has(port)) continue;
    rows.push({
      pid,
      ip,
      port: Number.isFinite(port) ? port : null,
    });
  }
  return rows;
}

export function pickPeer(
  rows: UdpPeerRow[],
  gamePids: Array<{ pid: number; label: string }>,
): GamePeer | null {
  const gamePidSet = new Set(gamePids.map((g) => g.pid));
  const pidLabel = new Map(gamePids.map((g) => [g.pid, g.label]));
  const scoped = gamePidSet.size
    ? rows.filter((r) => gamePidSet.has(r.pid))
    : rows;
  if (scoped.length === 0) return null;

  const counts = new Map<string, { n: number; port: number | null; pid: number }>();
  for (const row of scoped) {
    const cur = counts.get(row.ip);
    if (!cur) counts.set(row.ip, { n: 1, port: row.port, pid: row.pid });
    else cur.n += 1;
  }
  const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  if (!best) return null;
  const [ip, meta] = best;
  return {
    ip,
    port: meta.port,
    process: pidLabel.get(meta.pid) ?? "jeu",
    samples: meta.n,
  };
}

async function netstatUdp(): Promise<string> {
  const args =
    process.platform === "win32" ? ["-ano", "-p", "UDP"] : ["-anup"];
  const { stdout } = await execFileAsync("netstat", args, {
    timeout: 1200,
    maxBuffer: 512 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function powershellUdp(): Promise<string> {
  const { stdout } = await execFileAsync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-NetUDPEndpoint | Where-Object { $_.RemoteAddress } | ForEach-Object { 'UDP {0} {1}:{2} {3}' -f 'x', $_.RemoteAddress, $_.RemotePort, $_.OwningProcess }",
    ],
    { timeout: 1500, maxBuffer: 256 * 1024, windowsHide: true },
  );
  return stdout;
}

export async function listUdpPeers(): Promise<UdpPeerRow[]> {
  try {
    const parsed = parseNetstatUdp(await netstatUdp());
    if (parsed.length > 0) return parsed;
  } catch {
    /* fallback */
  }
  if (process.platform === "win32") {
    try {
      return parseNetstatUdp(await powershellUdp());
    } catch {
      return [];
    }
  }
  return [];
}

export async function discoverGamePeer(
  gamePids: Array<{ pid: number; label: string }>,
): Promise<GamePeer | null> {
  const rows = await listUdpPeers();
  return pickPeer(rows, gamePids);
}
