import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usersFetchAllMock, setSessionCookieMock } = vi.hoisted(() => ({
  usersFetchAllMock: vi.fn(),
  setSessionCookieMock: vi.fn(),
}));

vi.mock("@/lib/azure/cosmos", () => ({
  users: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({
        fetchAll: usersFetchAllMock,
      })),
    },
  })),
}));

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(),
  setSessionCookie: setSessionCookieMock,
}));

vi.mock("@/lib/auth/tenant", () => ({
  getTenantById: vi.fn(),
  getTenantBySlug: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

import { POST } from "@/app/api/auth/password/route";
import { canAccessAdmin } from "@/lib/auth/admin";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getTenantById, getTenantBySlug } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";

describe("/api/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersFetchAllMock.mockResolvedValue({
      resources: [
        {
          id: "user-1",
          email: "admin@example.com",
          passwordHash: "hash-123",
          isBlocked: false,
        },
      ],
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue({
      sessionId: "session-1",
      tenantIds: ["tenant-alpha"],
      activeTenantId: undefined,
      signedCookieValue: "signed-cookie",
    });
    vi.mocked(getTenantBySlug).mockResolvedValue(null);
    vi.mocked(getTenantById).mockResolvedValue(null);
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  });

  it("redirects a platform admin to the selected tenant workspace after password login", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue({
      id: "tenant-bravo",
      name: "Bravo",
      slug: "bravo",
      isActive: true,
      isPublic: false,
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      createdBy: "system",
    });
    vi.mocked(createSession).mockResolvedValue({
      sessionId: "session-1",
      tenantIds: ["tenant-alpha", "tenant-bravo"],
      activeTenantId: "tenant-bravo",
      signedCookieValue: "signed-cookie",
    });
    vi.mocked(canAccessAdmin).mockResolvedValue(true);

    const request = new NextRequest("http://localhost:3000/api/auth/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Password123!",
        tenantSlug: "bravo",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/t/bravo");
    expect(createSession).toHaveBeenCalledWith(
      "admin@example.com",
      "unknown",
      "tenant-bravo"
    );
    expect(setSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("still redirects to the admin console when no tenant was selected", async () => {
    vi.mocked(createSession).mockResolvedValue({
      sessionId: "session-1",
      tenantIds: [],
      activeTenantId: undefined,
      signedCookieValue: "signed-cookie",
    });
    vi.mocked(canAccessAdmin).mockResolvedValue(true);

    const request = new NextRequest("http://localhost:3000/api/auth/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Password123!",
        mode: "platform-admin",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/admin");
  });

  it("returns the original safe destination after password login", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Password123!",
        tenantSlug: "bravo",
        nextPath: "/t/bravo/media/media-123?view=detail",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/t/bravo/media/media-123?view=detail");
  });
});
