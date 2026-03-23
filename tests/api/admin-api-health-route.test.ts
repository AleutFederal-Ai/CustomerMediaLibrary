import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  isTenantAdmin: vi.fn(),
  isMediaContributor: vi.fn(),
}));

vi.mock("@/lib/health/checks", () => ({
  getDependencyHealthReport: vi.fn(),
}));

vi.mock("@/lib/api/probe", () => ({
  runAutomatedApiProbeSuite: vi.fn(),
}));

import { GET } from "@/app/api/admin/api-health/route";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin, isMediaContributor } from "@/lib/auth/permissions";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { runAutomatedApiProbeSuite } from "@/lib/api/probe";

describe("/api/admin/api-health", () => {
  it("returns forbidden when user lacks admin access", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    vi.mocked(isTenantAdmin).mockResolvedValue(false);
    vi.mocked(isMediaContributor).mockResolvedValue(false);

    const request = new NextRequest("http://localhost:3000/api/admin/api-health", {
      headers: {
        "x-session-email": "viewer@example.com",
        "x-active-tenant-id": "tenant-1",
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("returns a snapshot for an authorized admin", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    vi.mocked(isTenantAdmin).mockResolvedValue(true);
    vi.mocked(isMediaContributor).mockResolvedValue(true);
    vi.mocked(getDependencyHealthReport).mockResolvedValue({
      status: "healthy",
      timestamp: "2026-03-23T00:00:00.000Z",
      checks: {
        cosmosDb: { ok: true, message: "connected", latencyMs: 10 },
        blobStorage: { ok: true, message: "connected", latencyMs: 20 },
        keyVault: { ok: true, message: "connected", latencyMs: 30 },
        graphApi: { ok: true, message: "reachable", latencyMs: 40 },
      },
    });
    vi.mocked(runAutomatedApiProbeSuite).mockResolvedValue({
      samples: {
        activeTenantId: "tenant-1",
        activeTenantSlug: "tenant-one",
        sampleAlbumId: "album-1",
        sampleMediaId: "media-1",
      },
      summary: { passed: 2, failed: 0, skipped: 1 },
      results: [
        {
          endpointId: "health",
          method: "GET",
          path: "/api/health",
          status: "passed",
          httpStatus: 200,
          durationMs: 10,
          message: "ok",
        },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/admin/api-health", {
      headers: {
        "x-session-email": "admin@example.com",
        "x-active-tenant-id": "tenant-1",
        cookie: "session=abc",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.probes.summary.passed).toBe(2);
    expect(body.samples.sampleAlbumId).toBe("album-1");
  });
});
