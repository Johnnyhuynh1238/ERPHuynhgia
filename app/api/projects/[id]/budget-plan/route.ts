import { NextResponse } from "next/server";
import { BudgetPlanGroup, BudgetPlanStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildBudgetPlan } from "@/lib/budget-plan";

export const dynamic = "force-dynamic";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

// GET: ngân sách + đã chi/công nợ per hạng mục.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const data = await buildBudgetPlan(params.id);
  return NextResponse.json(data);
}

const lineSchema = z.object({
  id: z.string().uuid().nullable().optional(), // dòng cũ → giữ id (đơn/HĐ/chi/tiến độ gắn theo id)
  sectionId: z.string().uuid().nullable().optional(), // PHẦN tiến độ
  name: z.string().trim().min(1, "Tên hạng mục bắt buộc").max(255),
  groupKind: z.nativeEnum(BudgetPlanGroup),
  amount: z.coerce.number().int().min(0, "Ngân sách không hợp lệ"),
});
const putSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(lineSchema).max(100),
});

// PUT: lưu toàn bộ hạng mục (chỉ khi chưa khoá). Chỉ admin chốt số — kế toán chỉ xem.
//  - Dòng có id → UPDATE tại chỗ (giữ id: đơn mua hàng/thầu phụ/lệnh chi/tiến độ gắn theo id).
//  - Dòng mới (ko id) → INSERT. Dòng cũ vắng mặt → xoá; dòng đã gắn phần tiến độ/chi phí bị
//    trigger DB chặn → báo "đặt ngân sách = 0" (VD phụ lục trừ phần khách cấp: về 0, KHÔNG xoá).
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== UserRole.admin || !user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const { note, lines } = parsed.data;

  const existing = await prisma.projectBudgetPlan.findUnique({
    where: { projectId: params.id },
    include: { lines: { select: { id: true, name: true, sectionId: true } } },
  });
  if (existing?.status === BudgetPlanStatus.locked)
    return NextResponse.json({ error: "Ngân sách đã khoá, mở khoá để sửa" }, { status: 400 });

  // Phần chọn phải thuộc dự án.
  const secIds = Array.from(new Set(lines.map((l) => l.sectionId).filter((x): x is string => !!x)));
  if (secIds.length) {
    const n = await prisma.projectSection.count({ where: { projectId: params.id, id: { in: secIds } } });
    if (n !== secIds.length) return NextResponse.json({ error: "Phần tiến độ không hợp lệ" }, { status: 400 });
  }

  const oldById = new Map((existing?.lines ?? []).map((l) => [l.id, l]));
  const keepIds = new Set(lines.map((l) => l.id).filter((x): x is string => !!x && oldById.has(x)));
  const dropped = (existing?.lines ?? []).filter((l) => !keepIds.has(l.id));
  // Báo sớm, dễ hiểu (trigger DB vẫn chặn phần còn lại: dòng có chi phí/tiến độ gắn).
  const droppedSec = dropped.filter((l) => l.sectionId);
  if (droppedSec.length)
    return NextResponse.json(
      {
        error: `Không xoá được "${droppedSec[0].name}" (gắn phần tiến độ) — đặt ngân sách = 0 thay vì xoá`,
      },
      { status: 400 },
    );

  const total = lines.reduce((s, l) => s + l.amount, 0);

  try {
    await prisma.$transaction(async (tx) => {
      const plan = await tx.projectBudgetPlan.upsert({
        where: { projectId: params.id },
        create: {
          projectId: params.id,
          note: note ?? null,
          totalAmount: BigInt(total),
          createdById: user.id,
        },
        update: { note: note ?? null, totalAmount: BigInt(total) },
      });
      if (dropped.length)
        await tx.projectBudgetPlanLine.deleteMany({ where: { id: { in: dropped.map((l) => l.id) } } });
      for (const [i, l] of Array.from(lines.entries())) {
        const data = {
          name: l.name,
          groupKind: l.groupKind,
          amount: BigInt(l.amount),
          sortRank: i,
          sectionId: l.sectionId ?? null,
        };
        if (l.id && keepIds.has(l.id)) await tx.projectBudgetPlanLine.update({ where: { id: l.id }, data });
        else await tx.projectBudgetPlanLine.create({ data: { ...data, planId: plan.id } });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const m = msg.match(/Không xoá dòng ngân sách[^\n]*?thay vì xoá/);
    if (m) return NextResponse.json({ error: m[0] }, { status: 400 });
    throw e;
  }

  return NextResponse.json({ ok: true });
}

const actionSchema = z.object({ action: z.enum(["lock", "unlock"]) });

// POST: khoá / mở khoá ngân sách.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== UserRole.admin || !user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });

  const plan = await prisma.projectBudgetPlan.findUnique({ where: { projectId: params.id } });
  if (!plan) return NextResponse.json({ error: "Chưa có ngân sách" }, { status: 404 });

  const lock = parsed.data.action === "lock";
  await prisma.projectBudgetPlan.update({
    where: { id: plan.id },
    data: {
      status: lock ? BudgetPlanStatus.locked : BudgetPlanStatus.draft,
      lockedById: lock ? user.id : null,
      lockedAt: lock ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true });
}
