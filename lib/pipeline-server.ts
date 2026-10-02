import { prisma } from "@/lib/prisma";

export type PipelineVersionMeta = {
  versionNo: number;
  note: string | null;
  descriptionUpdatedAt: string | null;
  quoteUpdatedAt: string | null;
  quoteTotal: number | null;
  createdAt: string;
};

export type PipelineState = {
  id: string;
  name: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  slug: string;
  stage: number;
  status: string;
  stageDates: Record<string, string>;
  contractVersionNo: number | null;
  projectId: string | null;
  createdAt: string;
  versions: PipelineVersionMeta[];
};

// Trạng thái đầy đủ của 1 dự án pipeline cho màn giai đoạn (không kèm HTML — HTML xem qua /mo-ta/...).
export async function loadPipelineState(
  id: string,
): Promise<PipelineState | null> {
  const p = await prisma.projectPipeline.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      customerName: true,
      customerPhone: true,
      address: true,
      slug: true,
      stage: true,
      status: true,
      stageDates: true,
      contractVersionNo: true,
      projectId: true,
      createdAt: true,
      versions: {
        orderBy: { versionNo: "asc" },
        select: {
          versionNo: true,
          note: true,
          descriptionUpdatedAt: true,
          quoteUpdatedAt: true,
          quoteTotal: true,
          createdAt: true,
        },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    customerName: p.customerName,
    customerPhone: p.customerPhone,
    address: p.address,
    slug: p.slug,
    stage: p.stage,
    status: p.status,
    stageDates: (p.stageDates || {}) as Record<string, string>,
    contractVersionNo: p.contractVersionNo,
    projectId: p.projectId,
    createdAt: p.createdAt.toISOString(),
    versions: p.versions.map((v) => ({
      versionNo: v.versionNo,
      note: v.note,
      descriptionUpdatedAt: v.descriptionUpdatedAt
        ? v.descriptionUpdatedAt.toISOString()
        : null,
      quoteUpdatedAt: v.quoteUpdatedAt ? v.quoteUpdatedAt.toISOString() : null,
      quoteTotal: v.quoteTotal === null ? null : Number(v.quoteTotal),
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
