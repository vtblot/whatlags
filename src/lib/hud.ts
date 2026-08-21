import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";
import { PROCESS_SCAN_EVERY_MS } from "./budget";
import { discoverGamePeer } from "./game-peer";
import { icmpPing } from "./ping";
import { HUD_TOP_N } from "./overlay-budget";
import {
  describeProcess,
  isSpike,
  pickSuspect,
  shouldIgnoreProcess,
  type GamePeer,
  type HudFrame,
  type ProcRow,
  type SpikeSensitivity,
} from "./suspects";

const execFileAsync = promisify(execFile);

type NetMark = { at: number; rx: number; tx: number };

type GamePid = { pid: number; name: string; label: string };

type HeavyCache = {
  at: number;
  top: ProcRow[];
  gpuPct: number | null;
  vramPct: number | null;
  gamePids: GamePid[];
  peer: GamePeer | null;
};

type HudDelta = {
  lastNet: NetMark | null;
  lastTop: ProcRow[];
  lastRxMbps: number | null;
  lastMemPct: number | null;
  rttWindow: number[];
  lossStreak: number;
  heavy: HeavyCache | null;
};

const HUD_KEY = "__WHATLAGS_HUD__";

function hudDelta(): HudDelta {
  const g = globalThis as typeof globalThis & { [HUD_KEY]?: HudDelta };
  if (!g[HUD_KEY]) {
    g[HUD_KEY] = {
      lastNet: null,
      lastTop: [],
      lastRxMbps: null,
      lastMemPct: null,
      rttWindow: [],
      lossStreak: 0,
      heavy: null,
    };
  }
  return g[HUD_KEY];
}

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
      windowsHide: true,
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
        windowsHide: true,
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

function gamePidsFromList(
  list: Array<{ pid: number; name?: string; command?: string }>,
): GamePid[] {
  const out: GamePid[] = [];
  for (const p of list) {
    const name = (p.name || p.command || "process").toString();
    if (shouldIgnoreProcess(name)) continue;
    const { label, kind } = describeProcess(name);
    if (kind === "game") out.push({ pid: p.pid, name, label });
  }
  return out;
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

type GfxController = {
  utilizationGpu?: number | null;
  memoryUsed?: number | null;
  vram?: number | null;
};

function readGpu(gfx: { controllers?: GfxController[] } | null): {
  gpuPct: number | null;
  vramPct: number | null;
} {
  const controllers = gfx?.controllers ?? [];
  const gpuVals = controllers
    .map((c) => c.utilizationGpu)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  const gpuPct = gpuVals.length ? Math.round(Math.max(...gpuVals) * 10) / 10 : null;

  let vramPct: number | null = null;
  for (const c of controllers) {
    if (typeof c.memoryUsed === "number" && typeof c.vram === "number" && c.vram > 0) {
      const pct = (c.memoryUsed / c.vram) * 100;
      if (Number.isFinite(pct) && pct >= 0) {
        vramPct = Math.max(vramPct ?? 0, Math.round(pct * 10) / 10);
      }
    }
  }
  return { gpuPct, vramPct };
}

function readMemPct(mem: { total?: number; available?: number; used?: number }): number | null {
  const total = mem.total ?? 0;
  if (total <= 0) return null;
  const used =
    typeof mem.available === "number" ? total - mem.available : (mem.used ?? 0);
  const pct = (used / total) * 100;
  if (!Number.isFinite(pct) || pct < 0) return null;
  return Math.round(Math.min(100, pct) * 10) / 10;
}

async function captureHeavy(): Promise<HeavyCache> {
  const [conns, snapshot, gfx] = await Promise.all([
    connectionCounts(),
    si.processes(),
    si.graphics().catch(() => null),
  ]);
  const { gpuPct, vramPct } = readGpu(gfx);
  const gamePids = gamePidsFromList(snapshot.list);
  const peer = await discoverGamePeer(gamePids).catch(() => null);
  return {
    at: Date.now(),
    top: mapProcs(snapshot.list, conns),
    gpuPct,
    vramPct,
    gamePids,
    peer,
  };
}

export function cachedGamePids(): GamePid[] {
  return hudDelta().heavy?.gamePids ?? [];
}

export function cachedPeer(): GamePeer | null {
  return hudDelta().heavy?.peer ?? null;
}

export async function captureHud(
  target: string,
  opts?: { sensitivity?: SpikeSensitivity },
): Promise<HudFrame> {
  const at = Date.now();
  const d = hudDelta();
  const sensitivity = opts?.sensitivity ?? "normal";
  const [ping, nets, load, mem] = await Promise.all([
    icmpPing(target, 1),
    si.networkStats(),
    si.currentLoad(),
    si.mem(),
  ]);

  const totals = ifaceTotals(nets);
  let rxMbps: number | null = null;
  let txMbps: number | null = null;
  if (d.lastNet && at > d.lastNet.at) {
    const dt = (at - d.lastNet.at) / 1000;
    rxMbps = Math.max(0, ((totals.rx - d.lastNet.rx) * 8) / dt / 1_000_000);
    txMbps = Math.max(0, ((totals.tx - d.lastNet.tx) * 8) / dt / 1_000_000);
    rxMbps = Math.round(rxMbps * 10) / 10;
    txMbps = Math.round(txMbps * 10) / 10;
  }
  d.lastNet = { at, rx: totals.rx, tx: totals.tx };

  const rttMs = ping.avgMs;
  if (rttMs == null) d.lossStreak += 1;
  else {
    d.lossStreak = 0;
    d.rttWindow.push(rttMs);
    if (d.rttWindow.length > 20) d.rttWindow.shift();
  }
  const baselineMs = median(d.rttWindow.slice(0, -1));
  const spike = isSpike(rttMs, baselineMs, {
    sensitivity,
    lossStreak: d.lossStreak,
  });
  const loss = rttMs == null;

  const stale = !d.heavy || at - d.heavy.at >= PROCESS_SCAN_EVERY_MS;
  if (spike || stale) {
    d.heavy = await captureHeavy();
  }

  const top = d.heavy?.top ?? [];
  const gpuPct = d.heavy?.gpuPct ?? null;
  const vramPct = d.heavy?.vramPct ?? null;
  const memPct = readMemPct(mem);
  const suspect = pickSuspect({
    spike,
    rxMbps,
    txMbps,
    prevRxMbps: d.lastRxMbps,
    top,
    prevTop: d.lastTop,
    gpuPct,
    memPct,
    prevMemPct: d.lastMemPct,
  });

  d.lastTop = top;
  d.lastRxMbps = rxMbps;
  d.lastMemPct = memPct;

  return {
    at,
    target,
    rttMs,
    method: ping.method,
    rxMbps,
    txMbps,
    cpuPct: Math.round((load.currentLoad || 0) * 10) / 10,
    memPct,
    gpuPct,
    vramPct,
    spike,
    loss,
    baselineMs,
    top,
    suspect,
    peer: d.heavy?.peer ?? null,
    note: ping.error,
  };
}
