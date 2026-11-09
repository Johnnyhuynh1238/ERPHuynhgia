import { NextRequest, NextResponse } from "next/server";
import { resolveDiaryCode } from "@/lib/ks-day-link";
import { diaryList } from "@/lib/ks-diary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const r = await resolveDiaryCode(params.code);
  if (!r) return NextResponse.json({ message: "Link đã hết hạn" }, { status: 410 });
  return diaryList(req, r.project.id, r.user);
}
