import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProtectedLayout } from "@/components/protected-layout";
import { DiaryApprovalPanel } from "../_components/diary-approval-panel";

export const dynamic = "force-dynamic";

export default async function DiaryApprovalPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect(`/projects/${params.id}`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h1 className="text-xl font-semibold text-orange-300">Duyệt nhật ký thi công</h1>
          <p className="mt-1 text-xs text-[#8892b0]">
            {project.code} — {project.name}. Nhật ký KS đã chốt chờ admin duyệt; duyệt xong KS
            không sửa được nữa.
          </p>
        </div>
        <DiaryApprovalPanel projectId={project.id} />
      </div>
    </ProtectedLayout>
  );
}
