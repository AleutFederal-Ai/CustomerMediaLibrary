import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaReadMock = vi.fn();
const mediaPatchMock = vi.fn();

vi.mock("@/lib/azure/cosmos", () => ({
  media: vi.fn(async () => ({
    item: vi.fn(() => ({
      read: mediaReadMock,
      patch: mediaPatchMock,
    })),
  })),
}));

vi.mock("@/lib/azure/blob", () => ({
  generateSasUrl: vi.fn(async (_container: string, blobName: string) => ({
    sasUrl: `https://example.com/${blobName}`,
    expiresAt: "2026-03-26T00:00:00.000Z",
  })),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  isMediaContributor: vi.fn(),
  isTenantAdmin: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/media/[id]/route";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { AuditAction } from "@/types";

describe("/api/media/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaPatchMock.mockResolvedValue({});
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);
  });

  it("returns a default title when older media does not have one yet", async () => {
    mediaReadMock.mockResolvedValue({
      resource: {
        id: "media-1",
        albumId: "album-1",
        tenantId: "tenant-1",
        fileName: "briefing-photo.jpg",
        fileType: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        blobName: "tenant-1/album-1/media-1.jpg",
        thumbnailBlobName: "tenant-1/album-1/media-1_thumb.webp",
        tags: ["featured"],
        uploadedAt: "2026-03-25T00:00:00.000Z",
        uploadedBy: "operator@example.com",
        isDeleted: false,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/media/media-1", {
      headers: {
        "x-session-email": "operator@example.com",
        "x-client-ip": "127.0.0.1",
        "x-active-tenant-id": "tenant-1",
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ id: "media-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe("briefing-photo");
    expect(body.tags).toEqual(["featured"]);
  });

  it("updates media metadata for tenant admins only", async () => {
    vi.mocked(isTenantAdmin).mockResolvedValue(true);
    mediaReadMock.mockResolvedValue({
      resource: {
        id: "media-1",
        albumId: "album-1",
        tenantId: "tenant-1",
        fileName: "briefing-photo.jpg",
        title: "Original title",
        description: "Original description",
        fileType: "image",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        blobName: "tenant-1/album-1/media-1.jpg",
        thumbnailBlobName: "tenant-1/album-1/media-1_thumb.webp",
        tags: ["original"],
        uploadedAt: "2026-03-25T00:00:00.000Z",
        uploadedBy: "operator@example.com",
        isDeleted: false,
      },
    });

    const request = new NextRequest("http://localhost:3000/api/media/media-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-email": "admin@example.com",
        "x-client-ip": "127.0.0.1",
        "x-active-tenant-id": "tenant-1",
      },
      body: JSON.stringify({
        title: " Updated title ",
        description: " Updated description ",
        tags: [" Featured ", "archive", "featured"],
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "media-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mediaPatchMock).toHaveBeenCalledWith([
      { op: "replace", path: "/title", value: "Updated title" },
      { op: "replace", path: "/description", value: "Updated description" },
      { op: "replace", path: "/tags", value: ["featured", "archive"] },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEDIA_UPDATED,
      })
    );
    expect(body.title).toBe("Updated title");
    expect(body.description).toBe("Updated description");
    expect(body.tags).toEqual(["featured", "archive"]);
  });

  it("rejects metadata updates for non-admin users", async () => {
    vi.mocked(isTenantAdmin).mockResolvedValue(false);

    const request = new NextRequest("http://localhost:3000/api/media/media-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-session-email": "viewer@example.com",
        "x-active-tenant-id": "tenant-1",
      },
      body: JSON.stringify({
        title: "Should not save",
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "media-1" }),
    });

    expect(response.status).toBe(403);
    expect(mediaPatchMock).not.toHaveBeenCalled();
  });
});
