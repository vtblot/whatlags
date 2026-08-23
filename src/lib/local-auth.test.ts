import { describe, expect, it } from "vitest";
import {
  callerOrigin,
  isAllowedLocalOrigin,
  LOCAL_AGENT_ORIGINS,
} from "./local-auth";

describe("local origin allowlist", () => {
  it("allows the bound loopback origin and localhost equivalent", () => {
    expect(LOCAL_AGENT_ORIGINS).toContain("http://127.0.0.1:43147");
    expect(LOCAL_AGENT_ORIGINS).toContain("http://localhost:43147");
    expect(isAllowedLocalOrigin("http://127.0.0.1:43147", null)).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:43147", null)).toBe(true);
  });

  it("falls back to Referer when Origin is missing", () => {
    expect(
      isAllowedLocalOrigin(null, "http://127.0.0.1:43147/overlay?target=1.1.1.1"),
    ).toBe(true);
    expect(callerOrigin(null, "http://127.0.0.1:43147/foo")).toBe(
      "http://127.0.0.1:43147",
    );
  });

  it("rejects other origins, null origin, and missing headers", () => {
    expect(isAllowedLocalOrigin("https://evil.example", null)).toBe(false);
    expect(isAllowedLocalOrigin("http://127.0.0.1:80", null)).toBe(false);
    expect(isAllowedLocalOrigin("null", "http://127.0.0.1:43147/")).toBe(true);
    expect(isAllowedLocalOrigin("null", null)).toBe(false);
    expect(isAllowedLocalOrigin(null, null)).toBe(false);
  });
});
