import {
  albums,
  auditLogs,
  media,
  memberships,
  sessions,
  tenants,
  users,
} from "@/lib/azure/cosmos";
import { AuditLogRecord, TenantRecord } from "@/types";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  brandColor?: string;
  logoUrl?: string;
  isActive: boolean;
  albumCount: number;
  mediaCount: number;
  memberCount: number;
  storageMB: number;
}

export interface StatsResponse {
  totals: {
    tenants: number;
    activeTenants: number;
    users: number;
    media: number;
    albums: number;
    storageMB: number;
    activeSessions: number;
  };
  recentActivity: AuditLogRecord[];
  tenantSummaries: TenantSummary[];
}

async function countQuery(
  containerFn: () => Promise<import("@azure/cosmos").Container>,
  query: string,
  parameters?: { name: string; value: string }[]
): Promise<number> {
  const container = await containerFn();
  const { resources } = await container.items
    .query<number>({ query, parameters })
    .fetchAll();
  return resources[0] ?? 0;
}

export async function getPlatformStats(): Promise<StatsResponse> {
  const now = new Date().toISOString();

  const [
    totalTenants,
    activeTenants,
    totalUsers,
    totalMedia,
    totalAlbums,
    activeSessions,
    storageResult,
    recentActivity,
    allTenants,
  ] = await Promise.all([
    countQuery(tenants, "SELECT VALUE COUNT(1) FROM c"),
    countQuery(
      tenants,
      "SELECT VALUE COUNT(1) FROM c WHERE c.isActive = true"
    ),
    countQuery(users, "SELECT VALUE COUNT(1) FROM c"),
    countQuery(media, "SELECT VALUE COUNT(1) FROM c WHERE c.isDeleted = false"),
    countQuery(
      albums,
      "SELECT VALUE COUNT(1) FROM c WHERE c.isDeleted = false"
    ),
    countQuery(
      sessions,
      "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'session' AND c.expiresAt > @now",
      [{ name: "@now", value: now }]
    ),
    (async () => {
      const container = await media();
      const { resources } = await container.items
        .query<number>({
          query: "SELECT VALUE SUM(c.sizeBytes) FROM c WHERE c.isDeleted = false",
        })
        .fetchAll();
      return resources[0] ?? 0;
    })(),
    (async () => {
      const container = await auditLogs();
      const { resources } = await container.items
        .query<AuditLogRecord>({
          query: "SELECT TOP 10 * FROM c ORDER BY c.timestamp DESC",
        })
        .fetchAll();
      return resources;
    })(),
    (async () => {
      const container = await tenants();
      const { resources } = await container.items
        .query<TenantRecord>({
          query: "SELECT * FROM c ORDER BY c.name ASC",
        })
        .fetchAll();
      return resources;
    })(),
  ]);

  const tenantSummaries: TenantSummary[] = await Promise.all(
    allTenants.slice(0, 20).map(async (tenant) => {
      const [albumCount, mediaCount, memberCount, tenantStorage] =
        await Promise.all([
          countQuery(
            albums,
            "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
            [{ name: "@tid", value: tenant.id }]
          ),
          countQuery(
            media,
            "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
            [{ name: "@tid", value: tenant.id }]
          ),
          countQuery(
            memberships,
            "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isActive = true",
            [{ name: "@tid", value: tenant.id }]
          ),
          (async () => {
            const container = await media();
            const { resources } = await container.items
              .query<number>({
                query:
                  "SELECT VALUE SUM(c.sizeBytes) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
                parameters: [{ name: "@tid", value: tenant.id }],
              })
              .fetchAll();
            return resources[0] ?? 0;
          })(),
        ]);

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        brandColor: tenant.brandColor,
        logoUrl: tenant.logoUrl,
        isActive: tenant.isActive,
        albumCount,
        mediaCount,
        memberCount,
        storageMB: Math.round((tenantStorage as number) / (1024 * 1024)),
      };
    })
  );

  return {
    totals: {
      tenants: totalTenants,
      activeTenants,
      users: totalUsers,
      media: totalMedia,
      albums: totalAlbums,
      storageMB: Math.round((storageResult as number) / (1024 * 1024)),
      activeSessions,
    },
    recentActivity,
    tenantSummaries,
  };
}
