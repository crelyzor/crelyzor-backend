import type { ServiceClient } from "@prisma/client";
import { TokenPayload } from "./authTypes";
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      sessionId?: string;
      serviceClient?: ServiceClient;
      service?: {
        clientId: string;
        type: string;
        scopes: string[];
      };
    }
  }
}

export {};
