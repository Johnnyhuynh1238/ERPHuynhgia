import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canViewPayroll } from "@/lib/weekly-payroll";

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function vnd(n: bigint | number | null | undefined): string {
  if (n === null || n === undefined) return "0đ";
  const num = typeof n === "bigint" ? Number(n) : Number(n);
  return num.toLocaleString("vi-VN") + "đ";
}

function vndSigned(n: bigint | number | null | undefined): string {
  if (n === null || n === undefined) return "0đ";
  const num = typeof n === "bigint" ? Number(n) : Number(n);
  if (num > 0) return "+" + num.toLocaleString("vi-VN") + "đ";
  return num.toLocaleString("vi-VN") + "đ";
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string; payrollId: string; workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewPayroll({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const payroll = await prisma.weeklyPayroll.findFirst({
    where: { id: params.payrollId, projectId: project.id },
    select: {
      id: true, weekKey: true, weekStart: true, weekEnd: true, status: true,
      bonusPool: true, shareRate: true, totalDailyWage: true, totalOutputValue: true, weekDelta: true,
      lines: {
        where: { workerId: params.workerId },
        select: {
          id: true, workerId: true, fullName: true, grade: true,
          bankAccount: true, bankName: true, phone: true,
          totalDays: true, dailyRate: true, dailyWage: true,
          bonus: true, adjustment: true, payable: true,
          absentDaysP: true, absentDaysKp: true, absentDaysMua: true, absentDaysCho: true,
          note: true,
        },
      },
    },
  });
  if (!payroll) return NextResponse.json({ message: "Không tìm thấy bảng lương" }, { status: 404 });
  const line = payroll.lines[0];
  if (!line) return NextResponse.json({ message: "Thợ này không có dòng trong bảng lương" }, { status: 404 });

  const totalAbsent = line.absentDaysP + line.absentDaysKp + line.absentDaysMua + line.absentDaysCho;

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Phiếu lương ${esc(line.fullName)} — ${esc(payroll.weekKey)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 16px; background: #f3f4f6; color: #111827; }
  .sheet { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.06); padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .row .lbl { color: #4b5563; }
  .row .val { font-weight: 500; text-align: right; }
  .section-title { margin-top: 18px; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 18px; padding: 14px 16px; background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 10px; }
  .total .lbl { font-size: 13px; color: #065f46; }
  .total .val { font-size: 22px; font-weight: 700; color: #065f46; }
  .neg { color: #dc2626; }
  .footer { margin-top: 16px; font-size: 12px; color: #6b7280; text-align: center; }
  .actions { max-width: 560px; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; }
  .btn { padding: 8px 14px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-size: 13px; }
  .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  @media print {
    body { background: #fff; padding: 0; }
    .actions { display: none; }
    .sheet { box-shadow: none; border-radius: 0; max-width: 100%; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.close()">Đóng</button>
    <button class="btn btn-primary" onclick="window.print()">In / Lưu PDF</button>
  </div>
  <div class="sheet">
    <h1>Phiếu lương tuần ${esc(payroll.weekKey)}</h1>
    <div class="sub">${esc(project.name)} (${esc(project.code)}) — ${fmtDate(payroll.weekStart)} đến ${fmtDate(payroll.weekEnd)}</div>

    <div class="section-title">Thông tin thợ</div>
    <div class="row"><span class="lbl">Họ tên</span><span class="val">${esc(line.fullName)}</span></div>
    ${line.grade != null ? `<div class="row"><span class="lbl">Bậc</span><span class="val">${esc(line.grade)}</span></div>` : ""}
    ${line.phone ? `<div class="row"><span class="lbl">SĐT</span><span class="val">${esc(line.phone)}</span></div>` : ""}
    ${line.bankAccount ? `<div class="row"><span class="lbl">STK</span><span class="val">${esc(line.bankAccount)}${line.bankName ? " — " + esc(line.bankName) : ""}</span></div>` : ""}

    <div class="section-title">Công &amp; lương ngày</div>
    <div class="row"><span class="lbl">Tổng công</span><span class="val">${Number(line.totalDays).toLocaleString("vi-VN")} ngày</span></div>
    <div class="row"><span class="lbl">Đơn giá ngày</span><span class="val">${vnd(line.dailyRate)}</span></div>
    <div class="row"><span class="lbl">Lương công nhật</span><span class="val">${vnd(line.dailyWage)}</span></div>
    ${totalAbsent > 0 ? `<div class="row"><span class="lbl">Vắng</span><span class="val">P: ${line.absentDaysP} • KP: ${line.absentDaysKp} • Mưa: ${line.absentDaysMua} • Chờ: ${line.absentDaysCho}</span></div>` : ""}

    <div class="section-title">Thưởng đội tuần</div>
    <div class="row"><span class="lbl">Sản lượng cả đội</span><span class="val">${vnd(payroll.totalOutputValue)}</span></div>
    <div class="row"><span class="lbl">Lương công nhật cả đội</span><span class="val">${vnd(payroll.totalDailyWage)}</span></div>
    <div class="row"><span class="lbl">Chênh tuần (cả đội)</span><span class="val ${Number(payroll.weekDelta) < 0 ? "neg" : ""}">${vndSigned(payroll.weekDelta)}</span></div>
    <div class="row"><span class="lbl">Quỹ thưởng (${(Number(payroll.shareRate) * 100).toFixed(0)}%)</span><span class="val">${vnd(payroll.bonusPool)}</span></div>
    <div class="row"><span class="lbl">Thưởng của bạn</span><span class="val">${vnd(line.bonus)}</span></div>

    ${Number(line.adjustment) !== 0 ? `
    <div class="section-title">Điều chỉnh</div>
    <div class="row"><span class="lbl">Bù / trừ</span><span class="val ${Number(line.adjustment) < 0 ? "neg" : ""}">${vndSigned(line.adjustment)}</span></div>
    ` : ""}

    <div class="total"><span class="lbl">Thực nhận</span><span class="val">${vnd(line.payable)}</span></div>

    ${line.note ? `<div class="footer" style="margin-top: 10px; text-align: left;">Ghi chú: ${esc(line.note)}</div>` : ""}
    <div class="footer">In từ ERP Huỳnh Gia 6 — ${fmtDate(new Date())}</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
