import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/base-url", () => ({
  getPublicBaseUrl: vi.fn(),
  isSameOriginRequest: vi.fn(() => true),
}));

vi.mock("@/lib/auth/session", () => ({
  switchActiveTenant: vi.fn(),
}));

vi.mock("@/lib/auth/tenant", () => ({
  getTenantById: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/sessions/current/route";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { switchActiveTenant } from "@/lib/auth/session";
import { getTenantById } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";
import { AuditAction } from "@/types";

describe("/api/sessions/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(switchActiveTenant).mockResolvedValue(true);
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    vi.mocked(getPublicBaseUrl).mockReturnValue("http://localhost:3000");
    vi.mocked(getTenantById).mockResolvedValue(null);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  });

  it("switches to a tenant already present in the session membership list", async () => {
    const request = new NextRequest("http://localhost:3000/api/sessions/current", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "session-1",
        "x-session-email": "viewer@example.com",
        "x-tenant-ids": "tenant-1,tenant-2",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({ tenantId: "tenant-2" }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activeTenantId).toBe("tenant-2");
    expect(switchActiveTenant).toHaveBeenCalledWith(
      "session-1",
      "tenant-2",
      ["tenant-1", "tenant-2"]
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.TENANT_SWITCHED,
        tenantId: "tenant-2",
      })
    );
  });

  it("allows a platform admin to switch into an active tenant outside the session list", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-9",
      name: "Tenant Nine",
      slug: "tenant-nine",
      isActive: true,
      isPublic: false,
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z",
      createdBy: "system",
    });

    const request = new NextRequest("http://localhost:3000/api/sessions/current", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "session-admin",
        "x-session-email": "admin@example.com",
        "x-tenant-ids": "tenant-1",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({ tenantId: "tenant-9" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(canAccessAdmin).toHaveBeenCalledWith("admin@example.com");
    expect(getTenantById).toHaveBeenCalledWith("tenant-9");
    expect(switchActiveTenant).toHaveBeenCalledWith(
      "session-admin",
      "tenant-9",
      ["tenant-1", "tenant-9"]
    );
  });

  it("rejects non-admin users who try to switch outside their session tenant list", async () => {
    const request = new NextRequest("http://localhost:3000/api/sessions/current", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "session-1",
        "x-session-email": "viewer@example.com",
        "x-tenant-ids": "tenant-1",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({ tenantId: "tenant-3" }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Not a member/i);
    expect(switchActiveTenant).not.toHaveBeenCalled();
  });

  it("switches tenant context and redirects for slug-route handoff", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/sessions/current?tenantId=tenant-2&next=%2Ft%2Fbravo",
      {
        method: "GET",
        headers: {
          "x-session-id": "session-1",
          "x-session-email": "viewer@example.com",
          "x-tenant-ids": "tenant-1,tenant-2",
          "x-client-ip": "127.0.0.1",
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/t/bravo");
    expect(switchActiveTenant).toHaveBeenCalledWith(
      "session-1",
      "tenant-2",
      ["tenant-1", "tenant-2"]
    );
  });

  it("builds tenant-switch redirects from the public host instead of the internal request url", async () => {
    vi.mocked(getPublicBaseUrl).mockReturnValue("https://mymedia.aleutfederal.us");

    const request = new NextRequest(
      "http://912b3c9a2f1f:8080/api/sessions/current?tenantId=tenant-2&next=%2Fadmin%3Ftenant%3Dbravo",
      {
        method: "GET",
        headers: {
          "x-session-id": "session-1",
          "x-session-email": "viewer@example.com",
          "x-tenant-ids": "tenant-1,tenant-2",
          "x-client-ip": "127.0.0.1",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "mymedia.aleutfederal.us",
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://mymedia.aleutfederal.us/admin?tenant=bravo"
    );
  });
});
