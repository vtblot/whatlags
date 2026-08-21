import { describe, expect, it } from "vitest";
import { assertValidTarget, isBlockedTarget, isValidTarget, normalizeTarget } from "./host";

describe("normalizeTarget", () => {
  it("strips protocol, path and port", () => {
    expect(normalizeTarget(" https://riotgames.com:443/path ")).toBe("riotgames.com");
    expect(normalizeTarget("1.1.1.1")).toBe("1.1.1.1");
  });
});

describe("isValidTarget", () => {
  it("accepts ipv4 and hostnames", () => {
    expect(isValidTarget("1.1.1.1")).toBe(true);
    expect(isValidTarget("google.com")).toBe(true);
    expect(isValidTarget("eu.actual.battle.net")).toBe(true);
  });

  it("rejects empty, blocked and junk", () => {
    expect(isValidTarget("")).toBe(false);
    expect(isValidTarget("169.254.169.254")).toBe(false);
    expect(isValidTarget("not a host")).toBe(false);
    expect(isBlockedTarget("metadata.google.internal")).toBe(true);
  });

  it("assertValidTarget throws on junk", () => {
    expect(() => assertValidTarget("???")).toThrow(/Cible invalide/);
    expect(assertValidTarget("8.8.8.8")).toBe("8.8.8.8");
  });
});
