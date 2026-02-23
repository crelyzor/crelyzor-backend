import { TokenPayload } from "./authTypes";
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      sessionId?: string;
      org?: { orgId: string };
      service?: {
        clientId: string;
        type: string;
        scopes: string[];
      };
    }
  }
}

export {};
