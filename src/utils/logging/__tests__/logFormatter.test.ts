import { describe, it, expect } from "vitest";
import { redactPii, PII_DENYLIST } from "../logFormatter";

describe("redactPii", () => {
  it("replaces every denylisted field with [REDACTED]", () => {
    const input: Record<string, unknown> = {
      userId: "abc-123",
      email: "user@example.com",
      phone: "+919876543210",
      content: "transcript text here",
      accessToken: "ya29.token",
      refreshToken: "1//refresh",
    };
    const out = redactPii(input);

    expect(out.userId).toBe("abc-123");
    expect(out.email).toBe("[REDACTED]");
    expect(out.phone).toBe("[REDACTED]");
    expect(out.content).toBe("[REDACTED]");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(out.refreshToken).toBe("[REDACTED]");
  });

  it("passes through safe fields unchanged", () => {
    const input = { meetingId: "m-1", userId: "u-1", status: "COMPLETED" };
    expect(redactPii(input)).toEqual(input);
  });

  it("handles empty object", () => {
    expect(redactPii({})).toEqual({});
  });

  it("covers all denylisted field names", () => {
    // Build a meta object with every denylisted key set to a detectable value.
    const meta: Record<string, unknown> = {};
    for (const field of PII_DENYLIST) {
      meta[field] = `plaintext-${field}`;
    }
    const out = redactPii(meta);
    for (const field of PII_DENYLIST) {
      expect(out[field]).toBe("[REDACTED]");
    }
  });

  it("does not mutate the original object", () => {
    const input = { email: "a@b.com", userId: "u1" };
    const original = { ...input };
    redactPii(input);
    expect(input).toEqual(original);
  });
});
