import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { TenantPublicItem, ApiHealthSnapshot } from "@/types";
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
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");

  const [isPlatformAdmin, isTenantAdm] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
  ]);

  if (!isPlatformAdmin && !isTenantAdm) redirect("/");

  const [activeTenant, initialSnapshot] = await Promise.all([
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
    fetch(`${proto}://${host}/api/admin/api-health`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) =>
        r.ok ? (r.json() as Promise<ApiHealthSnapshot>) : getFallbackSnapshot()
      )
      .catch(() => getFallbackSnapshot()),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href="/admin">Return to Admin</BackLink>
          <div>
            <p className="hero-kicker">API Verification Console</p>
            <p className="text-sm text-[var(--text-muted)]">
              Operator health, smoke tests, and manual route validation
            </p>
          </div>
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
