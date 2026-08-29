import { NextResponse } from "next/server";

// POST /api/sub-payments/[id]/expense — ĐÃ NGỪNG.
// Thầu phụ chuyển sang CHI CHUNG cấp hợp đồng (POST /api/sub-contracts/[id]/pay),
// giống luồng trả nợ NCC: 1 nút "Chi", nhập số tiền. Các đợt theo hợp đồng chỉ còn
// là THAM KHẢO và tự cập nhật khi tổng đã trả cộng dồn đủ số của đợt.
//
// Giữ endpoint (không xoá) để client cũ/bookmark nhận thông báo rõ thay vì 404.
export async function POST() {
  return NextResponse.json(
    { message: 'Đã chuyển sang chi chung cấp hợp đồng — dùng nút "Chi" ở màn hợp đồng thầu phụ' },
    { status: 400 },
  );
}
