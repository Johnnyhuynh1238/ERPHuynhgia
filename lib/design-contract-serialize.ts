import type { Prisma } from "@prisma/client";

type ContractWithSteps = Prisma.DesignContractGetPayload<{ include: { steps: true } }>;

const STEP_ORDER = ["mat_bang", "mat_tien_3d", "noi_that", "shop_drawing", "du_toan_bao_gia"];

export function serializeDesignContract(c: ContractWithSteps | null) {
  if (!c) return null;
  return {
    id: c.id,
    customerName: c.customerName,
    customerPhone: c.customerPhone,
    signedAt: c.signedAt.toISOString(),
    totalValue: c.totalValue ? Number(c.totalValue) : null,
    status: c.status,
    notes: c.notes,
    leadId: c.leadId,
    projectId: c.projectId,
    hasQuote: c.quoteData != null,
    quoteUpdatedAt: c.quoteUpdatedAt?.toISOString() ?? null,
    steps: c.steps
      .slice()
      .sort((a, b) => STEP_ORDER.indexOf(a.kind) - STEP_ORDER.indexOf(b.kind))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        status: s.status,
        approvedAt: s.approvedAt?.toISOString() ?? null,
        notes: s.notes,
      })),
  };
}
