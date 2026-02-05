import { Prisma, LoginMethod, ProviderEnum } from "@prisma/client";
import { User } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { tokenService } from "./tokenService";
import { sessionService } from "./sessionService";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  TokenResponse,
  UserResponse,
  RefreshTokenRequest,
  LogoutRequest,
} from "../../types/authTypes";

type UserWithOrganizations = Prisma.UserGetPayload<{
  include: {
    organizationMembers: {
      include: {
        organization: true;
        userRoles: {
          include: {
            role: true;
          };
        };
      };
    };
  };
}>;

type OrganizationMemberWithDetails =
  UserWithOrganizations["organizationMembers"][number];
type UserRoleWithPermissions =
  OrganizationMemberWithDetails["userRoles"][number];

class AuthService {
  async refreshToken(
    data: RefreshTokenRequest,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const result = await sessionService.refreshTokens(
      data.refreshToken,
      ipAddress,
    );
    return result;
  }

  async logout(
    userId: string,
    data?: LogoutRequest,
    currentSessionId?: string,
  ): Promise<{ message: string }> {
    if (data?.logoutAll) {
      await sessionService.revokeAllSessions(userId);
      return { message: "Logged out from all devices successfully" };
    } else if (data?.refreshToken) {
      try {
        const refreshTokenPayload = tokenService.verifyRefreshToken(
          data.refreshToken,
        );
        await sessionService.revokeSession(
          userId,
          refreshTokenPayload.sessionId,
        );
      } catch (error) {
        console.log("Invalid refresh token during logout:", error);
      }
      return { message: "Logged out successfully" };
    } else if (currentSessionId) {
      await sessionService.revokeSession(userId, currentSessionId);
      return { message: "Logged out successfully" };
    }

    return { message: "Logged out successfully" };
  }

  async getUserProfile(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizationMembers: {
          include: {
            user: {
              select: {
                avatarUrl: true,
              },
            },
            organization: {
              select: {
                id: true,
                name: true,
                orgLogoUrl: true,
                description: true,
              },
            },
            userRoles: {
              where: { isActive: true },
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    return this.mapUserToResponse(user);
  }

  async updateUserProfile(
    userId: string,
    updateData: Partial<{
      name: string;
      countryCode: string;
      phoneNumber: string;
      country: string;
      state: string;
      avatarUrl: string;
    }>,
  ): Promise<UserResponse> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    return this.mapUserToResponse(user);
  }

  async getUserSessions(userId: string, currentSessionId?: string) {
    return await sessionService.getUserSessions(userId, currentSessionId);
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    await sessionService.revokeSession(userId, sessionId);
    return { message: "Session revoked successfully" };
  }

  async validateUserAccess(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, deletedAt: true },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    if (!user.isActive || user.deletedAt !== null) {
      throw ErrorFactory.unauthorized(
        "Account is inactive or has been deleted",
      );
    }

    return true;
  }

  async deactivateAccount(userId: string): Promise<{ message: string }> {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      await tx.refreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });

      await tx.session.deleteMany({
        where: { userId },
      });
    });

    return { message: "Account deactivated successfully" };
  }

  private mapUserToResponse(user: User | UserWithOrganizations): UserResponse {
    const response: UserResponse = {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      avatarUrl: user.avatarUrl,
      countryCode: user.countryCode || undefined,
      phoneNumber: user.phoneNumber || undefined,
      country: user.country || undefined,
      state: user.state || undefined,
      lastLoginAt: user.lastLoginAt || undefined,
      isActive: user.isActive,
    };

    if (
      "organizationMembers" in user &&
      user.organizationMembers &&
      user.organizationMembers.length > 0
    ) {
      response.organizations = user.organizationMembers.map(
        (member: OrganizationMemberWithDetails) => ({
          orgMemberId: member.id,
          orgId: member.organization.id,
          orgName: member.organization.name,
          orgLogoUrl: member.organization.orgLogoUrl,
          orgDescription: member.organization.description || undefined,
          accessLevel: member.accessLevel,
          roles: member.userRoles.map((role: UserRoleWithPermissions) => ({
            roleId: role.roleId,
            roleName: role.role?.systemRoleType || null,
            customRole: role.role
              ? {
                  id: role.role.id,
                  name: role.role.name,
                  description: role.role.description,
                }
              : null,
            permissions: [],
          })),
        }),
      );

      const firstMember = user.organizationMembers[0];
      if (firstMember.userRoles.length > 0) {
        response.role =
          firstMember.userRoles[0].role?.systemRoleType || undefined;
      }
    }

    return response;
  }

  async generateSSOToken(
    userId: string,
    targetDomain: string,
  ): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        organizationMembers: {
          select: {
            orgId: true,
            id: true,
            userRoles: {
              where: { isActive: true },
              select: {
                id: true,
                roleId: true,
                role: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    systemRoleType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    const orgRoles = user.organizationMembers.flatMap((member) =>
      member.userRoles.map((userRole) => ({
        orgId: member.orgId,
        orgMemberId: member.id,
        roleId: userRole.roleId,
        role: {
          roleName: userRole.role?.systemRoleType || null,
          roleId: userRole.roleId,
          permissions: [],
        },
      })),
    );

    const ssoPayload = {
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      targetDomain,
      type: "sso_transfer",
      orgRoles: orgRoles,
    };

    return tokenService.generateAccessToken({
      ...ssoPayload,
      sessionId: "sso_transfer",
    });
  }

  async consumeSSOToken(
    ssoToken: string,
    expectedDomain: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    try {
      const payload = tokenService.verifyAccessToken(ssoToken);

      if (payload.sessionId !== "sso_transfer") {
        throw ErrorFactory.unauthorized("Invalid SSO token");
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          organizationMembers: {
            include: {
              userRoles: {
                where: { isActive: true },
                include: {
                  role: {
                    select: {
                      id: true,
                      name: true,
                      description: true,
                      systemRoleType: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw ErrorFactory.unauthorized("User not found or inactive");
      }

      const { sessionId, refreshToken } = await sessionService.createSession(
        user.id,
        deviceInfo,
        ipAddress,
      );

      const { orgRoleCacheService } = await import("./orgRoleCacheService");
      await orgRoleCacheService.getUserOrgRoles(user.id);

      const accessToken = tokenService.generateAccessToken({
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        sessionId,
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600,
        tokenType: "Bearer",
        user: this.mapUserToResponse(user),
      };
    } catch (error) {
      throw ErrorFactory.unauthorized("Invalid or expired SSO token");
    }
  }

  async getUserRolesInOrganization(
    userId: string,
    orgId: string,
  ): Promise<{
    orgMemberId: string;
    roles: Array<{
      roleId: string;
      roleName: string | null;
      permissions: string[];
    }>;
  }> {
    const orgMember = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: { orgId, userId },
      },
      include: {
        userRoles: {
          where: { isActive: true },
          include: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                systemRoleType: true,
              },
            },
          },
        },
      },
    });

    if (!orgMember) {
      throw ErrorFactory.notFound("User is not a member of this organization");
    }

    return {
      orgMemberId: orgMember.id,
      roles: orgMember.userRoles.map((userRole) => ({
        roleId: userRole.roleId,
        roleName: userRole.role?.systemRoleType || null,
        permissions: [],
      })),
    };
  }

  async getUserAllPermissions(userId: string): Promise<{
    [orgId: string]: string[];
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizationMembers: {
          include: {
            userRoles: {
              where: { isActive: true },
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    const permissionsByOrg: { [orgId: string]: string[] } = {};

    user.organizationMembers.forEach((member) => {
      permissionsByOrg[member.orgId] = [];
    });

    return permissionsByOrg;
  }

  async findOrCreateGoogleUser(profile: {
    email: string;
    name: string;
    picture?: string | null;
    googleId: string;
  }) {
    const provider = "GOOGLE";

    const existingOAuth = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId: profile.googleId,
        },
      },
      include: { user: true },
    });

    if (existingOAuth && existingOAuth.user) {
      return existingOAuth.user;
    }

    let user = await prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture || undefined,
          isActive: true,
          emailVerified: true,
        },
      });
    }

    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerId: {
          provider,
          providerId: profile.googleId,
        },
      },
      update: {
        userId: user.id,
      },
      create: {
        provider,
        providerId: profile.googleId,
        userId: user.id,
        accessToken: "",
        refreshToken: "",
        expiry: 0,
        scopes: [],
      },
    });

    return user;
  }

  async generateTokens(
    user: User,
    deviceInfo?: string,
    ipAddress?: string,
    loginMethod: LoginMethod = LoginMethod.OAUTH,
    provider: ProviderEnum | null = null,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: "Bearer";
    user: UserResponse;
  }> {
    const { sessionId, refreshToken } = await sessionService.createSession(
      user.id,
      deviceInfo,
      ipAddress,
    );

    const { orgRoleCacheService } = await import("./orgRoleCacheService");
    await orgRoleCacheService.getUserOrgRoles(user.id);

    const accessToken = await tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      sessionId,
    });

    await this.logLoginHistory(
      user.id,
      true,
      loginMethod,
      ipAddress,
      deviceInfo,
      provider,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      tokenType: "Bearer",
      user: this.mapUserToResponse(user),
    };
  }

  async logLoginHistory(
    userId: string,
    success: boolean,
    loginMethod: LoginMethod,
    ipAddress?: string,
    deviceInfo?: string,
    provider?: ProviderEnum | null,
    failureReason?: string,
  ) {
    try {
      await prisma.loginHistory.create({
        data: {
          userId,
          ipAddress: ipAddress || "Unknown",
          deviceInfo: deviceInfo || "Unknown",
          success,
          loginMethod,
          provider: provider || null,
          failureReason,
        },
      });
    } catch (error) {
      console.error("[AuthService] Failed to log login history:", error);
    }
  }
}

export const authService = new AuthService();
