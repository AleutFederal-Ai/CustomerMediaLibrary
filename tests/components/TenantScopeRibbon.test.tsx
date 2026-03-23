import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TenantScopeRibbon from "@/components/gallery/TenantScopeRibbon";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("TenantScopeRibbon", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    global.fetch = vi.fn();
  });

  it("shows the active tenant and switches tenant context from the ribbon", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ activeTenantId: "tenant-2" }),
    } as Response);

    render(
      <TenantScopeRibbon
        activeTenant={{
          id: "tenant-1",
          name: "Alpha Tenant",
          slug: "alpha",
          brandColor: "#174365",
        }}
        tenants={[
          { id: "tenant-1", name: "Alpha Tenant", slug: "alpha" },
          { id: "tenant-2", name: "Bravo Tenant", slug: "bravo" },
        ]}
        roleLabel="Platform Admin"
        albumCount={4}
      />
    );

    expect(screen.getByRole("heading", { name: /Alpha Tenant/i })).toBeInTheDocument();
    expect(screen.getByText(/Collections/i)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/Switch Workspace/i),
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

    expect(refreshMock).toHaveBeenCalled();
  });
});
