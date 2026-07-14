import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { OverviewClient } from "./_components/overview-client";

export const metadata = { title: "Tổng quan dự án" };

// Màn tổng quan dự án — tài chính (thu/chi/biên LN/dòng tiền) + tiến độ + nhật ký.
// Tài liệu toàn màn (nền ngà, header riêng) như /du-toan, /mua-hang. Admin-only.
export default async function ProjectOverviewPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=overview`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  return <OverviewClient projectId={project.id} />;
}
