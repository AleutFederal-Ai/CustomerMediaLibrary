import { NextRequest, NextResponse } from "next/server";
import {
  tenants,
  users,
  media,
  albums,
  sessions,
  auditLogs,
  memberships,
} from "@/lib/azure/cosmos";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { TenantRecord, AuditLogRecord } from "@/types";

interface TenantSummary {
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

interface StatsResponse {
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

// GET /api/admin/stats — platform dashboard metrics
export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isAdmin = await isSuperAdmin(email);
  if (!isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const now = new Date().toISOString();

    // Run all aggregate queries in parallel
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
      countQuery(
        media,
        "SELECT VALUE COUNT(1) FROM c WHERE c.isDeleted = false"
      ),
      countQuery(
        albums,
        "SELECT VALUE COUNT(1) FROM c WHERE c.isDeleted = false"
      ),
      countQuery(
        sessions,
        "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'session' AND c.expiresAt > @now",
        [{ name: "@now", value: now }]
      ),
      // Storage sum
      (async () => {
        const container = await media();
        const { resources } = await container.items
          .query<number>({
            query:
              "SELECT VALUE SUM(c.sizeBytes) FROM c WHERE c.isDeleted = false",
          })
          .fetchAll();
        return resources[0] ?? 0;
      })(),
      // Recent audit entries
      (async () => {
        const container = await auditLogs();
        const { resources } = await container.items
          .query<AuditLogRecord>({
            query: "SELECT TOP 10 * FROM c ORDER BY c.timestamp DESC",
          })
          .fetchAll();
        return resources;
      })(),
      // All tenants for per-tenant summaries
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

    const storageMB = Math.round((storageResult as number) / (1024 * 1024));

    // Per-tenant summaries — run count queries for each tenant (limit to 20)
    const tenantSubset = allTenants.slice(0, 20);
    const tenantSummaries: TenantSummary[] = await Promise.all(
      tenantSubset.map(async (t) => {
        const [albumCount, mediaCount, memberCount, tenantStorage] =
          await Promise.all([
            countQuery(
              albums,
              "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
              [{ name: "@tid", value: t.id }]
            ),
            countQuery(
              media,
              "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
              [{ name: "@tid", value: t.id }]
            ),
            countQuery(
              memberships,
              "SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tid AND c.isActive = true",
              [{ name: "@tid", value: t.id }]
            ),
            (async () => {
              const container = await media();
              const { resources } = await container.items
                .query<number>({
                  query:
                    "SELECT VALUE SUM(c.sizeBytes) FROM c WHERE c.tenantId = @tid AND c.isDeleted = false",
                  parameters: [{ name: "@tid", value: t.id }],
                })
                .fetchAll();
              return resources[0] ?? 0;
            })(),
          ]);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          brandColor: t.brandColor,
          logoUrl: t.logoUrl,
          isActive: t.isActive,
          albumCount,
          mediaCount,
          memberCount,
          storageMB: Math.round((tenantStorage as number) / (1024 * 1024)),
        };
      })
    );

    const response: StatsResponse = {
      totals: {
        tenants: totalTenants,
        activeTenants,
        users: totalUsers,
        media: totalMedia,
        albums: totalAlbums,
        storageMB,
        activeSessions,
      },
      recentActivity,
      tenantSummaries,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[admin/stats] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
