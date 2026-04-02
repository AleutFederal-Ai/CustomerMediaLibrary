import { NextRequest, NextResponse } from "next/server";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Log-level gating
// Set LOG_LEVEL env var to: debug | info | warn | error (default: info)
// "debug" enables verbose / trace-level output for diagnosing issues.
// ---------------------------------------------------------------------------
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase().trim();
  if (raw in LEVEL_ORDER) return raw as LogLevel;
  return "info";
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getConfiguredLevel()];
}

// ---------------------------------------------------------------------------
// Value sanitisation
// ---------------------------------------------------------------------------

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sanitizeValue(nested),
      ])
    );
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Core emit
// ---------------------------------------------------------------------------

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
  if (!shouldEmit(level)) return;

  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "mymedia-platform",
    environment: process.env.NODE_ENV ?? "development",
    ...Object.fromEntries(
      Object.entries(context).map(([key, value]) => [key, sanitizeValue(value)])
    ),
  };

  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

// ---------------------------------------------------------------------------
// Public log functions
// ---------------------------------------------------------------------------

export function logDebug(event: string, context?: LogContext): void {
  emit("debug", event, context);
}

export function logInfo(event: string, context?: LogContext): void {
  emit("info", event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  emit("warn", event, context);
}

export function logError(event: string, context?: LogContext): void {
  emit("error", event, context);
}

// ---------------------------------------------------------------------------
// Request context extraction
// ---------------------------------------------------------------------------

export function getRequestLogContext(request: NextRequest): LogContext {
  const requestId = request.headers.get("x-request-id") ?? "unknown";
  const email = request.headers.get("x-session-email") ?? null;
  const tenantId = request.headers.get("x-active-tenant-id") ?? null;
  const ipAddress = request.headers.get("x-client-ip") ?? null;

  return {
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
    queryKeys: Array.from(request.nextUrl.searchParams.keys()),
    userEmail: email,
    tenantId,
    ipAddress,
  };
}

// ---------------------------------------------------------------------------
// Route-level request/response logging wrapper
// Wrap any Next.js route handler to get automatic entry/exit logs with timing.
//
// Usage:
//   export const GET = withRouteLogging("admin.albums.GET", handler);
// ---------------------------------------------------------------------------

type RouteHandler = (
  request: NextRequest,
  context?: unknown,
) => Promise<NextResponse> | NextResponse;

export function withRouteLogging(
  routeName: string,
  handler: RouteHandler,
): RouteHandler {
  return async (request: NextRequest, context?: unknown) => {
    const start = Date.now();
    const reqCtx = getRequestLogContext(request);

    logInfo(`${routeName}.received`, reqCtx);

    try {
      const response = await handler(request, context);
      const durationMs = Date.now() - start;
      const status = response.status;

      const logFn = status >= 500 ? logError : status >= 400 ? logWarn : logInfo;
      logFn(`${routeName}.completed`, {
        ...reqCtx,
        status,
        durationMs,
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      logError(`${routeName}.unhandled_error`, {
        ...reqCtx,
        durationMs,
        error: err,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
