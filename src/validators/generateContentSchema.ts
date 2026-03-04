import { z } from "zod";

export const generateContentSchema = z.object({
  type: z.enum(["MEETING_REPORT", "TWEET", "BLOG_POST", "EMAIL"]),
});
