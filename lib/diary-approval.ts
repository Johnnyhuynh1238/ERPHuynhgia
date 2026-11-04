// Duyệt nhật ký thi công (lệnh sếp 04/11/2026, việc V261104-121234):
// - KS lưu nhật ký → hệ thống TỰ DUYỆT: approvedAt = giờ lưu, approvedById = null (người duyệt = hệ thống).
// - Admin duyệt tay → approvedById = admin → khoá, KS không sửa được nữa.
// - Admin vẫn bỏ duyệt được (cả tự duyệt lẫn duyệt tay).
// Tự duyệt KHÔNG khoá: KS sửa lại được như trước, mỗi lần lưu ghi lại giờ tự duyệt.

type DiaryApproval = { approvedAt: Date | null; approvedById: string | null };

export const AUTO_APPROVER_NAME = "Hệ thống (tự duyệt)";

export function isDiaryAutoApproved(d: DiaryApproval): boolean {
  return Boolean(d.approvedAt) && !d.approvedById;
}

/** Chỉ duyệt tay của admin mới khoá nhật ký. */
export function isDiaryLocked(d: DiaryApproval | null | undefined): boolean {
  return Boolean(d?.approvedAt && d.approvedById);
}

export function autoApproveData(now: Date) {
  return { approvedAt: now, approvedById: null };
}
