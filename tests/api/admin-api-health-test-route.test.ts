import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  isTenantAdmin: vi.fn(),
}));

vi.mock("@/lib/api/probe", () => ({
  runManualApiProbe: vi.fn(),
}));

import { POST } from "@/app/api/admin/api-health/test/route";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { runManualApiProbe } from "@/lib/api/probe";

describe("/api/admin/api-health/test", () => {
  it("blocks mutating probes without explicit confirmation", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    vi.mocked(isTenantAdmin).mockResolvedValue(true);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/api-health/test",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-email": "admin@example.com",
          "x-active-tenant-id": "tenant-1",
        },
        body: JSON.stringify({
          method: "DELETE",
          path: "/api/admin/albums?id=album-1",
        }),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("executes a safe manual probe", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    vi.mocked(isTenantAdmin).mockResolvedValue(true);
    vi.mocked(runManualApiProbe).mockResolvedValue({
      status: 200,
      ok: true,
      durationMs: 12,
      contentType: "application/json",
      responseBody: '{"status":"ok"}',
    });

    const request = new NextRequest(
      "http://localhost:3000/api/admin/api-health/test",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-email": "admin@example.com",
          "x-active-tenant-id": "tenant-1",
        },
        body: JSON.stringify({
          method: "GET",
          path: "/api/health",
        }),
      }
    );

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(200);
    expect(body.responseBody).toContain("ok");
  });
});
