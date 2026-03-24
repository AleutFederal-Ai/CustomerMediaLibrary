import { NextRequest, NextResponse } from "next/server";
import {
  buildApiHealthSnapshot,
  getApiHealthAuthorization,
} from "@/lib/api/health-snapshot";
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

  const authorization = await getApiHealthAuthorization(email, activeTenantId);

  if (!authorization.isPlatformAdmin && !authorization.isTenantAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const snapshot = await buildApiHealthSnapshot({
      requestHeaders: request.headers,
      authorization,
    });

    logInfo("api.admin.api_health.completed", {
      ...context,
      durationMs: Date.now() - startedAt,
      probeSummary: snapshot.probes.summary,
      dependencyStatus: snapshot.dependencyHealth.status,
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
