import { NextRequest, NextResponse } from "next/server";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { TenantPublicItem } from "@/types";
import { withRouteLogging } from "@/lib/logging/structured";

/**
 * POST /api/tenants/lookup
 * Body: { slug: string }
 *
 * Validates a tenant slug (public or private) and returns minimal tenant info.
 * Used by the login page to confirm a private organization code before auth.
 *
 * Returns 200 with tenant info if valid, 404 if not found / inactive.
 * Never differentiates between "doesn't exist" and "private" — always 404 for
 * invalid slugs to prevent enumeration of private tenant names.
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const slug =
    typeof b.slug === "string" ? b.slug.toLowerCase().trim() : "";

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const tenant = await getTenantBySlug(slug);

  if (!tenant) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const item: TenantPublicItem = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    ...(tenant.description && { description: tenant.description }),
    ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
    ...(tenant.brandColor && { brandColor: tenant.brandColor }),
  };

  return NextResponse.json(item);
}

export const POST = withRouteLogging("tenants.lookup.POST", handlePost);
