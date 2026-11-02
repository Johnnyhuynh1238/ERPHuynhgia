import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { GanMocClient } from "./_components/gan-moc-client";

export const metadata = { title: "Gán mốc nghiệm thu & đợt thu" };

// GĐ5: Phòng Dự án gán công tác tiến độ → mốc nghiệm thu (đội khoán + chủ nhà) + đợt thu chủ nhà.
// GĐ6: KS tick xong công tác → ERP tự báo "Đến hạn nghiệm thu" / "Đủ điều kiện thu".
export default async function GanMocPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=gan-moc`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return <GanMocClient projectId={project.id} projectCode={project.code} projectName={project.name} />;
}
