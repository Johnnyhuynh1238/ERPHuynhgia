import { NextResponse } from "next/server";
import { CashPlanDirection, CashPlanSourceType, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setItemDate, setLineDate, setNativeDate } from "@/lib/cash-plan-ops";
import { buildCashCalendar } from "@/lib/cash-forecast";

export const runtime = "nodejs";

/**
 * Cổng nội bộ cho Văn phòng AI (bin/dong-tien, 05/11/2026): bản tin dòng tiền theo tuần gửi sếp mỗi sáng,
 * sếp đổi ngày thu/chi dự kiến trên link web → ghi ngược vào ERP đúng như màn /cash-plan.
 * Chỉ nhận từ host qua header x-cron-key (PUSH_CRON_KEY), không có session.
 *
 *   GET  → lịch dòng tiền công ty theo tháng/tuần (lib/cash-forecast buildCashCalendar): nguồn thật
 *          + dòng dự báo kế hoạch dòng tiền dự án + chi phí chung, dài đến dự án xa nhất
 *   POST {op:"native", sourceType, sourceId, date, offsetDays?}  đổi ngày gốc ở nguồn (thầu phụ / đợt thu / mua hàng)
 *   POST {op:"line", id, date}                            đổi ngày 1 dòng dự báo (project_cash_lines)
 *   POST {op:"item", id, date}                            đổi ngày 1 đợt kế hoạch (cash_plan_items)
 *   POST {op:"chunk", direction, sourceType, sourceId, projectId?, amount, date, title?}
 *                                                          lên kế hoạch phần "chưa có ngày" của 1 khoản
 */
function ok(req: Request) {
  const key = req.headers.get("x-cron-key");
  return !!key && !!process.env.PUSH_CRON_KEY && key === process.env.PUSH_CRON_KEY;
}

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await buildCashCalendar());
  } catch (err) {
    console.error("[cron cash-plan GET]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("native"),
    sourceType: z.enum(["sub_payment", "payment_schedule", "mh_order"]),
    sourceId: z.string().uuid(),
    date: dateStr.nullable(),
    offsetDays: z.coerce.number().int().min(0).max(365).optional(),
  }),
  z.object({ op: z.literal("item"), id: z.string().uuid(), date: dateStr.nullable() }),
  z.object({ op: z.literal("line"), id: z.string().uuid(), date: dateStr }),
  z.object({
    op: z.literal("chunk"),
    direction: z.enum(["out", "in"]),
    sourceType: z.enum(["mh_order", "ncc_congno", "sub_debt", "loan_principal", "loan_interest", "advance"]),
    sourceId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
    date: dateStr,
    title: z.string().trim().max(255).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  }),
]);

export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.op === "native") {
      const loi = await setNativeDate(b.sourceType, b.sourceId, b.date, b.offsetDays ?? 0);
      if (loi) return NextResponse.json({ error: loi }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    if (b.op === "item") {
      await setItemDate(b.id, b.date);
      return NextResponse.json({ ok: true });
    }
    if (b.op === "line") {
      await setLineDate(b.id, b.date);
      return NextResponse.json({ ok: true });
    }
    // chunk: cần người tạo → lấy admin đầu tiên (bản ghi ghi chú rõ nguồn là bản tin dòng tiền).
    const admin = await prisma.user.findFirst({
      where: { role: UserRole.admin },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!admin) return NextResponse.json({ error: "Không có tài khoản admin" }, { status: 500 });
    const created = await prisma.cashPlanItem.create({
      data: {
        direction: b.direction === "in" ? CashPlanDirection.in : CashPlanDirection.out,
        sourceType: b.sourceType as CashPlanSourceType,
        sourceId: b.sourceId,
        projectId: b.projectId ?? null,
        plannedDate: new Date(`${b.date}T00:00:00Z`),
        amount: new Prisma.Decimal(b.amount),
        title: b.title ?? null,
        note: b.note ?? "Sếp lên kế hoạch trên bản tin dòng tiền",
        createdBy: admin.id,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[cron cash-plan POST]", err);
    return NextResponse.json({ message: err instanceof Error ? err.message : "lỗi" }, { status: 500 });
  }
}
