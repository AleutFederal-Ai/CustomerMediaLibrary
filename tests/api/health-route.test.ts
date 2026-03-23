import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/health/checks", () => ({
  getDependencyHealthReport: vi.fn(),
}));

import { GET } from "@/app/api/health/route";
import { getDependencyHealthReport } from "@/lib/health/checks";

describe("/api/health", () => {
  it("returns dependency report and healthy status", async () => {
    vi.mocked(getDependencyHealthReport).mockResolvedValue({
      status: "healthy",
      timestamp: "2026-03-23T00:00:00.000Z",
      checks: {
        cosmosDb: { ok: true, message: "connected", latencyMs: 10 },
        blobStorage: { ok: true, message: "connected", latencyMs: 20 },
        keyVault: { ok: null, message: "not configured" },
        graphApi: { ok: true, message: "reachable", latencyMs: 30 },
      },
    });

    const request = new NextRequest("http://localhost:3000/api/health", {
      headers: {
        "x-request-id": "req-health",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.cosmosDb.ok).toBe(true);
  });
});
