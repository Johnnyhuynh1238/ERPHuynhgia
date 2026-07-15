import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TienDoClient } from "./_components/tien-do-client";

export const metadata = { title: "Tiến độ thi công" };

// Màn tiến độ theo công tác dự toán (flow mới). Admin kéo % + mark done từng công tác.
// Admin-only (như /du-toan, /mua-hang). Nguồn công tác: catalog VT + khoán.
export default async function TienDoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=tien-do`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return <TienDoClient projectId={project.id} projectCode={project.code} projectName={project.name} />;
}
