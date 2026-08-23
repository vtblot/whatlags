import { WATCH_INTERVAL_MS } from "./budget";
import { captureHud } from "./hud";
import { recordFrame } from "./journal";
import { isValidTarget, normalizeTarget } from "./host";
import { readConfig, writeConfig, type AgentConfig } from "./paths";
import {
  hasGameProcess,
  type HudFrame,
  type SpikeSensitivity,
  type WatchStatus,
} from "./suspects";

export type { WatchStatus };

type WatchRuntime = {
  running: boolean;
  looping: boolean;
  target: string;
  allowLan: boolean;
  sensitivity: SpikeSensitivity;
  latest: HudFrame | null;
  onFrame: ((frame: HudFrame) => void) | null;
};

const WATCH_KEY = "__WHATLAGS_WATCH__";

function runtime(): WatchRuntime {
  const g = globalThis as typeof globalThis & { [WATCH_KEY]?: WatchRuntime };
  if (!g[WATCH_KEY]) {
    const cfg = readConfig();
    const target = isValidTarget(cfg.target) ? cfg.target : "1.1.1.1";
    g[WATCH_KEY] = {
      running: cfg.watch,
      looping: false,
      target,
      allowLan: false,
      sensitivity: cfg.sensitivity,
      latest: null,
      onFrame: null,
    };
  }
  return g[WATCH_KEY];
}

function persist(): void {
  const rt = runtime();
  const next: AgentConfig = {
    target: rt.target,
    watch: rt.running,
    sensitivity: rt.sensitivity,
  };
  writeConfig(next);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(): Promise<void> {
  const rt = runtime();
  while (rt.looping) {
    if (!rt.running) {
      await sleep(400);
      continue;
    }
    const started = Date.now();
    try {
      const frame = await captureHud(rt.target, {
        sensitivity: rt.sensitivity,
        allowLan: rt.allowLan,
      });
      rt.latest = frame;
      recordFrame(frame);
      rt.onFrame?.(frame);
    } catch {
      /* next tick */
    }
    const wait = Math.max(0, WATCH_INTERVAL_MS - (Date.now() - started));
    await sleep(wait);
  }
}

export function getWatchStatus(): WatchStatus {
  const rt = runtime();
  return {
    running: rt.running,
    target: rt.target,
    latest: rt.latest,
    sensitivity: rt.sensitivity,
    gameRunning: hasGameProcess(rt.latest?.top ?? []),
  };
}

export function latestFrame(): HudFrame | null {
  return runtime().latest;
}

export function onWatchFrame(cb: ((frame: HudFrame) => void) | null): void {
  runtime().onFrame = cb;
}

export function setWatchAllowLan(allowLan: boolean): WatchStatus {
  const rt = runtime();
  rt.allowLan = allowLan;
  if (!isValidTarget(rt.target, { allowLan })) {
    rt.target = "1.1.1.1";
    rt.latest = null;
    persist();
  }
  return getWatchStatus();
}

export function setWatchTarget(raw: string, opts?: { allowLan?: boolean }): string {
  const host = normalizeTarget(raw);
  const allowLan = opts?.allowLan ?? runtime().allowLan;
  if (!isValidTarget(host, { allowLan })) {
    throw new Error("Cible invalide.");
  }
  const rt = runtime();
  if (rt.target === host) return host;
  rt.target = host;
  rt.latest = null;
  persist();
  return host;
}

export function setWatchSensitivity(sensitivity: SpikeSensitivity): WatchStatus {
  const rt = runtime();
  if (rt.sensitivity === sensitivity) return getWatchStatus();
  rt.sensitivity = sensitivity;
  persist();
  return getWatchStatus();
}

export function setWatchRunning(running: boolean): WatchStatus {
  const rt = runtime();
  if (rt.running === running) return getWatchStatus();
  rt.running = running;
  persist();
  return getWatchStatus();
}

/** Idempotent. First caller in this process owns the loop. */
export function startWatch(opts?: {
  target?: string;
  running?: boolean;
  sensitivity?: SpikeSensitivity;
}): WatchStatus {
  const rt = runtime();
  if (opts?.target) setWatchTarget(opts.target);
  if (opts?.running != null && opts.running !== rt.running) {
    rt.running = opts.running;
    persist();
  }
  if (opts?.sensitivity) setWatchSensitivity(opts.sensitivity);
  if (!rt.looping) {
    rt.looping = true;
    void loop();
  }
  return getWatchStatus();
}

export function stopWatch(): WatchStatus {
  return setWatchRunning(false);
}
