import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCt } from "@/lib/construction-technique-auth";

export const dynamic = "force-dynamic";

// body { ids: string[] } theo thứ tự mới → sort_order 10, 20, 30… (thứ tự = ưu tiên khớp tên)
export async function POST(request: Request) {
  const { error } = await requireCt(true);
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ message: "Thiếu danh sách" }, { status: 400 });
  await prisma.$transaction(
    ids.map((id, i) => prisma.constructionTechnique.updateMany({ where: { id }, data: { sortOrder: (i + 1) * 10 } })),
  );
  return NextResponse.json({ ok: true });
}
