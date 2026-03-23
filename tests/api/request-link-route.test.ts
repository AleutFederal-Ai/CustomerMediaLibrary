import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/magic-link", () => ({
  checkRateLimit: vi.fn(),
  generateMagicLinkToken: vi.fn(),
}));

vi.mock("@/lib/azure/graph", () => ({
  sendMagicLinkEmail: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/base-url", () => ({
  getPublicBaseUrl: vi.fn(),
}));

vi.mock("@/lib/auth/tenant", () => ({
  getUserTenantIds: vi.fn(),
}));

import { POST } from "@/app/api/auth/request-link/route";
import { checkRateLimit, generateMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkEmail } from "@/lib/azure/graph";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getPublicBaseUrl } from "@/lib/auth/base-url";
import { getUserTenantIds } from "@/lib/auth/tenant";

describe("/api/auth/request-link", () => {
  it("sends a magic link for an explicitly authorized tenant member", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    vi.mocked(generateMagicLinkToken).mockResolvedValue("token-123");
    vi.mocked(sendMagicLinkEmail).mockResolvedValue(undefined);
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    vi.mocked(getPublicBaseUrl).mockReturnValue("http://localhost:3000");
    vi.mocked(getUserTenantIds).mockResolvedValue(["tenant-1"]);

    const request = new NextRequest("http://localhost:3000/api/auth/request-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "member@example.com",
        tenantSlug: "tenant-one",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("If your email is authorized");
    expect(sendMagicLinkEmail).toHaveBeenCalledOnce();
  });
});
