import { notFound, redirect } from "next/navigation";
import { FileEdit, Inbox, ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";

export const dynamic = "force-dynamic";

export default async function MaterialHubPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const pendingCount = await prisma.materialProposal.count({
    where: { projectId: project.id, ksId: user.id, status: "pending" },
  });

  return (
    <SubLayout
      title="Vật tư"
      subtitle={project.name}
      backHref={`/ks-ql/sub/${project.id}/menu`}
    >
      <BigCard
        icon={<FileEdit className="h-8 w-8" />}
        title="ĐỀ XUẤT VẬT TƯ"
        subtitle={pendingCount > 0 ? `${pendingCount} đang chờ TPTC duyệt` : "Tạo đề xuất khi cần VT"}
        href={`/ks-ql/sub/${project.id}/material/propose`}
      />
      <BigCard
        icon={<Inbox className="h-8 w-8" />}
        title="NHẬN VẬT TƯ"
        subtitle="Sắp ra mắt"
        tone="muted"
        disabled
      />
      <BigCard
        icon={<ClipboardCheck className="h-8 w-8" />}
        title="KIỂM KÊ"
        subtitle="Sắp ra mắt"
        tone="muted"
        disabled
      />
    </SubLayout>
  );
}
