import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_RENDERED_PAGE_FILES = [
  "app/(gallery)/page.tsx",
  "components/gallery/GalleryWorkspacePage.tsx",
  "app/admin/page.tsx",
  "app/admin/albums/page.tsx",
  "app/admin/api-health/page.tsx",
  "app/admin/audit-logs/page.tsx",
  "app/admin/domains/page.tsx",
  "app/admin/members/page.tsx",
  "app/admin/upload/page.tsx",
  "app/admin/users/page.tsx",
];

describe("server-rendered pages", () => {
  it("do not fetch internal APIs over host/proto loopback", () => {
    for (const relativePath of SERVER_RENDERED_PAGE_FILES) {
      const fullPath = path.join(process.cwd(), relativePath);
      const fileContents = fs.readFileSync(fullPath, "utf8");

      expect(fileContents).not.toMatch(
        /fetch\(`\$\{proto\}:\/\/\$\{host\}\/api/
      );
    }
  });
});
