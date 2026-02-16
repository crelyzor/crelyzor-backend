import prisma from "../../db/prismaClient";
import { redis } from "../../config/redisClient";
import { orgRole } from "../../types/authTypes";

export interface UserOrgRolesCache {
  orgRoles: orgRole[];
  cachedAt: number;
}

class OrgRoleCacheService {
  private readonly CACHE_KEY_PREFIX = "user:orgroles:";
  private readonly DEFAULT_TTL_SECONDS = 900; // 15 minutes

  private getCacheTTL(): number {
    const envTTL = process.env.USER_ORG_CACHE_TTL_SECONDS;
    return envTTL ? parseInt(envTTL, 10) : this.DEFAULT_TTL_SECONDS;
  }

  private getCacheKey(userId: string): string {
    return `${this.CACHE_KEY_PREFIX}${userId}`;
  }

  private async fetchFromDatabase(userId: string): Promise<orgRole[]> {
    const members = await prisma.organizationMember.findMany({
      where: { userId },
      select: {
        id: true,
        orgId: true,
        accessLevel: true,
      },
    });

    return members.map((m) => ({
      orgId: m.orgId,
      orgMemberId: m.id,
      accessLevel: m.accessLevel,
    }));
  }

  async getUserOrgRoles(userId: string): Promise<UserOrgRolesCache> {
    const cacheKey = this.getCacheKey(userId);

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        if (typeof cached === "object" && cached !== null) {
          return cached as UserOrgRolesCache;
        } else if (typeof cached === "string") {
          return JSON.parse(cached) as UserOrgRolesCache;
        }
      }

      const orgRoles = await this.fetchFromDatabase(userId);
      const cacheData: UserOrgRolesCache = { orgRoles, cachedAt: Date.now() };
      const ttl = this.getCacheTTL();
      await redis.set(cacheKey, JSON.stringify(cacheData), { ex: ttl });

      return cacheData;
    } catch (error) {
      console.error(
        `[OrgRoleCache] Redis error for user ${userId}, falling back to DB:`,
        error,
      );
      const orgRoles = await this.fetchFromDatabase(userId);
      return { orgRoles, cachedAt: Date.now() };
    }
  }

  async invalidateUserOrgRoles(userId: string): Promise<void> {
    try {
      await redis.del(this.getCacheKey(userId));
    } catch (error) {
      console.error(
        `[OrgRoleCache] Error invalidating cache for user ${userId}:`,
        error,
      );
    }
  }

  async invalidateUsersInOrganization(orgId: string): Promise<void> {
    try {
      const members = await prisma.organizationMember.findMany({
        where: { orgId },
        select: { userId: true },
      });
      await Promise.all(
        members.map((m) => this.invalidateUserOrgRoles(m.userId)),
      );
    } catch (error) {
      console.error(
        `[OrgRoleCache] Error invalidating org ${orgId} users:`,
        error,
      );
    }
  }
}

export const orgRoleCacheService = new OrgRoleCacheService();
