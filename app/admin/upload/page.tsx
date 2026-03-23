import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isMediaContributor } from "@/lib/auth/permissions";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord, TenantPublicItem } from "@/types";
import UploadForm from "@/components/admin/UploadForm";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getActiveAlbums(tenantId: string): Promise<{ id: string; name: string }[]> {
  const container = await albums();
  const { resources } = await container.items
    .query<AlbumRecord>({
      query:
        "SELECT c.id, c.name FROM c WHERE c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c['order'] ASC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function UploadPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const tenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");
  if (!tenantId) redirect("/admin");
  const canUpload = await isMediaContributor(email, tenantId);
  if (!canUpload) redirect("/");

  const [albumList, activeTenant] = await Promise.all([
    getActiveAlbums(tenantId),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href="/admin">Return to Admin</BackLink>
          <div>
            <p className="hero-kicker">Media Intake</p>
            <p className="text-sm text-[var(--text-muted)]">
              {activeTenant?.name ?? "Active tenant"}
            </p>
          </div>
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-8 sm:space-y-8 sm:py-10">
        <HeroSection
          eyebrow="Upload Workflow"
          title={`Add new media into ${activeTenant?.name ?? "this tenant"}.`}
          description="Select a target album, upload approved files, and attach tags that improve searchability across the tenant workspace."
          meta={
            <span className="chip chip-accent">
              Available Albums
              <strong>{albumList.length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          {albumList.length === 0 ? (
            <div className="ops-empty">
              <p className="text-lg font-semibold text-white">
                No albums exist yet.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm">
                Create an album first so uploaded media can be routed into an
                approved collection.
              </p>
              <Link href="/admin/albums" className="ops-button mt-6 inline-flex">
                Create an Album
              </Link>
            </div>
          ) : (
            <UploadForm albums={albumList} />
          )}
        </div>
      </PageWidth>
    </AppShell>
  );
}
