import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canEditBudget } from "@/lib/project-budget";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/budget-suggested-components";

const KL_COLS = {
  STT: 1, STAGE: 2, COMPONENT: 3, NORM_CODE: 4, NAME: 5, UNIT: 6,
  QUANTITY: 7, VT: 8, NC: 9, MM: 10, TOTAL: 11,
};

const MAX_ROWS = 500;

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được tải mẫu" }, { status: 403 });
  }

  const [norms, mats, labs, macs] = await Promise.all([
    prisma.norm.findMany({
      select: { code: true, name: true, unit: true, category: true, kMaterial: true, kLabor: true, kMachine: true },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    prisma.materialPrice.findMany({
      where: { retiredAt: null },
      select: { name: true, unit: true, price: true },
      orderBy: { name: "asc" },
    }),
    prisma.laborPrice.findMany({
      where: { retiredAt: null },
      select: { grade: true, price: true },
      orderBy: { grade: "asc" },
    }),
    prisma.machinePrice.findMany({
      where: { retiredAt: null },
      select: { name: true, price: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Huỳnh Gia";
  wb.created = new Date();

  buildHuongDan(wb);
  buildKhoiLuong(wb);
  buildDinhMuc(wb, norms);
  buildBangGia(wb, mats, labs, macs);
  buildThanhTien(wb);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="du-toan-mau.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

function buildHuongDan(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("HƯỚNG DẪN", { properties: { tabColor: { argb: "FF2E7D32" } } });
  ws.columns = [{ width: 6 }, { width: 100 }];

  const lines: Array<{ h?: string; t?: string }> = [
    { h: "📘 HƯỚNG DẪN SỬ DỤNG FILE DỰ TOÁN ERP HUỲNH GIA" },
    { t: "" },
    { t: "File này dùng để nhập dự toán offline (KL + ĐM + Đơn giá), sau đó upload lên ERP để tự tạo budget." },
    { t: "" },
    { h: "📑 CÁC SHEET TRONG FILE" },
    { t: "1. HƯỚNG DẪN — Trang này, đọc trước khi nhập." },
    { t: "2. KHỐI LƯỢNG — ANH ĐIỀN TRỰC TIẾP TẠI ĐÂY. Mỗi dòng = 1 công tác." },
    { t: "3. ĐỊNH MỨC — Tham chiếu 91 ĐM của ERP. Tra mã ĐM ở đây, copy vào cột D sheet KHỐI LƯỢNG." },
    { t: "4. BẢNG GIÁ — Tham chiếu đơn giá VT/NC/MM master trong ERP. Chỉ để tham khảo." },
    { t: "5. THÀNH TIỀN — Tự cộng theo công thức từ sheet KHỐI LƯỢNG. Không cần điền." },
    { t: "" },
    { h: "✍️ CÁCH ĐIỀN SHEET KHỐI LƯỢNG (cột B→J)" },
    { t: "B · Giai đoạn — Chọn 1 trong: CB (Chuẩn Bị), N (Ngầm), T (Thô), HT (Hoàn Thiện), ME." },
    { t: "C · Cấu kiện — Tên cấu kiện trong giai đoạn đó. VD: 'Móng', 'Cột', 'Xây tường', 'Mái tôn'..." },
    { t: "D · Mã ĐM — (Optional) Mã từ sheet ĐỊNH MỨC, vd 'BT.1140'. Bỏ trống nếu công tác không có ĐM." },
    { t: "E · Tên công tác — Tên đầy đủ, vd 'Bê tông lót móng đá 4x6 M100'. Nếu để trống, hệ thống lấy theo Mã ĐM." },
    { t: "F · Đơn vị — m, m2, m3, kg, cái, công, ca... (theo ĐM nếu có Mã ĐM)." },
    { t: "G · Khối lượng — Số thực, vd 2.744" },
    { t: "H · Đơn giá VT — (Optional) Đơn giá vật tư đ/ĐV. CHỈ điền khi không dùng ĐM (vd Mái tôn, ốp đá riêng)." },
    { t: "I · Đơn giá NC — (Optional) Đơn giá nhân công đ/ĐV. Tương tự cột H." },
    { t: "J · Đơn giá MM — (Optional) Đơn giá máy móc đ/ĐV. Tương tự cột H." },
    { t: "K · Thành tiền — Công thức tự tính = G × (H + I + J). Không sửa." },
    { t: "" },
    { h: "⚠️ LƯU Ý QUAN TRỌNG" },
    { t: "• Nếu có Mã ĐM (cột D): ERP sẽ TỰ TÍNH giá VT/NC/MM theo bảng giá master, KHÔNG cần điền cột H/I/J." },
    { t: "• Nếu KHÔNG có Mã ĐM: PHẢI điền ít nhất 1 trong H/I/J để ERP tính được thành tiền." },
    { t: "• Mỗi (Giai đoạn + Cấu kiện) sẽ tự tạo cấu kiện mới nếu chưa có trong dự án." },
    { t: "• Đừng đổi tên sheet, đừng xoá header dòng 1, đừng thêm cột mới — sẽ làm hỏng parse khi upload." },
    { t: "• File hỗ trợ tối đa " + MAX_ROWS + " dòng công tác." },
    { t: "" },
    { h: "🚀 QUY TRÌNH" },
    { t: "1. Tải file mẫu này từ ERP (nút 'Tải mẫu Excel' ở trang Dự toán dự án)." },
    { t: "2. Mở file, đọc sheet HƯỚNG DẪN này." },
    { t: "3. Điền sheet KHỐI LƯỢNG (tra ĐM ở sheet ĐỊNH MỨC, tra giá ở sheet BẢNG GIÁ)." },
    { t: "4. Xem sheet THÀNH TIỀN để check tổng." },
    { t: "5. Upload lại lên ERP (nút 'Upload Excel' ở trang Dự toán dự án) — ERP sẽ ghi đè budget hiện tại." },
  ];

  let r = 1;
  for (const ln of lines) {
    const row = ws.getRow(r);
    if (ln.h) {
      row.getCell(1).value = "";
      row.getCell(2).value = ln.h;
      row.getCell(2).font = { bold: true, size: 12, color: { argb: "FF1B5E20" } };
      row.height = 22;
    } else {
      row.getCell(2).value = ln.t ?? "";
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
    r++;
  }
}

function buildKhoiLuong(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("KHỐI LƯỢNG", { properties: { tabColor: { argb: "FFF57C00" } } });
  ws.columns = [
    { header: "STT", key: "stt", width: 6 },
    { header: "Giai đoạn", key: "stage", width: 12 },
    { header: "Cấu kiện", key: "comp", width: 28 },
    { header: "Mã ĐM", key: "norm", width: 12 },
    { header: "Tên công tác", key: "name", width: 38 },
    { header: "Đơn vị", key: "unit", width: 8 },
    { header: "Khối lượng", key: "qty", width: 12 },
    { header: "Đơn giá VT", key: "vt", width: 14 },
    { header: "Đơn giá NC", key: "nc", width: 14 },
    { header: "Đơn giá MM", key: "mm", width: 14 },
    { header: "Thành tiền", key: "total", width: 16 },
  ];

  styleHeader(ws, 1, KL_COLS.TOTAL, "FFF57C00");

  // STT + công thức + data validation
  for (let i = 2; i <= MAX_ROWS + 1; i++) {
    ws.getRow(i).getCell(KL_COLS.STT).value = i - 1;
    ws.getRow(i).getCell(KL_COLS.STT).alignment = { horizontal: "center" };

    // Stage dropdown
    ws.getCell(i, KL_COLS.STAGE).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${STAGE_ORDER.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Sai giai đoạn",
      error: `Chọn 1 trong: ${STAGE_ORDER.join(", ")}`,
    };

    // Thành tiền formula
    ws.getCell(i, KL_COLS.TOTAL).value = {
      formula: `IF(G${i}="","",G${i}*(IF(H${i}="",0,H${i})+IF(I${i}="",0,I${i})+IF(J${i}="",0,J${i})))`,
    };
    ws.getCell(i, KL_COLS.TOTAL).numFmt = "#,##0";
    ws.getCell(i, KL_COLS.VT).numFmt = "#,##0";
    ws.getCell(i, KL_COLS.NC).numFmt = "#,##0";
    ws.getCell(i, KL_COLS.MM).numFmt = "#,##0";
    ws.getCell(i, KL_COLS.QUANTITY).numFmt = "#,##0.000";
  }

  // Total row
  const totalRow = MAX_ROWS + 2;
  ws.getRow(totalRow).getCell(KL_COLS.NAME).value = "TỔNG CỘNG";
  ws.getRow(totalRow).getCell(KL_COLS.NAME).font = { bold: true };
  ws.getRow(totalRow).getCell(KL_COLS.NAME).alignment = { horizontal: "right" };
  ws.getCell(totalRow, KL_COLS.TOTAL).value = {
    formula: `SUM(K2:K${MAX_ROWS + 1})`,
  };
  ws.getCell(totalRow, KL_COLS.TOTAL).numFmt = "#,##0";
  ws.getCell(totalRow, KL_COLS.TOTAL).font = { bold: true };

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 5 }];

  // Quick legend at top of frozen header
  const note = ws.getRow(MAX_ROWS + 4);
  note.getCell(2).value =
    `Giai đoạn: ${STAGE_ORDER.map((s) => `${s}=${STAGE_LABEL[s as keyof typeof STAGE_LABEL]}`).join(" · ")}`;
  note.getCell(2).font = { italic: true, color: { argb: "FF666666" } };
}

function buildDinhMuc(
  wb: ExcelJS.Workbook,
  norms: Array<{ code: string; name: string; unit: string; category: string | null; kMaterial: unknown; kLabor: unknown; kMachine: unknown }>,
) {
  const ws = wb.addWorksheet("ĐỊNH MỨC", { properties: { tabColor: { argb: "FF1976D2" } } });
  ws.columns = [
    { header: "Nhóm", key: "cat", width: 14 },
    { header: "Mã ĐM", key: "code", width: 12 },
    { header: "Tên định mức", key: "name", width: 48 },
    { header: "Đơn vị", key: "unit", width: 10 },
    { header: "K-VT", key: "kvt", width: 8 },
    { header: "K-NC", key: "knc", width: 8 },
    { header: "K-MM", key: "kmm", width: 8 },
  ];
  styleHeader(ws, 1, 7, "FF1976D2");
  for (const n of norms) {
    ws.addRow({
      cat: n.category ?? "",
      code: n.code,
      name: n.name,
      unit: n.unit,
      kvt: Number(n.kMaterial),
      knc: Number(n.kLabor),
      kmm: Number(n.kMachine),
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
}

function buildBangGia(
  wb: ExcelJS.Workbook,
  mats: Array<{ name: string; unit: string; price: bigint }>,
  labs: Array<{ grade: string; price: bigint }>,
  macs: Array<{ name: string; price: bigint }>,
) {
  const ws = wb.addWorksheet("BẢNG GIÁ", { properties: { tabColor: { argb: "FF7B1FA2" } } });
  ws.columns = [
    { header: "Loại", key: "kind", width: 8 },
    { header: "Tên / Bậc", key: "name", width: 40 },
    { header: "Đơn vị", key: "unit", width: 10 },
    { header: "Đơn giá", key: "price", width: 16 },
  ];
  styleHeader(ws, 1, 4, "FF7B1FA2");

  for (const m of mats) {
    ws.addRow({ kind: "VT", name: m.name, unit: m.unit, price: Number(m.price) });
  }
  for (const l of labs) {
    ws.addRow({ kind: "NC", name: `Bậc ${l.grade}`, unit: "công", price: Number(l.price) });
  }
  for (const mm of macs) {
    ws.addRow({ kind: "MM", name: mm.name, unit: "ca", price: Number(mm.price) });
  }

  ws.getColumn(4).numFmt = "#,##0";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
}

function buildThanhTien(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("THÀNH TIỀN", { properties: { tabColor: { argb: "FFC62828" } } });
  ws.columns = [
    { header: "Giai đoạn", key: "stage", width: 14 },
    { header: "Số công tác", key: "count", width: 14 },
    { header: "Thành tiền", key: "total", width: 20 },
  ];
  styleHeader(ws, 1, 3, "FFC62828");

  let r = 2;
  for (const s of STAGE_ORDER) {
    ws.getCell(r, 1).value = `${s} · ${STAGE_LABEL[s as keyof typeof STAGE_LABEL]}`;
    ws.getCell(r, 2).value = { formula: `COUNTIF('KHỐI LƯỢNG'!B2:B${MAX_ROWS + 1},"${s}")` };
    ws.getCell(r, 3).value = {
      formula: `SUMIF('KHỐI LƯỢNG'!B2:B${MAX_ROWS + 1},"${s}",'KHỐI LƯỢNG'!K2:K${MAX_ROWS + 1})`,
    };
    ws.getCell(r, 3).numFmt = "#,##0";
    r++;
  }
  // Grand total
  ws.getCell(r, 1).value = "TỔNG";
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = { formula: `COUNTA('KHỐI LƯỢNG'!B2:B${MAX_ROWS + 1})` };
  ws.getCell(r, 3).value = { formula: `SUM(C2:C${r - 1})` };
  ws.getCell(r, 3).numFmt = "#,##0";
  ws.getCell(r, 3).font = { bold: true };

  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function styleHeader(ws: ExcelJS.Worksheet, fromCol: number, toCol: number, argb: string) {
  const row = ws.getRow(1);
  for (let c = fromCol; c <= toCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
    };
  }
  row.height = 22;
}
