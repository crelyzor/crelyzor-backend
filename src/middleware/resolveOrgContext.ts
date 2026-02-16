import { Request, Response, NextFunction } from "express";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { AuthenticatedUser } from "../types/authTypes";
import { orgPayload } from "../types/orgTypes";

declare module "express" {
  export interface Request {
    org?: orgPayload;
  }
}

/**
 * Middleware to resolve the organization context.
 *
 * Finds the user's membership in the target org and sets accessLevel.
 */
export const resolveOrgContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const targetOrgId = req.headers["x-organization-id"] as string;
    const user = req.user as AuthenticatedUser;

    if (!targetOrgId) {
      throw ErrorFactory.validation("Missing X-Organization-ID header");
    }

    const membership = user.orgRoles?.find((r) => r.orgId === targetOrgId);

    if (!membership) {
      throw ErrorFactory.forbidden(
        "You do not have access to this organization",
      );
    }

    req.org = {
      orgId: targetOrgId,
      orgMemberId: membership.orgMemberId,
      accessLevel: membership.accessLevel,
    };

    return next();
  } catch (error) {
    globalErrorHandler(error as any, req, res);
  }
};
