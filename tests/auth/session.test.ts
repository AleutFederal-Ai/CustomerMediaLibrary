import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionsCreateMock = vi.fn();
const sessionsPatchMock = vi.fn();
const userFetchAllMock = vi.fn();
const userCreateMock = vi.fn();
const userPatchMock = vi.fn();

vi.mock("uuid", () => ({
  v4: vi.fn(() => "session-123"),
}));

vi.mock("@/lib/azure/keyvault", () => ({
  getSecret: vi.fn(async () => "test-secret"),
}));

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/tenant", () => ({
  getUserTenantIds: vi.fn(),
  getTenantById: vi.fn(),
}));

vi.mock("@/lib/azure/cosmos", () => ({
  sessions: vi.fn(async () => ({
    items: {
      create: sessionsCreateMock,
    },
    item: vi.fn(() => ({
      patch: sessionsPatchMock,
    })),
  })),
  users: vi.fn(async () => ({
    items: {
      query: vi.fn(() => ({
        fetchAll: userFetchAllMock,
      })),
      create: userCreateMock,
    },
    item: vi.fn(() => ({
      patch: userPatchMock,
    })),
  })),
}));

import { canAccessAdmin } from "@/lib/auth/admin";
import { getTenantById, getUserTenantIds } from "@/lib/auth/tenant";
import { createSession, switchActiveTenant } from "@/lib/auth/session";

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFetchAllMock.mockResolvedValue({ resources: [] });
    userCreateMock.mockResolvedValue({});
    sessionsCreateMock.mockResolvedValue({});
    sessionsPatchMock.mockResolvedValue({});
    userPatchMock.mockResolvedValue({});
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    vi.mocked(getUserTenantIds).mockResolvedValue(["tenant-alpha"]);
    vi.mocked(getTenantById).mockResolvedValue(null);
  });

  it("honors the selected tenant for a platform admin even when it is outside memberships", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    vi.mocked(getUserTenantIds).mockResolvedValue(["tenant-alpha"]);
    vi.mocked(getTenantById).mockResolvedValue({
      id: "tenant-bravo",
      name: "Bravo",
      slug: "bravo",
      isActive: true,
      isPublic: false,
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z",
      createdBy: "system",
    });

    const session = await createSession(
      "admin@example.com",
      "127.0.0.1",
      "tenant-bravo"
    );

    expect(session.activeTenantId).toBe("tenant-bravo");
    expect(session.tenantIds).toEqual(["tenant-alpha", "tenant-bravo"]);
    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTenantId: "tenant-bravo",
        tenantIds: ["tenant-alpha", "tenant-bravo"],
      })
    );
  });

  it("keeps the session tenant list aligned when switching active tenants", async () => {
    const switched = await switchActiveTenant(
      "session-123",
      "tenant-bravo",
      ["tenant-alpha", "tenant-bravo"]
    );

    expect(switched).toBe(true);
    expect(sessionsPatchMock).toHaveBeenCalledWith([
      { op: "replace", path: "/activeTenantId", value: "tenant-bravo" },
      {
        op: "replace",
        path: "/tenantIds",
        value: ["tenant-alpha", "tenant-bravo"],
      },
    ]);
  });
});
