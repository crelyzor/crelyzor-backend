import type { Request, Response } from "express";
import { AppError } from "../utils/errors/AppError";
import {
  exportParamSchema,
  exportQuerySchema,
} from "../validators/exportSchema";
import { exportMeeting } from "../services/exportService";

/**
 * GET /sma/meetings/:meetingId/export?format=pdf|txt&content=transcript|summary
 * Private — requires auth. Streams the requested content as a file download.
 */
export const exportMeetingContent = async (req: Request, res: Response) => {
  const params = exportParamSchema.safeParse(req.params);
  if (!params.success) throw new AppError("Invalid meeting ID", 400);

  const query = exportQuerySchema.safeParse(req.query);
  if (!query.success)
    throw new AppError(
      query.error.issues[0]?.message ?? "Invalid query params",
      400,
    );

  const userId = req.user!.userId;

  const { buffer, filename, mimeType } = await exportMeeting(
    params.data.meetingId,
    userId,
    query.data,
  );

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
};
