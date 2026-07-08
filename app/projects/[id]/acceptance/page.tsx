import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { AcceptanceManageClient } from "./_components/acceptance-manage-client";

export const dynamic = "force-dynamic";

export default async function ProjectAcceptancePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true, customerName: true },
  });
  if (!project) notFound();

  const canManage = user.role === "admin";

  return (
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-orange-300">Nghiệm thu chủ nhà</h2>
          <p className="mt-0.5 text-xs text-[#8892b0]">
            {canManage
              ? "Tạo mốc nghiệm thu để chủ nhà ký trên cổng CN (tab Tiến độ). Mốc đã ký sinh biên bản, bấm BB để xem / tải."
              : "Xem trạng thái ký của chủ nhà và tải biên bản nghiệm thu (bấm BB)."}
          </p>
        </div>
        <AcceptanceManageClient projectId={project.id} canManage={canManage} />
      </div>
  );
}
