import { UserRoleEnum } from "@prisma/client";

export interface OnboardUserDTO {
  name: string;
  email: string;
  countryCode?: string;
  phoneNumber?: string;
  country?: string;
  state?: string;
}

export interface onboardNonAdminDTO extends OnboardUserDTO {
  roles: UserRoleEnum[];
  orgId: string;
}
