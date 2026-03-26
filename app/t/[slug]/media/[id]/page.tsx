import SingleMediaWorkspace from "@/components/gallery/SingleMediaWorkspace";
import { getGalleryMediaPageContext } from "@/lib/auth/gallery-media-page";

export default async function TenantMediaPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { mediaId, albumId, tenantSlug } = await getGalleryMediaPageContext({
    mediaId: id,
    requestedTenantSlug: slug,
  });

  return (
    <SingleMediaWorkspace
      mediaId={mediaId}
      albumId={albumId}
      tenantSlug={tenantSlug}
    />
  );
}
