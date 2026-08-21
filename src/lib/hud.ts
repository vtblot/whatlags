import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";
import { icmpPing } from "./ping";
import { HUD_TOP_N } from "./overlay-budget";
import {
  describeProcess,
  isSpike,
  pickSuspect,
  shouldIgnoreProcess,
  type HudFrame,
  type ProcRow,
} from "./suspects";

const execFileAsync = promisify(execFile);

type NetMark = { at: number; rx: number; tx: number };

let lastNet: NetMark | null = null;
let lastTop: ProcRow[] = [];
let lastRxMbps: number | null = null;
const rttWindow: number[] = [];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
}

async function connectionCounts(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    const { stdout } = await execFileAsync("ss", ["-tnp"], {
      timeout: 600,
      maxBuffer: 256 * 1024,
    });
    for (const line of stdout.split("\n")) {
      const m = line.match(/pid=(\d+)/);
      if (!m) continue;
      const pid = Number(m[1]);
      map.set(pid, (map.get(pid) ?? 0) + 1);
    }
  } catch {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ano"], {
        timeout: 800,
        maxBuffer: 256 * 1024,
      });
      for (const line of stdout.split("\n")) {
        if (!/\b(ESTABLISHED|LISTEN)\b/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        map.set(pid, (map.get(pid) ?? 0) + 1);
      }
    } catch {
      /* overlay still works without per-pid sockets */
    }
  }
  return map;
}

function mapProcs(
  list: Array<{ pid: number; name?: string; command?: string; cpu?: number; mem?: number }>,
  conns: Map<number, number>,
): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const p of list) {
    const name = (p.name || p.command || "process").toString();
    if (shouldIgnoreProcess(name)) continue;
    const { label, kind } = describeProcess(name);
    rows.push({
      pid: p.pid,
      name,
      label,
      cpu: Math.round((p.cpu || 0) * 10) / 10,
      memPct: Math.round((p.mem || 0) * 10) / 10,
      conns: conns.get(p.pid) ?? 0,
      kind,
    });
  }
  const collapsed = new Map<string, ProcRow>();
  for (const p of rows) {
    const cur = collapsed.get(p.label);
    if (!cur) {
      collapsed.set(p.label, { ...p });
    } else {
      cur.cpu = Math.round((cur.cpu + p.cpu) * 10) / 10;
      cur.memPct = Math.round((cur.memPct + p.memPct) * 10) / 10;
      cur.conns += p.conns;
    }
  }
  return [...collapsed.values()]
    .sort((a, b) => b.cpu + b.conns * 0.05 - (a.cpu + a.conns * 0.05))
    .slice(0, HUD_TOP_N);
}

function ifaceTotals(
  stats: Array<{ iface: string; rx_bytes: number; tx_bytes: number }>,
): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const s of stats) {
    if (s.iface === "lo" || s.iface.startsWith("lo")) continue;
    rx += s.rx_bytes || 0;
    tx += s.tx_bytes || 0;
  }
  return { rx, tx };
}

export async function captureHud(target: string): Promise<HudFrame> {
  const at = Date.now();
  const [ping, nets, conns, load, snapshot] = await Promise.all([
    icmpPing(target, 1),
    si.networkStats(),
    connectionCounts(),
    si.currentLoad(),
    si.processes(),
  ]);
  const top = mapProcs(snapshot.list, conns);

  const totals = ifaceTotals(nets);
  let rxMbps: number | null = null;
  let txMbps: number | null = null;
  if (lastNet && at > lastNet.at) {
    const dt = (at - lastNet.at) / 1000;
    rxMbps = Math.max(0, ((totals.rx - lastNet.rx) * 8) / dt / 1_000_000);
    txMbps = Math.max(0, ((totals.tx - lastNet.tx) * 8) / dt / 1_000_000);
    rxMbps = Math.round(rxMbps * 10) / 10;
    txMbps = Math.round(txMbps * 10) / 10;
  }
  lastNet = { at, rx: totals.rx, tx: totals.tx };

  const rttMs = ping.avgMs;
  if (rttMs != null) {
    rttWindow.push(rttMs);
    if (rttWindow.length > 20) rttWindow.shift();
  }
  const baselineMs = median(rttWindow.slice(0, -1));
  const spike = isSpike(rttMs, baselineMs);
  const suspect = pickSuspect({
    spike,
    rxMbps,
    txMbps,
    prevRxMbps: lastRxMbps,
    top,
    prevTop: lastTop,
  });

  lastTop = top;
  lastRxMbps = rxMbps;

  return {
    at,
    target,
    rttMs,
    method: ping.method,
    rxMbps,
    txMbps,
    cpuPct: Math.round((load.currentLoad || 0) * 10) / 10,
    spike,
    baselineMs,
    top,
    suspect,
    note: ping.error,
  };
}
