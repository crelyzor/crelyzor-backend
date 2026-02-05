import prisma from "../../db/prismaClient";
import { redis } from "../../config/redisClient";
import { orgRole } from "../../types/authTypes";

/**
 * Cache service for user organization and role data
 * Reduces database queries by caching org/role information in Redis
 */

export interface UserOrgRolesCache {
  orgRoles: orgRole[];
  cachedAt: number; // Timestamp for debugging
}

class OrgRoleCacheService {
  private readonly CACHE_KEY_PREFIX = "user:orgroles:";
  private readonly DEFAULT_TTL_SECONDS = 900; // 15 minutes

  /**
   * Get cache TTL from environment or use default
   */
  private getCacheTTL(): number {
    const envTTL = process.env.USER_ORG_CACHE_TTL_SECONDS;
    return envTTL ? parseInt(envTTL, 10) : this.DEFAULT_TTL_SECONDS;
  }

  /**
   * Generate cache key for a user
   */
  private getCacheKey(userId: string): string {
    return `${this.CACHE_KEY_PREFIX}${userId}`;
  }

  /**
   * Fetch user's org/role data from database
   * This replicates the query logic from authService.login
   */
  private async fetchFromDatabase(userId: string): Promise<orgRole[]> {
    console.log(`[OrgRoleCache] Fetching from DB for user: ${userId}`);

    const organizationMembers = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        userRoles: {
          where: { isActive: true },
          include: {
            role: {
              include: {
                permissions: {
                  where: { isActive: true },
                },
              },
            },
          },
        },
      },
    });

    // Transform to orgRole format
    const orgRoles = organizationMembers.flatMap((member) =>
      member.userRoles.map((userRole) => ({
        orgId: member.orgId,
        orgMemberId: member.id,
        roleId: userRole.roleId,
        role: {
          roleName: userRole.role?.systemRoleType || null,
          roleId: userRole.roleId,
          permissions: userRole.role?.permissions.map((p) => p.name) || [],
        },
      })),
    );

    console.log(
      `[OrgRoleCache] Fetched ${orgRoles.length} org roles from DB for user: ${userId}`,
    );

    return orgRoles;
  }

  /**
   * Get user's org/role data from cache or database
   * Automatically caches the data if not found in cache
   */
  async getUserOrgRoles(userId: string): Promise<UserOrgRolesCache> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // Try to get from cache first
      const cached = await redis.get(cacheKey);

      if (cached) {
        console.log(`[OrgRoleCache] Cache hit for user: ${userId}`);

        // Upstash Redis may return already-parsed object or string
        if (typeof cached === "object" && cached !== null) {
          console.log(`[OrgRoleCache] Cache returned object, using directly`);
          return cached as UserOrgRolesCache;
        } else if (typeof cached === "string") {
          console.log(`[OrgRoleCache] Cache returned string, parsing JSON`);
          return JSON.parse(cached) as UserOrgRolesCache;
        } else {
          console.warn(
            `[OrgRoleCache] Unexpected cache format (${typeof cached}), fetching from DB`,
          );
          throw new Error("Unexpected cache format");
        }
      }

      console.log(`[OrgRoleCache] Cache miss for user: ${userId}`);

      // Fetch from database
      const orgRoles = await this.fetchFromDatabase(userId);

      // Cache the result
      const cacheData: UserOrgRolesCache = {
        orgRoles,
        cachedAt: Date.now(),
      };

      const ttl = this.getCacheTTL();
      // Store as JSON string
      await redis.set(cacheKey, JSON.stringify(cacheData), { ex: ttl });

      console.log(
        `[OrgRoleCache] Cached data for user: ${userId} (TTL: ${ttl}s)`,
      );

      return cacheData;
    } catch (error) {
      // If Redis fails, fall back to direct DB query
      console.error(
        `[OrgRoleCache] Redis error for user ${userId}, falling back to DB:`,
        error,
      );

      const orgRoles = await this.fetchFromDatabase(userId);
      return {
        orgRoles,
        cachedAt: Date.now(),
      };
    }
  }

  /**
   * Invalidate cache for a specific user
   * Call this when user's org/role data changes
   */
  async invalidateUserOrgRoles(userId: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(userId);
      await redis.del(cacheKey);
      console.log(`[OrgRoleCache] Invalidated cache for user: ${userId}`);
    } catch (error) {
      console.error(
        `[OrgRoleCache] Error invalidating cache for user ${userId}:`,
        error,
      );
      // Don't throw - cache invalidation failure shouldn't break the app
    }
  }

  /**
   * Invalidate cache for all users in an organization
   * Call this when organization is deleted or major changes occur
   */
  async invalidateUsersInOrganization(orgId: string): Promise<void> {
    try {
      console.log(
        `[OrgRoleCache] Invalidating cache for all users in org: ${orgId}`,
      );

      // Find all users in this organization
      const orgMembers = await prisma.organizationMember.findMany({
        where: { orgId },
        select: { userId: true },
      });

      // Invalidate cache for each user
      const invalidationPromises = orgMembers.map((member) =>
        this.invalidateUserOrgRoles(member.userId),
      );

      await Promise.all(invalidationPromises);

      console.log(
        `[OrgRoleCache] Invalidated cache for ${orgMembers.length} users in org: ${orgId}`,
      );
    } catch (error) {
      console.error(
        `[OrgRoleCache] Error invalidating org ${orgId} users:`,
        error,
      );
    }
  }

  /**
   * Invalidate cache for all users with a specific role
   * Call this when role is deleted or permissions are updated
   */
  async invalidateUsersWithRole(roleId: string): Promise<void> {
    try {
      console.log(
        `[OrgRoleCache] Invalidating cache for all users with role: ${roleId}`,
      );

      // Find all organization members with this role
      const userRoles = await prisma.userRole.findMany({
        where: { roleId },
        include: {
          orgMember: {
            select: { userId: true },
          },
        },
      });

      // Get unique user IDs
      const userIds = [...new Set(userRoles.map((ur) => ur.orgMember.userId))];

      // Invalidate cache for each user
      const invalidationPromises = userIds.map((userId) =>
        this.invalidateUserOrgRoles(userId),
      );

      await Promise.all(invalidationPromises);

      console.log(
        `[OrgRoleCache] Invalidated cache for ${userIds.length} users with role: ${roleId}`,
      );
    } catch (error) {
      console.error(
        `[OrgRoleCache] Error invalidating users with role ${roleId}:`,
        error,
      );
    }
  }

  /**
   * Clear all user org/role caches
   * Use sparingly - mainly for development/debugging
   */
  async clearAllCaches(): Promise<void> {
    try {
      console.log("[OrgRoleCache] Clearing all user org/role caches");
      // Note: This requires scanning Redis keys with pattern matching
      // Upstash Redis supports this via the keys() method
      const pattern = `${this.CACHE_KEY_PREFIX}*`;

      // For Upstash, we'll need to use scan or keys
      // This is a simplified version - in production you might want to use SCAN
      console.warn(
        "[OrgRoleCache] clearAllCaches is not fully implemented for Upstash Redis",
      );
      console.warn(
        "[OrgRoleCache] Consider invalidating specific users instead",
      );
    } catch (error) {
      console.error("[OrgRoleCache] Error clearing all caches:", error);
    }
  }
}

export const orgRoleCacheService = new OrgRoleCacheService();
