import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MediaGrid from "@/components/gallery/MediaGrid";
import { MediaListItem } from "@/types";

const ITEMS: MediaListItem[] = [
  {
    id: "image-1",
    albumId: "album-1",
    tenantId: "tenant-1",
    fileName: "alpha.jpg",
    title: "Alpha",
    fileType: "image",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    thumbnailUrl: "https://example.com/alpha.jpg",
    tags: [],
    uploadedAt: "2026-03-26T00:00:00.000Z",
  },
  {
    id: "video-1",
    albumId: "album-1",
    tenantId: "tenant-1",
    fileName: "bravo.mp4",
    title: "Bravo",
    fileType: "video",
    mimeType: "video/mp4",
    sizeBytes: 2048,
    thumbnailUrl: "https://example.com/bravo.jpg",
    tags: [],
    uploadedAt: "2026-03-26T00:00:00.000Z",
  },
];

describe("MediaGrid", () => {
  it("shows cover controls for a single selected image", () => {
    render(
      <MediaGrid
        items={ITEMS}
        selectedIds={new Set(["image-1"])}
        onSelectedChange={vi.fn()}
        onItemClick={vi.fn()}
        onBulkDownload={vi.fn()}
        onMakeAlbumCover={vi.fn()}
        albumCoverMediaId="video-1"
      />
    );

    expect(screen.getByRole("button", { name: /Make Album Cover/i })).toBeEnabled();
    expect(screen.getByText(/^Album Cover$/i)).toBeInTheDocument();
  });

  it("deletes the current selection from the toolbar", async () => {
    const user = userEvent.setup();
    const handleBulkDelete = vi.fn();

    render(
      <MediaGrid
        items={ITEMS}
        selectedIds={new Set(["image-1", "video-1"])}
        onSelectedChange={vi.fn()}
        onItemClick={vi.fn()}
        onBulkDownload={vi.fn()}
        onBulkDelete={handleBulkDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: /Delete Selection/i }));

    expect(handleBulkDelete).toHaveBeenCalledWith(["image-1", "video-1"]);
  });
});
