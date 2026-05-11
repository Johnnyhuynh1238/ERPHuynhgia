import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProjectEditorForm } from "@/app/projects/_components/project-editor-form";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function toDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function ProjectEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { draftId?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=1`);

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      name: true,
      customerName: true,
      customerPhone: true,
      customerIdNumber: true,
      address: true,
      areaM2: true,
      unitPrice: true,
      startDate: true,
      expectedEndDate: true,
      plannedDeadline: true,
      actualEndDate: true,
      status: true,
      notes: true,
      projectManagerId: true,
      mainEngineerId: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-[#8892b0]">
        <Link href={`/projects/${params.id}`} className="hover:underline">
          Thông tin dự án
        </Link>
        <span className="mx-2">&gt;</span>
        <span>Cập Nhật Dự Án</span>
      </div>

      <h2 className="text-2xl font-semibold text-[#f0f2ff]">Cập Nhật Dự Án</h2>

      <ProjectEditorForm
        mode="update"
        projectId={project.id}
        initialDraftId={searchParams?.draftId}
        currentUserId={user.id}
        currentUserRole="admin"
        currentUserName={user.name ?? ""}
        initialValues={{
          customerName: project.customerName,
          customerPhone: project.customerPhone,
          customerIdNumber: project.customerIdNumber || "",
          address: project.address,
          name: project.name,
          areaM2: Number(project.areaM2),
          unitPrice: Number(project.unitPrice),
          startDate: toDateInput(project.startDate),
          expectedEndDate: toDateInput(project.expectedEndDate),
          plannedDeadline: toDateInput(project.plannedDeadline),
          actualEndDate: toDateInput(project.actualEndDate),
          status: project.status,
          notes: project.notes || "",
          projectManagerId: project.projectManagerId,
          mainEngineerId: project.mainEngineerId,
          members: [],
        }}
      />
    </div>
  );
}
