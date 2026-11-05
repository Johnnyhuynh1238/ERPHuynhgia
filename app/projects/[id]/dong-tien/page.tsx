import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DongTienClient } from "./_components/dong-tien-client";

export const metadata = { title: "Kế hoạch dòng tiền dự án" };
export const dynamic = "force-dynamic";

// GĐ 5 Chuẩn bị: kế hoạch thu/chi dự án theo tuần (dự toán × tiến độ × điều khoản NCC). Admin sửa, kế toán xem.
export default async function ProjectDongTienPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect(`/projects/${params.id}?denied=dong-tien`);
  }
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();
  return (
    <DongTienClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      canEdit={user.role === UserRole.admin}
    />
  );
}
