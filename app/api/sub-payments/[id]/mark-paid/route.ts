import { NextResponse } from "next/server";

// POST /api/sub-payments/[id]/mark-paid — ĐÃ NGỪNG.
// Chi theo TỪNG ĐỢT tạo phiếu quỹ không gắn hợp đồng → tổng đã trả (Σ lệnh chi gắn HĐ)
// không đếm được → công nợ thầu phụ lệch sổ quỹ. Thay bằng CHI CHUNG cấp hợp đồng
// (POST /api/sub-contracts/[id]/pay): tạo lệnh chi chờ duyệt, khi chi xong thì các đợt
// tự tính lại theo tổng đã trả cộng dồn.
//
// Giữ endpoint (không xoá) để client cũ/bookmark nhận thông báo rõ thay vì 404.
export async function POST() {
  return NextResponse.json(
    { message: 'Đã chuyển sang chi chung cấp hợp đồng — dùng nút "Chi" ở màn hợp đồng thầu phụ' },
    { status: 400 },
  );
}
