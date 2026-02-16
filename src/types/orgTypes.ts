import { UserRoleEnum } from "@prisma/client";

export interface orgPayload {
  orgId: string;
  orgMemberId: string;
  accessLevel: UserRoleEnum;
}
