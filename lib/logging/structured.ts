import { NextRequest } from "next/server";

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

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

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
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

export function logInfo(event: string, context?: LogContext): void {
  emit("info", event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  emit("warn", event, context);
}

export function logError(event: string, context?: LogContext): void {
  emit("error", event, context);
}

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
