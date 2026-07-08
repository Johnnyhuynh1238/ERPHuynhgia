import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { EstimateClient } from "./_components/estimate-client";

export const metadata = { title: "Dự toán AI" };

// Màn dự toán admin: 6 tab (Mô tả / Khối lượng / Hao phí VT / Đơn giá / Định mức / Hao phí NC+MM).
// Chỉ admin — đây là công cụ bóc khối lượng nội bộ, khác màn /budget của TPTC.
export default async function ProjectEstimatePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=estimate`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return (
    <EstimateClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      initialTab={searchParams.tab}
    />
  );
}
