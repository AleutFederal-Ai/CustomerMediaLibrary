import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usersFetchAllMock = vi.fn();
const membershipsFetchAllMock = vi.fn();

vi.mock("@/lib/auth/permissions", () => ({
  isSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  beginUserImpersonation: vi.fn(),
  endUserImpersonation: vi.fn(),
}));

vi.mock("@/lib/azure/cosmos", () => ({
  users: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({ fetchAll: usersFetchAllMock })),
    },
  })),
  memberships: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({ fetchAll: membershipsFetchAllMock })),
    },
  })),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/logging/structured", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/admin/users/impersonate/route";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { beginUserImpersonation, endUserImpersonation } from "@/lib/auth/session";

describe("/api/admin/users/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    vi.mocked(beginUserImpersonation).mockResolvedValue(true);
    vi.mocked(endUserImpersonation).mockResolvedValue(true);
    usersFetchAllMock.mockResolvedValue({
      resources: [
        {
          id: "user-1",
          email: "target@example.com",
          isBlocked: false,
        },
      ],
    });
    membershipsFetchAllMock.mockResolvedValue({
      resources: [{ tenantId: "tenant-1" }],
    });
  });

  it("starts impersonation for platform admins with tenant membership", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/users/impersonate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-email": "admin@example.com",
        "x-session-id": "session-1",
        "x-active-tenant-id": "tenant-9",
        "x-tenant-ids": "tenant-9,tenant-2",
      },
      body: JSON.stringify({
        email: "target@example.com",
        tenantId: "tenant-1",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(beginUserImpersonation).toHaveBeenCalledWith(
      "session-1",
      "admin@example.com",
      "target@example.com",
      "tenant-1",
      ["tenant-1"],
      "tenant-9",
      ["tenant-9", "tenant-2"]
    );
    expect(body.success).toBe(true);
  });

  it("rejects impersonation for non platform admins", async () => {
    vi.mocked(isSuperAdmin).mockResolvedValue(false);

    const request = new NextRequest("http://localhost:3000/api/admin/users/impersonate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-email": "member@example.com",
        "x-session-id": "session-1",
      },
      body: JSON.stringify({
        email: "target@example.com",
        tenantId: "tenant-1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("ends impersonation only when impersonator header exists", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/users/impersonate", {
      method: "DELETE",
      headers: {
        "x-session-id": "session-2",
        "x-impersonator-email": "admin@example.com",
        "x-active-tenant-id": "tenant-4",
        "x-tenant-ids": "tenant-4,tenant-5",
      },
    });

    const response = await DELETE(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(endUserImpersonation).toHaveBeenCalledWith(
      "session-2",
      "admin@example.com",
      "tenant-4",
      ["tenant-4", "tenant-5"]
    );
    expect(body.success).toBe(true);
  });
});
