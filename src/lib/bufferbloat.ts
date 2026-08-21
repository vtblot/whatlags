import { icmpPing } from "./ping";
import { round1 } from "./stats";
import { BLOAT_BYTES, BLOAT_MS, PING_BURST_COUNT } from "./budget";
import type { BufferbloatGrade, BufferbloatResult } from "./types";

const LOAD_URL = `https://speed.cloudflare.com/__down?bytes=${BLOAT_BYTES}`;

export function gradeBufferbloat(deltaMs: number | null): BufferbloatGrade {
  if (deltaMs == null) return "?";
  if (deltaMs < 30) return "A";
  if (deltaMs < 60) return "B";
  if (deltaMs < 120) return "C";
  if (deltaMs < 200) return "D";
  return "F";
}

async function downloadAndDiscard(signal: AbortSignal): Promise<void> {
  const res = await fetch(LOAD_URL, { cache: "no-store", signal });
  const reader = res.body?.getReader();
  if (!reader) return;
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function runBufferbloat(
  target = "1.1.1.1",
): Promise<BufferbloatResult> {
  const idle = await icmpPing(target, PING_BURST_COUNT);

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), BLOAT_MS);
  const download = downloadAndDiscard(controller.signal).catch(() => undefined);

  const loaded = await icmpPing(target, PING_BURST_COUNT);
  controller.abort();
  clearTimeout(killer);
  await download;

  const idleAvgMs = idle.avgMs;
  const loadedAvgMs = loaded.avgMs;
  const deltaMs =
    idleAvgMs != null && loadedAvgMs != null
      ? round1(Math.max(0, loadedAvgMs - idleAvgMs))
      : null;

  return {
    target,
    idleAvgMs,
    loadedAvgMs,
    deltaMs,
    grade: gradeBufferbloat(deltaMs),
    idle,
    loaded,
  };
}
