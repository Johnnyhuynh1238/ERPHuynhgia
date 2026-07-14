import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MuaHangClient } from "./_components/mua-hang-client";

export const metadata = { title: "Mua hàng" };

// Module Mua hàng — đặt vật tư bám dự toán. Admin-only (như /du-toan).
// Đơn lưu bảng mh_orders (độc lập material_proposals). AI 🤖 ghi thẳng DB.
export default async function MuaHangPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect(`/projects/${params.id}?denied=mua-hang`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineer: { select: { fullName: true, phone: true } },
    },
  });
  if (!project) notFound();

  return (
    <MuaHangClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      ksName={project.mainEngineer?.fullName || ""}
      ksPhone={project.mainEngineer?.phone || ""}
    />
  );
}
