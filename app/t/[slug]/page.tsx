import { redirect } from "next/navigation";

/**
 * /t/[slug] — Direct tenant landing page.
 *
 * Passing a tenant slug in the URL pre-selects the organization on the login
 * page, skipping the tenant selection step. Both public and private tenants
 * are supported — having the URL is authorization enough to reach the login form.
 *
 * The login page handles slug validation and falls back to the selection step
 * if the slug is invalid.
 */
export default async function TenantLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/login?tenant=${encodeURIComponent(slug)}`);
}
