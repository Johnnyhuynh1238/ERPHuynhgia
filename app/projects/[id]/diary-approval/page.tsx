import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DiaryApprovalPanel } from "../_components/diary-approval-panel";

export const dynamic = "force-dynamic";

// Layout /projects/[id] đã bọc ProtectedLayout + header dự án — KHÔNG bọc lại.
export default async function DiaryApprovalPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect(`/projects/${params.id}`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-orange-300">Duyệt nhật ký thi công</h2>
        <p className="mt-0.5 text-xs text-[#8892b0]">
          Nhật ký KS lưu là hệ thống tự duyệt (khách xem được), KS vẫn sửa được. Admin bấm Duyệt tay thì KS không sửa
          được nữa; Bỏ duyệt để ẩn khỏi khách và cho KS sửa lại.
        </p>
      </div>
      <DiaryApprovalPanel projectId={project.id} />
    </div>
  );
}
