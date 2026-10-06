import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCt } from "@/lib/construction-technique-auth";
import { loadTechniques } from "@/lib/construction-technique-db";
import { parseTechniqueBody } from "./parse";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireCt(false);
  if (error) return error;
  return NextResponse.json({ techniques: await loadTechniques({ includeInactive: true }) });
}

export async function POST(request: Request) {
  const { user, error } = await requireCt(true);
  if (error) return error;
  const parsed = parseTechniqueBody(await request.json().catch(() => null));
  if ("message" in parsed) return NextResponse.json({ message: parsed.message }, { status: 400 });

  const existed = await prisma.constructionTechnique.findUnique({ where: { code: parsed.code }, select: { id: true } });
  if (existed) return NextResponse.json({ message: `Mã ${parsed.code} đã tồn tại` }, { status: 400 });
  const last = await prisma.constructionTechnique.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });

  const row = await prisma.constructionTechnique.create({
    data: { ...parsed, sortOrder: (last?.sortOrder ?? 0) + 10, updatedBy: user.id },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id });
}
