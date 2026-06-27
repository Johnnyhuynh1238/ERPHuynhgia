import { NextResponse } from "next/server";
import { Prisma, ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";
import { fireAndForget, notifyReceiptReceived } from "@/lib/notifications";

const RECEIVE_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const schema = z.object({
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày thu không hợp lệ"),
  receivedAmount: z.coerce.number().positive("Số tiền đã thu phải > 0"),
  receivedReceiptUrl: z.string().trim().max(500).optional().nullable(),
  receivedNote: z.string().trim().max(2000).optional().nullable(),
});

function atUtcDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

const SOURCE_LABEL: Record<string, string> = {
  customer: "Khách hàng",
  loan: "Vay",
  advance_return: "Hoàn ứng",
  other: "Khác",
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!RECEIVE_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền xác nhận đã thu" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = parsed.data;
  const receipt = await prisma.receipt.findUnique({ where: { id: params.id } });
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy lệnh thu" }, { status: 404 });
  if (receipt.status !== ReceiptStatus.pending) {
    return NextResponse.json({ message: "Lệnh thu không ở trạng thái chờ thu" }, { status: 400 });
  }

  const receivedAt = atUtcDate(data.receivedAt);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          status: ReceiptStatus.received,
          receivedBy: user.id,
          receivedAt,
          receivedAmount: new Prisma.Decimal(data.receivedAmount),
          receivedNote: data.receivedNote?.trim() || null,
          receivedReceiptUrl: data.receivedReceiptUrl?.trim() || null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      });
      await recordCashTxn(tx, {
        direction: "in",
        amount: data.receivedAmount,
        occurredAt: receivedAt,
        refType: "receipt",
        refId: receipt.id,
        projectId: receipt.projectId,
        note: `${receipt.code} — ${SOURCE_LABEL[receipt.source] || receipt.source}${receipt.payer ? ` / ${receipt.payer}` : ""}${data.receivedNote ? ` — ${data.receivedNote}` : ""}`,
        createdBy: user.id,
      });
      return upd;
    });

    fireAndForget(
      notifyReceiptReceived({
        receiptId: updated.id,
        code: updated.code,
        receivedAmount: Number(data.receivedAmount),
        sourceLabel: SOURCE_LABEL[updated.source] || updated.source,
        projectLabel: updated.project ? `${updated.project.code} — ${updated.project.name}` : null,
        actorUserId: user.id,
        actorName: user.name || user.email || "Kế toán",
      }),
    );

    return NextResponse.json({
      receipt: { ...updated, amount: Number(updated.amount), receivedAmount: Number(updated.receivedAmount) },
      message: "Đã xác nhận thu và ghi sổ quỹ",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
