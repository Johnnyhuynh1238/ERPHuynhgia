import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// Khi tất cả line của item đã approved → item lên approved luôn
async function syncItemStatus(itemId: string) {
  const [total, approved] = await Promise.all([
    prisma.estimateLine.count({ where: { itemId } }),
    prisma.estimateLine.count({ where: { itemId, status: "approved" } }),
  ]);
  if (total > 0 && total === approved) {
    await prisma.estimateItem.update({ where: { id: itemId }, data: { status: "approved" } });
  }
}

// PATCH: sửa line (KL/diễn giải/tên/mã ĐM/ghi chú → status edited) hoặc duyệt/bỏ duyệt
// body {name?, formula?, quantity?, normCode?, note?} | {action: "approve"|"unapprove"}
export async function PATCH(req: Request, { params }: { params: { lineId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const line = await prisma.estimateLine.findUnique({ where: { id: params.lineId } });
  if (!line) return NextResponse.json({ message: "Không tìm thấy công tác" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.action === "approve" || body.action === "unapprove") {
    await prisma.estimateLine.update({
      where: { id: line.id },
      data: { status: body.action === "approve" ? "approved" : "edited" },
    });
    await syncItemStatus(line.itemId);
    return NextResponse.json({ ok: true });
  }

  // Yêu cầu AI sửa: chỉ ghi/xoá fix_request, KHÔNG đổi status (đây không phải sửa tay).
  // Line đã duyệt vẫn cho gỡ yêu cầu; muốn AI sửa thì bỏ duyệt trước — worker sẽ bỏ qua line approved.
  if ("fixRequest" in body) {
    await prisma.estimateLine.update({
      where: { id: line.id },
      data: { fixRequest: String(body.fixRequest ?? "").trim() || null },
    });
    return NextResponse.json({ ok: true });
  }

  // Trả lời câu hỏi của công tác: chỉ ghi ai_answer, KHÔNG đổi status. Worker đọc rồi clear.
  if ("aiAnswer" in body) {
    await prisma.estimateLine.update({
      where: { id: line.id },
      data: { aiAnswer: String(body.aiAnswer ?? "").trim() || null },
    });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  if ("name" in body) {
    const v = String(body.name ?? "").trim();
    if (!v) return NextResponse.json({ message: "Tên công tác không được rỗng" }, { status: 400 });
    data.name = v;
  }
  if ("formula" in body) data.formula = String(body.formula ?? "").trim() || null;
  if ("note" in body) data.note = String(body.note ?? "").trim() || null;
  if ("quantity" in body) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q < 0) return NextResponse.json({ message: "Khối lượng không hợp lệ" }, { status: 400 });
    data.quantity = q;
  }
  if ("normCode" in body) {
    const code = String(body.normCode ?? "").trim();
    if (code) {
      const norm = await prisma.norm.findUnique({ where: { code }, select: { code: true } });
      if (!norm) return NextResponse.json({ message: `Không có định mức mã ${code}` }, { status: 400 });
      data.normCode = code;
    } else {
      data.normCode = null;
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ message: "Không có gì để sửa" }, { status: 400 });

  data.status = "edited";
  await prisma.estimateLine.update({ where: { id: line.id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE: xoá line
export async function DELETE(_req: Request, { params }: { params: { lineId: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;
  await prisma.estimateLine.delete({ where: { id: params.lineId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
