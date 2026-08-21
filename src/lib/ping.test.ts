import { describe, expect, it } from "vitest";
import { parsePingStdout } from "./ping";

describe("parsePingStdout", () => {
  it("parses unix ping lines", () => {
    const stdout = [
      "PING 1.1.1.1 (1.1.1.1): 56 data bytes",
      "64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms",
      "64 bytes from 1.1.1.1: icmp_seq=2 ttl=57 time=11.1 ms",
    ].join("\n");
    const samples = parsePingStdout(stdout, 2);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.rttMs).toBe(12.4);
    expect(samples[1]?.rttMs).toBe(11.1);
  });

  it("parses windows FR/EN time lines and pads losses", () => {
    const stdout = [
      "Envoi d'une requête 'Ping' 1.1.1.1",
      "Réponse de 1.1.1.1 : octets=32 temps=18 ms TTL=56",
      "Délai d'attente de la demande dépassé.",
    ].join("\n");
    const samples = parsePingStdout(stdout, 2);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.rttMs).toBe(18);
    expect(samples.some((s) => s.rttMs == null)).toBe(true);
  });
});
