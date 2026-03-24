import { canAccessAdmin } from "@/lib/auth/admin";
import { isMediaContributor, isTenantAdmin } from "@/lib/auth/permissions";
import { API_ENDPOINTS } from "@/lib/api/registry";
import { runAutomatedApiProbeSuite } from "@/lib/api/probe";
import { getDependencyHealthReport } from "@/lib/health/checks";
import { ApiHealthSnapshot } from "@/types";

export async function getApiHealthAuthorization(
  email: string,
  activeTenantId: string
): Promise<{
  isPlatformAdmin: boolean;
  isTenantAdmin: boolean;
  canContribute: boolean;
}> {
  const [isPlatformAdmin, isTenantAdm, canContribute] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
    activeTenantId
      ? isMediaContributor(email, activeTenantId)
      : Promise.resolve(false),
  ]);

  return {
    isPlatformAdmin,
    isTenantAdmin: isTenantAdm,
    canContribute,
  };
}

export async function buildApiHealthSnapshot({
  requestHeaders,
  authorization,
}: {
  requestHeaders: Headers;
  authorization: {
    isPlatformAdmin: boolean;
    isTenantAdmin: boolean;
    canContribute: boolean;
  };
}): Promise<ApiHealthSnapshot> {
  const [dependencyHealth, probes] = await Promise.all([
    getDependencyHealthReport(),
    runAutomatedApiProbeSuite({
      requestHeaders,
      authorization,
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    dependencyHealth,
    probes: {
      summary: probes.summary,
      results: probes.results,
    },
    endpoints: API_ENDPOINTS,
    samples: probes.samples,
  };
}
