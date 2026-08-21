import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertValidTarget } from "./host";
import { TRACE_MAX_HOPS, TRACE_TIMEOUT_MS } from "./budget";
import { mean, round1 } from "./stats";
import type { Hop, TracerouteResult } from "./types";

const execFileAsync = promisify(execFile);
const isWin = process.platform === "win32";

export async function traceroute(rawTarget: string): Promise<TracerouteResult> {
  const target = assertValidTarget(rawTarget);

  if (isWin) {
    return windowsTracert(target);
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "traceroute",
      ["-n", "-q", "1", "-w", "1", "-m", String(TRACE_MAX_HOPS), target],
      { timeout: TRACE_TIMEOUT_MS, maxBuffer: 64 * 1024, windowsHide: true },
    );
    const hops = parseTraceroute(`${stdout}\n${stderr}`);
    return { target, hops };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const hops = parseTraceroute(`${err.stdout ?? ""}\n${err.stderr ?? ""}`);
    if (hops.length > 0) {
      return { target, hops };
    }
    return {
      target,
      hops: [],
      error: err.message ?? "traceroute a échoué",
    };
  }
}

async function windowsTracert(target: string): Promise<TracerouteResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "tracert",
      ["-d", "-h", String(TRACE_MAX_HOPS), "-w", "1000", target],
      {
        timeout: Math.max(TRACE_TIMEOUT_MS, TRACE_MAX_HOPS * 4000),
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    const hops = parseTracert(`${stdout}\n${stderr}`);
    return { target, hops };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const hops = parseTracert(`${err.stdout ?? ""}\n${err.stderr ?? ""}`);
    if (hops.length > 0) {
      return { target, hops };
    }
    return {
      target,
      hops: [],
      error: err.message ?? "tracert a échoué",
    };
  }
}

/** Unix `traceroute -n`. */
export function parseTraceroute(output: string): Hop[] {
  const hops: Hop[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const hopMatch = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!hopMatch) continue;

    const hop = Number(hopMatch[1]);
    const rest = hopMatch[2].trim();
    if (rest === "*" || rest.startsWith("*")) {
      hops.push({ hop, host: null, rttsMs: [null], avgMs: null });
      continue;
    }

    const hostMatch = rest.match(/^(\S+)/);
    const host = hostMatch?.[1] ?? null;
    const rtts = [...rest.matchAll(/(\d+(?:\.\d+)?)\s*ms/g)].map((m) =>
      Number(m[1]),
    );
    const rttsMs = rtts.length > 0 ? rtts : [null];
    const numeric = rttsMs.filter((v): v is number => v != null);
    hops.push({
      hop,
      host,
      rttsMs,
      avgMs: numeric.length ? round1(mean(numeric)!) : null,
    });
  }
  return hops;
}

/** Windows `tracert -d`: `1    2 ms    1 ms    1 ms  192.168.1.1`. */
export function parseTracert(output: string): Hop[] {
  const hops: Hop[] = [];
  for (const line of output.split(/\r?\n/)) {
    const hopMatch = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!hopMatch) continue;
    const hop = Number(hopMatch[1]);
    const rest = hopMatch[2];
    const rttsMs: Array<number | null> = [];
    const tokenRe = /<\s*1\s*ms|(\d+)\s*ms|\*/gi;
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(rest)) && rttsMs.length < 3) {
      if (m[0].includes("*")) rttsMs.push(null);
      else if (/<\s*1/i.test(m[0])) rttsMs.push(1);
      else rttsMs.push(Number(m[1]));
    }
    if (rttsMs.length === 0) continue;
    const ip = rest.match(/(\d{1,3}(?:\.\d{1,3}){3})\s*$/);
    const timedOut = /timed out|délai d['’]attente|request timed out/i.test(rest);
    const numeric = rttsMs.filter((v): v is number => v != null);
    hops.push({
      hop,
      host: ip?.[1] ?? (timedOut || numeric.length === 0 ? null : rest.trim().split(/\s+/).pop() ?? null),
      rttsMs,
      avgMs: numeric.length ? round1(mean(numeric)!) : null,
    });
  }
  return hops;
}
