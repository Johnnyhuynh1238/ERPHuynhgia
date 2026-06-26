import { notFound, redirect } from "next/navigation";
import { ProjectStatus, UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canUserAccessProjectSubContracts } from "@/lib/sub-contract-auth";
import { ProjectTabsNav } from "./_components/project-tabs-nav";
import { ProjectBackLink } from "./_components/project-back-link";

type ProjectLayoutProps = {
  children: React.ReactNode;
  params: {
    id: string;
  };
};

const statusLabel: Record<ProjectStatus, string> = {
  planning: "Planning",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm ngưng",
};

const statusBadgeClass: Record<ProjectStatus, string> = {
  planning: "bg-slate-500/15 text-slate-300",
  in_progress: "bg-blue-500/15 text-blue-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
};

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...accessWhere,
    },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      status: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!exists) {
      notFound();
    }

    redirect("/projects?denied=1");
  }

  const isAdmin = user.role === UserRole.admin;
  const canViewPayments = user.role === UserRole.admin || user.role === UserRole.accountant;
  const canViewMembers = user.role === UserRole.admin || user.role === UserRole.construction_manager;

  const canViewConstructionLog = user.role !== UserRole.accountant;
  const canViewSubContracts = await canUserAccessProjectSubContracts(params.id, { id: user.id, role: user.role });
  const canProposeMaterials = user.role === UserRole.engineer || user.role === UserRole.admin;
  const canViewBudgetTab = ["admin", "construction_manager", "engineer", "accountant"].includes(user.role);
  const canViewWorkOrdersTab = ["admin", "construction_manager", "engineer", "accountant"].includes(user.role);
  const canViewEodTab = ["admin", "construction_manager", "engineer", "accountant"].includes(user.role);
  const canViewQcMappingTab = ["admin", "construction_manager"].includes(user.role);
  const canViewPayrollTab = ["admin", "construction_manager", "engineer", "accountant"].includes(user.role);

  const tabs = [
    { label: "Thông tin chung", href: `/projects/${params.id}` },
    { label: "Tiến độ", href: `/projects/${params.id}/tasks` },
    ...(canViewBudgetTab ? [{ label: "Dự toán", href: `/projects/${params.id}/budget` }] : []),
    ...(canViewWorkOrdersTab ? [{ label: "Giao việc", href: `/projects/${params.id}/work-orders` }] : []),
    ...(canViewEodTab ? [{ label: "Cuối ngày", href: `/projects/${params.id}/eod` }] : []),
    ...(canViewQcMappingTab ? [{ label: "QC Mapping", href: `/projects/${params.id}/qc-mapping` }] : []),
    ...(canViewQcMappingTab ? [{ label: "Chuẩn hoá DM", href: `/projects/${params.id}/migrate-to-catalog` }] : []),
    ...(canViewPayrollTab ? [{ label: "Lương tuần", href: `/projects/${params.id}/payroll` }] : []),
    ...(canProposeMaterials ? [{ label: "Đề xuất vật tư", href: `/projects/${params.id}/material-proposals` }] : []),
    ...(canViewSubContracts ? [{ label: "Thầu phụ", href: `/projects/${params.id}/sub-contracts` }] : []),
    ...(canViewConstructionLog ? [{ label: "Nhật ký thi công", href: `/projects/${params.id}/construction-log` }] : []),
    ...(canViewPayments ? [{ label: "Lịch thanh toán", href: `/projects/${params.id}/payments` }] : []),
    ...(canViewMembers ? [{ label: "Thành viên", href: `/projects/${params.id}/members` }] : []),
    { label: "Hồ sơ", href: `/projects/${params.id}/documents` },
    ...(isAdmin ? [{ label: "Log dự án", href: `/projects/${params.id}/log` }] : []),
  ];

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <ProjectBackLink projectId={project.id} projectName={project.name} />
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[#8892b0]">{project.code}</div>
              <h1 className="text-xl font-bold text-[#f0f2ff]">{project.name}</h1>
              <div className="text-sm text-[#8892b0]">Chủ nhà: {project.customerName}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass[project.status]}`}>
              {statusLabel[project.status]}
            </span>
          </div>

          {!isAdmin && (
            <div className="mt-4 border-t border-[#252840] pt-3">
              <ProjectTabsNav tabs={tabs} />
            </div>
          )}
        </div>

        {children}
      </div>
    </ProtectedLayout>
  );
}
