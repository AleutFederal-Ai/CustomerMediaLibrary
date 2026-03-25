import { redirect } from "next/navigation";
import { getGalleryAlbumPageContext } from "@/lib/auth/gallery-album-page";
import { buildGalleryAlbumPath } from "@/lib/admin-scope";

export default async function LegacyAlbumRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantSlug } = await getGalleryAlbumPageContext({ albumId: id });

  redirect(buildGalleryAlbumPath(tenantSlug, id));
}
