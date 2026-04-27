import { CustomerPortalShell } from "./_components/customer-portal-shell";
import { requirePortalPageAccess } from "@/lib/customer-portal";

export default async function CustomerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  const { session } = await requirePortalPageAccess(params.token);

  if (!session) {
    return <>{children}</>;
  }

  return <CustomerPortalShell token={params.token}>{children}</CustomerPortalShell>;
}
