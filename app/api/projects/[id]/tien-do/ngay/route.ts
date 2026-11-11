import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/estimate";
import { setWorkPlanDates } from "@/lib/tien-do-thuc-te";

export const runtime = "nodejs";

// PATCH: đặt ngày kế hoạch riêng cho công tác (admin). Body { works: [{ id, planStart, planEnd }] } — xem lib.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const b = (await req.json().catch(() => ({}))) as { works?: { id?: string; planStart?: unknown; planEnd?: unknown }[] };
  const loi = await setWorkPlanDates(params.id, Array.isArray(b.works) ? b.works : []);
  if (loi) return NextResponse.json({ message: loi }, { status: 400 });
  return NextResponse.json({ ok: true });
}
