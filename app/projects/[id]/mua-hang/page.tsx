import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseMhList } from "@/lib/mua-hang-list";
import { MuaHangClient } from "./_components/mua-hang-client";

export const metadata = { title: "Mua hàng" };

// Module Mua hàng — đặt vật tư bám dự toán.
// Danh sách VT = projects.mua_hang_list GHI TAY theo PHẦN (AI soạn từ bóc tách + hao hụt), chỉ hiển thị.
// Admin: tự do. Kế toán: SL vượt danh sách → vẫn cho đặt + log.
// Đơn lưu bảng mh_orders (độc lập material_proposals). AI 🤖 ghi thẳng DB.
export default async function MuaHangPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin" && user.role !== "accountant")
    redirect(`/projects/${params.id}?denied=mua-hang`);
  const isKeToan = user.role === "accountant";

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineer: { select: { fullName: true, phone: true } },
      muaHangList: true,
      muaHangListUpdatedAt: true,
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
      isKeToan={isKeToan}
      list={parseMhList(project.muaHangList)}
      listUpdatedAt={project.muaHangListUpdatedAt?.toISOString() ?? null}
    />
  );
}
