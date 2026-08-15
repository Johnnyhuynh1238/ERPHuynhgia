/**
 * Zalo inbound — hỏi–đáp nhanh cho kế toán + admin (keyword, read-only).
 * Bridge nhận tin TEXT từ thread KT/admin → POST {text} vào đây → trả {reply}.
 *
 * Nhận diện theo TỪ KHOÁ (không phải LLM): bỏ dấu + lowercase rồi so cụm.
 * Chỉ ĐỌC, không ghi gì. Bảo mật: Bearer <ZALO_INBOUND_SECRET>.
 */
import { NextResponse } from "next/server";
import { ExpenseStatus } from "@prisma/client";
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
  "• nợ ncc — công nợ nhà cung cấp\n" +
  "• giúp — xem lại danh sách";

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
  if (list.length === 0) return "✅ Không còn lệnh chi nào đang chờ.";
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const shown = list.slice(0, 15);
  const lines = shown.map((e) => `• ${e.code}: ${fmtVnd(Number(e.amount))}${e.payee ? ` — ${e.payee}` : ""}`);
  let out = `🔴 Lệnh chi chờ (${list.length}):\n${lines.join("\n")}`;
  if (list.length > shown.length) out += `\n… và ${list.length - shown.length} lệnh nữa`;
  out += `\n— Tổng: ${fmtVnd(total)}`;
  return out;
}

async function replyNccDebt(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT SUM(con_lai)::float8 AS total FROM ncc_cong_no_du_an
  `;
  const total = Number(rows[0]?.total ?? 0);
  return `🏭 Công nợ nhà cung cấp còn lại: ${fmtVnd(total)}`;
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
    if (/(so du|sodu|quy tien|con bao nhieu|con nhieu)/.test(text)) {
      reply = await replyBalances();
    } else if (/(lenh cho|cho chi|chua chi|lenh chi cho|con lenh)/.test(text)) {
      reply = await replyPending();
    } else if (/(no ncc|cong no|no nha cung cap|no ncc)/.test(text)) {
      reply = await replyNccDebt();
    } else if (/(giup|help|huong dan|lenh gi|menu|\?)/.test(text)) {
      reply = HELP;
    }
    // Không khớp lệnh nào → im lặng (null) để bot không chen vào chat thường.
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lỗi";
    return NextResponse.json({ reply: `⚠️ Lỗi tra cứu: ${msg}` });
  }
}
