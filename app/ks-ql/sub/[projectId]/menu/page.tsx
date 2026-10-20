import { notFound, redirect } from "next/navigation";
import { FolderOpen, BookOpen, FileSignature, ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";
import { UpcomingAcceptance } from "@/app/ks-ql/sub/_components/upcoming-acceptance";

export const dynamic = "force-dynamic";

export default async function SubMenuPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true, customerName: true },
  });
  if (!project) notFound();

  // Có từ 2 dự án mới cho quay lại danh sách (1 dự án thì /ks-ql/sub tự chuyển thẳng vào đây).
  const projectCount = await prisma.projectMemberAssignment.count({
    where: { userId: user.id, role: "pm_engineer" },
  });

  return (
    <SubLayout
      title={project.name}
      subtitle={`Chủ nhà: ${project.customerName}`}
      backHref={projectCount > 1 ? "/ks-ql/sub" : undefined}
    >
      <BigCard
        icon={<FolderOpen className="h-8 w-8" />}
        title="HỒ SƠ DỰ ÁN"
        subtitle="Bản vẽ thi công · Phối cảnh 3D"
        href={`/ks-ql/sub/${project.id}/ho-so`}
      />
      <BigCard
        icon={<BookOpen className="h-8 w-8" />}
        title="NHẬT KÝ THI CÔNG"
        subtitle="Trả lời 5 câu hỏi mỗi ngày"
        href={`/ks-ql/sub/${project.id}/diary`}
      />
      <BigCard
        icon={<FileSignature className="h-8 w-8" />}
        title="NGHIỆM THU CHỦ NHÀ"
        subtitle="Các đợt nghiệm thu với chủ nhà · Up biên bản đã ký + ảnh"
        href={`/ks-ql/sub/${project.id}/nghiem-thu`}
      />
      <BigCard
        icon={<ClipboardCheck className="h-8 w-8" />}
        title="NGHIỆM THU THẦU PHỤ"
        subtitle="Biên bản công tác đội khoán · Up biên bản đã ký + ảnh"
        href={`/ks-ql/sub/${project.id}/nghiem-thu-thau-phu`}
      />
      <UpcomingAcceptance projects={[project]} />
    </SubLayout>
  );
}
