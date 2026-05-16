import type { Metadata } from "next";
import { CustomerPortalShell } from "./_components/customer-portal-shell";
import { requirePortalPageAccess } from "@/lib/customer-portal";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  return {
    title: "Cổng chủ nhà - Huỳnh Gia",
    manifest: `/cn/${params.token}/manifest.webmanifest`,
    themeColor: "#f97316",
    appleWebApp: {
      capable: true,
      title: "HG Chủ Nhà",
      statusBarStyle: "black-translucent",
    },
  };
}

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
