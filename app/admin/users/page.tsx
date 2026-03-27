import { redirect } from "next/navigation";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant } = await searchParams;
  redirect(tenant ? `/admin/members?tenant=${encodeURIComponent(tenant)}` : "/admin/members");
}
