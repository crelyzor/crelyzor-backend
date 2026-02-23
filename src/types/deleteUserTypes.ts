export interface SoftDeleteUserParams {
  adminUserId: string;
  targetUserId: string;
}

export interface HardDeleteParams {
  daysThreshold: number;
}

export interface SoftDeleteResponse {
  message: string;
  deletedUser: {
    id: string;
    email: string;
    name: string;
    deletedAt: Date | null;
  };
}

export interface HardDeleteResponse {
  success: boolean;
  deletedCount: number;
  message: string;
}
