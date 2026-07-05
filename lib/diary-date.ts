import { getWorkDateVn } from "@/lib/attendance";

export const DIARY_BACKFILL_DAYS = 3;

// Nhật ký thi công: chỉ ghi cho hôm nay hoặc nhập bù tối đa DIARY_BACKFILL_DAYS ngày.
// Cấm ngày tương lai — entryDate lấy từ query/body nên phải chặn server-side.
export function diaryDateError(entryDate: Date): string | null {
  const today = getWorkDateVn();
  const diffDays = Math.round((today.getTime() - entryDate.getTime()) / 86_400_000);
  if (diffDays < 0) return "Không được ghi nhật ký cho ngày tương lai";
  if (diffDays > DIARY_BACKFILL_DAYS) {
    return `Chỉ được nhập bù nhật ký trong ${DIARY_BACKFILL_DAYS} ngày gần nhất`;
  }
  return null;
}
