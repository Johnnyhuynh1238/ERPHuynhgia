import { NextResponse } from "next/server";
import { resolveTienDoCode } from "@/lib/ks-day-link";
import { tienDoGet, tienDoPatch } from "@/lib/tien-do";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPIRED = { message: "Link đã hết hạn — link chỉ dùng trong ngày. Anh mở link thư ký gửi sáng nay." };

// Tiến độ qua link ngày (không đăng nhập): mã → KS + dự án, rồi dùng chung logic với màn ERP (KS ko thấy tiền).
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const r = await resolveTienDoCode(params.code);
  if (!r) return NextResponse.json(EXPIRED, { status: 410 });
  return tienDoGet(r.project.id, false);
}

export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  const r = await resolveTienDoCode(params.code);
  if (!r) return NextResponse.json(EXPIRED, { status: 410 });
  return tienDoPatch(req, r.project.id, r.user.id);
}
