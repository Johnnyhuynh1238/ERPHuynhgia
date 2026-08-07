/**
 * Zalo notify — bắn tin lệnh thu/chi cho kế toán qua bridge openzca chạy trên host.
 *
 * ERP (container) POST tới bridge (`ZALO_BRIDGE_URL`), bridge gọi `openzca msg ...`
 * với session Zalo đã login sẵn trên host. Không có bridge/token → skip im lặng,
 * không bao giờ làm fail flow tạo/duyệt lệnh (luôn gọi qua fireAndForget).
 *
 * Quy ước tin (kế toán không mở được PWA từ webview Zalo → bỏ link ERP):
 *  - Lệnh CHI: ảnh VietQR (kế toán quét chuyển khoản) + text (mã, số tiền, nội dung). Không kèm STK (đã có trong QR).
 *  - Lệnh THU: chỉ text (mã, số tiền, người nộp, dự án).
 */
import { prisma } from "@/lib/prisma";
import { buildVietQrImageUrl } from "@/lib/vietqr";

const BRIDGE_URL = (process.env.ZALO_BRIDGE_URL || "").replace(/\/$/, "");
const BRIDGE_TOKEN = process.env.ZALO_BRIDGE_TOKEN || "";

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

/**
 * Gửi 1 tin (text + ảnh tuỳ chọn) tới kế toán qua bridge.
 * Trả về true nếu bridge nhận; false nếu chưa cấu hình hoặc lỗi (đã nuốt lỗi).
 */
export async function sendZaloAccountant(input: {
  text: string;
  imageUrl?: string | null;
}): Promise<boolean> {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) return false; // chưa bật tích hợp Zalo
  try {
    const res = await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: JSON.stringify({ text: input.text, imageUrl: input.imageUrl || null }),
      // bridge nội mạng, phản hồi nhanh; chặn treo request
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[zalo-notify] bridge trả lỗi:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[zalo-notify] gọi bridge thất bại:", err);
    return false;
  }
}

function projectLabelOf(r: {
  project?: { code: string; name: string } | null;
  designContract?: { customerName: string } | null;
}): string {
  if (r.project) return `${r.project.code} — ${r.project.name}`;
  if (r.designContract) return `TK — ${r.designContract.customerName}`;
  return "";
}

/**
 * Lệnh CHI → gửi kế toán: ảnh VietQR (nếu đủ STK+ngân hàng) + text (mã, số tiền, nội dung).
 * Tự truy DB lấy STK/bank/số tiền để khỏi đổi chữ ký các hàm notify.
 */
export async function zaloNotifyExpense(expenseId: string): Promise<void> {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) return;
  const e = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      code: true,
      amount: true,
      payee: true,
      payeeBankBin: true,
      payeeAccountNumber: true,
      payeeAccountName: true,
      category: { select: { name: true } },
      project: { select: { code: true, name: true } },
      designContract: { select: { customerName: true } },
    },
  });
  if (!e) return;

  const amount = Number(e.amount);
  const where = projectLabelOf(e);
  const lines = [
    `🔴 LỆNH CHI ${e.code}`,
    `Số tiền: ${fmtVnd(amount)}`,
    `Nội dung: ${e.category.name}${e.payee ? ` · ${e.payee}` : ""}`,
  ];
  if (where) lines.push(`Dự án: ${where}`);

  let imageUrl: string | null = null;
  if (e.payeeBankBin && e.payeeAccountNumber) {
    imageUrl = buildVietQrImageUrl({
      bankBin: e.payeeBankBin,
      accountNumber: e.payeeAccountNumber,
      amount,
      addInfo: e.code,
      accountName: e.payeeAccountName || undefined,
    });
  }

  await sendZaloAccountant({ text: lines.join("\n"), imageUrl });
}

/**
 * Lệnh THU → gửi kế toán: chỉ text (mã, số tiền, người nộp, dự án). Không QR, không link.
 */
export async function zaloNotifyReceipt(receiptId: string): Promise<void> {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) return;
  const r = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: {
      code: true,
      amount: true,
      payer: true,
      project: { select: { code: true, name: true } },
      designContract: { select: { customerName: true } },
    },
  });
  if (!r) return;

  const where = projectLabelOf(r);
  const lines = [
    `🟢 LỆNH THU ${r.code}`,
    `Số tiền: ${fmtVnd(Number(r.amount))}`,
  ];
  if (r.payer) lines.push(`Người nộp: ${r.payer}`);
  if (where) lines.push(`Dự án: ${where}`);

  await sendZaloAccountant({ text: lines.join("\n"), imageUrl: null });
}
