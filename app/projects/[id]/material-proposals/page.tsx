import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { ProposalChat } from "./_components/proposal-chat";
import { ProposalsClient } from "@/app/proposals/_components/proposals-client";

export default async function ProjectMaterialProposalsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }
  if (user.role !== UserRole.engineer && user.role !== UserRole.admin) {
    redirect(`/projects/${params.id}`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, name: true, code: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <h2 className="text-lg font-bold text-[#f0f2ff]">Đề xuất vật tư</h2>
        <p className="mt-1 text-xs text-[#8892b0]">
          Chat với AI để đề xuất vật tư cho công trình. AI sẽ đọc lại để xác nhận, bấm CHỐT để gửi kế toán.
        </p>
      </div>
      <ProposalChat projectId={project.id} projectName={project.name} />
      <ProposalsClient currentRole={user.role} projectId={project.id} />
    </div>
  );
}
