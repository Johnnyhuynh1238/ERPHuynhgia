import { CustomerPortalShell } from "./_components/customer-portal-shell";
import { requirePortalPageAccess } from "@/lib/customer-portal";

export default async function CustomerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  const { project, session } = await requirePortalPageAccess(params.token);

  if (!project || !session) {
    return <>{children}</>;
  }

  return (
    <CustomerPortalShell token={params.token} projectName={project.name} customerName={project.customerName}>
      {children}
    </CustomerPortalShell>
  );
}
