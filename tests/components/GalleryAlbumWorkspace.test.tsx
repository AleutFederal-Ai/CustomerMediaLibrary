import { render, screen } from "@testing-library/react";
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
        tenantSlug="alpha"
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

    expect(
      screen.getByRole("link", { name: /Existing Album/i })
    ).toHaveAttribute("href", "/t/alpha/album/album-1");

    await user.click(
      screen.getByRole("button", { name: /Start a new album/i })
    );
    await user.type(screen.getByPlaceholderText(/Album name/i), "Fresh Collection");
    await user.type(
      screen.getByPlaceholderText(/Mission, event, or delivery summary/i),
      "Newly created collection"
    );
    await user.click(screen.getByRole("button", { name: /Create Album/i }));

    expect(
      await screen.findByRole(
        "link",
        { name: /Fresh Collection/i },
        { timeout: 10000 }
      )
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Fresh Collection/i })
    ).toHaveAttribute("href", "/t/alpha/album/album-2");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/albums?tenantId=tenant-1",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(refreshMock).toHaveBeenCalled();
  }, 10000);
});
