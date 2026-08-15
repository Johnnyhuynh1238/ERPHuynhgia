/**
 * Zalo inbound — kế toán gửi ảnh bill chuyển khoản vào thread Zalo → bridge OCR
 * đọc text bill → POST vào đây. Nội dung CK có mã lệnh chi (VietQR nhét addInfo=code),
 * NHƯNG ngân hàng bỏ dấu gạch nối (lệnh CHI-202608-0058 → bill hiện "CHI2026080058").
 * Vì vậy match mã theo dạng ĐÃ BỎ GẠCH: so UPPER(REPLACE(code,'-','')).
 *
 * Hỗ trợ NHIỀU lệnh trên 1 bill (KT chi chung): đọc hết mã → tổng số tiền các lệnh
 * pending phải khớp số tiền trên bill → ghi tất cả. Lệch → không ghi, chờ admin.
 *
 * Ghi: sao y luồng mark-paid (status=paid + lưu bill vào MinIO + recordCashTxn ghi sổ quỹ
 * tài khoản Tiền mặt), danh nghĩa user "Zalo Bot". Cập nhật paid dùng updateMany atomic
 * (guard status=pending trong transaction) để webhook lặp không trừ quỹ 2 lần.
 *
 * Bảo mật: chỉ nhận khi Authorization: Bearer <ZALO_INBOUND_SECRET> khớp.
 * Trả { status, reply } — bridge gửi `reply` lại thread kế toán.
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { ExpenseStatus, Prisma, SubPaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordCashTxn } from "@/lib/treasury";
import { putObjectToMinio } from "@/lib/minio";
import { fireAndForget, notifyExpensePaid } from "@/lib/notifications";

export const runtime = "nodejs";

const SECRET = process.env.ZALO_INBOUND_SECRET || "";
const BOT_EMAIL = "zalo-bot@huynhgia6.local";
const MAX_CODES = 20;

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

/** Cắt mọi token số trong OCR text → set chuỗi chỉ chữ số (đã bỏ dấu ngăn cách). */
function amountTokens(text: string): Set<string> {
  const set = new Set<string>();
  for (const m of Array.from(text.matchAll(/\d[\d.,\s]*\d|\d/g))) {
    const digits = m[0].replace(/\D/g, "").replace(/^0+/, "");
    if (digits) set.add(digits);
  }
  return set;
}

/** Tải ảnh bill (Zalo CDN) → lưu MinIO, trả về "minio://key". Lỗi → trả về url gốc. */
async function persistBill(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return imageUrl;
    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get("content-type") || "image/jpeg";
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const key = `expenses/receipts/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await putObjectToMinio({ key, body: buf, contentType: ct });
    return `minio://${key}`;
  } catch {
    return imageUrl; // fallback: giữ URL CDN, đừng để lỗi MinIO chặn ghi sổ
  }
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

  // Blob chữ+số (bỏ mọi ký tự khác) → bắt TẤT CẢ mã "CHI" + chuỗi số (đã mất gạch nối).
  const norm = ocrText.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const stripped = Array.from(new Set(Array.from(norm.matchAll(/CHI(\d{5,})/g)).map((x) => `CHI${x[1]}`))).slice(0, MAX_CODES);
  if (stripped.length === 0) {
    return NextResponse.json({
      status: "no_code",
      reply: "⚠️ Không đọc được mã lệnh chi trong ảnh. Vui lòng gửi lại ảnh bill rõ hơn.",
    });
  }

  // Tra lệnh chi theo mã đã bỏ gạch nối (có thể nhiều lệnh / 1 bill).
  const rows = await prisma.$queryRaw<Array<{ code: string; stripped: string }>>`
    SELECT code, UPPER(REPLACE(code, '-', '')) AS stripped
    FROM expenses
    WHERE UPPER(REPLACE(code, '-', '')) IN (${Prisma.join(stripped)})
  `;
  const foundCodes = rows.map((r) => r.code);
  const notFound = stripped.filter((s) => !rows.some((r) => r.stripped === s));

  if (foundCodes.length === 0) {
    return NextResponse.json({ status: "notfound", reply: `⚠️ Không tìm thấy lệnh chi khớp mã ${stripped.join(", ")} trong hệ thống.` });
  }

  const expenses = await prisma.expense.findMany({
    where: { code: { in: foundCodes } },
    include: { category: { select: { id: true, name: true } } },
  });
  const pending = expenses.filter((e) => e.status === ExpenseStatus.pending);
  const already = expenses.filter((e) => e.status === ExpenseStatus.paid);
  const badState = expenses.filter((e) => e.status !== ExpenseStatus.pending && e.status !== ExpenseStatus.paid);

  if (pending.length === 0) {
    const parts: string[] = [];
    if (already.length) parts.push(`Lệnh ${already.map((e) => e.code).join(", ")} đã ghi "đã chi" từ trước.`);
    if (badState.length) parts.push(`Lệnh ${badState.map((e) => e.code).join(", ")} không ở trạng thái chờ chi.`);
    if (notFound.length) parts.push(`Không tìm thấy mã ${notFound.join(", ")}.`);
    return NextResponse.json({ status: "nothing", reply: `ℹ️ Không có lệnh nào để ghi. ${parts.join(" ")}` });
  }

  // Tổng tiền các lệnh pending phải khớp số tiền trên bill (chi chung nhiều lệnh = 1 CK tổng).
  const total = pending.reduce((s, e) => s + Number(e.amount), 0);
  if (!amountTokens(ocrText).has(String(Math.round(total)))) {
    return NextResponse.json({
      status: "mismatch",
      reply: `⚠️ Số tiền trên bill không khớp tổng ${pending.length > 1 ? `${pending.length} lệnh` : "lệnh"} ${pending.map((e) => e.code).join(", ")} (tổng ${fmtVnd(total)}). Chưa ghi sổ, chờ admin duyệt tay.`,
    });
  }

  const bot = await prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true, fullName: true } });
  if (!bot) {
    return NextResponse.json({ status: "no_bot", reply: `⚠️ Chưa cấu hình user Zalo Bot, không ghi được.` }, { status: 500 });
  }
  const account = await prisma.cashAccount.findFirst({
    where: { code: "CASH", active: true },
    select: { id: true, name: true },
  });
  if (!account) {
    return NextResponse.json({ status: "no_account", reply: `⚠️ Không tìm thấy tài khoản Tiền mặt, không ghi được.` }, { status: 500 });
  }

  const billUrl = await persistBill(imageUrl);
  const paidAt =
    body.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt)
      ? new Date(`${body.occurredAt}T00:00:00.000Z`)
      : new Date();

  try {
    const { paid, balanceAfter } = await prisma.$transaction(async (tx) => {
      const paid: Array<{ code: string; amount: number }> = [];
      let balanceAfter = 0;
      for (const e of pending) {
        const amount = Number(e.amount);
        // Guard atomic: chỉ ghi nếu VẪN pending → webhook lặp không trừ quỹ 2 lần.
        const upd = await tx.expense.updateMany({
          where: { id: e.id, status: ExpenseStatus.pending },
          data: {
            status: ExpenseStatus.paid,
            paidBy: bot.id,
            paidAt,
            paidAmount: new Prisma.Decimal(amount),
            paidNote: "Tự động ghi từ bill Zalo (Zalo Bot)",
            paidReceiptUrl: billUrl,
            paidReceiptUrls: billUrl ? [billUrl] : [],
            nextReminderAt: null,
          },
        });
        if (upd.count === 0) continue; // đã bị ghi song song → bỏ qua, không trừ quỹ lần 2
        const res = await recordCashTxn(tx, {
          direction: "out",
          amount,
          occurredAt: paidAt,
          refType: "expense",
          refId: e.id,
          accountId: account.id,
          projectId: e.projectId,
          categoryId: e.categoryId,
          note: `${e.code} — ${e.category.name}${e.payee ? ` / ${e.payee}` : ""} — Zalo Bot`,
          createdBy: bot.id,
        });
        balanceAfter = Number(res.balanceAfter);
        if (e.subPaymentId) {
          await tx.subPayment.update({
            where: { id: e.subPaymentId },
            data: {
              status: SubPaymentStatus.paid,
              actualAmount: new Prisma.Decimal(amount),
              actualPaidDate: paidAt,
              paidBy: bot.id,
              paidAt,
            },
          });
        }
        paid.push({ code: e.code, amount });
      }
      return { paid, balanceAfter };
    });

    if (paid.length === 0) {
      return NextResponse.json({ status: "already", reply: `ℹ️ Lệnh ${pending.map((e) => e.code).join(", ")} vừa được ghi "đã chi" (xử lý trùng), không ghi lại.` });
    }

    for (const e of pending) {
      const info = paid.find((p) => p.code === e.code);
      if (!info) continue;
      fireAndForget(
        notifyExpensePaid({
          expenseId: e.id,
          code: e.code,
          paidAmount: info.amount,
          categoryName: e.category.name,
          projectLabel: null,
          actorUserId: bot.id,
          actorName: bot.fullName || "Zalo Bot",
        }),
      );
    }

    let reply: string;
    if (paid.length === 1) {
      reply = `✅ Đã cập nhật ${paid[0].code} → Đã chi\nChi ${fmtVnd(paid[0].amount)} vào tài khoản ${account.name}, số dư còn lại ${fmtVnd(balanceAfter)}.`;
    } else {
      const lines = paid.map((p) => ` • ${p.code}: ${fmtVnd(p.amount)}`).join("\n");
      const sum = paid.reduce((s, p) => s + p.amount, 0);
      reply = `✅ Đã cập nhật ${paid.length} lệnh → Đã chi:\n${lines}\nTổng ${fmtVnd(sum)} vào tài khoản ${account.name}, số dư còn lại ${fmtVnd(balanceAfter)}.`;
    }
    if (already.length) reply += `\n(Lệnh ${already.map((e) => e.code).join(", ")} đã chi từ trước.)`;

    return NextResponse.json({ status: "paid", reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lỗi không xác định";
    return NextResponse.json({ status: "error", reply: `⚠️ Lỗi ghi sổ: ${msg}` }, { status: 500 });
  }
}
