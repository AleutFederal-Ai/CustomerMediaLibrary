import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import { buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { getTenantById } from "@/lib/auth/tenant";
import { getOwnedMediaByEmail, getUserRecordByEmail, toUserProfileSummary } from "@/lib/profile";
import AccountMenu from "@/components/account/AccountMenu";
import ProfileWorkspace from "@/components/account/ProfileWorkspace";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

export default async function ProfilePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  if (!email) {
    redirect("/login");
  }

  const [user, ownedContent, activeTenant, isPlatformAdmin] = await Promise.all([
    getUserRecordByEmail(email),
    getOwnedMediaByEmail(email),
    activeTenantId ? getTenantById(activeTenantId) : Promise.resolve(null),
    canAccessAdmin(email),
  ]);

  const profile = toUserProfileSummary(email, user);
  const backHref = activeTenant?.slug
    ? buildGalleryWorkspacePath(activeTenant.slug)
    : isPlatformAdmin
      ? "/admin"
      : "/select-tenant";
  const backLabel = activeTenant?.slug ? "Return to Workspace" : isPlatformAdmin ? "Return to Admin" : "Select Tenant";

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={backHref}>{backLabel}</BackLink>
          <div>
            <p className="hero-kicker">Operator Profile</p>
            <p className="text-sm text-[var(--text-muted)]">
              Self-service account details, password access, and owned uploads
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <AccountMenu
            email={email}
            activeScopeLabel={activeTenant?.name ?? "Platform"}
          />
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-8 sm:space-y-8 sm:py-10">
        <HeroSection
          eyebrow="Profile Console"
          title="Manage your operator identity and access."
          description="Update the profile fields other teams see, maintain password sign-in, and review the media currently attributed to your account."
          meta={
            <>
              <span className="chip chip-accent">
                Active Scope
                <strong>{activeTenant?.name ?? "Platform"}</strong>
              </span>
              <span className="chip">
                Owned Uploads
                <strong>{ownedContent.length}</strong>
              </span>
            </>
          }
        />

        <ProfileWorkspace
          initialProfile={profile}
          ownedContent={ownedContent}
        />
      </PageWidth>
    </AppShell>
  );
}
