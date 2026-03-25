"use client";

import { TenantPublicItem } from "@/types";

export default function TenantBadge({
  tenant,
  className = "",
}: {
  tenant: TenantPublicItem;
  className?: string;
}) {
  if (tenant.logoUrl) {
    return (
      <img
        src={tenant.logoUrl}
        alt={tenant.name}
        className={`h-11 w-11 rounded-2xl border border-[color:var(--border)] bg-white object-contain p-2 ${className}`.trim()}
      />
    );
  }

  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white ${className}`.trim()}
      style={{ backgroundColor: tenant.brandColor ?? "#1e3a5f" }}
    >
      {tenant.name.charAt(0).toUpperCase()}
    </div>
  );
}
