import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DuToanClient } from "./_components/du-toan-client";

export const metadata = { title: "Dự toán" };

// App Dự toán DB — CHỈ chứa DB: hạng mục khoán + vật tư theo công tác (AI bóc, ghi thẳng).
// ERP không tự tính, chỉ hiển thị theo bộ lọc. Admin-only.
export default async function DuToanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=du-toan`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return (
    <DuToanClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      initialTab={searchParams.tab}
    />
  );
}
