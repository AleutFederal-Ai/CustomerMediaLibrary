import { albums, media, tenants } from "@/lib/azure/cosmos";
import {
  ApiEndpointDefinition,
  ApiProbeResult,
  ApiProbeSummary,
  TenantRecord,
  MediaRecord,
  AlbumRecord,
} from "@/types";
import { API_ENDPOINTS, ProbeSamples, resolvePathTemplate } from "@/lib/api/registry";
import { logError, logInfo } from "@/lib/logging/structured";

interface ProbeAuthorization {
  isPlatformAdmin: boolean;
  isTenantAdmin: boolean;
  canContribute: boolean;
}

function canProbeEndpoint(
  endpoint: ApiEndpointDefinition,
  auth: ProbeAuthorization
): boolean {
  switch (endpoint.authScope) {
    case "public":
    case "authenticated":
    case "tenant":
      return true;
    case "tenantAdmin":
      return auth.isTenantAdmin || auth.isPlatformAdmin;
    case "contributor":
      return auth.canContribute || auth.isTenantAdmin || auth.isPlatformAdmin;
    case "platformAdmin":
      return auth.isPlatformAdmin;
    default:
      return false;
  }
}

function buildSummary(results: ApiProbeResult[]): ApiProbeSummary {
  return results.reduce<ApiProbeSummary>((summary, result) => {
    switch (result.status) {
      case "passed":
        summary.passed += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
    }
    return summary;
  }, { passed: 0, failed: 0, skipped: 0 });
}

async function getSampleData(activeTenantId: string | null): Promise<ProbeSamples> {
  const samples: ProbeSamples = {
    activeTenantId: activeTenantId ?? undefined,
  };

  if (!activeTenantId) return samples;

  try {
    const tenantContainer = await tenants();
    const { resources: tenantResources } = await tenantContainer.items
      .query<TenantRecord>({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: activeTenantId }],
      })
      .fetchAll();
    samples.activeTenantSlug = tenantResources[0]?.slug;
  } catch {
    // best-effort only
  }

  try {
    const albumsContainer = await albums();
    const { resources: albumResources } = await albumsContainer.items
      .query<AlbumRecord>({
        query:
          "SELECT TOP 1 * FROM c WHERE c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c['order'] ASC",
        parameters: [{ name: "@tenantId", value: activeTenantId }],
      })
      .fetchAll();
    samples.sampleAlbumId = albumResources[0]?.id;
  } catch {
    // best-effort only
  }

  if (!samples.sampleAlbumId) return samples;

  try {
    const mediaContainer = await media();
    const { resources: mediaResources } = await mediaContainer.items
      .query<MediaRecord>({
        query:
          "SELECT TOP 1 * FROM c WHERE c.tenantId = @tenantId AND c.albumId = @albumId AND c.isDeleted = false ORDER BY c.uploadedAt DESC",
        parameters: [
          { name: "@tenantId", value: activeTenantId },
          { name: "@albumId", value: samples.sampleAlbumId },
        ],
      })
      .fetchAll();
    samples.sampleMediaId = mediaResources[0]?.id;
  } catch {
    // best-effort only
  }

  return samples;
}

function getBaseUrlFromHeaders(headers: Headers): string {
  const localPort = process.env.WEBSITES_PORT ?? process.env.PORT;
  if (process.env.NODE_ENV === "production" && localPort) {
    return `http://127.0.0.1:${localPort}`;
  }

  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function truncateBody(text: string, maxLength = 2500): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export async function runAutomatedApiProbeSuite({
  requestHeaders,
  authorization,
}: {
  requestHeaders: Headers;
  authorization: ProbeAuthorization;
}): Promise<{
  samples: ProbeSamples;
  results: ApiProbeResult[];
  summary: ApiProbeSummary;
}> {
  const activeTenantId = requestHeaders.get("x-active-tenant-id");
  const samples = await getSampleData(activeTenantId);
  const baseUrl = getBaseUrlFromHeaders(requestHeaders);
  const cookie = requestHeaders.get("cookie") ?? "";
  const requestId = requestHeaders.get("x-request-id") ?? "unknown";

  const automatedEndpoints = API_ENDPOINTS.filter(
    (endpoint) => endpoint.verificationMode === "automated"
  );

  const results: ApiProbeResult[] = [];

  for (const endpoint of automatedEndpoints) {
    if (!canProbeEndpoint(endpoint, authorization)) {
      results.push({
        endpointId: endpoint.id,
        method: endpoint.method,
        path: endpoint.pathTemplate,
        status: "skipped",
        message: "Not authorized for current session scope.",
      });
      continue;
    }

    const resolvedPath = resolvePathTemplate(endpoint.pathTemplate, samples);
    if (!resolvedPath) {
      results.push({
        endpointId: endpoint.id,
        method: endpoint.method,
        path: endpoint.pathTemplate,
        status: "skipped",
        message: "Missing sample data required to probe this endpoint.",
      });
      continue;
    }

    const startedAt = Date.now();

    try {
      const response = await fetch(new URL(resolvedPath, baseUrl), {
        method: endpoint.method,
        headers: {
          cookie,
          "x-api-probe": "1",
          "x-request-id": `${requestId}:${endpoint.id}`,
        },
        cache: "no-store",
      });

      const responseText = await response.text();
      const ok = response.ok;
      results.push({
        endpointId: endpoint.id,
        method: endpoint.method,
        path: resolvedPath,
        status: ok ? "passed" : "failed",
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
        message: ok ? "Endpoint responded successfully." : "Endpoint returned a non-success status.",
        responsePreview: truncateBody(responseText),
      });
    } catch (error) {
      logError("api.probe.failed", {
        requestId,
        endpointId: endpoint.id,
        error,
      });
      results.push({
        endpointId: endpoint.id,
        method: endpoint.method,
        path: resolvedPath,
        status: "failed",
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = buildSummary(results);
  logInfo("api.probe.completed", {
    requestId,
    summary,
  });

  return {
    samples,
    results,
    summary,
  };
}

export async function runManualApiProbe({
  requestHeaders,
  method,
  path,
  body,
}: {
  requestHeaders: Headers;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: string;
}): Promise<{
  status: number;
  ok: boolean;
  durationMs: number;
  contentType: string;
  responseBody: string;
}> {
  const baseUrl = getBaseUrlFromHeaders(requestHeaders);
  const cookie = requestHeaders.get("cookie") ?? "";
  const requestId = requestHeaders.get("x-request-id") ?? "unknown";
  const startedAt = Date.now();

  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-api-probe": "1",
      "x-request-id": `${requestId}:manual`,
    },
    ...(body ? { body } : {}),
    cache: "no-store",
  });

  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    contentType: response.headers.get("content-type") ?? "unknown",
    responseBody: truncateBody(await response.text(), 6000),
  };
}
