import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// Trạng thái được phép bấm "AI Phân tích": chưa chạy, hoặc đã có câu trả lời/kết quả cần bóc lại.
const REQUESTABLE = new Set(["draft", "waiting_answer", "ai_done", "approved"]);

// POST: đưa hạng mục vào hàng chờ AI bóc. Đợt 3 sẽ spawn session Claude tại đây.
export async function POST(_req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const item = await prisma.estimateItem.findUnique({
    where: { id: params.itemId },
    select: { id: true, status: true, name: true, method: true, materialSpec: true, dimensions: true },
  });
  if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 404 });
  if (!REQUESTABLE.has(item.status)) {
    return NextResponse.json({ message: "Hạng mục đang được AI xử lý" }, { status: 409 });
  }
  if (!item.dimensions && !item.method && !item.materialSpec) {
    return NextResponse.json({ message: "Nhập mô tả (biện pháp / vật tư / kích thước) trước khi yêu cầu bóc" }, { status: 400 });
  }

  await prisma.estimateItem.update({ where: { id: item.id }, data: { status: "requested" } });
  return NextResponse.json({ ok: true });
}

// DELETE: reset trạng thái về draft — cứu hạng mục kẹt analyzing khi session chết giữa chừng
export async function DELETE(_req: Request, { params }: { params: { itemId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateItem.update({ where: { id: params.itemId }, data: { status: "draft" } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
