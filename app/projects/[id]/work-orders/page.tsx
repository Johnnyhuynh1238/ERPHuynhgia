import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canCreateWorkOrder, canViewWorkOrders } from "@/lib/work-order";
import { WorkOrdersClient } from "./_components/work-orders-client";

export const metadata = { title: "Giao việc hàng ngày" };

export default async function WorkOrdersPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewWorkOrders({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=work-orders`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  return (
    <WorkOrdersClient
      projectId={project.id}
      canEdit={canCreateWorkOrder({ id: user.id, role: user.role })}
    />
  );
}
