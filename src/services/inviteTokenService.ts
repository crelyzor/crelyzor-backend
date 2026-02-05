import { v4 as uuidv4 } from "uuid";
import { UserRoleEnum } from "@prisma/client";
import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import {
  sendNotification,
  NotificationEvents,
  NotificationRoles,
} from "../utils/notificationServiceUtils";

interface SendInviteRequest {
  organizationId: string;
  invitedEmail: string;
  invitedRole: UserRoleEnum;
  invitedById: string;
}

interface AcceptInviteRequest {
  token: string;
  userId: string;
}

export const inviteTokenService = {
  /**
   * Send an email invitation to join an organization
   */
  async sendInvite(data: SendInviteRequest) {
    const { organizationId, invitedEmail, invitedRole, invitedById } = data;

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, orgLogoUrl: true },
    });

    if (!organization) {
      throw ErrorFactory.notFound("Organization not found");
    }

    // Verify inviter exists and is a member
    const inviter = await prisma.organizationMember.findFirst({
      where: {
        orgId: organizationId,
        userId: invitedById,
      },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!inviter) {
      throw ErrorFactory.forbidden(
        "Inviter is not a member of this organization",
      );
    }

    // Check if user already exists in this org
    const existingUser = await prisma.user.findUnique({
      where: { email: invitedEmail },
      include: {
        organizationMembers: {
          where: { orgId: organizationId },
        },
      },
    });

    if (existingUser && existingUser.organizationMembers.length > 0) {
      throw ErrorFactory.conflict(
        "User is already a member of this organization",
      );
    }

    // Check if there's already a pending invite for this email
    const existingInvite = await prisma.orgInvite.findUnique({
      where: {
        orgId_invitedEmail: {
          orgId: organizationId,
          invitedEmail: invitedEmail,
        },
      },
    });

    let invite;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    if (existingInvite && !existingInvite.acceptedAt) {
      // Update existing pending invite
      invite = await prisma.orgInvite.update({
        where: { id: existingInvite.id },
        data: {
          invitedRole,
          invitedById,
          expiresAt,
          token: uuidv4(), // Generate new token
        },
      });
    } else if (existingInvite && existingInvite.acceptedAt) {
      throw ErrorFactory.conflict("Invite has already been accepted");
    } else {
      // Create new invite
      invite = await prisma.orgInvite.create({
        data: {
          orgId: organizationId,
          invitedEmail,
          invitedRole,
          invitedById,
          token: uuidv4(),
          expiresAt,
        },
      });
    }

    // Generate invite link
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const inviteLink = `${frontendUrl}/invite/${invite.token}`;

    // Send notification email
    await sendNotification({
      orgId: organizationId,
      sender: {
        email: inviter.user.email,
        name: inviter.user.name || inviter.user.email,
        role: NotificationRoles.ADMIN,
        orgMemberId: inviter.id,
      },
      recipient: {
        email: invitedEmail,
        name: invitedEmail.split("@")[0], // Use email prefix as name
        role: NotificationRoles.TEAM_MEMBER,
      },
      event: NotificationEvents.NEW_TEAM_MEMBER,
      payload: {
        ORGANIZATION_NAME: organization.name,
        INVITER_NAME: inviter.user.name || inviter.user.email,
        INVITE_LINK: inviteLink,
        ROLE: invitedRole,
      },
    });

    return {
      success: true,
      message: "Invitation sent successfully",
      inviteToken: invite.token,
      expiresAt: invite.expiresAt,
    };
  },

  /**
   * Get invite details by token (for displaying org info before accepting)
   */
  async getInviteDetails(token: string) {
    const invite = await prisma.orgInvite.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            orgLogoUrl: true,
          },
        },
      },
    });

    if (!invite) {
      throw ErrorFactory.notFound("Invite not found or has expired");
    }

    // Check if invite has expired
    if (new Date() > invite.expiresAt) {
      throw ErrorFactory.validation("This invite has expired");
    }

    // Check if already accepted
    if (invite.acceptedAt) {
      throw ErrorFactory.conflict("This invite has already been accepted");
    }

    return {
      token: invite.token,
      invitedEmail: invite.invitedEmail,
      invitedRole: invite.invitedRole,
      expiresAt: invite.expiresAt,
      organization: invite.organization,
    };
  },

  /**
   * Accept an invite and join the organization
   */
  async acceptInvite(data: AcceptInviteRequest) {
    const { token, userId } = data;

    const invite = await prisma.orgInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      throw ErrorFactory.notFound("Invite not found");
    }

    // Validate invite
    if (new Date() > invite.expiresAt) {
      throw ErrorFactory.validation("This invite has expired");
    }

    if (invite.acceptedAt) {
      throw ErrorFactory.conflict("This invite has already been accepted");
    }

    // Verify user email matches invited email
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    if (user.email !== invite.invitedEmail) {
      throw ErrorFactory.forbidden(
        "This invite is for a different email address",
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: invite.orgId,
          userId: userId,
        },
      },
    });

    if (existingMember) {
      throw ErrorFactory.conflict(
        "You are already a member of this organization",
      );
    }

    // Create organization member and assign role in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization member
      const orgMember = await tx.organizationMember.create({
        data: {
          orgId: invite.orgId,
          userId: userId,
          accessLevel: invite.invitedRole,
        },
      });

      // Get the role for this organization
      const role = await tx.role.findFirst({
        where: {
          orgId: invite.orgId,
          systemRoleType: invite.invitedRole,
          isSystemRole: true,
        },
      });

      if (!role) {
        throw ErrorFactory.notFound(
          `Role ${invite.invitedRole} not found in organization`,
        );
      }

      // Assign role to user
      await tx.userRole.create({
        data: {
          orgMemberId: orgMember.id,
          roleId: role.id,
          isActive: true,
        },
      });

      // Mark invite as accepted
      await tx.orgInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: new Date(),
        },
      });

      return orgMember;
    });

    return {
      success: true,
      message: "Successfully joined organization",
      orgMemberId: result.id,
      organizationId: invite.orgId,
    };
  },

  /**
   * List all pending invites for an organization
   */
  async listPendingInvites(organizationId: string) {
    const invites = await prisma.orgInvite.findMany({
      where: {
        orgId: organizationId,
        acceptedAt: null,
        expiresAt: {
          gt: new Date(), // Not expired
        },
      },
      include: {
        organization: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return invites.map((invite) => ({
      id: invite.id,
      invitedEmail: invite.invitedEmail,
      invitedRole: invite.invitedRole,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      organizationName: invite.organization.name,
    }));
  },

  /**
   * Cancel/revoke an invite
   */
  async cancelInvite(inviteId: string, organizationId: string) {
    const invite = await prisma.orgInvite.findFirst({
      where: {
        id: inviteId,
        orgId: organizationId,
      },
    });

    if (!invite) {
      throw ErrorFactory.notFound("Invite not found");
    }

    if (invite.acceptedAt) {
      throw ErrorFactory.conflict(
        "Cannot cancel an invite that has already been accepted",
      );
    }

    await prisma.orgInvite.delete({
      where: { id: inviteId },
    });

    return {
      success: true,
      message: "Invite cancelled successfully",
    };
  },
};
