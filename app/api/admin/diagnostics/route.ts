import { NextRequest, NextResponse } from "next/server";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { auditLogs, sessions, users, tenants, memberships, albums, media, domains } from "@/lib/azure/cosmos";
import { withRouteLogging, logWarn } from "@/lib/logging/structured";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/admin/diagnostics
//
// Comprehensive system diagnostics endpoint designed for automated monitoring.
// Returns infrastructure health, collection stats, recent audit events, and
// configuration state — everything a bot or operator needs to triage issues.
//
// Requires super-admin access.
// ---------------------------------------------------------------------------

interface CollectionStats {
  name: string;
  reachable: boolean;
  error?: string;
}

async function probeCollection(
  name: string,
  getter: () => Promise<{ read: () => Promise<unknown> }>,
): Promise<CollectionStats> {
  try {
    const container = await getter();
    await container.read();
    return { name, reachable: true };
  } catch (err) {
    return {
      name,
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface RecentAuditSummary {
  totalLast24h: number;
  errorActions: Array<{ action: string; count: number }>;
  recentEntries: Array<{
    timestamp: string;
    action: string;
    userEmail: string;
    detail: Record<string, unknown>;
  }>;
}

async function getRecentAuditSummary(): Promise<RecentAuditSummary> {
  try {
    const container = await auditLogs();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Count entries in last 24h
    const { resources: countResult } = await container.items
      .query<number>({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.timestamp >= @since",
        parameters: [{ name: "@since", value: since }],
      })
      .fetchAll();

    // Get error/failure actions in last 24h
    const { resources: errorActions } = await container.items
      .query<{ action: string; cnt: number }>({
        query:
          "SELECT c.action, COUNT(1) AS cnt FROM c WHERE c.timestamp >= @since AND (CONTAINS(c.action, 'FAILED') OR CONTAINS(c.action, 'BLOCKED') OR CONTAINS(c.action, 'RATE_LIMITED')) GROUP BY c.action",
        parameters: [{ name: "@since", value: since }],
      })
      .fetchAll();

    // Most recent 20 entries
    const { resources: recent } = await container.items
      .query<{
        timestamp: string;
        action: string;
        userEmail: string;
        detail: Record<string, unknown>;
      }>({
        query:
          "SELECT c.timestamp, c.action, c.userEmail, c.detail FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT 20",
      })
      .fetchAll();

    return {
      totalLast24h: countResult[0] ?? 0,
      errorActions: errorActions.map((e) => ({ action: e.action, count: e.cnt })),
      recentEntries: recent,
    };
  } catch (err) {
    return {
      totalLast24h: -1,
      errorActions: [],
      recentEntries: [
        {
          timestamp: new Date().toISOString(),
          action: "DIAGNOSTICS_ERROR",
          userEmail: "system",
          detail: { error: err instanceof Error ? err.message : String(err) },
        },
      ],
    };
  }
}

interface ActiveSessionStats {
  activeSessions: number;
  uniqueUsers: number;
}

async function getSessionStats(): Promise<ActiveSessionStats> {
  try {
    const container = await sessions();
    const now = new Date().toISOString();
    const { resources } = await container.items
      .query<{ cnt: number; users: number }>({
        query:
          "SELECT COUNT(1) AS cnt FROM c WHERE c.type = 'session' AND c.expiresAt > @now",
        parameters: [{ name: "@now", value: now }],
      })
      .fetchAll();

    const { resources: userCount } = await container.items
      .query<number>({
        query:
          "SELECT VALUE COUNT(1) FROM (SELECT DISTINCT c.email FROM c WHERE c.type = 'session' AND c.expiresAt > @now)",
        parameters: [{ name: "@now", value: now }],
      })
      .fetchAll();

    return {
      activeSessions: resources[0]?.cnt ?? 0,
      uniqueUsers: userCount[0] ?? 0,
    };
  } catch {
    return { activeSessions: -1, uniqueUsers: -1 };
  }
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const superAdmin = await isSuperAdmin(email);
  if (!superAdmin) {
    logWarn("admin.diagnostics.GET.forbidden", { email });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Run all diagnostics in parallel
  const [
    dependencyHealth,
    cosmosCollections,
    auditSummary,
    sessionStats,
  ] = await Promise.all([
    getDependencyHealthReport(),
    Promise.all([
      probeCollection("sessions", sessions),
      probeCollection("users", users),
      probeCollection("tenants", tenants),
      probeCollection("memberships", memberships),
      probeCollection("albums", albums),
      probeCollection("media", media),
      probeCollection("auditlogs", auditLogs),
      probeCollection("domains", domains),
    ]),
    getRecentAuditSummary(),
    getSessionStats(),
  ]);

  const allCollectionsOk = cosmosCollections.every((c) => c.reachable);

  const report = {
    generatedAt: new Date().toISOString(),
    overallStatus:
      dependencyHealth.status === "healthy" && allCollectionsOk
        ? "healthy"
        : "degraded",
    infrastructure: dependencyHealth,
    cosmosCollections,
    sessionStats,
    auditSummary,
    configuration: {
      logLevel: process.env.LOG_LEVEL ?? "info",
      nodeEnv: process.env.NODE_ENV ?? "development",
      azureCloud: process.env.AZURE_CLOUD ?? "not set",
      appBaseUrl: process.env.APP_BASE_URL ?? "not set",
      keyVaultConfigured: Boolean(process.env.AZURE_KEY_VAULT_URI),
      dockerDev: process.env.DOCKER_DEV === "true",
    },
  };

  return NextResponse.json(report, {
    status: report.overallStatus === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withRouteLogging("admin.diagnostics.GET", handleGet);
