import { prisma } from "@/lib/prisma";
import { BudgetPlanGroup } from "@prisma/client";

// Tiến độ thi công theo PHẦN dự án (project_sections) — thay grouping theo công tác catalog.
//  - Mỗi PHẦN = 1 dòng tiến độ (refType "section"), tiền = Σ VT (estimate_db_materials) thuộc phần.
//  - Khoán (estimate_db_khoan) giữ lại: mỗi HĐ = 1 dòng trọn gói (tương thích data cũ).
// Tiến độ lưu ở estimate_task_progress (refType "section"|"khoan", percent 0..100 + done).
// Tổng = earned value theo tiền.

const KIND_LABEL: Record<BudgetPlanGroup, string> = {
  tho: "Thô",
  hoan_thien: "Hoàn thiện",
  nhan_cong: "Nhân công",
  chung: "Chung",
};
const KIND_RANK: Record<BudgetPlanGroup, number> = {
  tho: 0,
  hoan_thien: 1,
  nhan_cong: 2,
  chung: 3,
};
const KHOAN_KEY = "khoan";

export type ProgressTask = {
  refType: "section" | "khoan";
  refId: string;
  groupKey: string; // kind ("tho"…) cho phần; "khoan" cho khoán
  groupLabel: string; // "Thô" / "Hoàn thiện" / … / "Khoán trọn gói"
  name: string;
  amount: number; // tiền dự toán của phần/HĐ
  percent: number; // 0..100 — tiến độ THỰC TẾ
  done: boolean;
  planStart: string | null; // "YYYY-MM-DD" — tiến độ DỰ KIẾN (chỉ phần)
  planEnd: string | null;
};

export type EstimateProgress = {
  tasks: ProgressTask[];
  totalAmount: number;
  earnedPct: number; // Σ(percent×tiền)/Σtiền, làm tròn
  uncataloged: number; // số dòng VT chưa gắn PHẦN (không tính vào tiến độ)
};

export async function computeEstimateProgress(projectId: string): Promise<EstimateProgress> {
  const [sections, mats, khoans, progRows] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, kind: true, sortOrder: true, planStart: true, planEnd: true },
    }),
    prisma.estimateDbMaterial.findMany({
      where: { projectId },
      select: { sectionId: true, quantity: true, unitPrice: true },
    }),
    prisma.estimateDbKhoan.findMany({
      where: { projectId },
      select: { id: true, name: true, value: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId },
      select: { refType: true, refId: true, percent: true, done: true },
    }),
  ]);

  const progMap = new Map<string, { percent: number; done: boolean }>();
  for (const p of progRows) progMap.set(`${p.refType}|${p.refId}`, { percent: p.percent, done: p.done });
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  // Σ VT theo PHẦN. VT chưa gắn phần → uncataloged (không thành dòng tiến độ).
  const amtBySection = new Map<string, number>();
  let uncataloged = 0;
  for (const m of mats) {
    if (!m.sectionId) {
      uncataloged += 1;
      continue;
    }
    const amt = Number(m.quantity) * Number(m.unitPrice);
    amtBySection.set(m.sectionId, (amtBySection.get(m.sectionId) ?? 0) + amt);
  }

  const tasks: ProgressTask[] = [];
  for (const s of sections) {
    const pr = progMap.get(`section|${s.id}`);
    tasks.push({
      refType: "section",
      refId: s.id,
      groupKey: s.kind,
      groupLabel: KIND_LABEL[s.kind] ?? "Khác",
      name: s.name,
      amount: amtBySection.get(s.id) ?? 0,
      percent: pr?.percent ?? 0,
      done: pr?.done ?? false,
      planStart: iso(s.planStart),
      planEnd: iso(s.planEnd),
    });
  }
  for (const k of khoans) {
    const pr = progMap.get(`khoan|${k.id}`);
    tasks.push({
      refType: "khoan",
      refId: k.id,
      groupKey: KHOAN_KEY,
      groupLabel: "Khoán trọn gói",
      name: k.name,
      amount: Number(k.value),
      percent: pr?.percent ?? 0,
      done: pr?.done ?? false,
      planStart: null,
      planEnd: null,
    });
  }

  // Sắp: theo loại (thô→hoàn thiện→NC→chung), khoán cuối; giữ thứ tự phần (sortOrder) đã load.
  const rankOf = (t: ProgressTask) =>
    t.refType === "khoan" ? 99 : (KIND_RANK[t.groupKey as BudgetPlanGroup] ?? 50);
  // ổn định: dùng index gốc làm tiebreak (đã sort sortOrder khi load)
  const idx = new Map(tasks.map((t, i) => [t, i]));
  tasks.sort((a, b) => rankOf(a) - rankOf(b) || (idx.get(a)! - idx.get(b)!));

  const totalAmount = tasks.reduce((s, t) => s + t.amount, 0);
  const earned = tasks.reduce((s, t) => s + (t.percent / 100) * t.amount, 0);
  const earnedPct = totalAmount > 0 ? Math.round((earned / totalAmount) * 100) : 0;

  return { tasks, totalAmount, earnedPct, uncataloged };
}
