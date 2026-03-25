import AlbumWorkspacePage from "@/components/gallery/AlbumWorkspacePage";
import { getGalleryAlbumPageContext } from "@/lib/auth/gallery-album-page";

export default async function TenantAlbumPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { albumId, tenantSlug } = await getGalleryAlbumPageContext({
    albumId: id,
    requestedTenantSlug: slug,
  });

  return <AlbumWorkspacePage albumId={albumId} tenantSlug={tenantSlug} />;
}
