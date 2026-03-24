import GalleryWorkspacePage from "@/components/gallery/GalleryWorkspacePage";

export default async function TenantWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GalleryWorkspacePage requestedSlug={slug} />;
}
