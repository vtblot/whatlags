import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertValidTarget } from "./host";
import { TRACE_MAX_HOPS, TRACE_TIMEOUT_MS } from "./budget";
import { mean, round1 } from "./stats";
import type { Hop, TracerouteResult } from "./types";

const execFileAsync = promisify(execFile);

export async function traceroute(rawTarget: string): Promise<TracerouteResult> {
  const target = assertValidTarget(rawTarget);

  try {
    const { stdout, stderr } = await execFileAsync(
      "traceroute",
      ["-n", "-q", "1", "-w", "1", "-m", String(TRACE_MAX_HOPS), target],
      { timeout: TRACE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
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

export function parseTraceroute(output: string): Hop[] {
  const hops: Hop[] = [];
  for (const line of output.split("\n")) {
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
