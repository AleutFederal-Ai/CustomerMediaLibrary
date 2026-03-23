import { expect, test, type Page } from "@playwright/test";

async function stubLoginApis(page: Page) {
  await page.route("**/api/tenants/public", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "tenant-1",
          name: "Acme Mission Group",
          slug: "acme-mission",
          description: "Operational imagery and media workspace",
          brandColor: "#174365",
        },
      ]),
    });
  });

  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks: {
          cosmosDb: { ok: true, message: "connected", latencyMs: 12 },
          blobStorage: { ok: true, message: "connected", latencyMs: 18 },
          keyVault: { ok: null, message: "not configured" },
          graphApi: { ok: true, message: "reachable", latencyMs: 22 },
        },
      }),
    });
  });
}

test("login page renders secure tenant entry flow", async ({ page }) => {
  await stubLoginApis(page);

  await page.goto("/login");

  await expect(page.getByText(/Controlled Unclassified Information/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /myMedia Platform/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Choose your organization/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Acme Mission Group/i })).toBeVisible();
  await expect(page.getByText(/Cosmos DB/i)).toBeVisible();
  await expect(page.getByText(/Authorized, monitored, and tenant-scoped access/i)).toBeVisible();
});

test("login page stays mobile-friendly without horizontal overflow", async ({
  page,
}) => {
  await stubLoginApis(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/login");

  await expect(
    page.getByRole("heading", {
      name: /Controlled media access with tenant-safe sign-in/i,
    })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Choose your organization/i })).toBeVisible();
  await expect(page.getByText(/Platform Health/i)).toBeVisible();
  await expect(
    page.getByText(/Authorized, monitored, and tenant-scoped access/i)
  ).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  expect(hasHorizontalOverflow).toBeFalsy();
});
