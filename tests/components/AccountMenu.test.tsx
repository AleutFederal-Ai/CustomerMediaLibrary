import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AccountMenu from "@/components/account/AccountMenu";

describe("AccountMenu", () => {
  it("opens the profile and sign-out actions from the account button", async () => {
    const user = userEvent.setup();

    render(
      <AccountMenu
        email="operator@example.com"
        activeScopeLabel="Alpha Tenant"
      />
    );

    await user.click(screen.getByRole("button", { name: /Account/i }));

    expect(screen.getByRole("link", { name: /Manage Profile/i })).toHaveAttribute(
      "href",
      "/profile"
    );
    expect(
      screen.getByRole("link", { name: /Password & Access/i })
    ).toHaveAttribute("href", "/profile#password-access");
    expect(screen.getByRole("link", { name: /My Content/i })).toHaveAttribute(
      "href",
      "/profile#owned-content"
    );
    expect(screen.getByRole("link", { name: /Sign Out/i })).toHaveAttribute(
      "href",
      "/api/auth/signout"
    );
  });
});
