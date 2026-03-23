import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ApiHealthPortal from "@/components/admin/ApiHealthPortal";
import { ApiHealthSnapshot } from "@/types";

const snapshot: ApiHealthSnapshot = {
  generatedAt: "2026-03-23T00:00:00.000Z",
  dependencyHealth: {
    status: "healthy",
    timestamp: "2026-03-23T00:00:00.000Z",
    checks: {
      cosmosDb: { ok: true, message: "connected", latencyMs: 10 },
      blobStorage: { ok: true, message: "connected", latencyMs: 20 },
      keyVault: { ok: null, message: "not configured" },
      graphApi: { ok: true, message: "reachable", latencyMs: 30 },
    },
  },
  probes: {
    summary: { passed: 2, failed: 1, skipped: 0 },
    results: [
      {
        endpointId: "health",
        method: "GET",
        path: "/api/health",
        status: "passed",
        httpStatus: 200,
        durationMs: 15,
        message: "Endpoint responded successfully.",
      },
    ],
  },
  endpoints: [
    {
      id: "health",
      category: "Platform",
      method: "GET",
      pathTemplate: "/api/health",
      description: "Health endpoint",
      authScope: "public",
      verificationMode: "automated",
    },
    {
      id: "admin-users",
      category: "Admin",
      method: "PATCH",
      pathTemplate: "/api/admin/users",
      description: "Update user",
      authScope: "platformAdmin",
      verificationMode: "manual",
      sampleBody: '{ "email": "admin@example.com" }',
      destructive: true,
    },
  ],
  samples: {
    activeTenantId: "tenant-1",
    activeTenantSlug: "tenant-one",
    sampleAlbumId: "album-1",
    sampleMediaId: "media-1",
  },
};

describe("ApiHealthPortal", () => {
  it("renders probe summary and runs a manual request", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        method: "GET",
        path: "/api/health",
        ok: true,
        status: 200,
        durationMs: 11,
        contentType: "application/json",
        responseBody: '{"status":"healthy"}',
      }),
    }) as typeof fetch;

    render(<ApiHealthPortal initialSnapshot={snapshot} />);

    expect(screen.getByText(/Safe endpoint verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Health endpoint/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run Manual Probe/i }));

    await waitFor(() => {
      expect(screen.getByText(/"status":"healthy"/i)).toBeInTheDocument();
    });
  });
});
