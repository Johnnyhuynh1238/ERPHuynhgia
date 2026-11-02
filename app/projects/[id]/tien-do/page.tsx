import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TienDoClient } from "./_components/tien-do-client";

export const metadata = { title: "Báo cáo tiến độ" };

// Báo cáo tiến độ: hạng mục lớn = dòng ngân sách/PHẦN; mark done từng khối lượng (estimate_works),
// % tự tính. Màn admin; KS dùng cùng client ở /ks-ql/sub/[projectId]/tien-do (ẩn tiền).
export default async function TienDoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=tien-do`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true, address: true },
  });
  if (!project) notFound();

  return (
    <TienDoClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      projectAddress={project.address}
    />
  );
}
