import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import {
  buildApiHealthSnapshot,
  getApiHealthAuthorization,
} from "@/lib/api/health-snapshot";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { getActiveTenantPublicItem } from "@/lib/tenant-data";
import { ApiHealthSnapshot } from "@/types";
import { API_ENDPOINTS } from "@/lib/api/registry";
import ApiHealthPortal from "@/components/admin/ApiHealthPortal";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getFallbackSnapshot(): Promise<ApiHealthSnapshot> {
  return {
    generatedAt: new Date().toISOString(),
    dependencyHealth: {
      status: "unknown",
      timestamp: new Date().toISOString(),
      checks: {
        cosmosDb: { ok: null, message: "Unavailable" },
        blobStorage: { ok: null, message: "Unavailable" },
        keyVault: { ok: null, message: "Unavailable" },
        graphApi: { ok: null, message: "Unavailable" },
      },
    },
    probes: {
      summary: { passed: 0, failed: 0, skipped: 0 },
      results: [],
    },
    endpoints: API_ENDPOINTS,
    samples: {},
  };
}

export default async function ApiHealthPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  if (!email) redirect("/login");

  const authorization = await getApiHealthAuthorization(email, activeTenantId);

  if (!authorization.isPlatformAdmin && !authorization.isTenantAdmin) redirect("/");

  const [activeTenant, initialSnapshot] = await Promise.all([
    getActiveTenantPublicItem(activeTenantId),
    buildApiHealthSnapshot({
      requestHeaders: new Headers(headerStore),
      authorization,
    })
      .catch(() => getFallbackSnapshot()),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={buildAdminTenantPath("/admin", activeTenant?.slug)}>
            Return to Admin
          </BackLink>
          <div>
            <p className="hero-kicker">API Verification Console</p>
            <p className="text-sm text-[var(--text-muted)]">
              Operator health, smoke tests, and manual route validation
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
          eyebrow="API Health Portal"
          title="Dependency health, route verification, and live API testing."
          description="Use this console to confirm external dependencies, run the non-destructive smoke suite, and manually exercise any route in the platform with full response visibility."
          meta={
            <>
              <span className="chip chip-accent">
                Dependency Status
                <strong>{initialSnapshot.dependencyHealth.status}</strong>
              </span>
              <span className="chip">
                Active Scope
                <strong>{activeTenant?.name ?? "Platform"}</strong>
              </span>
            </>
          }
        />

        <ApiHealthPortal initialSnapshot={initialSnapshot} />
      </PageWidth>
    </AppShell>
  );
}
