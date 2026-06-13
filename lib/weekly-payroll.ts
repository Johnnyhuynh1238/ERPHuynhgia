import type { TimesheetAbsentReason } from "@prisma/client";
import { weekKeyForDate } from "@/lib/eod";

// Tỉ lệ chia thưởng cho đội khi tuần có chênh dương (spec mặc định 0.5).
// Để hardcode tại đây cho dễ thay đổi; tương lai có thể move ra system_config.
export const SHARE_RATE = 0.5;

// Số ngày MUA/CHO chiếm đa số tuần thì KHÔNG tính vào chuỗi tuần âm liên tiếp
// (vì lỗi công ty/thời tiết, không phải lỗi đội). Spec: N config.
export const NEG_STREAK_RAINY_THRESHOLD = 3;

type UserCtx = { id: string; role: string };

// TPTC chốt tuần. KETOAN mới được mark PAID.
const CLOSE_ROLES = ["admin", "construction_manager"];
const READY_ROLES = ["admin", "construction_manager"];
const PAID_ROLES = ["admin", "accountant"];
const VIEW_ROLES = ["admin", "construction_manager", "engineer", "accountant"];
const EXPORT_ROLES = ["admin", "accountant"];

export function canCloseWeek(u: UserCtx): boolean {
  return CLOSE_ROLES.includes(u.role);
}
export function canMarkPayrollReady(u: UserCtx): boolean {
  return READY_ROLES.includes(u.role);
}
export function canMarkPayrollPaid(u: UserCtx): boolean {
  return PAID_ROLES.includes(u.role);
}
export function canViewPayroll(u: UserCtx): boolean {
  return VIEW_ROLES.includes(u.role);
}
export function canExportBankCsv(u: UserCtx): boolean {
  return EXPORT_ROLES.includes(u.role);
}

export const PAYROLL_STATUS_LABEL: Record<"draft" | "ready_to_pay" | "paid", string> = {
  draft: "Nháp",
  ready_to_pay: "Chờ chi",
  paid: "Đã chi",
};

// Tuần ISO bắt đầu thứ Hai (giống weekKeyForDate ở M4).
export function weekRangeFromKey(weekKey: string): { weekStart: Date; weekEnd: Date } {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`weekKey không hợp lệ: ${weekKey}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO week 1 chứa ngày Thứ Năm đầu tiên của năm.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const weekStart = new Date(week1Mon);
  weekStart.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return { weekStart, weekEnd };
}

export function weekKeyForDateStr(dateStr: string): string {
  return weekKeyForDate(new Date(`${dateStr}T00:00:00.000Z`));
}

export type CalcTimesheet = {
  workerId: string;
  dayValue: number; // 0 / 0.5 / 1
  absentReason: TimesheetAbsentReason | null;
};
export type CalcWorker = {
  id: string;
  fullName: string;
  grade: number | null;
  dailyRate: number; // VND
  bankAccount: string | null;
  bankName: string | null;
  phone: string | null;
};
export type CalcOutput = {
  workOrderId: string;
  approvedQty: number; // chỉ tính approvedQty (đã passed)
  unitPrice: number; // VND/đơn vị
};
export type CalcAdjustment = {
  workerId: string;
  amount: number; // âm hoặc dương
};

export type CalcLine = {
  workerId: string;
  totalDays: number;
  dailyRate: number;
  dailyWage: number;
  bonus: number;
  adjustment: number;
  payable: number;
  absentDaysP: number;
  absentDaysKp: number;
  absentDaysMua: number;
  absentDaysCho: number;
};

export type CalcResult = {
  totalDays: number;
  totalDailyWage: number;
  totalOutputValue: number;
  weekDelta: number; // output - dailyWage
  carryoverPrev: number; // sau khi cộng dồn từ tuần trước (= prev.carryoverNew + prev.weekDelta âm dồn)
  carryoverNew: number; // sau khi chia thưởng (>=0)
  bonusPool: number;
  totalBonus: number;
  totalPayable: number;
  shareRate: number;
  lines: CalcLine[];
};

// Tính bảng lương tuần.
// timesheets: tất cả timesheet trong tuần (đã filter project + week)
// outputs: approvedQty per workOrder (chỉ tính output qcStatus=passed)
// workers: hồ sơ thợ snapshot
// prevCarryover: carryoverNew của tuần trước (có thể âm sau khi đã cộng dồn delta âm) — null nếu chưa có tuần trước.
//   ⚠ Khi carryover âm: chuyển vào tuần này dưới dạng "carryoverPrev âm" → chia thưởng phải đợi đến khi carryoverPrev + weekDelta > 0.
export function calcWeeklyPayroll(input: {
  workers: CalcWorker[];
  timesheets: CalcTimesheet[];
  outputs: CalcOutput[];
  adjustments?: CalcAdjustment[];
  prevCarryover?: number;
  shareRate?: number;
}): CalcResult {
  const shareRate = input.shareRate ?? SHARE_RATE;
  const workerById = new Map(input.workers.map((w) => [w.id, w]));

  // 1. Cộng dayValue + đếm vắng theo từng thợ.
  type Accum = {
    days: number;
    p: number;
    kp: number;
    mua: number;
    cho: number;
  };
  const accumByWorker = new Map<string, Accum>();
  for (const t of input.timesheets) {
    let a = accumByWorker.get(t.workerId);
    if (!a) {
      a = { days: 0, p: 0, kp: 0, mua: 0, cho: 0 };
      accumByWorker.set(t.workerId, a);
    }
    a.days += t.dayValue;
    if (t.dayValue === 0 && t.absentReason) {
      if (t.absentReason === "P") a.p += 1;
      else if (t.absentReason === "KP") a.kp += 1;
      else if (t.absentReason === "MUA") a.mua += 1;
      else if (t.absentReason === "CHO") a.cho += 1;
    }
  }

  // 2. Lương công nhật cá nhân = dailyRate × Σ dayValue.
  const dailyWageByWorker = new Map<string, number>();
  for (const [workerId, acc] of Array.from(accumByWorker.entries())) {
    const w = workerById.get(workerId);
    const rate = w?.dailyRate ?? 0;
    dailyWageByWorker.set(workerId, Math.round(rate * acc.days));
  }
  const totalDailyWage = Array.from(dailyWageByWorker.values()).reduce((s, n) => s + n, 0);
  const totalDays = Array.from(accumByWorker.values()).reduce((s, a) => s + a.days, 0);

  // 3. Giá trị sản lượng = Σ (approvedQty × unitPrice).
  const totalOutputValue = input.outputs.reduce(
    (s, o) => s + Math.round(o.approvedQty * o.unitPrice),
    0,
  );

  // 4. Chênh tuần + carryover.
  const weekDelta = totalOutputValue - totalDailyWage;
  const carryoverPrev = (input.prevCarryover ?? 0) + weekDelta;

  // 5. Chia thưởng.
  let bonusPool = 0;
  let carryoverNew = carryoverPrev;
  if (carryoverPrev > 0) {
    bonusPool = Math.floor(carryoverPrev * shareRate);
    carryoverNew = carryoverPrev - bonusPool; // ≥0
  }

  // Trọng số = dailyRate × số công cá nhân (rate × days)
  const weights = new Map<string, number>();
  let totalWeight = 0;
  for (const [workerId, acc] of Array.from(accumByWorker.entries())) {
    const w = workerById.get(workerId);
    const rate = w?.dailyRate ?? 0;
    const wt = rate * acc.days;
    weights.set(workerId, wt);
    totalWeight += wt;
  }

  // Phân bổ bonus (round down per worker, dư đưa về người trọng số lớn nhất).
  const bonusByWorker = new Map<string, number>();
  let allocatedBonus = 0;
  let topWorker: string | null = null;
  let topWeight = -1;
  for (const [workerId, wt] of Array.from(weights.entries())) {
    const share = totalWeight > 0 ? Math.floor((bonusPool * wt) / totalWeight) : 0;
    bonusByWorker.set(workerId, share);
    allocatedBonus += share;
    if (wt > topWeight) {
      topWeight = wt;
      topWorker = workerId;
    }
  }
  if (bonusPool > allocatedBonus && topWorker) {
    bonusByWorker.set(topWorker, (bonusByWorker.get(topWorker) ?? 0) + (bonusPool - allocatedBonus));
  }
  const totalBonus = bonusPool;

  // 6. Adjustments per worker.
  const adjByWorker = new Map<string, number>();
  for (const a of input.adjustments ?? []) {
    adjByWorker.set(a.workerId, (adjByWorker.get(a.workerId) ?? 0) + Math.round(a.amount));
  }

  // 7. Build lines (tất cả thợ có timesheet trong tuần)
  const lines: CalcLine[] = [];
  for (const [workerId, acc] of Array.from(accumByWorker.entries())) {
    const w = workerById.get(workerId);
    const rate = w?.dailyRate ?? 0;
    const dailyWage = dailyWageByWorker.get(workerId) ?? 0;
    const bonus = bonusByWorker.get(workerId) ?? 0;
    const adjustment = adjByWorker.get(workerId) ?? 0;
    lines.push({
      workerId,
      totalDays: acc.days,
      dailyRate: rate,
      dailyWage,
      bonus,
      adjustment,
      payable: dailyWage + bonus + adjustment,
      absentDaysP: acc.p,
      absentDaysKp: acc.kp,
      absentDaysMua: acc.mua,
      absentDaysCho: acc.cho,
    });
  }
  // Adjustments cho thợ không có timesheet tuần này (vd hoàn bù tuần trước) → vẫn xuất hiện trong lines.
  for (const [workerId, amount] of Array.from(adjByWorker.entries())) {
    if (accumByWorker.has(workerId)) continue;
    const w = workerById.get(workerId);
    lines.push({
      workerId,
      totalDays: 0,
      dailyRate: w?.dailyRate ?? 0,
      dailyWage: 0,
      bonus: 0,
      adjustment: amount,
      payable: amount,
      absentDaysP: 0,
      absentDaysKp: 0,
      absentDaysMua: 0,
      absentDaysCho: 0,
    });
  }

  const totalPayable = lines.reduce((s, l) => s + l.payable, 0);

  return {
    totalDays,
    totalDailyWage,
    totalOutputValue,
    weekDelta,
    carryoverPrev,
    carryoverNew,
    bonusPool,
    totalBonus,
    totalPayable,
    shareRate,
    lines,
  };
}

// Quy đổi chuỗi tuần âm — bỏ qua tuần mà MUA+CHO chiếm ≥ NEG_STREAK_RAINY_THRESHOLD
// trong nhóm thợ (snapshot từ payroll lines).
export function computeNegativeStreak(
  prevStreak: number,
  weekDelta: number,
  totalAbsentMua: number,
  totalAbsentCho: number,
): number {
  const rainyDays = totalAbsentMua + totalAbsentCho;
  if (rainyDays >= NEG_STREAK_RAINY_THRESHOLD) return prevStreak; // không tính tuần này
  if (weekDelta < 0) return prevStreak + 1;
  return 0;
}

// CSV chuẩn chuyển khoản: STT, Họ tên, STK, Ngân hàng, Số tiền, Nội dung
// Encode UTF-8 with BOM cho Excel mở đúng tiếng Việt.
export function buildBankCsv(
  rows: Array<{
    fullName: string;
    bankAccount: string | null;
    bankName: string | null;
    payable: number;
  }>,
  weekKey: string,
  projectCode: string,
): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push(["STT", "Ho ten", "So tai khoan", "Ngan hang", "So tien", "Noi dung"].map(esc).join(","));
  rows.forEach((r, i) => {
    lines.push([
      String(i + 1),
      r.fullName,
      r.bankAccount ?? "",
      r.bankName ?? "",
      String(r.payable),
      `Luong ${weekKey} ${projectCode}`,
    ].map(esc).join(","));
  });
  return "﻿" + lines.join("\r\n") + "\r\n";
}
