import { NextRequest, NextResponse } from "next/server";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { getRequestLogContext, logError, logInfo } from "@/lib/logging/structured";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();
  const context = getRequestLogContext(request);

  try {
    const report = await getDependencyHealthReport();
    logInfo("api.health.completed", {
      ...context,
      durationMs: Date.now() - start,
      status: report.status,
    });

    return NextResponse.json(report, {
      status: report.status === "degraded" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("api.health.failed", {
      ...context,
      durationMs: Date.now() - start,
      error,
    });
    return NextResponse.json(
      { error: "Failed to compute health report" },
      { status: 500 }
    );
  }
}
