import Link from "next/link";
import AccountMenu, { AccountTenantOption } from "@/components/account/AccountMenu";
import { PageWidth } from "@/components/ui/AppFrame";
import { PLATFORM_TITLE } from "@/lib/platform-config";

interface Props {
  homeHref?: string;
  tenantName?: string;
  pageLabel: string;
  email?: string;
  activeScopeLabel?: string;
  activeTenantId?: string;
  tenantOptions?: AccountTenantOption[];
  canSwitchTenant?: boolean;
  adminHref?: string;
}

export default function PlatformHeader({
  homeHref = "/select-tenant",
  tenantName,
  pageLabel,
  email,
  activeScopeLabel,
  activeTenantId,
  tenantOptions,
  canSwitchTenant = false,
  adminHref,
}: Props) {
  return (
    <header className="border-b border-[rgba(148,163,184,0.18)] bg-white/95 backdrop-blur">
      <PageWidth className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href={homeHref}
            className="block text-base font-semibold tracking-[-0.03em] text-slate-950 hover:text-slate-700"
          >
            {PLATFORM_TITLE}
          </Link>
          <p className="truncate text-sm text-slate-600">
            {tenantName ? `${tenantName} > ${pageLabel}` : pageLabel}
          </p>
        </div>

        {email ? (
          <AccountMenu
            email={email}
            activeScopeLabel={activeScopeLabel}
            activeTenantId={activeTenantId}
            tenantOptions={tenantOptions}
            canSwitchTenant={canSwitchTenant}
            adminHref={adminHref}
          />
        ) : null}
      </PageWidth>
    </header>
  );
}
