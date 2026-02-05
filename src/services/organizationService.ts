import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { UserRoleEnum } from "@prisma/client";
import { CreateOrganizationDTO } from "../types/OrganizationDTO";
import { UpdateOrganizationRequest } from "../validators/organizationSchema";
import {
  assignUserRole,
  createDefaultRoleTemplates,
} from "../utils/assignRoles";
import {
  NotificationEvents,
  NotificationRoles,
  sendNotification,
} from "../utils/notificationServiceUtils";
import { orgRoleCacheService } from "./auth/orgRoleCacheService";

export const registerOrganizationService = {
  /**
   * Registers a new organization and assigns the user as its owner.
   * Simplified for calendar system - flat organization structure.
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

    const existingMember = await prisma.organizationMember.findFirst({
      where: { userId },
    });
    if (existingMember) {
      throw ErrorFactory.conflict("User is already part of an organization.");
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

          // Create default role templates (OWNER, ADMIN, MEMBER)
          const roleTemplates = await createDefaultRoleTemplates(org.id, tx);

          // Create organization member for the owner
          const orgMember = await tx.organizationMember.create({
            data: {
              userId,
              orgId: org.id,
              accessLevel: UserRoleEnum.OWNER,
            },
          });

          // Assign OWNER role to the user
          const ownerRole = roleTemplates.find(
            (r) => r.systemRoleType === UserRoleEnum.OWNER,
          );
          if (ownerRole) {
            await assignUserRole(
              {
                userId,
                orgMemberId: orgMember.id,
                orgId: org.id,
                role: UserRoleEnum.OWNER,
              },
              tx,
            );
          }

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

      // Invalidate cache for this user
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
            userRoles: {
              where: { isActive: true },
              include: {
                role: {
                  select: {
                    id: true,
                    name: true,
                    systemRoleType: true,
                  },
                },
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
        roles: m.userRoles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          systemRoleType: ur.role.systemRoleType,
        })),
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
    // Verify the user is an owner
    const orgMember = await prisma.organizationMember.findFirst({
      where: {
        orgId,
        userId,
        userRoles: {
          some: {
            role: { systemRoleType: UserRoleEnum.OWNER },
            isActive: true,
          },
        },
      },
    });

    if (!orgMember) {
      throw ErrorFactory.forbidden("Only organization owners can delete it");
    }

    // Get all user IDs for cache invalidation
    const allMembers = await prisma.organizationMember.findMany({
      where: { orgId },
      select: { userId: true },
    });

    await prisma.$transaction(async (tx) => {
      // Delete user roles
      await tx.userRole.deleteMany({
        where: { orgMember: { orgId } },
      });

      // Delete organization members
      await tx.organizationMember.deleteMany({
        where: { orgId },
      });

      // Delete roles
      await tx.role.deleteMany({
        where: { orgId },
      });

      // Delete meetings
      await tx.meeting.deleteMany({
        where: { organizationId: orgId },
      });

      // Delete availability settings
      await tx.memberAvailability.deleteMany({
        where: { orgMember: { orgId } },
      });

      // Delete the organization
      await tx.organization.delete({
        where: { id: orgId },
      });
    });

    // Invalidate cache for all affected users
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
      whereClause.userRoles = {
        some: {
          role: { systemRoleType: roleFilter },
          isActive: true,
        },
      };
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
          userRoles: {
            where: { isActive: true },
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  systemRoleType: true,
                },
              },
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
        roles: m.userRoles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          systemRoleType: ur.role.systemRoleType,
        })),
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
    // Find or create the user
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

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: { orgId, userId },
      },
    });

    if (existingMember) {
      throw ErrorFactory.conflict("User is already a member of this organization");
    }

    const role = memberData.role || UserRoleEnum.MEMBER;

    const result = await prisma.$transaction(async (tx) => {
      const orgMember = await tx.organizationMember.create({
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

      // Assign role
      await assignUserRole(
        {
          userId,
          orgMemberId: orgMember.id,
          orgId,
          role,
        },
        tx,
      );

      return orgMember;
    });

    // Invalidate cache
    await orgRoleCacheService.invalidateUserOrgRoles(userId);

    // Get org name for notification
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    // Send welcome notification
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
      role,
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
      include: {
        user: true,
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!member) {
      throw ErrorFactory.notFound("Member not found");
    }

    // Check if trying to remove the owner
    const isOwner = member.userRoles.some(
      (ur) => ur.role.systemRoleType === UserRoleEnum.OWNER,
    );
    if (isOwner) {
      throw ErrorFactory.forbidden("Cannot remove the organization owner");
    }

    await prisma.$transaction(async (tx) => {
      // Delete user roles
      await tx.userRole.deleteMany({
        where: { orgMemberId: memberId },
      });

      // Delete the membership
      await tx.organizationMember.delete({
        where: { id: memberId },
      });
    });

    // Invalidate cache
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
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!member) {
      throw ErrorFactory.notFound("Member not found");
    }

    // Cannot change owner's role
    const isOwner = member.userRoles.some(
      (ur) => ur.role.systemRoleType === UserRoleEnum.OWNER,
    );
    if (isOwner && newRole !== UserRoleEnum.OWNER) {
      throw ErrorFactory.forbidden("Cannot change owner's role");
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate current roles
      await tx.userRole.updateMany({
        where: { orgMemberId: memberId, isActive: true },
        data: { isActive: false },
      });

      // Assign new role
      await assignUserRole(
        {
          userId: member.userId,
          orgMemberId: memberId,
          orgId,
          role: newRole,
        },
        tx,
      );

      // Update access level
      await tx.organizationMember.update({
        where: { id: memberId },
        data: { accessLevel: newRole },
      });
    });

    // Invalidate cache
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
    // Verify current user is owner
    const currentOwner = await prisma.organizationMember.findFirst({
      where: {
        orgId,
        userId: currentOwnerId,
        userRoles: {
          some: {
            role: { systemRoleType: UserRoleEnum.OWNER },
            isActive: true,
          },
        },
      },
    });

    if (!currentOwner) {
      throw ErrorFactory.forbidden("Only the current owner can transfer ownership");
    }

    // Verify new owner is a member
    const newOwner = await prisma.organizationMember.findFirst({
      where: { orgId, userId: newOwnerId },
    });

    if (!newOwner) {
      throw ErrorFactory.notFound("New owner must be a member of the organization");
    }

    await prisma.$transaction(async (tx) => {
      // Change current owner to ADMIN
      await tx.userRole.updateMany({
        where: { orgMemberId: currentOwner.id, isActive: true },
        data: { isActive: false },
      });

      await assignUserRole(
        {
          userId: currentOwnerId,
          orgMemberId: currentOwner.id,
          orgId,
          role: UserRoleEnum.ADMIN,
        },
        tx,
      );

      await tx.organizationMember.update({
        where: { id: currentOwner.id },
        data: { accessLevel: UserRoleEnum.ADMIN },
      });

      // Change new owner to OWNER
      await tx.userRole.updateMany({
        where: { orgMemberId: newOwner.id, isActive: true },
        data: { isActive: false },
      });

      await assignUserRole(
        {
          userId: newOwnerId,
          orgMemberId: newOwner.id,
          orgId,
          role: UserRoleEnum.OWNER,
        },
        tx,
      );

      await tx.organizationMember.update({
        where: { id: newOwner.id },
        data: { accessLevel: UserRoleEnum.OWNER },
      });
    });

    // Invalidate cache for both users
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
        userRoles: {
          where: { isActive: true },
          include: {
            role: {
              select: {
                id: true,
                name: true,
                systemRoleType: true,
              },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      orgMemberId: m.id,
      accessLevel: m.accessLevel,
      organization: m.organization,
      roles: m.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        systemRoleType: ur.role.systemRoleType,
      })),
    }));
  },
};
