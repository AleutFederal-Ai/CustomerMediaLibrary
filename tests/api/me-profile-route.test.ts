import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const usersPatchMock = vi.fn();
const usersCreateMock = vi.fn();

vi.mock("@/lib/azure/cosmos", () => ({
  users: vi.fn(async () => ({
    items: {
      create: usersCreateMock,
    },
    item: vi.fn(() => ({
      patch: usersPatchMock,
    })),
  })),
}));

vi.mock("@/lib/profile", () => ({
  getUserRecordByEmail: vi.fn(),
  toUserProfileSummary: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/me/profile/route";
import { writeAuditLog } from "@/lib/audit/logger";
import { getUserRecordByEmail, toUserProfileSummary } from "@/lib/profile";
import { AuditAction } from "@/types";

describe("/api/me/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersPatchMock.mockResolvedValue({});
    usersCreateMock.mockResolvedValue({});
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
    vi.mocked(getUserRecordByEmail).mockResolvedValue({
      id: "user-1",
      email: "operator@example.com",
      firstLoginAt: "2026-03-24T00:00:00.000Z",
      lastLoginAt: "2026-03-24T00:00:00.000Z",
      loginCount: 3,
      isBlocked: false,
      displayName: "Operator Example",
      passwordHash: "hash-123",
      isPlatformAdmin: true,
    });
    vi.mocked(toUserProfileSummary).mockReturnValue({
      email: "operator@example.com",
      displayName: "Operator Example",
      loginCount: 3,
      hasPassword: true,
      isPlatformAdmin: true,
    });
  });

  it("returns the current user's safe profile summary", async () => {
    const request = new NextRequest("http://localhost:3000/api/me/profile", {
      headers: {
        "x-session-email": "operator@example.com",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getUserRecordByEmail).toHaveBeenCalledWith("operator@example.com");
    expect(body.email).toBe("operator@example.com");
    expect(body.hasPassword).toBe(true);
  });

  it("updates self-service profile fields", async () => {
    vi.mocked(getUserRecordByEmail)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "operator@example.com",
        firstLoginAt: "2026-03-24T00:00:00.000Z",
        lastLoginAt: "2026-03-24T00:00:00.000Z",
        loginCount: 3,
        isBlocked: false,
        displayName: "Operator Example",
      })
      .mockResolvedValueOnce({
        id: "user-1",
        email: "operator@example.com",
        firstLoginAt: "2026-03-24T00:00:00.000Z",
        lastLoginAt: "2026-03-24T00:00:00.000Z",
        loginCount: 3,
        isBlocked: false,
        displayName: "Updated Operator",
        jobTitle: "Program Manager",
      });
    vi.mocked(toUserProfileSummary).mockReturnValue({
      email: "operator@example.com",
      displayName: "Updated Operator",
      jobTitle: "Program Manager",
      loginCount: 3,
      hasPassword: false,
      isPlatformAdmin: false,
    });

    const request = new NextRequest("http://localhost:3000/api/me/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-email": "operator@example.com",
        "x-client-ip": "127.0.0.1",
      },
      body: JSON.stringify({
        displayName: "Updated Operator",
        jobTitle: "Program Manager",
        organization: "",
        phoneNumber: "",
        officeLocation: "",
      }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(usersPatchMock).toHaveBeenCalledWith([
      { op: "add", path: "/displayName", value: "Updated Operator" },
      { op: "add", path: "/jobTitle", value: "Program Manager" },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PROFILE_UPDATED,
      })
    );
    expect(body.displayName).toBe("Updated Operator");
  });
});
