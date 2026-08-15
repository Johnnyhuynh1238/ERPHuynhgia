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
import { getProjectFinanceSummary } from "@/lib/project-finance-summary";
import { computeEstimateProgress } from "@/lib/estimate-progress";

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
  "• dự án — đếm dự án đang chạy\n" +
  "• dự án <tên> — số liệu 1 dự án (vd: dự án nhà Cường)\n" +
  "• tổng hợp dự án — số liệu tất cả dự án\n" +
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

const STATUS_VN: Record<string, string> = {
  planning: "kế hoạch",
  in_progress: "đang thi công",
  completed: "đã xong",
  paused: "tạm dừng",
};

// Tra số liệu 1 dự án theo TÊN (hoặc mã). Trả null nếu người dùng không nhập tên
// (chỉ gõ "dự án") → caller fallback về đếm theo status.
async function replyOneProject(rawText: string): Promise<string | null> {
  // Bỏ các từ lệnh, giữ lại phần tên dự án.
  const q = rawText
    .replace(/\b(du an|cong trinh|project|so lieu|thong tin|bao cao|xem|cho|check|cua|nha)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return null; // không có tên → để caller trả danh sách đếm

  const all = await prisma.project.findMany({ select: { id: true, name: true, code: true, status: true } });
  const scored = all
    .map((p) => {
      const n = deburr(p.name);
      const c = deburr(p.code || "");
      let score = 0;
      if (c && c === q) score = 100;
      else if (n === q) score = 90;
      else if (n.includes(q)) score = 60;
      else if (q.includes(n) && n.length >= 3) score = 40;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return `🔎 Không thấy dự án khớp "${q}". Gõ "dự án" để xem danh sách.`;
  }
  // Nhiều dự án cùng điểm cao → liệt kê để anh chọn chính xác.
  const top = scored[0].score;
  const ties = scored.filter((x) => x.score === top);
  if (ties.length > 1) {
    const names = ties.slice(0, 8).map((x) => `• ${x.p.name}${x.p.code ? ` (${x.p.code})` : ""}`);
    return `🔎 Có ${ties.length} dự án khớp "${q}":\n${names.join("\n")}\nNhắn rõ tên hơn giúp em.`;
  }

  return buildProjectReport(scored[0].p.id);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

// Báo cáo ĐẦY ĐỦ mọi số của 1 dự án (thông tin + tiến độ + tài chính + đợt thu +
// mua hàng + thầu phụ + nghiệm thu + nhật ký + cơ cấu chi). Số tài chính tái dùng
// getProjectFinanceSummary → khớp trang Tài chính dự án.
async function buildProjectReport(projectId: string): Promise<string> {
  const [meta, fin, prog] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true, name: true, address: true, status: true, startDate: true, expectedEndDate: true },
    }),
    getProjectFinanceSummary(projectId),
    computeEstimateProgress(projectId).catch(() => null),
  ]);
  if (!meta) return "🔎 Dự án không còn tồn tại.";

  const [schedules, mhRows, subRows, subPaidRows, msRows, diaryRows, catRows, payrollRows] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { projectId },
      select: { status: true, amount: true, milestoneDescription: true, expectedDate: true, dueDate: true },
      orderBy: [{ phaseNumber: "asc" }, { installmentNo: "asc" }],
    }),
    prisma.$queryRaw<{ n: number; total: number; received: number }[]>`
      SELECT count(*)::int n, coalesce(sum(total),0)::float8 total,
             count(*) FILTER (WHERE status='received')::int received
      FROM mh_orders WHERE project_id = ${projectId}::uuid`,
    prisma.$queryRaw<{ n: number; total: number }[]>`
      SELECT count(*)::int n, coalesce(sum(contract_value),0)::float8 total
      FROM sub_contracts WHERE project_id = ${projectId}::uuid`,
    prisma.$queryRaw<{ paid: number }[]>`
      SELECT coalesce(sum(sp.actual_amount),0)::float8 paid
      FROM sub_payments sp JOIN sub_contracts sc ON sc.id = sp.sub_contract_id
      WHERE sc.project_id = ${projectId}::uuid AND sp.status = 'paid'`,
    prisma.$queryRaw<{ total: number; signed: number }[]>`
      SELECT count(*)::int total, count(*) FILTER (WHERE status='signed')::int signed
      FROM acceptance_milestones WHERE project_id = ${projectId}::uuid`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int n FROM construction_diaries WHERE project_id = ${projectId}::uuid`,
    prisma.$queryRaw<{ name: string; amount: number }[]>`
      SELECT coalesce(ec.name,'Khác') name, sum(ct.amount)::float8 amount
      FROM cash_transactions ct LEFT JOIN expense_categories ec ON ec.id = ct.category_id
      WHERE ct.project_id = ${projectId}::uuid AND ct.direction = 'out'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
    prisma.$queryRaw<{ paid: number }[]>`
      SELECT coalesce(sum(total_payable),0)::float8 paid
      FROM weekly_payrolls WHERE project_id = ${projectId}::uuid AND status = 'paid'`,
  ]);

  // Đợt thu
  const doneInstallments = schedules.filter((s) => s.status === "collected" || s.status === "paid").length;
  const nextUnpaid = schedules
    .filter((s) => !(s.status === "collected" || s.status === "paid") && (s.expectedDate || s.dueDate))
    .sort((a, b) => new Date(a.expectedDate ?? a.dueDate!).getTime() - new Date(b.expectedDate ?? b.dueDate!).getTime())[0];

  const mh = mhRows[0] ?? { n: 0, total: 0, received: 0 };
  const sub = subRows[0] ?? { n: 0, total: 0 };
  const subPaid = Number(subPaidRows[0]?.paid ?? 0);
  const ms = msRows[0] ?? { total: 0, signed: 0 };
  const diaryCount = Number(diaryRows[0]?.n ?? 0);
  const payrollPaid = Number(payrollRows[0]?.paid ?? 0);

  const daysLeft = meta.expectedEndDate
    ? Math.ceil((new Date(meta.expectedEndDate).getTime() - Date.now()) / 86400000)
    : null;
  const grossMargin = fin.budgetTotal != null ? fin.contractValue - fin.budgetTotal : null;
  const cashFlow = fin.collected - fin.spent;

  const L: string[] = [];
  L.push(`🏗️ ${meta.name}${meta.code ? ` (${meta.code})` : ""}`);
  L.push(`Trạng thái: ${STATUS_VN[meta.status] || meta.status}`);
  if (meta.address) L.push(`Địa chỉ: ${meta.address}`);
  L.push(`Bắt đầu: ${fmtDate(meta.startDate)} · Dự kiến xong: ${fmtDate(meta.expectedEndDate)}${daysLeft != null ? ` (${daysLeft >= 0 ? `còn ${daysLeft}` : `trễ ${-daysLeft}`} ngày)` : ""}`);
  if (prog) L.push(`Tiến độ (theo công tác): ${prog.earnedPct}%`);

  L.push(``);
  L.push(`💰 TÀI CHÍNH`);
  L.push(`• Giá trị HĐ: ${fmtVnd(fin.contractValue)}`);
  L.push(`• Đã thu: ${fmtVnd(fin.collected)} (${fin.collectedPct}%)`);
  L.push(`• Còn phải thu: ${fmtVnd(fin.remaining)}`);
  L.push(`• Đã chi (sổ quỹ + lương): ${fmtVnd(fin.spent)}`);
  L.push(`• Nợ NCC còn lại: ${fmtVnd(fin.supplierDebt)}`);
  L.push(`• Chi phí phát sinh (chi + nợ NCC): ${fmtVnd(fin.incurred)}`);
  L.push(`• Tổng dự toán (giá vốn): ${fin.budgetTotal != null ? fmtVnd(fin.budgetTotal) : "—"}`);
  L.push(`• Biên LN dự kiến (HĐ − giá vốn): ${grossMargin != null ? fmtVnd(grossMargin) : "—"}`);
  L.push(`• Còn phải chi (theo dự toán): ${fin.remainingToSpend != null ? fmtVnd(fin.remainingToSpend) : "—"}`);
  L.push(`• Dòng tiền (thu − chi): ${fmtVnd(cashFlow)}`);
  if (payrollPaid > 0) L.push(`• Trong đó lương đã trả: ${fmtVnd(payrollPaid)}`);

  if (catRows.length > 0) {
    L.push(``);
    L.push(`📂 Cơ cấu chi (sổ quỹ):`);
    for (const c of catRows) L.push(`  • ${c.name}: ${fmtVnd(Number(c.amount))}`);
  }

  L.push(``);
  L.push(`🧾 ĐỢT THU: ${doneInstallments}/${schedules.length} đợt đã thu`);
  if (nextUnpaid)
    L.push(`  • Đợt tới: ${nextUnpaid.milestoneDescription ?? "—"} — ${fmtVnd(Number(nextUnpaid.amount))} (hạn ${fmtDate(nextUnpaid.expectedDate ?? nextUnpaid.dueDate)})`);

  L.push(``);
  L.push(`🛒 MUA HÀNG: ${mh.n} đơn (${mh.received} đã nhận) — ${fmtVnd(Number(mh.total))}`);
  L.push(`👷 THẦU PHỤ: ${sub.n} HĐ — giá trị ${fmtVnd(Number(sub.total))}, đã trả ${fmtVnd(subPaid)}, còn ${fmtVnd(Number(sub.total) - subPaid)}`);
  L.push(`✅ NGHIỆM THU: ${ms.signed}/${ms.total} mốc đã ký`);
  L.push(`📔 NHẬT KÝ: ${diaryCount} ngày ghi`);

  return L.join("\n");
}

// Tổng hợp số liệu TỪNG dự án đang chạy (planning + in_progress).
// Mỗi dự án tái dùng getProjectFinanceSummary → số khớp trang Tài chính dự án.
async function replyProjectsDetail(): Promise<string> {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["planning", "in_progress"] } },
    select: { id: true, name: true, code: true },
    orderBy: { createdAt: "asc" },
  });
  if (projects.length === 0) return "🏗️ Không có dự án nào đang chạy.";

  const CAP = 12;
  const shown = projects.slice(0, CAP);
  const sums = await Promise.all(shown.map((p) => getProjectFinanceSummary(p.id)));

  let totCollected = 0, totRemaining = 0, totSpent = 0, totDebt = 0;
  const blocks = shown.map((p, i) => {
    const s = sums[i];
    totCollected += s.collected;
    totRemaining += s.remaining;
    totSpent += s.spent;
    totDebt += s.supplierDebt;
    const lines = [
      `🏗️ ${p.name}${p.code ? ` (${p.code})` : ""}`,
      `  • Thu: ${fmtVnd(s.collected)}/${fmtVnd(s.contractValue)} (${s.collectedPct}%)`,
      `  • Còn phải thu: ${fmtVnd(s.remaining)}`,
      `  • Đã chi: ${fmtVnd(s.spent)}`,
      `  • Nợ NCC: ${fmtVnd(s.supplierDebt)}`,
    ];
    if (s.remainingToSpend != null) lines.push(`  • Còn phải chi: ${fmtVnd(s.remainingToSpend)}`);
    return lines.join("\n");
  });

  let out = `📋 Tổng hợp ${projects.length} dự án đang chạy:\n\n${blocks.join("\n\n")}`;
  if (projects.length > shown.length) out += `\n\n… và ${projects.length - shown.length} dự án nữa`;
  out +=
    `\n\n— TỔNG:\n` +
    `  • Đã thu: ${fmtVnd(totCollected)}\n` +
    `  • Còn phải thu: ${fmtVnd(totRemaining)}\n` +
    `  • Đã chi: ${fmtVnd(totSpent)}\n` +
    `  • Nợ NCC: ${fmtVnd(totDebt)}`;
  return out;
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
    } else if (/(tong hop du an|chi tiet du an|tung du an|du an chi tiet|so lieu du an)/.test(text)) {
      reply = await replyProjectsDetail();
    } else if (/(du an|cong trinh|project)/.test(text)) {
      reply = await replyOneProject(text);
      if (reply === null) reply = await replyProjects(); // chỉ gõ "dự án" → đếm theo status
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
