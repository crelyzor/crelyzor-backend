import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { UserRoleEnum } from "@prisma/client";
import { CreateOrganizationDTO } from "../types/OrganizationDTO";
import { UpdateOrganizationRequest } from "../validators/organizationSchema";
import {
  NotificationEvents,
  NotificationRoles,
  sendNotification,
} from "../utils/notificationServiceUtils";
import { orgRoleCacheService } from "./auth/orgRoleCacheService";

export const registerOrganizationService = {
  /**
   * Registers a new organization and assigns the user as its owner.
   */
  async register(userId: string, orgData: CreateOrganizationDTO) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    if (!user) {
      throw ErrorFactory.unauthorized("Invalid user session.");
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const org = await tx.organization.create({
            data: {
              name: orgData.name,
              description: orgData.description,
              organizationDetails: orgData.organizationDetails || {},
            },
          });

          if (!org) {
            throw ErrorFactory.dbOperation("Failed to create organization.");
          }

          const orgMember = await tx.organizationMember.create({
            data: {
              userId,
              orgId: org.id,
              accessLevel: UserRoleEnum.OWNER,
            },
          });

          return {
            organization: {
              id: org.id,
              name: org.name,
              description: org.description,
            },
            member: {
              id: orgMember.id,
              accessLevel: orgMember.accessLevel,
            },
          };
        },
        { timeout: 30000 },
      );

      await orgRoleCacheService.invalidateUserOrgRoles(userId);

      return result;
    } catch (err: any) {
      if (err.code === "P2002") {
        throw ErrorFactory.conflict("Organization name already exists.");
      }
      console.error("[OrganizationService.register] Error:", err);
      throw ErrorFactory.dbOperation("Failed to create organization.");
    }
  },

  /**
   * Gets organization details by ID
   */
  async getOrganizationById(orgId: string, userId?: string) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!org) {
      throw ErrorFactory.notFound("Organization not found");
    }

    return {
      id: org.id,
      name: org.name,
      description: org.description,
      orgLogoUrl: org.orgLogoUrl,
      brandColor: org.brandColor,
      organizationDetails: org.organizationDetails,
      senderEmail: org.senderEmail,
      senderName: org.senderName,
      createdAt: org.createdAt,
      memberCount: org.members.length,
      members: org.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        accessLevel: m.accessLevel,
        user: m.user,
      })),
    };
  },

  /**
   * Updates organization details
   */
  async updateOrganization(orgId: string, data: UpdateOrganizationRequest) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw ErrorFactory.notFound("Organization not found");
    }

    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: data.name,
        description: data.description,
        orgLogoUrl: data.orgLogoUrl,
        brandColor: data.brandColor,
        organizationDetails: data.organizationDetails,
        senderEmail: data.senderEmail,
        senderName: data.senderName,
      },
    });

    return {
      id: updatedOrg.id,
      name: updatedOrg.name,
      description: updatedOrg.description,
      orgLogoUrl: updatedOrg.orgLogoUrl,
      brandColor: updatedOrg.brandColor,
      senderEmail: updatedOrg.senderEmail,
      senderName: updatedOrg.senderName,
    };
  },

  /**
   * Deletes an organization and all related data
   */
  async deleteOrganization(orgId: string, userId: string) {
    const orgMember = await prisma.organizationMember.findFirst({
      where: {
        orgId,
        userId,
        accessLevel: UserRoleEnum.OWNER,
      },
    });

    if (!orgMember) {
      throw ErrorFactory.forbidden("Only organization owners can delete it");
    }

    const allMembers = await prisma.organizationMember.findMany({
      where: { orgId },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.deleteMany({
        where: { orgId },
      });

      await tx.meeting.deleteMany({
        where: { organizationId: orgId },
      });

      await tx.memberAvailability.deleteMany({
        where: { orgMember: { orgId } },
      });

      await tx.organization.delete({
        where: { id: orgId },
      });
    });

    await Promise.all(
      allMembers.map((m) => orgRoleCacheService.invalidateUserOrgRoles(m.userId)),
    );

    return { message: "Organization deleted successfully" };
  },

  /**
   * Gets all members of an organization
   */
  async getOrganizationMembers(orgId: string, options?: {
    page?: number;
    limit?: number;
    search?: string;
    roleFilter?: UserRoleEnum;
  }) {
    const { page = 1, limit = 20, search, roleFilter } = options || {};
    const skip = (page - 1) * limit;

    const whereClause: any = { orgId };

    if (search) {
      whereClause.user = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    if (roleFilter) {
      whereClause.accessLevel = roleFilter;
    }

    const [members, total] = await Promise.all([
      prisma.organizationMember.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              isActive: true,
              lastLoginAt: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.organizationMember.count({ where: whereClause }),
    ]);

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        accessLevel: m.accessLevel,
        createdAt: m.createdAt,
        user: m.user,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Adds a new member to the organization
   */
  async addOrganizationMember(
    orgId: string,
    addedByUserId: string,
    memberData: {
      userId?: string;
      email?: string;
      name?: string;
      role?: UserRoleEnum;
    },
  ) {
    let userId = memberData.userId;

    if (!userId && memberData.email) {
      let user = await prisma.user.findUnique({
        where: { email: memberData.email },
      });

      if (!user && memberData.name) {
        user = await prisma.user.create({
          data: {
            email: memberData.email,
            name: memberData.name,
          },
        });
      }

      if (!user) {
        throw ErrorFactory.notFound(
          "User not found. Please provide name to create a new user.",
        );
      }

      userId = user.id;
    }

    if (!userId) {
      throw ErrorFactory.validation("Either userId or email is required");
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: { orgId, userId },
      },
    });

    if (existingMember) {
      throw ErrorFactory.conflict("User is already a member of this organization");
    }

    const role = memberData.role || UserRoleEnum.MEMBER;

    const result = await prisma.organizationMember.create({
      data: {
        orgId,
        userId,
        accessLevel: role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    await orgRoleCacheService.invalidateUserOrgRoles(userId);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    try {
      await sendNotification({
        orgId,
        recipient: {
          email: result.user.email,
          name: result.user.name,
          role: NotificationRoles.TEAM_MEMBER,
        },
        sender: {
          email: process.env.ADMIN_EMAIL || "noreply@example.com",
          name: org?.name || "Organization",
          role: NotificationRoles.ADMIN,
        },
        event: NotificationEvents.NEW_TEAM_MEMBER,
        payload: {
          CONSULTANT_NAME: result.user.name,
          ENTITY_NAME: org?.name || "Organization",
          LINK: process.env.FRONTEND_URL || "https://app.example.com",
        },
      });
    } catch (err) {
      console.error("[addOrganizationMember] Notification error:", err);
    }

    return {
      id: result.id,
      userId: result.userId,
      accessLevel: result.accessLevel,
      user: result.user,
    };
  },

  /**
   * Removes a member from the organization
   */
  async removeOrganizationMember(
    orgId: string,
    memberId: string,
    removedByUserId: string,
  ) {
    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, orgId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Member not found");
    }

    if (member.accessLevel === UserRoleEnum.OWNER) {
      throw ErrorFactory.forbidden("Cannot remove the organization owner");
    }

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    await orgRoleCacheService.invalidateUserOrgRoles(member.userId);

    return { message: "Member removed successfully" };
  },

  /**
   * Updates a member's role
   */
  async updateMemberRole(
    orgId: string,
    memberId: string,
    newRole: UserRoleEnum,
    updatedByUserId: string,
  ) {
    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, orgId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Member not found");
    }

    if (member.accessLevel === UserRoleEnum.OWNER && newRole !== UserRoleEnum.OWNER) {
      throw ErrorFactory.forbidden("Cannot change owner's role");
    }

    await prisma.organizationMember.update({
      where: { id: memberId },
      data: { accessLevel: newRole },
    });

    await orgRoleCacheService.invalidateUserOrgRoles(member.userId);

    return { message: "Member role updated successfully" };
  },

  /**
   * Transfer organization ownership
   */
  async transferOwnership(
    orgId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ) {
    const currentOwner = await prisma.organizationMember.findFirst({
      where: {
        orgId,
        userId: currentOwnerId,
        accessLevel: UserRoleEnum.OWNER,
      },
    });

    if (!currentOwner) {
      throw ErrorFactory.forbidden("Only the current owner can transfer ownership");
    }

    const newOwner = await prisma.organizationMember.findFirst({
      where: { orgId, userId: newOwnerId },
    });

    if (!newOwner) {
      throw ErrorFactory.notFound("New owner must be a member of the organization");
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({
        where: { id: currentOwner.id },
        data: { accessLevel: UserRoleEnum.ADMIN },
      });

      await tx.organizationMember.update({
        where: { id: newOwner.id },
        data: { accessLevel: UserRoleEnum.OWNER },
      });
    });

    await Promise.all([
      orgRoleCacheService.invalidateUserOrgRoles(currentOwnerId),
      orgRoleCacheService.invalidateUserOrgRoles(newOwnerId),
    ]);

    return { message: "Ownership transferred successfully" };
  },

  /**
   * Gets all organizations for a user
   */
  async getUserOrganizations(userId: string) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            orgLogoUrl: true,
            brandColor: true,
            createdAt: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      orgMemberId: m.id,
      accessLevel: m.accessLevel,
      organization: m.organization,
    }));
  },
};
