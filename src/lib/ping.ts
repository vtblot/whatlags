import { execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import dns from "node:dns/promises";
import { assertValidTarget } from "./host";
import { PING_INTERVAL_SEC } from "./budget";
import { summarizePing } from "./stats";
import type { PingSample, PingSummary } from "./types";

const execFileAsync = promisify(execFile);

const isWin = process.platform === "win32";

const PING_LINE =
  /bytes from .*: icmp_seq=(\d+).*time[=<]([\d.]+) ms(?:.*ttl[=:](\d+))?/i;
const PING_LINE_TTL_FIRST =
  /bytes from .*: icmp_seq=(\d+)\s+ttl=(\d+)\s+time[=<]([\d.]+) ms/i;
/** Windows EN/FR: `time=12ms TTL=56` / `temps=12 ms TTL=56` / `time<1ms`. */
const PING_LINE_WIN =
  /(?:time|temps)\s*[=<]\s*([\d.]+)\s*ms(?:\s*TTL=(\d+))?/i;

export async function resolveIp(host: string): Promise<string | undefined> {
  try {
    const { address } = await dns.lookup(host, { family: 4 });
    return address;
  } catch {
    return undefined;
  }
}

function pingArgs(count: number, target: string): string[] {
  if (isWin) {
    return ["-n", String(count), "-w", "1000", target];
  }
  return ["-n", "-c", String(count), "-i", String(PING_INTERVAL_SEC), "-W", "1", target];
}

async function runPing(target: string, count: number): Promise<string> {
  const timeout = isWin
    ? Math.max(4000, count * 2500)
    : Math.max(8000, count * 500);
  try {
    const { stdout } = await execFileAsync("ping", pingArgs(count, target), {
      timeout,
      maxBuffer: 32 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const err = error as { stdout?: string };
    return err.stdout ?? "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function icmpPing(
  rawTarget: string,
  count = 8,
): Promise<PingSummary> {
  const target = assertValidTarget(rawTarget);
  const resolvedIp = await resolveIp(target);

  let stdout: string;
  if (isWin && count > 1) {
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      chunks.push(await runPing(target, 1));
      if (i < count - 1) await sleep(PING_INTERVAL_SEC * 1000);
    }
    stdout = chunks.join("\n");
  } else {
    stdout = await runPing(target, count);
  }

  const samples = parsePingStdout(stdout, count);
  if (samples.some((s) => s.rttMs != null)) {
    return summarizePing({
      target,
      method: "icmp",
      samples,
      resolvedIp,
    });
  }

  return tcpPing(target, 443, count, stdout.trim() || "ping a échoué");
}

export function parsePingStdout(stdout: string, count: number): PingSample[] {
  const samples: PingSample[] = [];
  for (const line of stdout.split(/\r?\n/)) {
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
    const unix = line.match(PING_LINE);
    if (unix) {
      samples.push({
        seq: Number(unix[1]),
        rttMs: Number(unix[2]),
        ttl: unix[3] ? Number(unix[3]) : undefined,
        at: Date.now(),
      });
      continue;
    }
    const win = line.match(PING_LINE_WIN);
    if (win && !/bytes from/i.test(line)) {
      samples.push({
        seq: samples.length + 1,
        rttMs: Number(win[1]),
        ttl: win[2] ? Number(win[2]) : undefined,
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
  return samples.slice(0, count);
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
      ? `ICMP indisponible (${fallbackFrom.slice(0, 120)}). Mesure TCP :${port}.`
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
