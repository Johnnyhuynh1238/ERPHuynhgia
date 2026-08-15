/**
 * Zalo inbound — kế toán gửi ảnh bill chuyển khoản vào thread Zalo → bridge OCR
 * đọc mã lệnh chi (CHI-YYMM-NNNN, đã nhét vào nội dung VietQR) + text → POST vào đây.
 *
 * Endpoint tự: tra lệnh chi theo mã → verify số tiền có trong OCR text → nếu khớp
 * thì sao y luồng mark-paid (status=paid + lưu bill + recordCashTxn ghi sổ quỹ),
 * ghi dưới danh nghĩa user "Zalo Bot", mặc định tài khoản Tiền mặt.
 *
 * Bảo mật: chỉ nhận khi header Authorization: Bearer <ZALO_INBOUND_SECRET> khớp
 * (bridge nội mạng host↔container). Không có secret → 503, không xử lý.
 *
 * Trả { status, reply } — bridge gửi `reply` trở lại thread kế toán.
 */
import { NextResponse } from "next/server";
import { ExpenseStatus, Prisma, SubPaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";
import { fireAndForget, notifyExpensePaid } from "@/lib/notifications";

const SECRET = process.env.ZALO_INBOUND_SECRET || "";
const BOT_EMAIL = "zalo-bot@huynhgia6.local";
// Cho phép khoảng trắng + các loại gạch nối OCR hay nhận nhầm.
const CODE_RE = /CHI\s*[-–—]\s*(\d{4})\s*[-–—]\s*(\d+)/i;

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

/** Cắt mọi token số trong OCR text → set chuỗi chỉ chữ số (đã bỏ dấu ngăn cách). */
function amountTokens(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of text.matchAll(/\d[\d.,\s]*\d|\d/g)) {
    const digits = m[0].replace(/\D/g, "").replace(/^0+/, "");
    if (digits) set.add(digits);
  }
  return set;
}

export async function POST(request: Request) {
  if (!SECRET) return NextResponse.json({ reply: null }, { status: 503 });
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m || m[1] !== SECRET) return NextResponse.json({ reply: null }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { ocrText?: string; imageUrl?: string; occurredAt?: string }
    | null;
  if (!body) return NextResponse.json({ reply: null }, { status: 400 });

  const ocrText = (body.ocrText || "").toString();
  const imageUrl = (body.imageUrl || "").toString().trim() || null;

  const cm = CODE_RE.exec(ocrText);
  if (!cm) {
    return NextResponse.json({
      status: "no_code",
      reply: "⚠️ Không đọc được mã lệnh chi trong ảnh. Vui lòng gửi lại ảnh bill rõ hơn.",
    });
  }
  const code = `CHI-${cm[1]}-${cm[2]}`;

  const expense = await prisma.expense.findUnique({
    where: { code },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!expense) {
    return NextResponse.json({ status: "notfound", reply: `⚠️ Không tìm thấy lệnh chi ${code} trong hệ thống.` });
  }
  if (expense.status === ExpenseStatus.paid) {
    return NextResponse.json({ status: "already", reply: `ℹ️ Lệnh ${code} đã ghi "đã chi" từ trước, không ghi lại.` });
  }
  if (expense.status !== ExpenseStatus.pending) {
    return NextResponse.json({ status: "bad_state", reply: `⚠️ Lệnh ${code} không ở trạng thái chờ chi, không tự ghi được.` });
  }

  const amount = Number(expense.amount);
  const expectDigits = String(Math.round(amount));
  if (!amountTokens(ocrText).has(expectDigits)) {
    return NextResponse.json({
      status: "mismatch",
      reply: `⚠️ Bill ${code} không thấy số tiền khớp lệnh (${fmtVnd(amount)}). Chưa ghi sổ, chờ admin duyệt tay.`,
    });
  }

  const bot = await prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true, fullName: true } });
  if (!bot) {
    return NextResponse.json({ status: "no_bot", reply: `⚠️ Chưa cấu hình user Zalo Bot, không ghi được ${code}.` }, { status: 500 });
  }
  const account = await prisma.cashAccount.findFirst({
    where: { code: "CASH", active: true },
    select: { id: true, name: true },
  });
  if (!account) {
    return NextResponse.json({ status: "no_account", reply: `⚠️ Không tìm thấy tài khoản Tiền mặt, không ghi được ${code}.` }, { status: 500 });
  }

  const paidAt =
    body.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt)
      ? new Date(`${body.occurredAt}T00:00:00.000Z`)
      : new Date();

  try {
    const { balanceAfter } = await prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expense.id },
        data: {
          status: ExpenseStatus.paid,
          paidBy: bot.id,
          paidAt,
          paidAmount: new Prisma.Decimal(amount),
          paidNote: "Tự động ghi từ bill Zalo (Zalo Bot)",
          paidReceiptUrl: imageUrl,
          paidReceiptUrls: imageUrl ? [imageUrl] : [],
          nextReminderAt: null,
        },
      });
      const res = await recordCashTxn(tx, {
        direction: "out",
        amount,
        occurredAt: paidAt,
        refType: "expense",
        refId: expense.id,
        accountId: account.id,
        projectId: expense.projectId,
        categoryId: expense.categoryId,
        note: `${expense.code} — ${expense.category.name}${expense.payee ? ` / ${expense.payee}` : ""} — Zalo Bot`,
        createdBy: bot.id,
      });
      if (expense.subPaymentId) {
        await tx.subPayment.update({
          where: { id: expense.subPaymentId },
          data: {
            status: SubPaymentStatus.paid,
            actualAmount: new Prisma.Decimal(amount),
            actualPaidDate: paidAt,
            paidBy: bot.id,
            paidAt,
          },
        });
      }
      return res;
    });

    fireAndForget(
      notifyExpensePaid({
        expenseId: expense.id,
        code: expense.code,
        paidAmount: amount,
        categoryName: expense.category.name,
        projectLabel: null,
        actorUserId: bot.id,
        actorName: bot.fullName || "Zalo Bot",
      }),
    );

    return NextResponse.json({
      status: "paid",
      reply: `✅ Đã cập nhật ${code} → Đã chi\nChi ${fmtVnd(amount)} vào tài khoản ${account.name}, số dư còn lại ${fmtVnd(Number(balanceAfter))}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lỗi không xác định";
    return NextResponse.json({ status: "error", reply: `⚠️ Lỗi ghi sổ ${code}: ${msg}` }, { status: 500 });
  }
}
