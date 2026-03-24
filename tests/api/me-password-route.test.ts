import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usersPatchMock = vi.fn();

vi.mock("@/lib/azure/cosmos", () => ({
  users: vi.fn(async () => ({
    item: vi.fn(() => ({
      patch: usersPatchMock,
    })),
  })),
}));

vi.mock("@/lib/profile", () => ({
  getUserRecordByEmail: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

import { POST } from "@/app/api/me/password/route";
import { writeAuditLog } from "@/lib/audit/logger";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getUserRecordByEmail } from "@/lib/profile";
import { AuditAction } from "@/types";

describe("/api/me/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersPatchMock.mockResolvedValue({});
    vi.mocked(hashPassword).mockResolvedValue("hashed-password");
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  });

  it("requires the current password when one already exists", async () => {
    vi.mocked(getUserRecordByEmail).mockResolvedValue({
      id: "user-1",
      email: "operator@example.com",
      firstLoginAt: "2026-03-24T00:00:00.000Z",
      lastLoginAt: "2026-03-24T00:00:00.000Z",
      loginCount: 3,
      isBlocked: false,
      passwordHash: "existing-hash",
    });

    const request = new NextRequest("http://localhost:3000/api/me/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-email": "operator@example.com",
      },
      body: JSON.stringify({
        nextPassword: "this-is-a-valid-password",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Current password is required/i);
    expect(usersPatchMock).not.toHaveBeenCalled();
  });

  it("updates the current user's password", async () => {
    vi.mocked(getUserRecordByEmail).mockResolvedValue({
      id: "user-1",
      email: "operator@example.com",
      firstLoginAt: "2026-03-24T00:00:00.000Z",
      lastLoginAt: "2026-03-24T00:00:00.000Z",
      loginCount: 3,
      isBlocked: false,
      passwordHash: "existing-hash",
    });

    const request = new NextRequest("http://localhost:3000/api/me/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-email": "operator@example.com",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({
        currentPassword: "current-secret",
        nextPassword: "this-is-a-valid-password",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalledWith(
      "current-secret",
      "existing-hash"
    );
    expect(usersPatchMock).toHaveBeenCalledWith([
      { op: "add", path: "/passwordHash", value: "hashed-password" },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PASSWORD_SET,
      })
    );
    expect(body.ok).toBe(true);
  });
});
