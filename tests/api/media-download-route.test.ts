import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/azure/cosmos", () => ({
  media: vi.fn(),
}));

vi.mock("@/lib/azure/blob", () => ({
  getBlobClient: vi.fn(),
}));

vi.mock("@/lib/audit/logger", () => ({
  writeAuditLog: vi.fn(),
}));

import { GET } from "@/app/api/media/download/route";
import { media } from "@/lib/azure/cosmos";

describe("/api/media/download", () => {
  it("rejects cross-tenant downloads", async () => {
    vi.mocked(media).mockResolvedValue({
      item: vi.fn().mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: {
            id: "media-1",
            albumId: "album-1",
            tenantId: "tenant-other",
            fileName: "secret.jpg",
            mimeType: "image/jpeg",
            blobName: "blob-1",
            isDeleted: false,
          },
        }),
      }),
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/media/download?id=media-1&albumId=album-1",
      {
        headers: {
          "x-session-email": "user@example.com",
          "x-active-tenant-id": "tenant-1",
        },
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
