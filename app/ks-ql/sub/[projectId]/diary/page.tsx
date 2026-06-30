import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { getWorkDateVn } from "@/lib/attendance";
import { DiaryClient } from "./_components/diary-client";

export const dynamic = "force-dynamic";

export default async function DiaryPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true, customerName: true },
  });
  if (!project) notFound();

  const today = getWorkDateVn();
  const todayYmd = today.toISOString().slice(0, 10);

  return (
    <SubLayout
      title="Nhật ký thi công"
      subtitle={project.name}
      backHref={`/ks-ql/sub/${project.id}/menu`}
    >
      <DiaryClient projectId={project.id} todayYmd={todayYmd} />
    </SubLayout>
  );
}
