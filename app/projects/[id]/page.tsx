import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ProjectInfoClient } from "./_components/project-info-client";
import { ProjectHubGrid } from "./_components/project-hub-grid";
import { KetoanProjectHub } from "./_components/ketoan-project-hub";
import { ProjectFinanceHeader } from "./_components/project-finance-header";
import { getProjectFinanceSummary } from "@/lib/project-finance-summary";
import { canUserAccessProjectSubContracts } from "@/lib/sub-contract-auth";
import { OverviewClient } from "./overview/_components/overview-client";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

export default async function ProjectInfoPage({ params }: { params: { id: string } }) {
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
    include: {
      projectManager: {
        select: { id: true, fullName: true, email: true },
      },
      mainEngineer: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  const today = startOfTodayUtc();
  const todaySiteRest = await prisma.siteRestDay.findUnique({
    where: {
      projectId_restDate: {
        projectId: params.id,
        restDate: today,
      },
    },
    select: {
      id: true,
      restDate: true,
      reason: true,
      note: true,
      createdAt: true,
      declaredByUser: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  // Admin: màn chi tiết dự án = màn Tổng quan (tài chính + tiến độ + nhật ký), full-bleed ngà.
  // (chrome tối đã ẩn ở layout qua HideOnEstimate isAdmin). Vai trò khác giữ hub + info.
  if (user.role === UserRole.admin) {
    const pendingDiariesAdmin = await prisma.constructionDiary.count({
      where: { projectId: params.id, savedAt: { not: null }, approvedAt: null },
    });
    return (
      <OverviewClient
        projectId={project.id}
        laborMode={project.laborMode}
        pendingDiaries={pendingDiariesAdmin}
      />
    );
  }

  // Kế toán vào dự án chỉ để mua hàng: màn ngà riêng (Mua hàng + Công nợ NCC),
  // KHÔNG finance header / info card / tile thi công như admin.
  if (user.role === UserRole.accountant) {
    const [orderAgg, pendingCount, nccRows] = await Promise.all([
      prisma.mhOrder.aggregate({
        where: { projectId: params.id },
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.mhOrder.count({
        where: { projectId: params.id, status: { in: ["draft", "ordered"] } },
      }),
      prisma.$queryRaw<
        Array<{ tong_no: string; da_tra: string; con_lai: string; ncc_count: number | bigint }>
      >`
        SELECT COALESCE(SUM(tong_no),0) AS tong_no,
               COALESCE(SUM(da_tra),0)  AS da_tra,
               COALESCE(SUM(con_lai),0) AS con_lai,
               COUNT(*) FILTER (WHERE con_lai > 0)::int AS ncc_count
        FROM ncc_cong_no_du_an
        WHERE project_id = ${params.id}::uuid`,
    ]);
    const ncc = nccRows[0] ?? { tong_no: "0", da_tra: "0", con_lai: "0", ncc_count: 0 };
    return (
      <KetoanProjectHub
        projectId={project.id}
        code={project.code}
        name={project.name}
        customerName={project.customerName}
        status={project.status}
        orderCount={orderAgg._count._all}
        orderTotal={Number(orderAgg._sum.total ?? 0)}
        pendingCount={pendingCount}
        nccCount={Number(ncc.ncc_count)}
        tongNo={Number(ncc.tong_no)}
        daTra={Number(ncc.da_tra)}
        conLai={Number(ncc.con_lai)}
      />
    );
  }

  const [admins, engineers] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.admin, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: UserRole.engineer, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const canViewFinancial = user.role === UserRole.admin || user.role === UserRole.accountant;
  const financeSummary = canViewFinancial ? await getProjectFinanceSummary(project.id) : null;
  const isAdmin = user.role === UserRole.admin;
  const role = user.role as UserRole;
  const canViewSubContracts = isAdmin
    ? true
    : await canUserAccessProjectSubContracts(params.id, { id: user.id, role });

  // Badge số nhật ký KS đã chốt chờ duyệt trên icon "Duyệt nhật ký"
  const pendingDiaries = isAdmin
    ? await prisma.constructionDiary.count({
        where: { projectId: params.id, savedAt: { not: null }, approvedAt: null },
      })
    : 0;

  const inAllowedSet = (allowed: UserRole[]) => allowed.includes(role);
  const caps = {
    isAdmin,
    canViewBudget: inAllowedSet([UserRole.admin, UserRole.construction_manager, UserRole.engineer, UserRole.accountant]),
    canViewWorkOrders: inAllowedSet([UserRole.admin, UserRole.construction_manager, UserRole.engineer, UserRole.accountant]),
    canViewEod: inAllowedSet([UserRole.admin, UserRole.construction_manager, UserRole.engineer, UserRole.accountant]),
    canViewQcMapping: inAllowedSet([UserRole.admin, UserRole.construction_manager]),
    canViewPayroll: inAllowedSet([UserRole.admin, UserRole.construction_manager, UserRole.engineer, UserRole.accountant]),
    canProposeMaterials: inAllowedSet([UserRole.admin, UserRole.engineer]),
    canMuaHang: inAllowedSet([UserRole.admin, UserRole.accountant]),
    canViewSubContracts,
    canViewConstructionLog: role !== UserRole.accountant,
    canViewPayments: inAllowedSet([UserRole.admin, UserRole.accountant]),
    canViewMembers: inAllowedSet([UserRole.admin, UserRole.construction_manager]),
    canViewFinance: isAdmin,
    canViewAcceptance: inAllowedSet([UserRole.admin, UserRole.construction_manager, UserRole.engineer]),
  };

  return (
    <div className="space-y-4">
      {financeSummary && <ProjectFinanceHeader summary={financeSummary} />}
      <ProjectHubGrid
        projectId={project.id}
        caps={caps}
        laborMode={project.laborMode}
        pendingDiaries={pendingDiaries}
      />
      <ProjectInfoClient
      project={JSON.parse(
        JSON.stringify(
          canViewFinancial
            ? project
            : {
                ...project,
                contractValue: null,
              },
        ),
      )}
      admins={admins}
      engineers={engineers}
      isAdmin={user.role === UserRole.admin}
      isConstructionManager={user.role === UserRole.construction_manager}
      canViewFinancial={canViewFinancial}
      currentUserRole={user.role}
      currentUserId={user.id}
      todaySiteRest={todaySiteRest ? JSON.parse(JSON.stringify(todaySiteRest)) : null}
    />
    </div>
  );
}
