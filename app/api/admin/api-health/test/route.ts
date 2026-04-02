import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { runManualApiProbe } from "@/lib/api/probe";
import { ApiManualProbeResponse } from "@/types";
import { withRouteLogging, getRequestLogContext, logError, logInfo, logWarn } from "@/lib/logging/structured";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const BLOCKED_PATHS = new Set([
  "/api/admin/api-health",
  "/api/admin/api-health/test",
]);

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const context = getRequestLogContext(request);
  const startedAt = Date.now();
  const email = request.headers.get("x-session-email");
  const activeTenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!email) {
    logWarn("admin.api-health.test.POST.forbidden", { email: null, reason: "Missing session email" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [isPlatformAdmin, isTenantAdm] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
  ]);

  if (!isPlatformAdmin && !isTenantAdm) {
    logWarn("admin.api-health.test.POST.forbidden", { email, reason: "Not a platform or tenant admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    method?: string;
    path?: string;
    requestBody?: string;
    allowMutating?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const method = (body.method ?? "GET").toUpperCase();
  const path = body.path ?? "";
  const requestBody = body.requestBody;
  const allowMutating = body.allowMutating === true;

  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: "Unsupported method" }, { status: 400 });
  }

  if (!path.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Only same-origin /api/* paths can be tested." },
      { status: 400 }
    );
  }

  if (BLOCKED_PATHS.has(path.split("?")[0])) {
    return NextResponse.json(
      { error: "Recursive health test routes cannot be targeted." },
      { status: 400 }
    );
  }

  if ((method === "POST" || method === "PATCH" || method === "DELETE") && !allowMutating) {
    logWarn("api.admin.manual_probe.blocked_mutation", {
      ...context,
      targetMethod: method,
      targetPath: path,
    });
    return NextResponse.json(
      {
        error:
          "Mutating requests require explicit allowMutating=true confirmation.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await runManualApiProbe({
      requestHeaders: request.headers,
      method: method as "GET" | "POST" | "PATCH" | "DELETE",
      path,
      body: requestBody,
    });

    const response: ApiManualProbeResponse = {
      method,
      path,
      ...result,
    };

    logInfo("api.admin.manual_probe.completed", {
      ...context,
      durationMs: Date.now() - startedAt,
      targetMethod: method,
      targetPath: path,
      status: result.status,
    });

    return NextResponse.json(response, {
      status: result.ok ? 200 : 502,
    });
  } catch (error) {
    logError("api.admin.manual_probe.failed", {
      ...context,
      durationMs: Date.now() - startedAt,
      targetMethod: method,
      targetPath: path,
      error,
    });
    return NextResponse.json(
      { error: "Failed to run manual API probe" },
      { status: 500 }
    );
  }
}

export const POST = withRouteLogging("admin.api-health.test.POST", handlePost);
