import type { PingSample, PingSummary, ProbeMethod } from "./types";

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg == null) return null;
  const variance =
    values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Mean consecutive difference — closer to “felt” jitter than stddev. */
export function jitter(values: number[]): number | null {
  if (values.length < 2) return null;
  let total = 0;
  for (let i = 1; i < values.length; i++) {
    total += Math.abs(values[i] - values[i - 1]);
  }
  return total / (values.length - 1);
}

export function summarizePing(input: {
  target: string;
  method: ProbeMethod;
  samples: PingSample[];
  resolvedIp?: string;
  error?: string;
}): PingSummary {
  const rtts = input.samples
    .map((s) => s.rttMs)
    .filter((v): v is number => v != null);
  const transmitted = input.samples.length;
  const received = rtts.length;
  const lossPct =
    transmitted === 0 ? 100 : round1(((transmitted - received) / transmitted) * 100);

  return {
    target: input.target,
    resolvedIp: input.resolvedIp,
    method: input.method,
    transmitted,
    received,
    lossPct,
    minMs: rtts.length ? round1(Math.min(...rtts)) : null,
    avgMs: rtts.length ? round1(mean(rtts)!) : null,
    maxMs: rtts.length ? round1(Math.max(...rtts)) : null,
    jitterMs: jitter(rtts) != null ? round1(jitter(rtts)!) : null,
    stddevMs: stddev(rtts) != null ? round1(stddev(rtts)!) : null,
    samples: input.samples,
    error: input.error,
  };
}

export function latencyTone(ms: number | null): "good" | "ok" | "playable" | "bad" | "dead" {
  if (ms == null) return "dead";
  if (ms < 30) return "good";
  if (ms < 50) return "ok";
  if (ms < 80) return "playable";
  return "bad";
}

export function formatMs(ms: number | null, digits = 1): string {
  if (ms == null) return "—";
  return `${ms.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ms`;
}

export function formatPct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} %`;
}
