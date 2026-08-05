import { randomUUID } from "crypto";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { serializeDesignContract } from "@/lib/design-contract-serialize";
import { quoteSummary } from "@/lib/quote-compute";
import { DesignContractDetailClient } from "./_components/design-contract-detail-client";

export const metadata = { title: "HĐ thiết kế · Báo giá" };

export default async function DesignContractDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect("/");

  let contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    include: { steps: true, project: { select: { id: true, code: true } } },
  });
  if (!contract) notFound();

  // Backfill lazy: đảm bảo có bước cuối "du_toan_bao_gia"
  if (!contract.steps.some((s) => s.kind === "du_toan_bao_gia")) {
    await prisma.designContractStep.create({
      data: { contractId: contract.id, kind: "du_toan_bao_gia" },
    });
    contract = await prisma.designContract.findUnique({
      where: { id: params.id },
      include: { steps: true, project: { select: { id: true, code: true } } },
    });
  }
  if (!contract) notFound();

  // Đảm bảo có token chia sẻ công khai (khách xem báo giá read-only).
  let shareToken = contract.quoteShareToken;
  if (!shareToken) {
    shareToken = randomUUID();
    await prisma.designContract.update({
      where: { id: contract.id },
      data: { quoteShareToken: shareToken },
    });
  }

  const serialized = serializeDesignContract(contract);
  const sum = contract.quoteData ? quoteSummary(contract.quoteData) : null;

  return (
    <DesignContractDetailClient
      contract={serialized!}
      projectId={contract.project?.id ?? null}
      projectCode={contract.project?.code ?? null}
      grand={sum?.grand ?? null}
      shareToken={shareToken}
    />
  );
}
