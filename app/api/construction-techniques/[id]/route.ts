import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCt } from "@/lib/construction-technique-auth";
import { parseTechniqueBody } from "../parse";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireCt(true);
  if (error) return error;
  const parsed = parseTechniqueBody(await request.json().catch(() => null));
  if ("message" in parsed) return NextResponse.json({ message: parsed.message }, { status: 400 });

  const dup = await prisma.constructionTechnique.findFirst({
    where: { code: parsed.code, NOT: { id: params.id } },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ message: `Mã ${parsed.code} đã tồn tại` }, { status: 400 });

  const r = await prisma.constructionTechnique.updateMany({
    where: { id: params.id },
    data: { ...parsed, updatedBy: user.id },
  });
  if (r.count === 0) return NextResponse.json({ message: "Không tìm thấy mẫu" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireCt(true);
  if (error) return error;
  await prisma.constructionTechnique.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
