import { execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import dns from "node:dns/promises";
import { assertValidTarget } from "./host";
import { PING_INTERVAL_SEC } from "./budget";
import { summarizePing } from "./stats";
import type { PingSample, PingSummary } from "./types";

const execFileAsync = promisify(execFile);

const PING_LINE =
  /bytes from .*: icmp_seq=(\d+).*time[=<]([\d.]+) ms(?:.*ttl[=:](\d+))?/i;
const PING_LINE_TTL_FIRST =
  /bytes from .*: icmp_seq=(\d+)\s+ttl=(\d+)\s+time[=<]([\d.]+) ms/i;

export async function resolveIp(host: string): Promise<string | undefined> {
  try {
    const { address } = await dns.lookup(host, { family: 4 });
    return address;
  } catch {
    return undefined;
  }
}

export async function icmpPing(
  rawTarget: string,
  count = 8,
): Promise<PingSummary> {
  const target = assertValidTarget(rawTarget);
  const resolvedIp = await resolveIp(target);

  try {
    const { stdout } = await execFileAsync(
      "ping",
      ["-n", "-c", String(count), "-i", String(PING_INTERVAL_SEC), "-W", "1", target],
      { timeout: Math.max(8000, count * 500), maxBuffer: 32 * 1024 },
    );
    return summarizePing({
      target,
      method: "icmp",
      samples: parsePingStdout(stdout, count),
      resolvedIp,
    });
  } catch (error) {
    const err = error as { stdout?: string; message?: string };
    if (err.stdout) {
      const recovered = parsePingStdout(err.stdout, count);
      if (recovered.some((s) => s.rttMs != null)) {
        return summarizePing({
          target,
          method: "icmp",
          samples: recovered,
          resolvedIp,
        });
      }
    }
    const message = error instanceof Error ? error.message : "ping a échoué";
    return tcpPing(target, 443, count, message);
  }
}

function parsePingStdout(stdout: string, count: number): PingSample[] {
  const samples: PingSample[] = [];
  for (const line of stdout.split("\n")) {
    const ttlFirst = line.match(PING_LINE_TTL_FIRST);
    if (ttlFirst) {
      samples.push({
        seq: Number(ttlFirst[1]),
        ttl: Number(ttlFirst[2]),
        rttMs: Number(ttlFirst[3]),
        at: Date.now(),
      });
      continue;
    }
    const m = line.match(PING_LINE);
    if (m) {
      samples.push({
        seq: Number(m[1]),
        rttMs: Number(m[2]),
        ttl: m[3] ? Number(m[3]) : undefined,
        at: Date.now(),
      });
    }
  }
  if (samples.length < count) {
    const seen = new Set(samples.map((s) => s.seq));
    for (let seq = 1; seq <= count; seq++) {
      if (!seen.has(seq)) {
        samples.push({ seq, rttMs: null, at: Date.now() });
      }
    }
    samples.sort((a, b) => a.seq - b.seq);
  }
  return samples;
}

export async function tcpPing(
  rawTarget: string,
  port = 443,
  count = 6,
  fallbackFrom?: string,
): Promise<PingSummary> {
  const target = assertValidTarget(rawTarget);
  const resolvedIp = await resolveIp(target);
  const samples: PingSample[] = [];

  for (let seq = 1; seq <= count; seq++) {
    const rttMs = await tcpConnectRtt(resolvedIp ?? target, port);
    samples.push({ seq, rttMs, at: Date.now() });
  }

  return summarizePing({
    target,
    method: "tcp",
    samples,
    resolvedIp,
    error: fallbackFrom
      ? `ICMP indisponible (${fallbackFrom}). Mesure TCP :${port}.`
      : undefined,
  });
}

function tcpConnectRtt(host: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.connect({ host, port, timeout: 2500 });
    const done = (value: number | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.on("connect", () => done(performance.now() - started));
    socket.on("timeout", () => done(null));
    socket.on("error", () => done(null));
  });
}
