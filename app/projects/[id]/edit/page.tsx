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
      contractValue: true,
      startDate: true,
      expectedEndDate: true,
      plannedDeadline: true,
      actualEndDate: true,
      status: true,
      notes: true,
      projectManagerId: true,
      mainEngineerId: true,
      contractMeta: true,
      paymentSchedules: {
        select: {
          id: true,
          type: true,
          installmentNo: true,
          description: true,
          percent: true,
          amount: true,
          dueDate: true,
          paymentNote: true,
        },
        orderBy: [{ type: "asc" }, { installmentNo: "asc" }],
      },
      projectMembers: {
        select: { userId: true, roleInProject: true },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const resolvedDraftId = searchParams?.draftId;

  const meta = (project.contractMeta && typeof project.contractMeta === "object" && !Array.isArray(project.contractMeta)
    ? (project.contractMeta as Record<string, unknown>)
    : {}) as {
    customerPermanentAddress?: string | null;
    contractSignDate?: string | null;
    warrantyTotalMonths?: number | null;
    warrantyStructureYears?: number | null;
    warrantyLeakYears?: number | null;
  };

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
        initialDraftId={resolvedDraftId}
        currentUserId={user.id}
        currentUserRole="admin"
        currentUserName={user.name ?? ""}
        initialValues={{
          customerName: project.customerName,
          customerPhone: project.customerPhone,
          customerIdNumber: project.customerIdNumber || "",
          customerPermanentAddress: meta.customerPermanentAddress || "",
          address: project.address,
          name: project.name,
          contractValue: project.contractValue ? Number(project.contractValue) : Number(project.areaM2) * Number(project.unitPrice),
          startDate: toDateInput(project.startDate),
          expectedEndDate: toDateInput(project.expectedEndDate),
          plannedDeadline: toDateInput(project.plannedDeadline),
          actualEndDate: toDateInput(project.actualEndDate),
          contractSignDate: meta.contractSignDate || "",
          warrantyTotalMonths: meta.warrantyTotalMonths ?? 12,
          warrantyStructureYears: meta.warrantyStructureYears ?? 5,
          warrantyLeakYears: meta.warrantyLeakYears ?? 2,
          status: project.status,
          notes: project.notes || "",
          projectManagerId: project.projectManagerId,
          mainEngineerId: project.mainEngineerId,
          paymentSchedules: project.paymentSchedules.map((row, idx) => ({
            id: row.id,
            type: (row.type === "addendum" ? "addendum" : "contract") as "contract" | "addendum",
            installmentNo: row.installmentNo ?? idx + 1,
            description: row.description ?? "",
            percent: row.percent ? Number(row.percent) : undefined,
            amount: row.amount ? Number(row.amount) : undefined,
            dueDate: toDateInput(row.dueDate),
            paymentNote: row.paymentNote || "",
          })),
          members: project.projectMembers
            .filter((m) => m.userId !== project.projectManagerId && m.userId !== project.mainEngineerId)
            .map((m) => ({ userId: m.userId, roleInProject: m.roleInProject })),
        }}
      />
    </div>
  );
}
