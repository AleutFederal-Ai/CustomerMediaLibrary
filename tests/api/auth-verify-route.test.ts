import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { setSessionCookieMock } = vi.hoisted(() => ({
  setSessionCookieMock: vi.fn(),
}));

vi.mock("@/lib/auth/magic-link", () => ({
  validateMagicLinkToken: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
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

vi.mock("@/lib/auth/base-url", () => ({
  getPublicBaseUrl: vi.fn(),
}));

import { GET, POST } from "@/app/api/auth/verify/route";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { validateMagicLinkToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { getTenantById, getTenantBySlug } from "@/lib/auth/tenant";
import { writeAuditLog } from "@/lib/audit/logger";

describe("/api/auth/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateMagicLinkToken).mockResolvedValue("admin@example.com");
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
    vi.mocked(getPublicBaseUrl).mockReturnValue("http://localhost:3000");
  });

  it("GET returns a confirmation landing page instead of immediately verifying", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify?token=token-123&tenant=bravo"
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Confirm Sign In");
    expect(html).toContain('name="token"');
    expect(html).toContain('value="token-123"');
    expect(html).toContain('value="bravo"');
    // Token should NOT have been consumed by GET
    expect(validateMagicLinkToken).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("GET redirects to login with error when token is missing", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify"
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=invalid");
  });

  it("POST redirects a platform admin to the selected tenant workspace after verification", async () => {
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

    const body = new URLSearchParams({
      token: "token-123",
      tenant: "bravo",
      next: "",
      mode: "",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/t/bravo");
    expect(createSession).toHaveBeenCalledWith(
      "admin@example.com",
      "unknown",
      "tenant-bravo"
    );
    expect(setSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("POST redirects to the admin console when no tenant was selected in platform-admin mode", async () => {
    vi.mocked(createSession).mockResolvedValue({
      sessionId: "session-1",
      tenantIds: [],
      activeTenantId: undefined,
      signedCookieValue: "signed-cookie",
    });
    vi.mocked(canAccessAdmin).mockResolvedValue(true);

    const body = new URLSearchParams({
      token: "token-123",
      tenant: "",
      next: "",
      mode: "platform-admin",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin");
  });

  it("POST keeps platform-admin magic-link sign-in on the admin console even with tenant memberships", async () => {
    vi.mocked(createSession).mockResolvedValue({
      sessionId: "session-1",
      tenantIds: ["tenant-alpha", "tenant-bravo"],
      activeTenantId: "tenant-alpha",
      signedCookieValue: "signed-cookie",
    });
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-alpha",
      name: "Alpha",
      slug: "alpha",
      isActive: true,
      isPublic: false,
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      createdBy: "system",
    });
    vi.mocked(canAccessAdmin).mockResolvedValue(true);

    const body = new URLSearchParams({
      token: "token-123",
      tenant: "",
      next: "",
      mode: "platform-admin",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin");
  });

  it("POST redirects back to the originally requested shared link after verification", async () => {
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

    const body = new URLSearchParams({
      token: "token-123",
      tenant: "bravo",
      next: "/t/bravo/album/album-123",
      mode: "",
    });
    const request = new NextRequest(
      "http://localhost:3000/api/auth/verify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/t/bravo/album/album-123"
    );
  });
});
