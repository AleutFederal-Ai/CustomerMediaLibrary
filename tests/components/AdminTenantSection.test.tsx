import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminTenantSection from "@/app/admin/AdminTenantSection";

const refreshMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    replace: replaceMock,
  }),
}));

describe("AdminTenantSection", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    replaceMock.mockReset();
    global.fetch = vi.fn();
  });

  it("keeps tenant-scoped admin links on the selected tenant and updates the admin URL after a switch", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ activeTenantId: "tenant-2" }),
    } as Response);

    render(
      <AdminTenantSection
        activeTenant={{
          id: "tenant-1",
          name: "Alpha Tenant",
          slug: "alpha",
          brandColor: "#174365",
        }}
        tenantSummaries={[
          {
            id: "tenant-1",
            name: "Alpha Tenant",
            slug: "alpha",
            isActive: true,
            albumCount: 3,
            mediaCount: 11,
            memberCount: 4,
          },
          {
            id: "tenant-2",
            name: "Bravo Tenant",
            slug: "bravo",
            isActive: true,
            albumCount: 6,
            mediaCount: 28,
            memberCount: 9,
          },
        ]}
      />
    );

    expect(
      screen.getByRole("link", { name: /Manage Albums/i })
    ).toHaveAttribute("href", "/admin/albums?tenant=alpha");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Select active tenant/i }),
      "tenant-2"
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/sessions/current",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ tenantId: "tenant-2" }),
        })
      );
    });

    expect(replaceMock).toHaveBeenCalledWith("/admin?tenant=bravo");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
