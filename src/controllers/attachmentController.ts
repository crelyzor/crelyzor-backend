import { Request, Response } from "express";
import { attachmentService } from "../services/attachmentService";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import {
  attachmentMeetingParamSchema,
  attachmentIdParamSchema,
  addLinkSchema,
} from "../validators/attachmentSchema";

export const attachmentController = {
  async getAttachments(req: Request, res: Response) {
    const params = attachmentMeetingParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError("Invalid meeting ID", 400);

    const attachments = await attachmentService.getAttachments(
      params.data.meetingId,
      req.user!.userId,
    );

    return apiResponse(res, {
      statusCode: 200,
      message: "Attachments fetched",
      data: { attachments },
    });
  },

  async addLink(req: Request, res: Response) {
    const params = attachmentMeetingParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError("Invalid meeting ID", 400);

    const body = addLinkSchema.safeParse(req.body);
    if (!body.success) {
      const firstIssue = body.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = firstIssue?.message ?? "Validation failed";
      throw new AppError(path ? `${path}: ${message}` : message, 400);
    }

    const attachment = await attachmentService.addLink(
      params.data.meetingId,
      req.user!.userId,
      body.data,
    );

    logger.info("Link attachment added via controller", {
      meetingId: params.data.meetingId,
      userId: req.user!.userId,
    });

    return apiResponse(res, {
      statusCode: 201,
      message: "Link added",
      data: { attachment },
    });
  },

  async uploadFile(req: Request, res: Response) {
    const params = attachmentMeetingParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError("Invalid meeting ID", 400);

    if (!req.file) throw new AppError("No file uploaded", 400);

    const name = typeof req.body.name === "string" ? req.body.name : undefined;

    const attachment = await attachmentService.uploadFile(
      params.data.meetingId,
      req.user!.userId,
      req.file,
      name,
    );

    return apiResponse(res, {
      statusCode: 201,
      message: "File uploaded",
      data: { attachment },
    });
  },

  async deleteAttachment(req: Request, res: Response) {
    const params = attachmentIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError("Invalid params", 400);

    await attachmentService.deleteAttachment(
      params.data.meetingId,
      params.data.attachmentId,
      req.user!.userId,
    );

    return apiResponse(res, { statusCode: 200, message: "Attachment deleted" });
  },
};
