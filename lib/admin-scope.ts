export function buildAdminTenantPath(
  path: string,
  tenantSlug?: string | null
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();

  if (!normalizedSlug) {
    return path;
  }

  const scopedUrl = new URL(path, "http://localhost");
  scopedUrl.searchParams.set("tenant", normalizedSlug);
  return `${scopedUrl.pathname}${scopedUrl.search}`;
}
