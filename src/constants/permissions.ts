/**
 * Simplified Permission Definitions for Calendar + SMA
 * Single source of truth for all permissions
 */

export const PERMISSIONS = {
  // ============================================
  // ORGANIZATION MANAGEMENT
  // ============================================
  READ_ORGANIZATION: "READ_ORGANIZATION",
  MANAGE_ORGANIZATION: "MANAGE_ORGANIZATION",
  MANAGE_ROLES: "MANAGE_ROLES",

  // ============================================
  // TEAM MANAGEMENT
  // ============================================
  READ_MEMBERS: "READ_MEMBERS",
  MANAGE_MEMBERS: "MANAGE_MEMBERS",
  INVITE_MEMBERS: "INVITE_MEMBERS",

  // ============================================
  // CALENDAR / MEETINGS
  // ============================================
  CREATE_MEETING: "CREATE_MEETING",
  READ_MEETING: "READ_MEETING",
  MANAGE_MEETING: "MANAGE_MEETING",
  DELETE_MEETING: "DELETE_MEETING",
  READ_ALL_MEETINGS: "READ_ALL_MEETINGS", // Admin view all org meetings

  // ============================================
  // SMA (Smart Meeting Assistant)
  // ============================================
  UPLOAD_RECORDING: "UPLOAD_RECORDING",
  READ_TRANSCRIPT: "READ_TRANSCRIPT",
  MANAGE_ACTION_ITEMS: "MANAGE_ACTION_ITEMS",
  READ_AI_SUMMARY: "READ_AI_SUMMARY",
} as const;

export type PermissionType = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Permission Modules Map - groups permissions by category
 */
export const PERMISSION_MODULES = {
  "Organization Management": [
    PERMISSIONS.READ_ORGANIZATION,
    PERMISSIONS.MANAGE_ORGANIZATION,
    PERMISSIONS.MANAGE_ROLES,
  ],
  "Team Management": [
    PERMISSIONS.READ_MEMBERS,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.INVITE_MEMBERS,
  ],
  "Calendar & Meetings": [
    PERMISSIONS.CREATE_MEETING,
    PERMISSIONS.READ_MEETING,
    PERMISSIONS.MANAGE_MEETING,
    PERMISSIONS.DELETE_MEETING,
    PERMISSIONS.READ_ALL_MEETINGS,
  ],
  "Smart Meeting Assistant": [
    PERMISSIONS.UPLOAD_RECORDING,
    PERMISSIONS.READ_TRANSCRIPT,
    PERMISSIONS.MANAGE_ACTION_ITEMS,
    PERMISSIONS.READ_AI_SUMMARY,
  ],
} as const;

/**
 * Get module name for a permission
 */
export function getModuleForPermission(permission: string): string {
  for (const [module, perms] of Object.entries(PERMISSION_MODULES)) {
    if ((perms as readonly string[]).includes(permission)) {
      return module;
    }
  }
  return "Uncategorized";
}
