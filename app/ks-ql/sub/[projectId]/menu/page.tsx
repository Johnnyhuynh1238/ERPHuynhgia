import { notFound, redirect } from "next/navigation";
import { Package, HardHat, BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";

export const dynamic = "force-dynamic";

export default async function SubMenuPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true, customerName: true },
  });
  if (!project) notFound();

  return (
    <SubLayout
      title={project.name}
      subtitle={`Chủ nhà: ${project.customerName}`}
    >
      <BigCard
        icon={<Package className="h-8 w-8" />}
        title="VẬT TƯ"
        subtitle="Đề xuất · Nhận · Kiểm kê"
        href={`/ks-ql/sub/${project.id}/material`}
      />
      <BigCard
        icon={<HardHat className="h-8 w-8" />}
        title="NHÂN CÔNG"
        subtitle="Sắp ra mắt"
        tone="muted"
        disabled
      />
      <BigCard
        icon={<BookOpen className="h-8 w-8" />}
        title="NHẬT KÝ THI CÔNG"
        subtitle="Trả lời 5 câu hỏi mỗi ngày"
        href={`/ks-ql/sub/${project.id}/diary`}
      />
    </SubLayout>
  );
}
