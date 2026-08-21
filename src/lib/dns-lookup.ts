import dns from "node:dns/promises";
import { DNS_NAMES } from "./targets";
import type { DnsResult } from "./types";

export async function lookupName(name: string): Promise<DnsResult> {
  const started = performance.now();
  try {
    const addresses = await dns.resolve4(name);
    return {
      name,
      addresses,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    };
  } catch (error) {
    return {
      name,
      addresses: [],
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      error: error instanceof Error ? error.message : "échec DNS",
    };
  }
}

export async function lookupPresetNames(): Promise<DnsResult[]> {
  return Promise.all(DNS_NAMES.map(lookupName));
}

export async function getGateway(): Promise<{
  gateway?: string;
  interface?: string;
  error?: string;
}> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("ip", ["-4", "route", "show", "default"], {
      timeout: 3000,
    });
    const match = stdout.match(/default via (\S+) dev (\S+)/);
    if (!match) return { error: "Aucune route par défaut IPv4." };
    return { gateway: match[1], interface: match[2] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "ip route a échoué",
    };
  }
}
