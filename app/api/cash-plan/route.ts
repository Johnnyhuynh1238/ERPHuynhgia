import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { CashPlanDirection, CashPlanSourceType, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildCashPlan } from "@/lib/cash-plan";

function canAccess(role: string | undefined) {
  return role === UserRole.admin || role === UserRole.accountant;
}

// ── GET: toàn bộ dữ liệu màn kế hoạch ────────────────────────────────────────
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  const data = await buildCashPlan({ projectId: projectId || null });
  return NextResponse.json(data);
}

// ── POST: tạo đợt kế hoạch / khoản nhập tay / chuỗi lương định kỳ ─────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const chunkSchema = z.object({
  kind: z.literal("chunk"),
  direction: z.enum(["out", "in"]),
  sourceType: z.enum(["mh_order", "loan_principal", "loan_interest", "advance"]),
  sourceId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  plannedDate: dateStr,
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  title: z.string().trim().max(255).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

const manualSchema = z.object({
  kind: z.literal("manual"),
  direction: z.enum(["out", "in"]),
  projectId: z.string().uuid().nullable().optional(),
  plannedDate: dateStr.nullable().optional(),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  title: z.string().trim().min(1, "Nhập tên khoản").max(255),
  note: z.string().trim().max(2000).nullable().optional(),
});

const salarySchema = z.object({
  kind: z.literal("salary"),
  title: z.string().trim().min(1, "Nhập tên/nhân viên").max(255),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  payday: dateStr, // ngày trả trong tháng (yyyy-mm-dd); định kỳ lấy năm của ngày này
  recurring: z.boolean().default(false),
  note: z.string().trim().max(2000).nullable().optional(),
});

const bodySchema = z.discriminatedUnion("kind", [chunkSchema, manualSchema, salarySchema]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role) || !user?.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;

  if (b.kind === "salary") {
    const [y, , d] = b.payday.split("-").map(Number);
    const groupId = b.recurring ? randomUUID() : null;
    // Định kỳ = cả năm dương lịch (T1–T12) của năm chọn; không thì 1 kỳ đúng ngày chọn.
    const months = b.recurring ? Array.from({ length: 12 }, (_, i) => i) : [Number(b.payday.split("-")[1]) - 1];
    const rows: Prisma.CashPlanItemCreateManyInput[] = months.map((mIdx) => {
      const lastDay = new Date(Date.UTC(y, mIdx + 1, 0)).getUTCDate();
      const planned = new Date(Date.UTC(y, mIdx, Math.min(d, lastDay))); // kẹp ngày cuối tháng
      return {
        direction: CashPlanDirection.out,
        sourceType: CashPlanSourceType.salary,
        plannedDate: planned,
        amount: new Prisma.Decimal(b.amount),
        title: b.title,
        note: b.note ?? null,
        recurGroupId: groupId,
        createdBy: user.id,
      };
    });
    await prisma.cashPlanItem.createMany({ data: rows });
    return NextResponse.json({ ok: true, count: rows.length });
  }

  const common = {
    direction: b.direction === "in" ? CashPlanDirection.in : CashPlanDirection.out,
    amount: new Prisma.Decimal(b.amount),
    note: b.note ?? null,
    projectId: b.projectId ?? null,
    createdBy: user.id,
  };

  const created = await prisma.cashPlanItem.create({
    data:
      b.kind === "chunk"
        ? {
            ...common,
            sourceType: b.sourceType as CashPlanSourceType,
            sourceId: b.sourceId,
            plannedDate: new Date(`${b.plannedDate}T00:00:00Z`),
            title: b.title ?? null,
          }
        : {
            ...common,
            sourceType: CashPlanSourceType.manual,
            plannedDate: b.plannedDate ? new Date(`${b.plannedDate}T00:00:00Z`) : null,
            title: b.title,
          },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: created.id });
}

// ── PATCH: đổi ngày gốc ở NGUỒN (đồng bộ 2 chiều) ────────────────────────────
const nativeSchema = z.object({
  sourceType: z.enum(["sub_payment", "payment_schedule", "mh_order"]),
  sourceId: z.string().uuid(),
  date: dateStr.nullable(), // null = xoá ngày gốc
});

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!canAccess(user?.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = nativeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "invalid" }, { status: 400 });
  const { sourceType, sourceId, date } = parsed.data;
  const value = date ? new Date(`${date}T00:00:00Z`) : null;

  if (sourceType === "sub_payment") {
    if (!value) return NextResponse.json({ error: "Đợt thầu phụ bắt buộc có ngày" }, { status: 400 });
    await prisma.subPayment.update({ where: { id: sourceId }, data: { expectedDate: value } });
  } else if (sourceType === "payment_schedule") {
    await prisma.paymentSchedule.update({ where: { id: sourceId }, data: { expectedDate: value } });
  } else {
    await prisma.mhOrder.update({ where: { id: sourceId }, data: { deliveryDate: value } });
  }
  return NextResponse.json({ ok: true });
}
