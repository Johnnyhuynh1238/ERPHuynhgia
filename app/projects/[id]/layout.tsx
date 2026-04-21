import { notFound, redirect } from "next/navigation";
import { ProjectStatus, UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ProjectTabsNav } from "./_components/project-tabs-nav";

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
  planning: "bg-slate-200 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-indigo-100 text-indigo-700",
  paused: "bg-amber-100 text-amber-700",
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

  const tabs = [
    { label: "Thông tin chung", href: `/projects/${params.id}` },
    { label: "Tiến độ", href: `/projects/${params.id}/tasks` },
    ...(canViewPayments ? [{ label: "Lịch thanh toán", href: `/projects/${params.id}/payments` }] : []),
    ...(isAdmin ? [{ label: "Thành viên", href: `/projects/${params.id}/members` }] : []),
  ];

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">{project.code}</div>
              <h1 className="text-2xl font-semibold text-[#1F4E79]">{project.name}</h1>
              <div className="text-sm text-slate-600">Chủ nhà: {project.customerName}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass[project.status]}`}>
              {statusLabel[project.status]}
            </span>
          </div>

          <div className="mt-4 border-t pt-3">
            <ProjectTabsNav tabs={tabs} />
          </div>
        </div>

        {children}
      </div>
    </ProtectedLayout>
  );
}
