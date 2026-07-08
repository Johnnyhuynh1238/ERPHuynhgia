import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, type EstimateQa } from "@/lib/estimate";

export const runtime = "nodejs";

// POST: admin trả lời câu hỏi AI. body {index, answer}
export async function POST(req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({
    where: { id: params.itemId },
    select: { id: true, qaThread: true },
  });
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const index = Number(body.index);
  const answer = String(body.answer || "").trim();
  if (!answer) return NextResponse.json({ message: "Thiếu câu trả lời" }, { status: 400 });

  const thread = [...(((item.qaThread as unknown as EstimateQa[]) ?? []))];
  if (!thread[index]) return NextResponse.json({ message: "Không tìm thấy câu hỏi" }, { status: 404 });
  thread[index] = { ...thread[index], a: answer, answeredAt: new Date().toISOString() };

  await prisma.estimateItem.update({
    where: { id: item.id },
    data: { qaThread: thread as unknown as object[] },
  });
  return NextResponse.json({ qaThread: thread });
}
