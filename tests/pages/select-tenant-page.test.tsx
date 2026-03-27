import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectTenantPage from "@/app/select-tenant/page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("SelectTenantPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  it("filters public tenants using the search text box", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "1", name: "Alpha Workspace", slug: "alpha" },
        { id: "2", name: "Bravo Workspace", slug: "bravo" },
      ],
    } as Response);

    const user = userEvent.setup();
    render(<SelectTenantPage />);

    await screen.findByRole("button", { name: /Alpha Workspace/i });

    await user.type(
      screen.getByPlaceholderText(/Search by tenant name or slug/i),
      "bravo"
    );

    expect(
      screen.queryByRole("button", { name: /Alpha Workspace/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Bravo Workspace/i })
    ).toBeInTheDocument();
  });

  it("allows private tenant code entry and continues after lookup", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/tenants/public")) {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url.includes("/api/tenants/lookup") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ found: true }),
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const user = userEvent.setup();
    render(<SelectTenantPage />);

    await screen.findByText(/No public workspaces are currently listed/i);

    await user.type(
      screen.getByLabelText(/Private tenant code/i),
      "private-team"
    );
    await user.click(
      screen.getByRole("button", { name: /Continue with Private Tenant/i })
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/t/private-team/login");
    });
  });
});
