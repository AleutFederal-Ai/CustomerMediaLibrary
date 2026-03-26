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
  albumId: string
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}/album/${albumId}` : `/album/${albumId}`;
}

export function buildGalleryMediaPath(
  tenantSlug: string | null | undefined,
  mediaId: string
): string {
  const normalizedSlug = tenantSlug?.trim().toLowerCase();
  return normalizedSlug ? `/t/${normalizedSlug}/media/${mediaId}` : `/media/${mediaId}`;
}
