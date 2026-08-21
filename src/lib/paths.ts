import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SpikeSensitivity } from "./suspects";

export function dataDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), "WhatLags");
  }
  return path.join(os.homedir(), ".whatlags");
}

export function logsDir(): string {
  return path.join(dataDir(), "logs");
}

export function configPath(): string {
  return path.join(dataDir(), "config.json");
}

export function logFileForDay(day = todayStamp()): string {
  return path.join(logsDir(), `${day}.jsonl`);
}

export function todayStamp(at = Date.now()): string {
  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ensureDataDirs(): void {
  fs.mkdirSync(logsDir(), { recursive: true });
}

export type AgentConfig = {
  target: string;
  watch: boolean;
  sensitivity: SpikeSensitivity;
};

const SENSITIVITIES: SpikeSensitivity[] = ["sensitive", "normal", "calm"];

const DEFAULT_CONFIG: AgentConfig = {
  target: "1.1.1.1",
  watch: true,
  sensitivity: "normal",
};

function parseSensitivity(raw: unknown): SpikeSensitivity {
  return SENSITIVITIES.includes(raw as SpikeSensitivity)
    ? (raw as SpikeSensitivity)
    : DEFAULT_CONFIG.sensitivity;
}

export function readConfig(): AgentConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    return {
      target:
        typeof parsed.target === "string" && parsed.target.trim()
          ? parsed.target.trim()
          : DEFAULT_CONFIG.target,
      watch: parsed.watch !== false,
      sensitivity: parseSensitivity(parsed.sensitivity),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(next: AgentConfig): void {
  ensureDataDirs();
  fs.writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
