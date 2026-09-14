// Phân bổ hạng mục ngân sách theo SỐ TIỀN cho 1 đơn mua hàng (nhiều hạng mục / đơn).
// Lưu ở cột mh_orders.budget_alloc (JSON) dạng [{lineId, amount}]; Σ amount = tổng đơn.
// Cột budget_line_id cũ giữ = phần tử đầu (hạng mục chính) để tương thích chỗ đọc cũ.

export type BudgetAlloc = { lineId: string; amount: number };

// Đọc/lọc mảng alloc thô từ body/JSON → chỉ giữ phần tử hợp lệ (lineId + amount > 0).
export function cleanAlloc(raw: unknown): BudgetAlloc[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetAlloc[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const lineId = o.lineId ? String(o.lineId) : "";
    const amount = Math.round(Number(o.amount) || 0);
    if (lineId && amount > 0) out.push({ lineId, amount });
  }
  return out;
}

// Kiểm alloc (khi CÓ gắn hạng mục): mọi lineId hợp lệ + không trùng + Σ = tổng đơn.
// Trả message lỗi (tiếng Việt) hoặc null nếu hợp lệ. Alloc rỗng KHÔNG check ở đây
// (caller tự quyết: tạo đơn bắt buộc gắn, sửa đơn cho phép bỏ gắn).
export function validateAlloc(
  alloc: BudgetAlloc[],
  validIds: Set<string>,
  total: number,
): string | null {
  const seen = new Set<string>();
  for (const a of alloc) {
    if (!validIds.has(a.lineId)) return "Có hạng mục ngân sách không hợp lệ";
    if (seen.has(a.lineId)) return "Một hạng mục ngân sách bị chọn trùng";
    seen.add(a.lineId);
    if (!(a.amount > 0)) return "Số tiền mỗi hạng mục phải lớn hơn 0";
  }
  const sum = alloc.reduce((s, a) => s + a.amount, 0);
  if (Math.round(sum) !== Math.round(total)) {
    return `Tổng phân bổ hạng mục (${sum.toLocaleString("vi-VN")}đ) phải bằng tổng đơn (${Math.round(
      total,
    ).toLocaleString("vi-VN")}đ)`;
  }
  return null;
}

// Alloc dùng cho THỐNG KÊ: ưu tiên budget_alloc; đơn cũ chưa có alloc → 1 phần tử
// = budget_line_id phủ toàn bộ total. Rỗng cả hai = chưa gắn (vào "unassigned").
export function resolveAlloc(o: {
  budgetAlloc?: unknown;
  budgetLineId?: string | null;
  total: unknown;
}): BudgetAlloc[] {
  const list = cleanAlloc(o.budgetAlloc);
  if (list.length) return list;
  if (o.budgetLineId) return [{ lineId: String(o.budgetLineId), amount: Math.round(Number(o.total) || 0) }];
  return [];
}
