import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  usersFetchAllMock,
  membershipsFetchAllMock,
  tenantsFetchAllMock,
  usersCreateMock,
  membershipsCreateMock,
  membershipsPatchMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  usersFetchAllMock: vi.fn(),
  membershipsFetchAllMock: vi.fn(),
  tenantsFetchAllMock: vi.fn(),
  usersCreateMock: vi.fn(),
  membershipsCreateMock: vi.fn(),
  membershipsPatchMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

const usersQueryMock = vi.fn((querySpec: { query: string }) => {
  if (querySpec.query.includes("FROM c WHERE c.email = @email")) {
    return { fetchAll: usersFetchAllMock };
  }

  return { fetchAll: vi.fn().mockResolvedValue({ resources: [] }) };
});

const membershipsQueryMock = vi.fn(() => ({ fetchAll: membershipsFetchAllMock }));

vi.mock("@/lib/auth/permissions", () => ({
  isSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/azure/cosmos", () => ({
  users: vi.fn(async () => ({
    items: {
      query: usersQueryMock,
      create: usersCreateMock,
    },
  })),
  sessions: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({ fetchAll: vi.fn().mockResolvedValue({ resources: [] }) })),
    },
  })),
  memberships: vi.fn(async () => ({
    items: {
      query: membershipsQueryMock,
      create: membershipsCreateMock,
    },
    item: vi.fn(() => ({ patch: membershipsPatchMock })),
  })),
  tenants: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({ fetchAll: tenantsFetchAllMock })),
    },
  })),
}));

import { POST } from "@/app/api/admin/users/route";
import { isSuperAdmin } from "@/lib/auth/permissions";

describe("/api/admin/users POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuperAdmin).mockResolvedValue(true);
    usersFetchAllMock.mockResolvedValue({ resources: [] });
    membershipsFetchAllMock.mockResolvedValue({ resources: [] });
    tenantsFetchAllMock.mockResolvedValue({ resources: [{ id: "tenant-123" }] });
    usersCreateMock.mockResolvedValue({ resource: { id: "new-user-id" } });
    membershipsCreateMock.mockResolvedValue({});
    membershipsPatchMock.mockResolvedValue({});
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("creates a direct user and provisions tenant membership", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-email": "admin@example.com",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({
        email: "new.user@example.com",
        action: "create",
        tenantId: "tenant-123",
        tenantRole: "contributor",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, created: true });
    expect(usersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.user@example.com",
        loginCount: 0,
        isBlocked: false,
      })
    );
    expect(membershipsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-123",
        userEmail: "new.user@example.com",
        role: "contributor",
      })
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_created",
        detail: expect.objectContaining({
          targetEmail: "new.user@example.com",
          created: true,
          tenantId: "tenant-123",
        }),
      })
    );
  });

  it("reuses an existing user and updates existing membership", async () => {
    usersFetchAllMock.mockResolvedValueOnce({
      resources: [
        {
          id: "existing-user",
          email: "existing@example.com",
          firstLoginAt: "2026-01-01T00:00:00.000Z",
          lastLoginAt: "2026-01-01T00:00:00.000Z",
          loginCount: 1,
          isBlocked: false,
        },
      ],
    });
    membershipsFetchAllMock.mockResolvedValueOnce({
      resources: [
        {
          id: "membership-1",
          tenantId: "tenant-123",
          userEmail: "existing@example.com",
          role: "viewer",
          source: "explicit",
          addedAt: "2026-01-01T00:00:00.000Z",
          addedBy: "admin@example.com",
          isActive: false,
        },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-email": "admin@example.com",
      },
      body: JSON.stringify({
        email: "existing@example.com",
        action: "create",
        tenantId: "tenant-123",
        tenantRole: "admin",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, created: false });
    expect(usersCreateMock).not.toHaveBeenCalled();
    expect(membershipsPatchMock).toHaveBeenCalled();
  });

  it("rejects provisioning when selected tenant is inactive or missing", async () => {
    tenantsFetchAllMock.mockResolvedValueOnce({ resources: [] });

    const request = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-email": "admin@example.com",
      },
      body: JSON.stringify({
        email: "new.user@example.com",
        action: "create",
        tenantId: "tenant-missing",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("tenant");
    expect(membershipsCreateMock).not.toHaveBeenCalled();
  });
});
