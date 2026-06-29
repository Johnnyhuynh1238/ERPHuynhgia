import { redirect } from "next/navigation";
import { Home } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";

export const dynamic = "force-dynamic";

export default async function SubLandingPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  // Lấy các dự án subcontract mà user này là member (pm_engineer).
  const memberRows = await prisma.projectMemberAssignment.findMany({
    where: { userId: user.id, role: "pm_engineer" },
    select: { projectId: true },
  });
  const projectIds = memberRows.map((r) => r.projectId);
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds }, laborMode: "subcontract" },
        select: { id: true, name: true, customerName: true, address: true },
        orderBy: { startDate: "desc" },
      })
    : [];

  if (projects.length === 1) {
    redirect(`/ks-ql/sub/${projects[0].id}/menu`);
  }

  if (projects.length === 0) {
    return (
      <SubLayout title="Chọn dự án" subtitle="Chưa có dự án giao khoán nào được gán cho anh">
        <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-8 text-center text-base text-[#8892b0]">
          Liên hệ TPTC để được gán dự án.
        </div>
      </SubLayout>
    );
  }

  return (
    <SubLayout title="Chọn dự án" subtitle={`Có ${projects.length} dự án`}>
      {projects.map((p) => (
        <BigCard
          key={p.id}
          icon={<Home className="h-8 w-8" />}
          title={p.name}
          subtitle={p.customerName}
          href={`/ks-ql/sub/${p.id}/menu`}
        />
      ))}
    </SubLayout>
  );
}
