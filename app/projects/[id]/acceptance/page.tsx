import { redirect, notFound } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { AcceptanceManageClient } from "./_components/acceptance-manage-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nghiệm thu" };

const statusLabel: Record<ProjectStatus, string> = {
  planning: "Chuẩn bị",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm ngưng",
};

// Màn tài liệu toàn màn (nền ngà, header riêng) — khung tối của project layout bị ẩn (HideOnEstimate).
export default async function ProjectAcceptancePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { kind?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      status: true,
      memberAssignments: { where: { userId: user.id, role: "pm_engineer" }, select: { id: true }, take: 1 },
    },
  });
  if (!project) notFound();

  const canManage = user.role === "admin";
  // KS quản lý vào từ menu /ks-ql → quay lại menu đó; còn lại về trang dự án.
  const backHref =
    !canManage && project.memberAssignments.length > 0 ? `/ks-ql/sub/${project.id}/menu` : `/projects/${project.id}`;

  return (
    <AcceptanceManageClient
      projectId={project.id}
      project={{
        code: project.code,
        name: project.name,
        customerName: project.customerName,
        statusLabel: statusLabel[project.status],
      }}
      canManage={canManage}
      userId={user.id}
      backHref={backHref}
      group={searchParams.kind === "thau_phu" ? "thau_phu" : "chu_nha"}
    />
  );
}
