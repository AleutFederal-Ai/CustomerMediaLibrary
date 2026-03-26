import { describe, expect, it } from "vitest";
import {
  buildAdminConsoleEntryPath,
  buildAdminTenantPath,
  buildTenantSessionHandoffPath,
} from "@/lib/admin-scope";

describe("admin scope helpers", () => {
  it("builds a tenant-scoped admin path", () => {
    expect(buildAdminTenantPath("/admin", "alpha")).toBe("/admin?tenant=alpha");
  });

  it("builds an explicit session handoff path", () => {
    expect(buildTenantSessionHandoffPath("tenant-1", "/admin?tenant=alpha")).toBe(
      "/api/sessions/current?tenantId=tenant-1&next=%2Fadmin%3Ftenant%3Dalpha"
    );
  });

  it("builds an admin console entry path that switches tenant context first", () => {
    expect(buildAdminConsoleEntryPath("tenant-1", "alpha")).toBe(
      "/api/sessions/current?tenantId=tenant-1&next=%2Fadmin%3Ftenant%3Dalpha"
    );
  });
});
