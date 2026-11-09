import { NextRequest, NextResponse } from "next/server";
import { resolveDiaryCode } from "@/lib/ks-day-link";
import { diaryGet, diaryPost } from "@/lib/ks-diary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPIRED = { message: "Link đã hết hạn — link chỉ dùng trong ngày. Anh mở link thư ký gửi sáng nay." };

// Nhật ký qua link ngày (không đăng nhập): mã → KS + dự án, rồi dùng chung logic với màn ERP.
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const r = await resolveDiaryCode(params.code);
  if (!r) return NextResponse.json(EXPIRED, { status: 410 });
  return diaryGet(req, r.project, r.user);
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const r = await resolveDiaryCode(params.code);
  if (!r) return NextResponse.json(EXPIRED, { status: 410 });
  return diaryPost(req, r.project, r.user);
}
