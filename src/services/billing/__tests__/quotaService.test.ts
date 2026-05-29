import type { Request } from "express";
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock is hoisted above all imports, so the mock factory cannot close
// over a regular `const` declared at file scope (TDZ). vi.hoisted lifts the
// initializer alongside the mock so the spy is ready when the factory runs.
const { teamFindUniqueMock } = vi.hoisted(() => ({
  teamFindUniqueMock: vi.fn(),
}));

vi.mock("../../../db/prismaClient", () => ({
  default: {
    team: { findUnique: teamFindUniqueMock },
  },
}));

import { getQuotaOwner } from "../quotaService";

describe("getQuotaOwner", () => {
  beforeEach(() => {
    teamFindUniqueMock.mockReset();
  });

  it("returns userId unchanged when teamId is omitted", async () => {
    const result = await getQuotaOwner({ userId: "user-1" });
    expect(result).toBe("user-1");
    expect(teamFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns userId unchanged when teamId is null", async () => {
    const result = await getQuotaOwner({ userId: "user-1", teamId: null });
    expect(result).toBe("user-1");
    expect(teamFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns team.ownerId when the team is active", async () => {
    teamFindUniqueMock.mockResolvedValueOnce({
      ownerId: "owner-1",
      isDeleted: false,
    });

    const result = await getQuotaOwner({
      userId: "member-1",
      teamId: "team-1",
    });

    expect(result).toBe("owner-1");
    expect(teamFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "team-1" },
      select: { ownerId: true, isDeleted: true },
    });
  });

  it("throws AppError when the team is soft-deleted (no silent userId fallback)", async () => {
    teamFindUniqueMock.mockResolvedValueOnce({
      ownerId: "owner-1",
      isDeleted: true,
    });

    await expect(
      getQuotaOwner({ userId: "member-1", teamId: "team-deleted" }),
    ).rejects.toThrowError(/billing attribution/);
  });

  it("throws AppError when the team is missing entirely", async () => {
    teamFindUniqueMock.mockResolvedValueOnce(null);

    await expect(
      getQuotaOwner({ userId: "member-1", teamId: "team-missing" }),
    ).rejects.toThrowError(/billing attribution/);
  });

  it("memoises the lookup per Request — second call hits cache", async () => {
    teamFindUniqueMock.mockResolvedValueOnce({
      ownerId: "owner-1",
      isDeleted: false,
    });

    // Minimal Request-shaped object — the symbol-keyed cache only needs
    // somewhere to attach properties.
    const req = {} as Request;

    const first = await getQuotaOwner({
      userId: "member-1",
      teamId: "team-1",
      req,
    });
    const second = await getQuotaOwner({
      userId: "member-1",
      teamId: "team-1",
      req,
    });

    expect(first).toBe("owner-1");
    expect(second).toBe("owner-1");
    expect(teamFindUniqueMock).toHaveBeenCalledTimes(1);
  });

  it("does not bleed cache across two distinct Request objects", async () => {
    teamFindUniqueMock
      .mockResolvedValueOnce({ ownerId: "owner-1", isDeleted: false })
      .mockResolvedValueOnce({ ownerId: "owner-2", isDeleted: false });

    const reqA = {} as Request;
    const reqB = {} as Request;

    const fromA = await getQuotaOwner({
      userId: "member-1",
      teamId: "team-x",
      req: reqA,
    });
    const fromB = await getQuotaOwner({
      userId: "member-1",
      teamId: "team-x",
      req: reqB,
    });

    expect(fromA).toBe("owner-1");
    expect(fromB).toBe("owner-2");
    expect(teamFindUniqueMock).toHaveBeenCalledTimes(2);
  });
});
