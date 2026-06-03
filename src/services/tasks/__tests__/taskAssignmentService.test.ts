import { describe, it, expect, beforeEach, vi } from "vitest";

const { teamMemberFindFirstMock, userFindUniqueMock } = vi.hoisted(() => ({
  teamMemberFindFirstMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("../../../db/prismaClient", () => ({
  default: {
    teamMember: { findFirst: teamMemberFindFirstMock },
    user: { findUnique: userFindUniqueMock },
  },
}));

import { assertAssigneeIsMember } from "../taskAssignmentService";

describe("assertAssigneeIsMember", () => {
  beforeEach(() => {
    teamMemberFindFirstMock.mockReset();
    userFindUniqueMock.mockReset();
  });

  it("returns assignee name when member is active", async () => {
    teamMemberFindFirstMock.mockResolvedValue({ role: "MEMBER" });
    userFindUniqueMock.mockResolvedValue({ name: "Alice Smith" });

    const name = await assertAssigneeIsMember("user-1", "team-1");
    expect(name).toBe("Alice Smith");
  });

  it("falls back to 'Team member' when user has no name", async () => {
    teamMemberFindFirstMock.mockResolvedValue({ role: "MEMBER" });
    userFindUniqueMock.mockResolvedValue({ name: null });

    const name = await assertAssigneeIsMember("user-1", "team-1");
    expect(name).toBe("Team member");
  });

  it("throws 400 when assignee is not a team member", async () => {
    teamMemberFindFirstMock.mockResolvedValue(null);

    await expect(assertAssigneeIsMember("user-1", "team-1")).rejects.toMatchObject({
      statusCode: 400,
      message: "Assignee is not a member of this team",
    });
  });
});
