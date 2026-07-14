import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  STAGE_LABEL,
  computeDesignContractStage,
  computeLeadStage,
  computeProjectStage,
  defaultNextAction,
  normalizePhone,
  type PipelineRow,
  type PipelineStage,
} from "@/lib/customer-pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const stageParam = url.searchParams.get("stage");
  const search = url.searchParams.get("q")?.trim().toLowerCase();

  const now = new Date();

  const [leads, designContracts, projects] = await Promise.all([
    prisma.baogiaLead.findMany({
      where: { status: { not: "spam" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.designContract.findMany({
      orderBy: { signedAt: "desc" },
      include: { steps: true },
    }),
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        paymentSchedules: { select: { status: true, dueDate: true, expectedDate: true, amount: true, paidAmount: true } },
      },
    }),
  ]);

  // Group theo phone đã normalize
  const groups = new Map<string, PipelineRow>();

  function upsert(row: PipelineRow) {
    const existing = groups.get(row.customerKey);
    if (!existing || row.stage > existing.stage) {
      groups.set(row.customerKey, row);
    } else if (row.stage === existing.stage) {
      // cùng stage, giữ row có lastActivity mới hơn + merge id
      const newer = new Date(row.lastActivityAt) > new Date(existing.lastActivityAt) ? row : existing;
      groups.set(row.customerKey, {
        ...newer,
        leadId: newer.leadId ?? existing.leadId ?? row.leadId,
        designContractId: newer.designContractId ?? existing.designContractId ?? row.designContractId,
        projectId: newer.projectId ?? existing.projectId ?? row.projectId,
        projectCode: newer.projectCode ?? existing.projectCode ?? row.projectCode,
      });
    } else {
      // stage thấp hơn nhưng có thể bổ sung id
      groups.set(row.customerKey, {
        ...existing,
        leadId: existing.leadId ?? row.leadId,
        designContractId: existing.designContractId ?? row.designContractId,
        projectId: existing.projectId ?? row.projectId,
        projectCode: existing.projectCode ?? row.projectCode,
      });
    }
  }

  for (const lead of leads) {
    const key = normalizePhone(lead.phone);
    if (!key) continue;
    const meta = computeLeadStage(lead, now);
    const stage = meta.stage as PipelineStage;
    upsert({
      customerKey: key,
      customerName: lead.name,
      customerPhone: lead.phone,
      stage,
      stageLabel: STAGE_LABEL[stage],
      subLabel: null,
      daysInStage: Math.max(0, Math.floor((now.getTime() - meta.lastActivityAt.getTime()) / 86_400_000)),
      hotFlag: meta.hotFlag,
      nextAction: meta.nextAction,
      contractValue: lead.feeTotal ?? null,
      projectId: null,
      projectCode: null,
      designContractId: null,
      leadId: lead.id,
      lastActivityAt: meta.lastActivityAt.toISOString(),
    });
  }

  for (const c of designContracts) {
    const key = normalizePhone(c.customerPhone ?? "");
    if (!key) continue;
    const meta = computeDesignContractStage(c, now);
    upsert({
      customerKey: key,
      customerName: c.customerName,
      customerPhone: c.customerPhone ?? "",
      stage: meta.stage,
      stageLabel: STAGE_LABEL[meta.stage],
      subLabel: meta.subLabel,
      daysInStage: Math.max(0, Math.floor((now.getTime() - meta.lastActivityAt.getTime()) / 86_400_000)),
      hotFlag: meta.hotFlag,
      nextAction: meta.nextAction,
      contractValue: c.totalValue ? Number(c.totalValue) : null,
      projectId: c.projectId,
      projectCode: null,
      designContractId: c.id,
      leadId: c.leadId,
      lastActivityAt: meta.lastActivityAt.toISOString(),
    });
  }

  for (const p of projects) {
    const key = normalizePhone(p.customerPhone);
    if (!key) continue;
    const meta = computeProjectStage(p, now);
    upsert({
      customerKey: key,
      customerName: p.customerName,
      customerPhone: p.customerPhone,
      stage: meta.stage,
      stageLabel: STAGE_LABEL[meta.stage],
      subLabel: meta.subLabel,
      daysInStage: Math.max(0, Math.floor((now.getTime() - meta.lastActivityAt.getTime()) / 86_400_000)),
      hotFlag: meta.hotFlag,
      nextAction: defaultNextAction(meta.stage),
      contractValue: p.contractValue ? Number(p.contractValue) : null,
      projectId: p.id,
      projectCode: p.code,
      designContractId: null,
      leadId: null,
      lastActivityAt: meta.lastActivityAt.toISOString(),
    });
  }

  let items = Array.from(groups.values());

  const counts: Record<PipelineStage, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const it of items) counts[it.stage]++;

  if (stageParam && /^[1-7]$/.test(stageParam)) {
    const s = Number(stageParam) as PipelineStage;
    items = items.filter((it) => it.stage === s);
  }

  if (search) {
    items = items.filter(
      (it) =>
        it.customerName.toLowerCase().includes(search) ||
        normalizePhone(it.customerPhone).includes(normalizePhone(search)) ||
        (it.projectCode ?? "").toLowerCase().includes(search),
    );
  }

  items.sort((a, b) => {
    // hot trước, rồi mới đến daysInStage giảm dần
    if (!!a.hotFlag !== !!b.hotFlag) return a.hotFlag ? -1 : 1;
    return b.daysInStage - a.daysInStage;
  });

  return NextResponse.json({ counts, total: items.length, items });
}
