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

test("base URL starts with tenant selection and keeps the auth entry points visible", async ({
  page,
}) => {
  await stubLoginApis(page);

  await page.goto("/");

  await expect(page).toHaveURL(/\/select-tenant$/);
  await expect(page.getByText(/Controlled Unclassified Information/i)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Select tenant, then sign in/i,
    })
  ).toBeVisible();
  await expect(
    page.getByPlaceholder(/Search by tenant name or slug/i)
  ).toBeVisible();
  await expect(page.getByRole("button", {
    name: /Continue with Selected Workspace/i,
  })).toBeVisible();

  await page.goto("/login");

  await expect(
    page.getByRole("heading", {
      name: /Platform administrator sign-in/i,
    })
  ).toBeVisible();
  await expect(page.getByText(/Platform Health/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Magic Link/i })).toBeVisible();
});

test("tenant selection page stays mobile-friendly without horizontal overflow", async ({
  page,
}) => {
  await stubLoginApis(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/select-tenant");

  await expect(
    page.getByRole("heading", {
      name: /Select tenant, then sign in/i,
    })
  ).toBeVisible();
  await expect(page.getByText(/Aleut Federal/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Platform Administrator Sign-In/i })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });

  expect(hasHorizontalOverflow).toBeFalsy();
});
