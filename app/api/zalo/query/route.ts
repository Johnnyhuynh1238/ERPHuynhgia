/**
 * Zalo inbound — hỏi–đáp nhanh cho kế toán + admin (keyword, read-only).
 * Bridge nhận tin TEXT từ thread KT/admin → POST {text} vào đây → trả {reply}.
 *
 * Nhận diện theo TỪ KHOÁ (không phải LLM): bỏ dấu + lowercase rồi so cụm.
 * Chỉ ĐỌC, không ghi gì. Bảo mật: Bearer <ZALO_INBOUND_SECRET>.
 */
import { NextResponse } from "next/server";
import { ExpenseStatus, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SECRET = process.env.ZALO_INBOUND_SECRET || "";

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
}

/** Bỏ dấu tiếng Việt + lowercase để so khớp keyword linh hoạt. */
function deburr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

const HELP =
  "🤖 Lệnh tra cứu:\n" +
  "• số dư — số dư các quỹ\n" +
  "• lệnh chờ — lệnh chi chưa chi\n" +
  "• thu chờ — lệnh thu chưa thu\n" +
  "• chi tháng — đã chi tháng này\n" +
  "• thu tháng — đã thu tháng này\n" +
  "• hôm nay — thu/chi hôm nay\n" +
  "• nợ ncc — công nợ nhà cung cấp\n" +
  "• nợ khách — khách còn phải thu\n" +
  "• dự án — dự án đang chạy\n" +
  "• tổng quan — báo cáo nhanh\n" +
  "• giúp — xem lại danh sách";

async function sumRaw(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ v: number | null }>>(sql);
  return Number(rows[0]?.v ?? 0);
}

const SQL_CHI_THANG = `SELECT COALESCE(SUM(amount),0)::float8 v FROM cash_transactions WHERE direction='out' AND date_trunc('month',occurred_at)=date_trunc('month',now())`;
const SQL_THU_THANG = `SELECT COALESCE(SUM(amount),0)::float8 v FROM cash_transactions WHERE direction='in' AND date_trunc('month',occurred_at)=date_trunc('month',now())`;
const SQL_CHI_HOMNAY = `SELECT COALESCE(SUM(amount),0)::float8 v FROM cash_transactions WHERE direction='out' AND occurred_at::date=current_date`;
const SQL_THU_HOMNAY = `SELECT COALESCE(SUM(amount),0)::float8 v FROM cash_transactions WHERE direction='in' AND occurred_at::date=current_date`;
const SQL_NO_NCC = `SELECT COALESCE(SUM(con_lai),0)::float8 v FROM ncc_cong_no_du_an`;
const SQL_NO_KHACH = `SELECT COALESCE(SUM(amount),0)::float8 v FROM payment_schedules WHERE status IN ('not_collected','request_sent','customer_late','overdue','pending')`;

async function replyBalances(): Promise<string> {
  const accs = await prisma.cashAccount.findMany({
    where: { active: true },
    select: { name: true, currentBalance: true },
    orderBy: { sortOrder: "asc" },
  });
  if (accs.length === 0) return "Chưa có tài khoản quỹ nào.";
  const lines = accs.map((a) => `• ${a.name}: ${fmtVnd(Number(a.currentBalance))}`);
  const total = accs.reduce((s, a) => s + Number(a.currentBalance), 0);
  return `💰 Số dư quỹ:\n${lines.join("\n")}\n— Tổng: ${fmtVnd(total)}`;
}

async function replyPending(): Promise<string> {
  const list = await prisma.expense.findMany({
    where: { status: ExpenseStatus.pending },
    select: { code: true, amount: true, payee: true },
    orderBy: { createdAt: "asc" },
  });
  if (list.length === 0) return "📋 Lệnh chi chờ: 0 lệnh.";
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const shown = list.slice(0, 15);
  const lines = shown.map((e) => `• ${e.code}: ${fmtVnd(Number(e.amount))}${e.payee ? ` — ${e.payee}` : ""}`);
  let out = `🔴 Lệnh chi chờ (${list.length}):\n${lines.join("\n")}`;
  if (list.length > shown.length) out += `\n… và ${list.length - shown.length} lệnh nữa`;
  out += `\n— Tổng: ${fmtVnd(total)}`;
  return out;
}

async function replyReceiptsPending(): Promise<string> {
  const list = await prisma.receipt.findMany({
    where: { status: ReceiptStatus.pending },
    select: { code: true, amount: true, payer: true },
    orderBy: { createdAt: "asc" },
  });
  if (list.length === 0) return "📋 Lệnh thu chờ: 0 lệnh.";
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const shown = list.slice(0, 15);
  const lines = shown.map((r) => `• ${r.code}: ${fmtVnd(Number(r.amount))}${r.payer ? ` — ${r.payer}` : ""}`);
  let out = `🟢 Lệnh thu chờ (${list.length}):\n${lines.join("\n")}`;
  if (list.length > shown.length) out += `\n… và ${list.length - shown.length} lệnh nữa`;
  out += `\n— Tổng: ${fmtVnd(total)}`;
  return out;
}

async function replyProjects(): Promise<string> {
  const rows = await prisma.project.groupBy({ by: ["status"], _count: { _all: true } });
  const map = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  const active = (map["planning"] || 0) + (map["in_progress"] || 0);
  return `🏗️ Dự án: ${active} đang chạy (kế hoạch ${map["planning"] || 0}, thi công ${map["in_progress"] || 0}, xong ${map["completed"] || 0}, tạm dừng ${map["paused"] || 0}).`;
}

async function replyOverview(): Promise<string> {
  const [bal, chiThang, thuThang, noNcc, noKhach, pendCount] = await Promise.all([
    prisma.cashAccount.aggregate({ where: { active: true }, _sum: { currentBalance: true } }),
    sumRaw(SQL_CHI_THANG),
    sumRaw(SQL_THU_THANG),
    sumRaw(SQL_NO_NCC),
    sumRaw(SQL_NO_KHACH),
    prisma.expense.count({ where: { status: ExpenseStatus.pending } }),
  ]);
  return (
    `📊 Tổng quan:\n` +
    `• Tồn quỹ: ${fmtVnd(Number(bal._sum.currentBalance ?? 0))}\n` +
    `• Tháng này: thu ${fmtVnd(thuThang)} / chi ${fmtVnd(chiThang)}\n` +
    `• Lệnh chi chờ: ${pendCount}\n` +
    `• Nợ NCC: ${fmtVnd(noNcc)}\n` +
    `• Khách còn phải thu: ${fmtVnd(noKhach)}`
  );
}

export async function POST(request: Request) {
  if (!SECRET) return NextResponse.json({ reply: null }, { status: 503 });
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m || m[1] !== SECRET) return NextResponse.json({ reply: null }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = deburr((body?.text || "").toString());
  if (!text) return NextResponse.json({ reply: null });

  try {
    let reply: string | null = null;

    if (/(tong quan|bao cao|tinh hinh|dashboard)/.test(text)) {
      reply = await replyOverview();
    } else if (/(so du|sodu|ton quy|con bao nhieu|con nhieu tien)/.test(text)) {
      reply = await replyBalances();
    } else if (/(lenh cho|cho chi|chua chi|lenh chi cho|con lenh)/.test(text)) {
      reply = await replyPending();
    } else if (/(thu cho|lenh thu|chua thu)/.test(text)) {
      reply = await replyReceiptsPending();
    } else if (/(chi thang|da chi thang|chi trong thang)/.test(text)) {
      reply = `🔴 Đã chi tháng này: ${fmtVnd(await sumRaw(SQL_CHI_THANG))}`;
    } else if (/(thu thang|da thu thang|thu trong thang)/.test(text)) {
      reply = `🟢 Đã thu tháng này: ${fmtVnd(await sumRaw(SQL_THU_THANG))}`;
    } else if (/(hom nay|hnay|thu chi hom nay|ngay hom nay)/.test(text)) {
      const [chi, thu] = await Promise.all([sumRaw(SQL_CHI_HOMNAY), sumRaw(SQL_THU_HOMNAY)]);
      reply = `📅 Hôm nay:\n• Thu: ${fmtVnd(thu)}\n• Chi: ${fmtVnd(chi)}`;
    } else if (/(no ncc|no nha cung cap|cong no ncc)/.test(text)) {
      reply = `🏭 Công nợ nhà cung cấp còn lại: ${fmtVnd(await sumRaw(SQL_NO_NCC))}`;
    } else if (/(no khach|khach no|phai thu|cong no khach)/.test(text)) {
      reply = `🧾 Khách còn phải thu: ${fmtVnd(await sumRaw(SQL_NO_KHACH))}`;
    } else if (/(cong no)/.test(text)) {
      const [ncc, khach] = await Promise.all([sumRaw(SQL_NO_NCC), sumRaw(SQL_NO_KHACH)]);
      reply = `💼 Công nợ:\n• Nợ NCC: ${fmtVnd(ncc)}\n• Khách phải thu: ${fmtVnd(khach)}`;
    } else if (/(du an|cong trinh|project)/.test(text)) {
      reply = await replyProjects();
    } else if (/(giup|help|huong dan|lenh gi|menu|^\?$)/.test(text)) {
      reply = HELP;
    }
    // Không khớp lệnh nào → im lặng (null) để bot không chen vào chat thường.
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lỗi";
    return NextResponse.json({ reply: `⚠️ Lỗi tra cứu: ${msg}` });
  }
}
