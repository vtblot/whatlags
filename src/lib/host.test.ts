import { describe, expect, it } from "vitest";
import {
  assertValidTarget,
  isBlockedTarget,
  isCloudMetadataHost,
  isPrivateLanHost,
  isValidTarget,
  normalizeTarget,
} from "./host";

describe("normalizeTarget", () => {
  it("strips protocol, path and port", () => {
    expect(normalizeTarget(" https://riotgames.com:443/path ")).toBe("riotgames.com");
    expect(normalizeTarget("1.1.1.1")).toBe("1.1.1.1");
  });
});

describe("isValidTarget", () => {
  it("accepts public ipv4 and hostnames", () => {
    expect(isValidTarget("1.1.1.1")).toBe(true);
    expect(isValidTarget("8.8.8.8")).toBe(true);
    expect(isValidTarget("google.com")).toBe(true);
    expect(isValidTarget("eu.actual.battle.net")).toBe(true);
  });

  it("rejects empty, metadata and junk", () => {
    expect(isValidTarget("")).toBe(false);
    expect(isValidTarget("169.254.169.254")).toBe(false);
    expect(isValidTarget("not a host")).toBe(false);
    expect(isBlockedTarget("metadata.google.internal")).toBe(true);
    expect(isCloudMetadataHost("169.254.169.254")).toBe(true);
  });

  it("rejects RFC1918 and loopback unless allowLan", () => {
    expect(isPrivateLanHost("192.168.1.1")).toBe(true);
    expect(isPrivateLanHost("10.0.0.1")).toBe(true);
    expect(isPrivateLanHost("172.16.0.1")).toBe(true);
    expect(isPrivateLanHost("127.0.0.1")).toBe(true);
    expect(isPrivateLanHost("localhost")).toBe(true);
    expect(isPrivateLanHost("1.1.1.1")).toBe(false);

    expect(isValidTarget("192.168.1.1")).toBe(false);
    expect(isValidTarget("10.1.2.3")).toBe(false);
    expect(isValidTarget("172.31.255.1")).toBe(false);
    expect(isValidTarget("127.0.0.1")).toBe(false);
    expect(isValidTarget("localhost")).toBe(false);

    expect(isValidTarget("172.15.0.1")).toBe(true);
    expect(isValidTarget("192.168.1.1", { allowLan: true })).toBe(true);
    expect(isValidTarget("127.0.0.1", { allowLan: true })).toBe(true);
    expect(isValidTarget("localhost", { allowLan: true })).toBe(true);
  });

  it("keeps metadata blocked even with allowLan", () => {
    expect(isValidTarget("169.254.169.254", { allowLan: true })).toBe(false);
    expect(isValidTarget("metadata.google.internal", { allowLan: true })).toBe(false);
    expect(isBlockedTarget("169.254.0.1", { allowLan: true })).toBe(true);
  });

  it("assertValidTarget throws on junk and LAN by default", () => {
    expect(() => assertValidTarget("???")).toThrow(/Cible invalide/);
    expect(() => assertValidTarget("192.168.0.1")).toThrow(/LAN\/loopback/);
    expect(assertValidTarget("8.8.8.8")).toBe("8.8.8.8");
    expect(assertValidTarget("192.168.0.1", { allowLan: true })).toBe("192.168.0.1");
  });
});
