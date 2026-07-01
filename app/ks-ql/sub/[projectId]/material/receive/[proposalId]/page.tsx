import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { ReceiveDetailClient } from "./_components/receive-detail-client";

export const dynamic = "force-dynamic";

type ParsedItem = {
  ten?: string;
  sl?: number;
  dvt?: string;
  name?: string;
  qty?: number;
  unit?: string;
  task?: string;
};

type ReceiptRow = {
  itemSeq: number;
  receivedQty: number;
  qcChecked: boolean;
  photos: Array<{ key: string }>;
  note: string | null;
  receivedAt: string;
};

export default async function ReceiveDetailPage({
  params,
}: {
  params: { projectId: string; proposalId: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, code: true, name: true },
  });
  if (!project) notFound();

  const proposal = await prisma.materialProposal.findFirst({
    where: {
      id: params.proposalId,
      projectId: project.id,
      status: "accepted",
      orderStatus: { in: ["ordered", "received"] },
      closedAt: null,
    },
    select: {
      id: true,
      description: true,
      parsedItems: true,
      orderStatus: true,
      orderedAt: true,
      ks: { select: { fullName: true } },
      receipts: {
        select: {
          itemSeq: true,
          receivedQty: true,
          qcChecked: true,
          photos: true,
          note: true,
          receivedAt: true,
        },
      },
    },
  });
  if (!proposal) notFound();

  const items = ((proposal.parsedItems as ParsedItem[] | null) ?? []).map((it, idx) => ({
    seq: idx,
    name: it.name ?? it.ten ?? "—",
    qty: it.qty ?? it.sl ?? 0,
    unit: it.unit ?? it.dvt ?? "",
    task: it.task ?? "",
  }));

  const receipts: ReceiptRow[] = proposal.receipts.map((r) => ({
    itemSeq: r.itemSeq,
    receivedQty: Number(r.receivedQty),
    qcChecked: r.qcChecked,
    photos: ((r.photos as unknown as Array<{ key: string }> | null) ?? []).map((p) => ({ key: p.key })),
    note: r.note,
    receivedAt: r.receivedAt.toISOString(),
  }));

  return (
    <SubLayout
      title="Nhận vật tư"
      subtitle={project.name}
      backHref={`/ks-ql/sub/${project.id}/material/receive`}
    >
      <ReceiveDetailClient
        proposalId={proposal.id}
        description={proposal.description}
        orderStatus={proposal.orderStatus as "ordered" | "received"}
        items={items}
        initialReceipts={receipts}
        project={{ code: project.code, name: project.name }}
        ksName={proposal.ks.fullName}
      />
    </SubLayout>
  );
}
