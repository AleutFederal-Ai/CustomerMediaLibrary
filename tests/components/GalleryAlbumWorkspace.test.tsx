import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleryAlbumWorkspace from "@/components/gallery/GalleryAlbumWorkspace";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("GalleryAlbumWorkspace", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    global.fetch = vi.fn();
  });

  it("shows a newly created album immediately after a successful create", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "album-2",
        tenantId: "tenant-1",
        name: "Fresh Collection",
        description: "Newly created collection",
        order: 2,
      }),
    } as Response);

    render(
      <GalleryAlbumWorkspace
        canCreate={true}
        tenantId="tenant-1"
        initialAlbums={[
          {
            id: "album-1",
            tenantId: "tenant-1",
            name: "Existing Album",
            description: "Already present",
            mediaCount: 3,
            order: 1,
          },
        ]}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Stand up a new album workspace/i })
    );
    await user.type(screen.getByPlaceholderText(/Album name/i), "Fresh Collection");
    await user.type(
      screen.getByPlaceholderText(/Mission, event, or delivery summary/i),
      "Newly created collection"
    );
    await user.click(screen.getByRole("button", { name: /Create Album/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Fresh Collection/i })).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/albums?tenantId=tenant-1",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(refreshMock).toHaveBeenCalled();
  });
});
