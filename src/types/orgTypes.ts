import { UserRoleEnum } from "@prisma/client";
export interface orgPayload {
  orgId: string;
  orgRoles: {
    orgMemberId: string;
    roleId: string;
    role: {
      roleName: UserRoleEnum | null;
      roleId: string;
    };
  }[];
  highestRole: UserRoleEnum;
}
