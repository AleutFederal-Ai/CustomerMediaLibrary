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

export function buildTenantSessionHandoffPath(
  tenantId: string,
  nextPath: string
): string {
  const handoffUrl = new URL("/api/sessions/current", "http://localhost");
  handoffUrl.searchParams.set("tenantId", tenantId);
  handoffUrl.searchParams.set("next", nextPath);
  return `${handoffUrl.pathname}${handoffUrl.search}`;
}

export function buildAdminConsoleEntryPath(
  tenantId?: string | null,
  tenantSlug?: string | null
): string {
  void tenantId;
  return buildAdminTenantPath("/admin", tenantSlug);
}

export function buildGalleryWorkspacePath(
  tenantSlug?: string | null
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}` : "/select-tenant";
}

export function buildTenantLoginPath(
  tenantSlug?: string | null
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}/login` : "/login";
}

export function buildGalleryAlbumPath(
  tenantSlug: string | null | undefined,
  albumIdOrSlug: string
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}/album/${albumIdOrSlug}` : `/album/${albumIdOrSlug}`;
}

export function buildGalleryMediaPath(
  tenantSlug: string | null | undefined,
  mediaId: string
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}/media/${mediaId}` : `/media/${mediaId}`;
}
