import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SESSION_FRAME_CAP } from "./budget";
import { ensureDataDirs, logFileForDay, logsDir, todayStamp } from "./paths";
import type { HudFrame } from "./suspects";

const execFileAsync = promisify(execFile);

export type JournalSnapshot = {
  dir: string;
  day: string;
  sessionSpikes: HudFrame[];
  sessionFrames: HudFrame[];
  disk: HudFrame[];
};

type JournalState = {
  frames: HudFrame[];
  spikes: HudFrame[];
};

const JOURNAL_KEY = "__WHATLAGS_JOURNAL__";

function state(): JournalState {
  const g = globalThis as typeof globalThis & { [JOURNAL_KEY]?: JournalState };
  if (!g[JOURNAL_KEY]) {
    g[JOURNAL_KEY] = { frames: [], spikes: [] };
  }
  return g[JOURNAL_KEY];
}

export function recordFrame(frame: HudFrame): void {
  const s = state();
  s.frames.push(frame);
  if (s.frames.length > SESSION_FRAME_CAP) s.frames.splice(0, s.frames.length - SESSION_FRAME_CAP);
  if (!frame.spike) return;
  s.spikes.push(frame);
  appendSpike(frame);
}

let queue: Promise<void> = Promise.resolve();

function appendSpike(frame: HudFrame): void {
  const line = `${JSON.stringify(frame)}\n`;
  const file = logFileForDay(todayStamp(frame.at));
  queue = queue
    .then(async () => {
      try {
        ensureDataDirs();
        await fs.promises.appendFile(file, line, "utf8");
      } catch {
        /* disk full / permissions — session still keeps the spike */
      }
    })
    .catch(() => undefined);
}

export function sessionFrames(): HudFrame[] {
  return state().frames;
}

export function sessionSpikes(): HudFrame[] {
  return state().spikes;
}

export function readDay(day: string): HudFrame[] {
  const file = logFileForDay(day);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const out: HudFrame[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as HudFrame);
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function snapshot(day = todayStamp()): JournalSnapshot {
  return {
    dir: logsDir(),
    day,
    sessionSpikes: sessionSpikes(),
    sessionFrames: sessionFrames(),
    disk: readDay(day),
  };
}

export async function openLogsDir(): Promise<string> {
  const dir = logsDir();
  ensureDataDirs();
  try {
    if (process.platform === "win32") {
      await execFileAsync("explorer.exe", [dir], { windowsHide: false });
    } else if (process.platform === "darwin") {
      await execFileAsync("open", [dir]);
    } else {
      await execFileAsync("xdg-open", [dir]);
    }
  } catch {
    /* explorer.exe often exits 1 after opening */
  }
  return dir;
}
