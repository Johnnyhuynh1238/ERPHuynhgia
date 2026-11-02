import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TienDoClient } from "@/app/projects/[id]/tien-do/_components/tien-do-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Báo cáo tiến độ" };

// Báo cáo tiến độ cho KS: cùng màn với admin (/projects/[id]/tien-do), KS chỉ tick xong từng
// khối lượng — không thấy tiền, không sửa ngày dự kiến.
export default async function KsTienDoPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, code: true, name: true, address: true },
  });
  if (!project) notFound();

  return (
    <TienDoClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      projectAddress={project.address}
      backHref={`/ks-ql/sub/${project.id}/menu`}
      ks
    />
  );
}
