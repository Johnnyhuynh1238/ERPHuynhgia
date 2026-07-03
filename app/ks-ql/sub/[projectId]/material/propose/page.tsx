import { notFound, redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";
import { ProposalCard, type ProposalCardRow } from "../_components/proposal-card";

export const dynamic = "force-dynamic";

export default async function ProposeListPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const proposals = await prisma.materialProposal.findMany({
    where: { projectId: project.id, ksId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      description: true,
      status: true,
      orderStatus: true,
      parsedItems: true,
      createdAt: true,
      _count: { select: { debts: true } },
    },
  });

  return (
    <SubLayout
      title="Đề xuất vật tư"
      subtitle={`${proposals.length} đề xuất gần đây`}
      backHref={`/ks-ql/sub/${project.id}/material`}
    >
      <BigCard
        icon={<PlusCircle className="h-8 w-8" />}
        title="TẠO ĐỀ XUẤT MỚI"
        subtitle="Thêm vật tư cần cho công trình"
        href={`/ks-ql/sub/${project.id}/material/propose/new`}
      />

      {proposals.length === 0 ? (
        <div className="mt-2 rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-8 text-center text-base text-[#8892b0]">
          Chưa có đề xuất nào.
        </div>
      ) : (
        proposals.map((p) => (
          <ProposalCard
            key={p.id}
            p={p as unknown as ProposalCardRow}
            href={`/ks-ql/sub/${project.id}/material/propose/${p.id}`}
          />
        ))
      )}
    </SubLayout>
  );
}
