import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAllMock = vi.fn();
const queryMock = vi.fn(() => ({
  fetchAll: fetchAllMock,
}));

vi.mock("@/lib/auth/admin", () => ({
  canAccessAdmin: vi.fn(),
}));

vi.mock("@/lib/azure/cosmos", () => ({
  tenants: vi.fn(async () => ({
    items: {
      query: queryMock,
    },
  })),
}));

import { GET } from "@/app/api/tenants/route";
import { canAccessAdmin } from "@/lib/auth/admin";

describe("/api/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canAccessAdmin).mockResolvedValue(false);
    fetchAllMock.mockResolvedValue({ resources: [] });
  });

  it("returns the session tenant list for non-admin users", async () => {
    fetchAllMock.mockResolvedValue({
      resources: [
        {
          id: "tenant-1",
          name: "Alpha",
          slug: "alpha",
          isPublic: true,
          isActive: true,
          createdAt: "2026-03-23T00:00:00.000Z",
        },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/tenants", {
      headers: {
        "x-session-email": "viewer@example.com",
        "x-tenant-ids": "tenant-1,tenant-2",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("c.id IN"),
        parameters: [
          { name: "@t0", value: "tenant-1" },
          { name: "@t1", value: "tenant-2" },
        ],
      })
    );
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("tenant-1");
  });

  it("returns all active tenants for platform admins", async () => {
    vi.mocked(canAccessAdmin).mockResolvedValue(true);
    fetchAllMock.mockResolvedValue({
      resources: [
        {
          id: "tenant-1",
          name: "Alpha",
          slug: "alpha",
          isPublic: true,
          isActive: true,
          createdAt: "2026-03-23T00:00:00.000Z",
        },
        {
          id: "tenant-2",
          name: "Bravo",
          slug: "bravo",
          isPublic: false,
          isActive: true,
          createdAt: "2026-03-23T00:00:00.000Z",
        },
      ],
    });

    const request = new NextRequest("http://localhost:3000/api/tenants", {
      headers: {
        "x-session-email": "admin@example.com",
        "x-tenant-ids": "",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "SELECT * FROM c WHERE c.isActive = true ORDER BY c.name ASC",
        parameters: [],
      })
    );
    expect(body).toHaveLength(2);
  });
});
