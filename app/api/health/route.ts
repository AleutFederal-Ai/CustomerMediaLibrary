import { NextRequest, NextResponse } from "next/server";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { withRouteLogging, logError } from "@/lib/logging/structured";

export const dynamic = "force-dynamic";

async function handleGet(request: NextRequest): Promise<NextResponse> {
  try {
    const report = await getDependencyHealthReport();

    return NextResponse.json(report, {
      status: report.status === "degraded" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("health.GET.failed", { error });
    return NextResponse.json(
      { error: "Failed to compute health report" },
      { status: 500 }
    );
  }
}

export const GET = withRouteLogging("health.GET", handleGet);
