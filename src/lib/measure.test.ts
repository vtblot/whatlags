import { describe, expect, it } from "vitest";
import { gradeBufferbloat } from "./bufferbloat";
import { isPublicIPv4, parseNetstatUdp, pickPeer } from "./game-peer";
import { analyze } from "./analyze";
import type { PingSummary } from "./types";

describe("gradeBufferbloat", () => {
  it("maps deltas to grades", () => {
    expect(gradeBufferbloat(null)).toBe("?");
    expect(gradeBufferbloat(10)).toBe("A");
    expect(gradeBufferbloat(45)).toBe("B");
    expect(gradeBufferbloat(90)).toBe("C");
    expect(gradeBufferbloat(150)).toBe("D");
    expect(gradeBufferbloat(250)).toBe("F");
  });
});

describe("game-peer", () => {
  it("filters public ipv4", () => {
    expect(isPublicIPv4("1.1.1.1")).toBe(true);
    expect(isPublicIPv4("192.168.1.1")).toBe(false);
    expect(isPublicIPv4("10.0.0.5")).toBe(false);
    expect(isPublicIPv4("8.8.8.8")).toBe(true);
  });

  it("picks the most frequent game udp peer", () => {
    const stdout = [
      "UDP    192.168.1.5:50123    104.160.141.3:5000    4242",
      "UDP    192.168.1.5:50124    104.160.141.3:5001    4242",
      "UDP    192.168.1.5:50125    1.1.1.1:53           99",
    ].join("\n");
    const rows = parseNetstatUdp(stdout);
    const peer = pickPeer(rows, [{ pid: 4242, label: "Riot" }]);
    expect(peer?.ip).toBe("104.160.141.3");
    expect(peer?.process).toBe("Riot");
    expect(peer?.samples).toBe(2);
  });
});

function ping(target: string, avgMs: number): PingSummary {
  return {
    target,
    method: "icmp",
    transmitted: 6,
    received: 6,
    lossPct: 0,
    minMs: avgMs - 1,
    avgMs,
    maxMs: avgMs + 1,
    jitterMs: 1,
    stddevMs: 1,
    samples: [],
  };
}

describe("analyze origin", () => {
  it("skips origin-server for local agent", () => {
    const local = analyze({ pings: [ping("1.1.1.1", 18)], origin: "local" });
    expect(local.findings.some((f) => f.id === "origin-server")).toBe(false);
    const remote = analyze({ pings: [ping("1.1.1.1", 18)], origin: "server" });
    expect(remote.findings.some((f) => f.id === "origin-server")).toBe(true);
  });
});
