import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CongNoClient } from "./_components/cong-no-client";

export const metadata = { title: "Công nợ NCC" };

// Công nợ NCC — icon trong màn dự án. Admin-only (như /mua-hang).
// Nợ suy từ đơn mh_orders đã ghi công nợ; thanh toán gộp theo NCC.
export default async function CongNoPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=cong-no`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  return <CongNoClient projectId={project.id} projectCode={project.code} projectName={project.name} />;
}
