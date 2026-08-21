import { describe, expect, it } from "vitest";
import {
  describeProcess,
  isSpike,
  pickSuspect,
  type ProcRow,
} from "./suspects";

function proc(partial: Partial<ProcRow> & Pick<ProcRow, "name" | "label" | "kind">): ProcRow {
  return {
    pid: 10,
    cpu: 0,
    memPct: 1,
    conns: 0,
    ...partial,
  };
}

describe("isSpike", () => {
  it("treats a single timeout as not a spike", () => {
    expect(isSpike(null, 20, { lossStreak: 1 })).toBe(false);
  });

  it("spikes after consecutive losses", () => {
    expect(isSpike(null, 20, { lossStreak: 2 })).toBe(true);
    expect(isSpike(null, 20, { sensitivity: "calm", lossStreak: 2 })).toBe(false);
    expect(isSpike(null, 20, { sensitivity: "calm", lossStreak: 3 })).toBe(true);
  });

  it("uses cold-start and relative margin", () => {
    expect(isSpike(90, null)).toBe(true);
    expect(isSpike(50, null)).toBe(false);
    expect(isSpike(60, 20)).toBe(true);
    expect(isSpike(30, 20)).toBe(false);
  });

  it("respects sensitive vs calm", () => {
    expect(isSpike(50, 30, { sensitivity: "sensitive" })).toBe(true);
    expect(isSpike(50, 30, { sensitivity: "calm" })).toBe(false);
  });
});

describe("describeProcess", () => {
  it("maps catalog names", () => {
    expect(describeProcess("League of Legends.exe").kind).toBe("game");
    expect(describeProcess("GeForce Experience.exe").label).toBe("NVIDIA Overlay");
    expect(describeProcess("EasyAntiCheat.exe").label).toBe("Easy Anti-Cheat");
  });
});

describe("pickSuspect", () => {
  const steam = proc({
    name: "steam.exe",
    label: "Steam",
    kind: "download",
    cpu: 4,
    pid: 1,
  });

  it("returns null when not a spike", () => {
    expect(pickSuspect({
      spike: false,
      rxMbps: 20,
      txMbps: 1,
      prevRxMbps: 0.1,
      top: [steam],
      prevTop: [],
    })).toBeNull();
  });

  it("blames bandwidth jump on a downloader", () => {
    const hit = pickSuspect({
      spike: true,
      rxMbps: 12,
      txMbps: 0.2,
      prevRxMbps: 0.2,
      top: [steam],
      prevTop: [steam],
    });
    expect(hit?.label).toBe("Steam");
    expect(hit?.confidence).toBe("high");
  });

  it("blames a cpu hog", () => {
    const chrome = proc({
      name: "chrome.exe",
      label: "Navigateur",
      kind: "browser",
      cpu: 28,
      pid: 2,
    });
    const hit = pickSuspect({
      spike: true,
      rxMbps: 0.1,
      txMbps: 0.1,
      prevRxMbps: 0.1,
      top: [chrome],
      prevTop: [{ ...chrome, cpu: 4 }],
    });
    expect(hit?.label).toBe("Navigateur");
  });
});
