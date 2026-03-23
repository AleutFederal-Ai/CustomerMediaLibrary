import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { API_ENDPOINTS, resolvePathTemplate } from "@/lib/api/registry";

const EXCLUDED_ROUTE_PATHS = new Set([
  "/api/admin/api-health",
  "/api/admin/api-health/test",
]);

function normalizeDynamicSegments(value: string): string {
  return value
    .replace(/\{[^/]+\}/g, "[param]")
    .replace(/\[[^/]+\]/g, "[param]");
}

function getApiRoutePaths(): string[] {
  const apiRoot = path.join(process.cwd(), "app", "api");
  const discovered: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.name !== "route.ts") continue;

      const relativeDirectory = path
        .relative(apiRoot, path.dirname(fullPath))
        .split(path.sep)
        .join("/");

      discovered.push(`/api/${relativeDirectory === "" ? "" : relativeDirectory}`.replace(/\/+$/, ""));
    }
  }

  walk(apiRoot);
  return discovered.sort();
}

describe("API endpoint registry", () => {
  it("covers every app/api route except the self-referential health console routes", () => {
    const registeredPaths = new Set(
      API_ENDPOINTS.map((endpoint) =>
        normalizeDynamicSegments(endpoint.pathTemplate.split("?")[0])
      )
    );

    const uncoveredRoutes = getApiRoutePaths()
      .map((routePath) => normalizeDynamicSegments(routePath))
      .filter((routePath) => !EXCLUDED_ROUTE_PATHS.has(routePath))
      .filter((routePath) => !registeredPaths.has(routePath));

    expect(uncoveredRoutes).toEqual([]);
  });

  it("resolves known sample tokens and blocks incomplete templates", () => {
    expect(
      resolvePathTemplate("/api/search?albumId={sampleAlbumId}", {
        sampleAlbumId: "album-1",
      })
    ).toBe("/api/search?albumId=album-1");

    expect(
      resolvePathTemplate("/api/media/{sampleMediaId}", {
        sampleAlbumId: "album-1",
      })
    ).toBeNull();
  });
});
