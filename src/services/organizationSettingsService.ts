import prisma from "../db/prismaClient";
import { ErrorFactory } from "../utils/globalErrorHandler";
import {
  UpdateMeetingPreferenceRequest,
  UpdateMeetingPreferenceResponse,
  GetMeetingPreferenceResponse,
} from "../types/organizationSettingsTypes";

export class OrganizationSettingsService {
  async updateMeetingPreference(
    userId: string,
    data: UpdateMeetingPreferenceRequest,
  ): Promise<UpdateMeetingPreferenceResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    if (!existingUser) {
      throw ErrorFactory.notFound("User not found");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        meetingPreference: data.meetingPreference,
        updatedAt: new Date(),
      },
      select: {
        meetingPreference: true,
      },
    });

    return {
      success: true,
      message: "Meeting preference updated successfully",
      data: {
        meetingPreference: updatedUser.meetingPreference as "GOOGLE" | "ZOOM",
      },
    };
  }

  async getMeetingPreference(
    userId: string,
  ): Promise<GetMeetingPreferenceResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        meetingPreference: true,
      },
    });

    if (!user) {
      throw ErrorFactory.notFound("User not found");
    }

    return {
      success: true,
      data: {
        meetingPreference: user.meetingPreference as "GOOGLE" | "ZOOM" | null,
      },
    };
  }
}

export const organizationSettingsService = new OrganizationSettingsService();
