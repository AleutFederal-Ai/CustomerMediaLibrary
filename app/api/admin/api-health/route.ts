import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isMediaContributor, isTenantAdmin } from "@/lib/auth/permissions";
import { API_ENDPOINTS } from "@/lib/api/registry";
import { runAutomatedApiProbeSuite } from "@/lib/api/probe";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { ApiHealthSnapshot } from "@/types";
import { getRequestLogContext, logError, logInfo } from "@/lib/logging/structured";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = getRequestLogContext(request);
  const startedAt = Date.now();

  const email = request.headers.get("x-session-email");
  const activeTenantId = request.headers.get("x-active-tenant-id") ?? "";
  if (!email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [isPlatformAdmin, isTenantAdm, canContribute] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
    activeTenantId
      ? isMediaContributor(email, activeTenantId)
      : Promise.resolve(false),
  ]);

  if (!isPlatformAdmin && !isTenantAdm) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [dependencyHealth, probes] = await Promise.all([
      getDependencyHealthReport(),
      runAutomatedApiProbeSuite({
        requestHeaders: request.headers,
        authorization: {
          isPlatformAdmin,
          isTenantAdmin: isTenantAdm,
          canContribute,
        },
      }),
    ]);

    const snapshot: ApiHealthSnapshot = {
      generatedAt: new Date().toISOString(),
      dependencyHealth,
      probes: {
        summary: probes.summary,
        results: probes.results,
      },
      endpoints: API_ENDPOINTS,
      samples: probes.samples,
    };

    logInfo("api.admin.api_health.completed", {
      ...context,
      durationMs: Date.now() - startedAt,
      probeSummary: probes.summary,
      dependencyStatus: dependencyHealth.status,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("api.admin.api_health.failed", {
      ...context,
      durationMs: Date.now() - startedAt,
      error,
    });
    return NextResponse.json(
      { error: "Failed to build API health snapshot" },
      { status: 500 }
    );
  }
}
